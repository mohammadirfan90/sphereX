"""
spexpi_adapter.py — Async bridge between FastAPI and the blocking spexpi_worker.

Runs the worker in a ThreadPoolExecutor so the event loop is never blocked.
Updates the job registry via thread-safe asyncio callbacks.

Fix: Capture the running event loop at submit time (in the async context) and
pass it explicitly to the thread. Never call asyncio.get_event_loop() from
inside a worker thread — it doesn't see the running loop.
"""

from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from services.spectrum_jobs import (
    SPHEREX_CACHE_DIR,
    JobPhase,
    SpectrumJobRequest,
    registry,
)

log = logging.getLogger("spexpi_adapter")

# Thread pool: 2 concurrent SPExPI extractions (I/O bound, downloads dominate)
_THREAD_POOL = ThreadPoolExecutor(max_workers=int(os.environ.get("SPEXPI_WORKERS", "2")))


def _make_sync_phase_callback(job_id: str, loop: asyncio.AbstractEventLoop):
    """
    Returns a synchronous callback that safely schedules registry updates
    on the captured event loop from any worker thread.
    """
    phase_map = {
        "discovering": JobPhase.DISCOVERING,
        "downloading": JobPhase.DOWNLOADING,
        "calibrating": JobPhase.CALIBRATING,
        "positioning": JobPhase.POSITIONING,
        "photometry":  JobPhase.PHOTOMETRY,
        "binning":     JobPhase.BINNING,
        "qa":          JobPhase.QA,
        "complete":    JobPhase.COMPLETE,
    }

    def callback(jid: str, phase_name: str, progress: int, kwargs: dict) -> None:
        phase = phase_map.get(phase_name, JobPhase.PHOTOMETRY)
        if not loop.is_closed():
            coro = registry.update_phase(
                jid, phase, progress,
                n_cutouts    = kwargs.get("n_cutouts"),
                n_meas       = kwargs.get("n_measurements"),
                data_release = kwargs.get("data_release"),
            )
            try:
                asyncio.run_coroutine_threadsafe(coro, loop)
            except RuntimeError:
                pass

    return callback


async def submit_job(request: SpectrumJobRequest) -> tuple[str, bool]:
    """
    Register a new extraction job and submit it to the thread pool.
    Returns (job_id, is_new). If an identical job is already running, returns existing.
    """
    job_id, is_new = await registry.create_job(request)

    if not is_new:
        log.info("Returning existing job %s for duplicate request", job_id)
        return job_id, False

    artifact_dir = SPHEREX_CACHE_DIR / "jobs" / job_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # Capture the running event loop NOW (in async context) before handing off to thread
    loop = asyncio.get_running_loop()
    phase_callback = _make_sync_phase_callback(job_id, loop)
    pm = request.proper_motion

    def _run():
        from workers.spexpi_worker import run_extraction
        try:
            run_extraction(
                job_id            = job_id,
                ra                = request.ra,
                dec               = request.dec,
                target_name       = request.target_name,
                data_release      = request.data_release,
                photometry_method = request.photometry_method,
                pmra_masyr        = pm.pmra_masyr         if pm else None,
                pmdec_masyr       = pm.pmdec_masyr        if pm else None,
                reference_epoch_yr= pm.reference_epoch_yr if pm else None,
                phase_callback    = phase_callback,
                artifact_dir      = artifact_dir,
            )
            # Read result file that worker wrote
            import json
            result_path = artifact_dir / "spectrum.json"
            result = json.loads(result_path.read_text(encoding="utf-8"))
            n_meas = result.get("diagnostics", {}).get("n_valid_measurements", 0)
            dr     = result.get("data_release", "unknown")
            if not loop.is_closed():
                try:
                    asyncio.run_coroutine_threadsafe(
                        registry.mark_complete(job_id, result_path, dr, n_meas), loop
                    )
                except RuntimeError:
                    pass
        except RuntimeError as e:
            msg = str(e)
            parts = msg.split(":", 1)
            reason  = parts[0] if len(parts) == 2 else "EXTRACTION_FAILED"
            message = parts[1] if len(parts) == 2 else msg
            if not loop.is_closed():
                try:
                    if reason == "NO_COVERAGE":
                        asyncio.run_coroutine_threadsafe(
                            registry.mark_unavailable(job_id, reason, message), loop
                        )
                    else:
                        asyncio.run_coroutine_threadsafe(
                            registry.mark_failed(job_id, message, reason), loop
                        )
                except RuntimeError:
                    pass
        except Exception as e:
            log.exception("[%s] Unexpected error in spexpi worker", job_id)
            if not loop.is_closed():
                try:
                    asyncio.run_coroutine_threadsafe(
                        registry.mark_failed(job_id, str(e), "EXTRACTION_FAILED"), loop
                    )
                except RuntimeError:
                    pass

    loop.run_in_executor(_THREAD_POOL, _run)
    log.info("Submitted new SPExPI job %s", job_id)
    return job_id, True


async def get_job_result(job_id: str) -> dict[str, Any] | None:
    """Return the completed spectrum JSON or None if not ready."""
    return await registry.get_result(job_id)


async def cancel_job(job_id: str) -> bool:
    """Cancel a pending or running extraction job in SQLite registry."""
    return await registry.cancel_job(job_id)

