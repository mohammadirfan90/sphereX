"""Persistent SQLite Job Registry for SPExPI Spectral Extraction Jobs.

Stores durable job metadata in SQLite (.cache/spherex/jobs.db).
Survives backend reloads and uvicorn restarts with startup crash reconciliation.

Lifecycle:
  QUEUED → DISCOVERING → DOWNLOADING → CALIBRATING →
  POSITIONING → PHOTOMETRY → BINNING → QA → COMPLETE
  or → FAILED / UNAVAILABLE
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
import uuid
from enum import Enum
from pathlib import Path
from typing import Any, Optional, Tuple, Dict, List
from pydantic import BaseModel

log = logging.getLogger("spectrum_jobs")

SPHEREX_CACHE_DIR = Path(
    os.environ.get("SPHEREX_CACHE_DIR", Path(__file__).parent.parent / ".cache" / "spherex")
)
SPHEREX_CACHE_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = SPHEREX_CACHE_DIR / "jobs.db"
VALID_RELEASES = {"qr2", "qr3"}


class JobPhase(str, Enum):
    QUEUED      = "queued"
    RUNNING     = "running"
    DISCOVERING = "discovering"
    DOWNLOADING = "downloading"
    CALIBRATING = "calibrating"
    POSITIONING = "positioning"
    PHOTOMETRY  = "photometry"
    BINNING     = "binning"
    QA          = "qa"
    COMPLETE    = "complete"
    FAILED      = "failed"
    UNAVAILABLE = "unavailable"


class ProperMotionInput(BaseModel):
    pmra_masyr: float
    pmdec_masyr: float
    reference_epoch_yr: float


class SpectrumJobRequest(BaseModel):
    ra: float
    dec: float
    target_name: Optional[str] = None
    data_release: str = "latest"          # "latest", "qr3", "qr2"
    photometry_method: str = "both"       # "aperture", "psf", "both"
    proper_motion: Optional[ProperMotionInput] = None
    source_morphology: str = "point"      # "point" | "galaxy"


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobPhase
    phase: JobPhase
    progress: int                         # 0–100
    n_cutouts_found: int
    n_measurements: int
    data_release: Optional[str]
    error: Optional[str]
    reason: Optional[str]                 # machine-readable failure code
    started_at: float
    updated_at: float


def _get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn


async def init_job_database() -> None:
    """Initialize SQLite database schema and reconcile jobs from previous restarts."""
    def _init():
        with _get_db_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS extraction_jobs (
                    job_id TEXT PRIMARY KEY,
                    cache_key TEXT UNIQUE,
                    status TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    ra REAL NOT NULL,
                    dec REAL NOT NULL,
                    target_name TEXT,
                    data_release TEXT NOT NULL,
                    photometry_method TEXT NOT NULL,
                    pmra REAL,
                    pmdec REAL,
                    ref_epoch REAL,
                    n_cutouts_found INTEGER DEFAULT 0,
                    n_measurements INTEGER DEFAULT 0,
                    error TEXT,
                    reason TEXT,
                    started_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    result_path TEXT
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_cache_key ON extraction_jobs(cache_key);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON extraction_jobs(status);")

            # Reconcile any orphaned in-flight jobs interrupted by server restart
            active_phases = (
                JobPhase.QUEUED.value,
                JobPhase.RUNNING.value,
                JobPhase.DISCOVERING.value,
                JobPhase.DOWNLOADING.value,
                JobPhase.CALIBRATING.value,
                JobPhase.POSITIONING.value,
                JobPhase.PHOTOMETRY.value,
                JobPhase.BINNING.value,
                JobPhase.QA.value,
            )
            placeholders = ",".join(["?"] * len(active_phases))
            now = time.time()
            cursor = conn.execute(
                f"""
                UPDATE extraction_jobs
                SET status = ?, phase = ?, error = ?, reason = ?, updated_at = ?
                WHERE status IN ({placeholders})
                """,
                (
                    JobPhase.FAILED.value,
                    JobPhase.FAILED.value,
                    "Extraction was interrupted by a server restart. Please resubmit.",
                    "SERVER_RESTARTED",
                    now,
                    *active_phases,
                ),
            )
            if cursor.rowcount > 0:
                log.info("Reconciled %d interrupted extraction jobs to FAILED on startup.", cursor.rowcount)
            conn.commit()

    await asyncio.to_thread(_init)


def _make_cache_key(request: SpectrumJobRequest) -> str:
    """SHA256 keyed by all scientifically significant parameters."""
    pm = request.proper_motion
    raw = "|".join([
        f"{request.ra:.6f}",
        f"{request.dec:.6f}",
        request.data_release,
        request.photometry_method,
        request.source_morphology,
        f"{pm.pmra_masyr:.4f}" if pm else "0",
        f"{pm.pmdec_masyr:.4f}" if pm else "0",
        f"{pm.reference_epoch_yr:.2f}" if pm else "0",
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


class _JobRegistry:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(2)  # Max 2 concurrent extractions

    async def create_job(self, request: SpectrumJobRequest) -> Tuple[str, bool]:
        """Return (job_id, is_new). Reuses completed or currently running identical job."""
        cache_key = _make_cache_key(request)

        def _db_op():
            with _get_db_connection() as conn:
                row = conn.execute(
                    "SELECT job_id, status FROM extraction_jobs WHERE cache_key = ?",
                    (cache_key,),
                ).fetchone()

                if row:
                    status = row["status"]
                    if status not in (JobPhase.FAILED.value, JobPhase.UNAVAILABLE.value):
                        return row["job_id"], False

                # Create fresh job
                job_id = f"sxjob_{uuid.uuid4().hex[:16]}"
                now = time.time()
                pm = request.proper_motion
                conn.execute(
                    """
                    INSERT INTO extraction_jobs (
                        job_id, cache_key, status, phase, progress, ra, dec,
                        target_name, data_release, photometry_method, pmra, pmdec,
                        ref_epoch, started_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        job_id = excluded.job_id,
                        status = excluded.status,
                        phase = excluded.phase,
                        progress = excluded.progress,
                        started_at = excluded.started_at,
                        updated_at = excluded.updated_at,
                        error = NULL,
                        reason = NULL,
                        result_path = NULL
                    """,
                    (
                        job_id,
                        cache_key,
                        JobPhase.QUEUED.value,
                        JobPhase.QUEUED.value,
                        0,
                        request.ra,
                        request.dec,
                        request.target_name,
                        request.data_release,
                        request.photometry_method,
                        pm.pmra_masyr if pm else None,
                        pm.pmdec_masyr if pm else None,
                        pm.reference_epoch_yr if pm else None,
                        now,
                        now,
                    ),
                )
                conn.commit()
                return job_id, True

        async with self._lock:
            return await asyncio.to_thread(_db_op)

    async def get_job(self, job_id: str) -> Optional[JobStatusResponse]:
        """Fetch current status for job_id from SQLite."""
        def _db_op():
            with _get_db_connection() as conn:
                row = conn.execute(
                    "SELECT * FROM extraction_jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                if not row:
                    return None
                return JobStatusResponse(
                    job_id=row["job_id"],
                    status=JobPhase(row["status"]),
                    phase=JobPhase(row["phase"]),
                    progress=row["progress"],
                    n_cutouts_found=row["n_cutouts_found"],
                    n_measurements=row["n_measurements"],
                    data_release=row["data_release"],
                    error=row["error"],
                    reason=row["reason"],
                    started_at=row["started_at"],
                    updated_at=row["updated_at"],
                )

        return await asyncio.to_thread(_db_op)

    async def update_phase(
        self,
        job_id: str,
        phase: JobPhase,
        progress: int = 0,
        n_cutouts: Optional[int] = None,
        n_meas: Optional[int] = None,
        data_release: Optional[str] = None,
    ) -> None:
        """Update phase, progress, and interim counters."""
        def _db_op():
            with _get_db_connection() as conn:
                now = time.time()
                updates = ["status = ?", "phase = ?", "progress = ?", "updated_at = ?"]
                params = [phase.value, phase.value, progress, now]

                if n_cutouts is not None:
                    updates.append("n_cutouts_found = ?")
                    params.append(n_cutouts)
                if n_meas is not None:
                    updates.append("n_measurements = ?")
                    params.append(n_meas)
                if data_release is not None:
                    updates.append("data_release = ?")
                    params.append(data_release)

                params.append(job_id)
                conn.execute(
                    f"UPDATE extraction_jobs SET {', '.join(updates)} WHERE job_id = ?",
                    tuple(params),
                )
                conn.commit()

        await asyncio.to_thread(_db_op)

    async def mark_complete(
        self,
        job_id: str,
        result_path: Path,
        data_release: str,
        n_measurements: int,
    ) -> None:
        def _db_op():
            with _get_db_connection() as conn:
                now = time.time()
                conn.execute(
                    """
                    UPDATE extraction_jobs
                    SET status = ?, phase = ?, progress = 100, result_path = ?,
                        data_release = ?, n_measurements = ?, updated_at = ?
                    WHERE job_id = ?
                    """,
                    (
                        JobPhase.COMPLETE.value,
                        JobPhase.COMPLETE.value,
                        str(result_path),
                        data_release,
                        n_measurements,
                        now,
                        job_id,
                    ),
                )
                conn.commit()

        await asyncio.to_thread(_db_op)

    async def mark_failed(self, job_id: str, error: str, reason: str) -> None:
        def _db_op():
            with _get_db_connection() as conn:
                now = time.time()
                conn.execute(
                    """
                    UPDATE extraction_jobs
                    SET status = ?, phase = ?, progress = 0, error = ?, reason = ?, updated_at = ?
                    WHERE job_id = ?
                    """,
                    (JobPhase.FAILED.value, JobPhase.FAILED.value, error, reason, now, job_id),
                )
                conn.commit()

        await asyncio.to_thread(_db_op)

    async def mark_unavailable(self, job_id: str, reason: str, message: str) -> None:
        def _db_op():
            with _get_db_connection() as conn:
                now = time.time()
                conn.execute(
                    """
                    UPDATE extraction_jobs
                    SET status = ?, phase = ?, progress = 0, error = ?, reason = ?, updated_at = ?
                    WHERE job_id = ?
                    """,
                    (JobPhase.UNAVAILABLE.value, JobPhase.UNAVAILABLE.value, message, reason, now, job_id),
                )
                conn.commit()

        await asyncio.to_thread(_db_op)

    async def get_result(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Load result JSON from the persisted result_path."""
        def _db_op():
            with _get_db_connection() as conn:
                row = conn.execute(
                    "SELECT result_path, status FROM extraction_jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                if not row or row["status"] != JobPhase.COMPLETE.value or not row["result_path"]:
                    return None
                return row["result_path"]

        res_path_str = await asyncio.to_thread(_db_op)
        if not res_path_str:
            return None

        p = Path(res_path_str)
        if not p.exists():
            return None

        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning("Failed to read result file %s: %s", p, e)
            return None

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job if queued or running."""
        def _db_op():
            with _get_db_connection() as conn:
                row = conn.execute(
                    "SELECT status FROM extraction_jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                if not row:
                    return False
                now = time.time()
                conn.execute(
                    """
                    UPDATE extraction_jobs
                    SET status = ?, phase = ?, error = 'Job cancelled by user request.',
                        reason = 'CANCELLED', updated_at = ?
                    WHERE job_id = ?
                    """,
                    (JobPhase.FAILED.value, JobPhase.FAILED.value, now, job_id),
                )
                conn.commit()
                return True

        return await asyncio.to_thread(_db_op)

    async def find_cached_job(self, ra: float, dec: float, tol_deg: float = 0.0003) -> Optional[str]:
        """Find a completed job near this RA/Dec."""
        def _db_op():
            with _get_db_connection() as conn:
                row = conn.execute(
                    """
                    SELECT job_id FROM extraction_jobs
                    WHERE status = ?
                      AND abs(ra - ?) < ?
                      AND abs(dec - ?) < ?
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (JobPhase.COMPLETE.value, ra, tol_deg, dec, tol_deg),
                ).fetchone()
                return row["job_id"] if row else None

        return await asyncio.to_thread(_db_op)

    async def delete_job(self, job_id: str) -> bool:
        """Remove a job from SQLite database."""
        def _db_op():
            with _get_db_connection() as conn:
                cursor = conn.execute("DELETE FROM extraction_jobs WHERE job_id = ?", (job_id,))
                conn.commit()
                return cursor.rowcount > 0

        return await asyncio.to_thread(_db_op)


registry = _JobRegistry()

