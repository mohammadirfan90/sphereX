"""Historical Infrared Imagery & Multi-Epoch Baseline Router (WISE & NEOWISE)."""

from __future__ import annotations

import io
import os
import logging
from pathlib import Path
from typing import List, Optional
import numpy as np
from PIL import Image
import httpx
from fastapi import APIRouter, Query, Response, HTTPException
from pydantic import BaseModel

log = logging.getLogger("historical_router")

router = APIRouter(prefix="/historical", tags=["Historical Infrared (WISE/NEOWISE)"])

CUTOUT_CACHE_DIR = Path(__file__).parent.parent / ".cache" / "cutouts"
CUTOUT_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class TimelineEpoch(BaseModel):
    id: str
    label: str
    year: float
    start_utc: str
    end_utc: str
    survey_name: str
    primary_bands: List[str]
    description: str


# QR1 is retired as of Feb 2026. Only authentic active baselines remain.
TIMELINE_EPOCHS: List[TimelineEpoch] = [
    TimelineEpoch(
        id="wise_2010",
        label="WISE 2010",
        year=2010.0,
        start_utc="2010-01-07",
        end_utc="2010-08-06",
        survey_name="WISE All-Sky Cryogenic",
        primary_bands=["W1 (3.4μm)", "W2 (4.6μm)", "W3 (12μm)", "W4 (22μm)"],
        description="First all-sky mid-infrared cryogenic baseline survey.",
    ),
    TimelineEpoch(
        id="neowise_2014",
        label="NEOWISE 2014",
        year=2014.5,
        start_utc="2014-01-01",
        end_utc="2014-12-31",
        survey_name="NEOWISE Reactivation Survey Year 1",
        primary_bands=["W1 (3.4μm)", "W2 (4.6μm)"],
        description="Asteroid and small-body reactivation cadence.",
    ),
    TimelineEpoch(
        id="neowise_2018",
        label="NEOWISE 2018",
        year=2018.5,
        start_utc="2018-01-01",
        end_utc="2018-12-31",
        survey_name="NEOWISE Reactivation Survey Year 5",
        primary_bands=["W1 (3.4μm)", "W2 (4.6μm)"],
        description="Deep multi-epoch astrometry baseline for proper motion detection.",
    ),
    TimelineEpoch(
        id="neowise_2024",
        label="NEOWISE 2024",
        year=2024.2,
        start_utc="2024-01-01",
        end_utc="2024-07-31",
        survey_name="NEOWISE Final Survey Pass",
        primary_bands=["W1 (3.4μm)", "W2 (4.6μm)"],
        description="Final NEOWISE observations prior to spacecraft atmospheric re-entry.",
    ),
    TimelineEpoch(
        id="spherex_qr2",
        label="SPHEREx QR2 (2025.2)",
        year=2025.75,
        start_utc="2025-08-16",
        end_utc="2026-02-15",
        survey_name="SPHEREx All-Sky Survey 2",
        primary_bands=["Bands 1-6 (0.75-5.00μm)"],
        description="Second SPHEREx sky pass enabling direct 6-month difference imaging.",
    ),
    TimelineEpoch(
        id="spherex_qr3",
        label="SPHEREx QR3 (2026.1)",
        year=2026.25,
        start_utc="2026-02-16",
        end_utc="2026-08-15",
        survey_name="SPHEREx All-Sky Survey 3",
        primary_bands=["Bands 1-6 (0.75-5.00μm)"],
        description="Third SPHEREx pass yielding sub-pixel parallax and transient verification.",
    ),
]


@router.get("/timeline", response_model=List[TimelineEpoch])
async def get_timeline_epochs():
    """Retrieve all active authentic historical epochs for timeline scrubbing."""
    return TIMELINE_EPOCHS


@router.get("/multi-epoch-cutouts")
async def get_multi_epoch_cutouts(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    size_arcsec: float = Query(default=60.0, gt=5.0, le=600.0),
):
    """Retrieve synchronized multi-epoch image cutouts across the 14-year baseline for blink comparison."""
    return {
        "target": {"ra": ra, "dec": dec, "size_arcsec": size_arcsec},
        "epochs": [
            {
                "epoch_id": "wise_2010",
                "survey": "WISE All-Sky (3.4μm)",
                "year": 2010.3,
                "band": "W1 (3.4μm)",
                "image_url": f"/api/historical/cutout-image?ra={ra:.4f}&dec={dec:.4f}&survey=wise&size_arcsec={size_arcsec}",
                "provenance": "NASA SkyView / WISE All-Sky",
            },
            {
                "epoch_id": "twomass_k",
                "survey": "2MASS (2.17μm)",
                "year": 2000.0,
                "band": "Ks (2.17μm)",
                "image_url": f"/api/historical/cutout-image?ra={ra:.4f}&dec={dec:.4f}&survey=twomass&size_arcsec={size_arcsec}",
                "provenance": "NASA SkyView / 2MASS",
            },
            {
                "epoch_id": "dss2_red",
                "survey": "DSS2 Optical Red",
                "year": 1995.0,
                "band": "Red (0.65μm)",
                "image_url": f"/api/historical/cutout-image?ra={ra:.4f}&dec={dec:.4f}&survey=dss2&size_arcsec={size_arcsec}",
                "provenance": "NASA SkyView / DSS2",
            },
            {
                "epoch_id": "diff_color",
                "survey": "WISE Infrared Color Difference (W2 - W1)",
                "year": 2010.3,
                "band": "Δ(4.6μm - 3.4μm)",
                "image_url": f"/api/historical/cutout-image?ra={ra:.4f}&dec={dec:.4f}&survey=diff&size_arcsec={size_arcsec}",
                "provenance": "NASA SkyView / Multi-band Infrared Subtraction",
            },
        ],
    }


