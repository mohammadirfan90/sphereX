"""Unit tests for SPExPI SQLite persistent job queue."""

import pytest
import sqlite3
import asyncio
from fastapi.testclient import TestClient
from main import app
from services.spectrum_jobs import (
    init_job_database,
    registry,
    DB_PATH,
    SpectrumJobRequest,
    JobPhase,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_db():
    asyncio.run(init_job_database())


def test_sqlite_jobs_schema():
    """Verify SQLite database table exists with expected schema."""
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='extraction_jobs';")
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == "extraction_jobs"


def test_spexpi_job_submission_and_poll():
    """Test job submission and immediate polling through FastAPI endpoints."""
    response = client.post(
        "/api/spectrophotometry/jobs",
        json={
            "ra": 269.452,
            "dec": 4.693,
            "target_name": "Barnard's Star",
            "data_release": "qr3",
            "photometry_method": "both",
        },
    )
    assert response.status_code in (200, 202)
    data = response.json()
    assert "job_id" in data
    job_id = data["job_id"]
    assert data["status"] in ["queued", "running", "discovering"]

    # Poll status
    poll_resp = client.get(f"/api/spectrophotometry/jobs/{job_id}")
    assert poll_resp.status_code == 200
    poll_data = poll_resp.json()
    assert poll_data["job_id"] == job_id
    assert poll_data["status"] in ["queued", "running", "discovering", "complete", "unavailable"]


def test_spexpi_crash_reconciliation():
    """Verify that interrupted 'running' jobs are reconciled on server restart with SERVER_RESTARTED."""
    fake_job_id = "test-crash-recovery-job-123"

    # Manually insert an abandoned 'running' job
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO extraction_jobs (
                job_id, cache_key, status, phase, progress, ra, dec,
                target_name, data_release, photometry_method,
                started_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (fake_job_id, "fake_cache_key_999", "running", "photometry", 45, 100.0, 20.0, "Interrupted Target", "qr3", "aperture", 1000.0, 1000.0),
        )
        conn.commit()

    # Run startup reconciliation
    asyncio.run(init_job_database())

    # Check job status is now 'failed' with SERVER_RESTARTED
    job = asyncio.run(registry.get_job(fake_job_id))
    assert job is not None
    assert job.status == JobPhase.FAILED
    assert job.reason == "SERVER_RESTARTED"


def test_spexpi_job_cancellation():
    """Verify job cancellation updates status to cancelled."""
    req = SpectrumJobRequest(
        ra=150.0,
        dec=10.0,
        target_name="Cancel Target",
        data_release="qr3",
        photometry_method="aperture",
    )
    job_id, _ = asyncio.run(registry.create_job(req))
    initial_job = asyncio.run(registry.get_job(job_id))
    assert initial_job is not None
    assert initial_job.status == JobPhase.QUEUED

    # Cancel the job
    cancelled = asyncio.run(registry.cancel_job(job_id))
    assert cancelled is True

    # Verify status
    updated_job = asyncio.run(registry.get_job(job_id))
    assert updated_job is not None
    assert updated_job.status == JobPhase.FAILED
    assert updated_job.reason == "CANCELLED"
