"""
provenance.py — Build provenance documents for SPExPI spectral extraction jobs.
"""

from __future__ import annotations

import importlib.metadata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def spexpi_version() -> str:
    try:
        return importlib.metadata.version("spexpi")
    except Exception:
        return "unknown"


def build_provenance(
    request_dict: dict[str, Any],
    data_release: str,
    sapm_collection: str,
    spectral_channels_collection: str | None,
    photometry_method: str,
    aperture_radius_pix: float,
    n_cutouts: int,
    n_measurements: int,
    extracted_at: datetime | None = None,
) -> dict[str, Any]:
    """Return a provenance document for one completed extraction job."""
    if extracted_at is None:
        extracted_at = datetime.now(timezone.utc)

    return {
        "pipeline": f"SPExPI v{spexpi_version()}",
        "source": "NASA/IPAC IRSA SPHEREx",
        "release": data_release,
        "sapm_collection": sapm_collection,
        "spectral_channels_collection": spectral_channels_collection,
        "photometry_method": photometry_method,
        "aperture_radius_pix": aperture_radius_pix,
        "n_cutouts_processed": n_cutouts,
        "n_valid_measurements": n_measurements,
        "extracted_at": extracted_at.isoformat(),
        "governing_rule": (
            "NO SYNTHETIC SCIENTIFIC MEASUREMENTS. "
            "All flux values originate from SPHEREx FITS products and SPHEREx calibration products."
        ),
        "request": request_dict,
    }


def save_provenance(provenance: dict[str, Any], artifact_dir: Path) -> Path:
    """Write provenance.json into the job artifact directory."""
    artifact_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_dir / "provenance.json"
    import json
    path.write_text(json.dumps(provenance, indent=2, default=str), encoding="utf-8")
    return path