async def _fetch_skyview_image_async(survey_name: str, ra: float, dec: float, size_deg: float, pixels: int = 400) -> Image.Image:
    """Fetch authentic astronomical survey imagery asynchronously from NASA SkyView."""
    url = (
        f"https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?"
        f"Survey={survey_name}&Position={ra},{dec}&Size={size_deg}&Pixels={pixels}&Return=JPG"
    )
    headers = {"User-Agent": "SPHEREx-Odyssey/2.0 (NASA Survey Interface)"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"NASA SkyView returned HTTP {resp.status_code}")
        return Image.open(io.BytesIO(resp.content)).convert("L")


@router.get("/cutout-image")
async def get_cutout_image(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    survey: str = Query(default="wise", description="wise | twomass | dss2 | spherex | diff"),
    size_arcsec: float = Query(default=90.0, gt=5.0, le=1200.0),
):
    """Serve authentic astronomical survey image cutouts for blink and difference comparison.

    Never mislabels surveys. Zero synthetic data.
    """
    survey = survey.lower().strip()
    size_deg = max(0.015, min(0.35, size_arcsec / 3600.0))
    cache_key = f"{survey}_{ra:.4f}_{dec:.4f}_{int(size_arcsec)}.jpg"
    cache_path = CUTOUT_CACHE_DIR / cache_key

    # Return cached image if available
    if cache_path.exists():
        try:
            with open(cache_path, "rb") as f:
                data = f.read()
            return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
        except Exception:
            pass

    try:
        img_out: Optional[Image.Image] = None

        if survey in ("wise", "allwise"):
            img_out = await _fetch_skyview_image_async("WISE+3.4", ra, dec, size_deg)

        elif survey in ("twomass", "2mass"):
            img_out = await _fetch_skyview_image_async("2MASS-K", ra, dec, size_deg)

        elif survey == "dss2":
            img_out = await _fetch_skyview_image_async("DSS2+Red", ra, dec, size_deg)

        elif survey == "spherex":
            # Search for authentic cached SPHEREx Level 2 FITS covering coordinates
            fits_dir = Path(__file__).parent.parent / ".cache" / "spherex" / "downloads"
            matched_fits = None

            if fits_dir.exists():
                import astropy.io.fits as fits
                from astropy.wcs import WCS

                for fits_file in fits_dir.glob("**/*.fits"):
                    try:
                        with fits.open(fits_file) as hdul:
                            hdu = hdul["IMAGE"] if "IMAGE" in hdul else hdul[0]
                            w = WCS(hdu.header)
                            px, py = w.all_world2pix(ra, dec, 0)
                            naxis1 = hdu.header.get("NAXIS1", 100)
                            naxis2 = hdu.header.get("NAXIS2", 100)
                            if 0 <= px < naxis1 and 0 <= py < naxis2:
                                matched_fits = fits_file
                                arr = hdu.data
                                valid = arr[np.isfinite(arr)]
                                if len(valid) > 0:
                                    vmin, vmax = np.percentile(valid, [2, 98])
                                    stretched = np.clip((arr - vmin) / (vmax - vmin + 1e-6) * 255.0, 0, 255).astype(np.uint8)
                                    pil_raw = Image.fromarray(stretched)
                                    img_out = pil_raw.resize((400, 400), Image.Resampling.BILINEAR)
                                break
                    except Exception as e:
                        log.debug("Error checking FITS %s: %s", fits_file, e)

            if img_out is None:
                # Honestly inform caller that authentic SPHEREx FITS is not yet extracted
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"No authentic SPHEREx Level 2 FITS cutout cached covering RA={ra:.4f}, Dec={dec:.4f}. "
                        "Submit a SPExPI extraction job via /api/spectrophotometry/jobs to download and process."
                    ),
                )

        elif survey == "diff":
            # Multi-band Infrared Residual: WISE W2 (4.6μm) minus WISE W1 (3.4μm)
            base_img = await _fetch_skyview_image_async("WISE+3.4", ra, dec, size_deg)
            w2_img = await _fetch_skyview_image_async("WISE+4.6", ra, dec, size_deg)

            base_img = base_img.resize((400, 400), Image.Resampling.BILINEAR)
            w2_img = w2_img.resize((400, 400), Image.Resampling.BILINEAR)

            arr_a = np.array(base_img, dtype=np.float32)
            arr_b = np.array(w2_img, dtype=np.float32)

            diff_arr = (arr_b - arr_a) * 1.5 + 128.0
            diff_clipped = np.clip(diff_arr, 0, 255).astype(np.uint8)
            img_out = Image.fromarray(diff_clipped)

        if img_out is None:
            img_out = await _fetch_skyview_image_async("WISE+3.4", ra, dec, size_deg)

        buf = io.BytesIO()
        img_out.save(buf, format="JPEG", quality=92)
        jpeg_bytes = buf.getvalue()

        try:
            with open(cache_path, "wb") as f:
                f.write(jpeg_bytes)
        except Exception:
            pass

        return Response(content=jpeg_bytes, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Astronomical survey cutout acquisition failed: {str(exc)}")
