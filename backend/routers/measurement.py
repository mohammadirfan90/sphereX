"""Measurement router (Phase 8).

Endpoint:

  POST /api/measurement/aperture
        — Pull a HiPS2FITS cutout and run aperture photometry at the
          requested (RA, Dec). Returns centroid, flux, SNR, magnitude
          (when a zeropoint is supplied), and provenance.

The endpoint NEVER fabricates measurements. If the cutout cannot be
fetched or the photometry cannot complete, the response is a 502 / 503
with an explicit message; no synthetic numbers are returned.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from adapters.measurement import (
    PhotometryResult,
    PixelSource,
    measure_at_position,
    DEFAULT_APERTURE_RADIUS_PX,
    APERTURE_RADIUS_MIN_PX,
    APERTURE_RADIUS_MAX_PX,
    DEFAULT_HIPS2FITS_URL,
    ApertureRadiusInvalid,
    CutoutFetchError,
    CutoutDecodeError,
)
from adapters.provenance import build_provenance_bundle

log = logging.getLogger("measurement_router")
router = APIRouter(prefix="/measurement", tags=["Measurement (aperture photometry)"])


# ── Pydantic response models ────────────────────────────────────────────────


class PixelSourceResponse(BaseModel):
    centroid_x_px: float
    centroid_y_px: float
    peak_value: float
    aperture_flux: float
    aperture_flux_uncertainty: float
    snr: float
    magnitude: Optional[float] = None
    magnitude_uncertainty: Optional[float] = None
    background_per_pixel: float
    n_pixels_in_aperture: int
    is_centroid_converged: bool


class PhotometryResponse(BaseModel):
    cutout_url: str
    hips_id: str
    width_px: int
    height_px: int
    fov_deg: float
    ra_deg: float
    dec_deg: float
    aperture_radius_px: float
    background_per_pixel: float
    background_rms: float
    sources: list[PixelSourceResponse] = Field(default_factory=list)
    n_sources_detected: int
    provenance: dict


# ── Conversion ───────────────────────────────────────────────────────────────


def _result_to_response(r: PhotometryResult) -> PhotometryResponse:
    sources = [
        PixelSourceResponse(
            centroid_x_px=s.centroid_x_px,
            centroid_y_px=s.centroid_y_px,
            peak_value=s.peak_value,
            aperture_flux=s.aperture_flux,
            aperture_flux_uncertainty=s.aperture_flux_uncertainty,
            snr=s.snr,
            magnitude=s.magnitude,
            magnitude_uncertainty=s.magnitude_uncertainty,
            background_per_pixel=s.background_per_pixel,
            n_pixels_in_aperture=s.n_pixels_in_aperture,
            is_centroid_converged=s.is_centroid_converged,
        )
        for s in r.sources
    ]
    prov = build_provenance_bundle(
        service="CDS HiPS2FITS + in-house aperture photometry",
        endpoint=DEFAULT_HIPS2FITS_URL,
        adapter_contract="adapters.measurement:measure_at_position",
        extra={
            "hips_id": r.hips_id,
            "fov_deg": r.fov_deg,
            "width_px": r.width_px,
            "height_px": r.height_px,
            "aperture_radius_px": r.aperture_radius_px,
            "background_per_pixel": r.background_per_pixel,
            "background_rms": r.background_rms,
            **r.provenance,
        },
    )
    return PhotometryResponse(
        cutout_url=r.cutout_url,
        hips_id=r.hips_id,
        width_px=r.width_px,
        height_px=r.height_px,
        fov_deg=r.fov_deg,
        ra_deg=r.ra_deg,
        dec_deg=r.dec_deg,
        aperture_radius_px=r.aperture_radius_px,
        background_per_pixel=r.background_per_pixel,
        background_rms=r.background_rms,
        sources=sources,
        n_sources_detected=r.n_sources_detected,
        provenance=prov,
    )


# ── Routes ───────────────────────────────────────────────────────────────────


@router.post("/aperture", response_model=PhotometryResponse)
async def aperture_photometry(
    ra: float = Query(..., ge=0.0, lt=360.0, description="J2000 RA in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="J2000 Dec in degrees"),
    fov_deg: float = Query(0.02, gt=0.0, le=0.5,
                           description="Cutout field of view in degrees (max 0.5°)"),
    hips_id: str = Query("P/DSS2/color",
                         min_length=1, max_length=120,
                         description="HiPS layer identifier (e.g. P/DSS2/color, P/allWISE/color)"),
    width_px: int = Query(300, ge=32, le=2048, description="Cutout width in pixels"),
    height_px: int = Query(300, ge=32, le=2048, description="Cutout height in pixels"),
    aperture_radius_px: float = Query(
        DEFAULT_APERTURE_RADIUS_PX, ge=APERTURE_RADIUS_MIN_PX,
        le=APERTURE_RADIUS_MAX_PX,
        description=f"Aperture radius in pixels [{APERTURE_RADIUS_MIN_PX}, {APERTURE_RADIUS_MAX_PX}]",
    ),
    magnitude_zeropoint: Optional[float] = Query(
        None, description="Photometric zeropoint; without this, magnitude is None",
    ),
):
    """Pull a HiPS2FITS cutout and run aperture photometry at (RA, Dec).

    The cutout is fetched live from CDS alasky. We return 502 if the
    fetch fails, 503 if cutout decoding fails (e.g. Pillow not
    installed), and 400 if the aperture radius is outside the
    permitted range.
    """
    t0 = time.monotonic()
    try:
        result = await measure_at_position(
            ra_deg=ra, dec_deg=dec, fov_deg=fov_deg, hips_id=hips_id,
            width_px=width_px, height_px=height_px,
            aperture_radius_px=aperture_radius_px,
            magnitude_zeropoint=magnitude_zeropoint,
        )
    except ApertureRadiusInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except CutoutFetchError as exc:
        raise HTTPException(status_code=502, detail=f"HiPS2FITS unreachable: {exc}")
    except CutoutDecodeError as exc:
        raise HTTPException(status_code=503, detail=f"Cutout decode failed: {exc}")

    if result is None:
        raise HTTPException(status_code=502, detail="Photometry returned no result.")

    log.info(
        "Aperture phot ra=%f dec=%f foV=%f hips=%s -> flux=%.4f SNR=%.2f in %.2fs",
        ra, dec, fov_deg, hips_id,
        result.sources[0].aperture_flux if result.sources else 0.0,
        result.sources[0].snr if result.sources else 0.0,
        time.monotonic() - t0,
    )
    return _result_to_response(result)
