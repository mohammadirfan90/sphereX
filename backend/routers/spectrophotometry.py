"""SPHEREx Odyssey Spectral Extraction API (SPExPI).

Endpoints:
  POST   /spectrophotometry/jobs           → submit authentic SPExPI extraction job
  GET    /spectrophotometry/jobs/{job_id} → poll phase + progress from SQLite registry
  GET    /spectrophotometry/jobs/{job_id}/result → fetch completed spectrum JSON
  DELETE /spectrophotometry/jobs/{job_id} → cancel/remove job from SQLite registry
  GET    /spectrophotometry/preview        → return cached measurement if available

NO SYNTHETIC SCIENTIFIC MEASUREMENTS.
All spectrum values originate from SPHEREx FITS products via SPExPI.
Failure → explicit UNAVAILABLE state, never a fabricated spectrum.
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from adapters.spexpi_adapter import get_job_result, submit_job, cancel_job
from services.spectrum_jobs import (
    JobPhase,
    ProperMotionInput,
    SpectrumJobRequest,
    JobStatusResponse,
    registry,
)

router = APIRouter(prefix="/spectrophotometry", tags=["SPHEREx Spectrophotometry"])


class JobCreateRequest(BaseModel):
    ra: float = Field(..., ge=0.0, lt=360.0, description="Right ascension (J2000, degrees)")
    dec: float = Field(..., ge=-90.0, le=90.0, description="Declination (J2000, degrees)")
    target_name: Optional[str] = Field(None, description="Human-readable target label")
    data_release: str = Field("latest", description="'qr3', 'qr2', or 'latest'")
    photometry_method: str = Field("both", description="'aperture', 'psf', or 'both'")
    proper_motion: Optional[ProperMotionInput] = Field(None)
    source_morphology: str = Field("point", description="'point' or 'galaxy'")


class JobSubmitResponse(BaseModel):
    job_id: str
    status: str
    is_new: bool


@router.post("/jobs", response_model=JobSubmitResponse, status_code=202)
async def submit_spectrum_job(body: JobCreateRequest):
    """Submit a new SPExPI spectral extraction job.

    Returns immediately with a job_id; poll GET /jobs/{job_id} for progress.
    """
    if body.data_release not in ("latest", "qr3", "qr2"):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid data_release={body.data_release!r}. Use 'qr3', 'qr2', or 'latest'.",
        )
    if body.photometry_method not in ("aperture", "psf", "both"):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid photometry_method={body.photometry_method!r}.",
        )

    request = SpectrumJobRequest(
        ra=body.ra,
        dec=body.dec,
        target_name=body.target_name,
        data_release=body.data_release,
        photometry_method=body.photometry_method,
        proper_motion=body.proper_motion,
        source_morphology=body.source_morphology,
    )

    job_id, is_new = await submit_job(request)
    return JobSubmitResponse(job_id=job_id, status="queued", is_new=is_new)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Poll extraction job status from persistent SQLite store."""
    job = await registry.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found in database.")
    return job


@router.get("/jobs/{job_id}/result")
async def get_job_result_endpoint(job_id: str) -> dict[str, Any]:
    """Fetch the completed SPHEREx spectrum.

    Returns 404 if not found; 503 if unavailable; 502 if failed; 202 if in progress.
    Response is always authentic source='spherex_real' — never synthetic.
    """
    job = await registry.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")

    if job.status == JobPhase.UNAVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unavailable",
                "reason": job.reason,
                "message": job.error or "SPHEREx data could not be retrieved for this coordinate.",
            },
        )
    if job.status == JobPhase.FAILED:
        raise HTTPException(
            status_code=502,
            detail={
                "status": "failed",
                "reason": job.reason,
                "message": job.error or "SPExPI extraction failed.",
            },
        )
    if job.status != JobPhase.COMPLETE:
        raise HTTPException(
            status_code=202,
            detail={
                "status": job.status.value,
                "phase": job.phase.value,
                "progress": job.progress,
                "message": "Extraction in progress. Poll this endpoint.",
            },
        )

    result = await get_job_result(job_id)
    if result is None:
        raise HTTPException(status_code=500, detail="Result artifact not found on disk.")
    return result


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job_endpoint(job_id: str):
    """Cancel or remove an extraction job from the SQLite registry."""
    cancelled = await cancel_job(job_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")


@router.get("/preview")
async def get_preview(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
) -> dict[str, Any]:
    """Return a cached real-data spectrum if already extracted for this coordinate,

    otherwise return { available: false } without starting a new job.
    """
    cached_job_id = await registry.find_cached_job(ra=ra, dec=dec)
    if cached_job_id:
        result = await get_job_result(cached_job_id)
        if result:
            return {"available": True, "job_id": cached_job_id, "preview": result}

    return {
        "available": False,
        "message": "No cached SPHEREx spectrum for this coordinate. Submit a POST /jobs request to extract.",
    }
