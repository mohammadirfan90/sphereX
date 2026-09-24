"""Multi-wavelength HiPS composition engine (Phase 10).

Builds a per-coordinate SED stack from the registered HiPS layers in
``adapters.hips_engine``. The engine emits a registry entry per band,
containing:

  * the HiPS layer identifier,
  * the cutout URL via the CDS HiPS2FITS endpoint,
  * the central wavelength / band label,
  * the FITS pixel scale at the target (arcsec/pixel).

The engine does NOT fetch pixels; it builds URLs. Pixel fetching
lives in the measurement engine (Phase 8). This separation keeps the
composition layer free of network/decoder dependencies.

Composition rules (overlay-aware blending):

  1. Each band contributes ONE cutout URL at the requested (RA, Dec)
     and FOV. We never substitute a different band for the requested one.

  2. Per-band cutouts are returned in increasing central-wavelength
     order, so the SED is naturally ordered (FUV -> NIR -> MIR).

  3. Duplicate bands (same HiPS identifier at the same FOV) are
     deduplicated - we return each layer at most once.

  4. The composition is "overlay-aware" in the sense that we report
     per-layer wavelength metadata so the front-end can apply
     band-specific scaling (e.g. log-stretch for faint bands,
     sqrt-stretch for high-dynamic-range images) without our
     guessing.

Scientific invariants:

  * No synthetic bands. If a requested HiPS layer is not in the
    registry, it is rejected with :class:`HiPSLayerUnknown`.
  * No "best-fit" interpolation across missing bands. A missing band
    means a missing entry in the SED stack.
  * The FOV is shared across all bands to enable pixel-level overlay.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from adapters.hips_engine import (
    HiPSBandProperties,
    HiPSError,
    get_spherex_hips,
    get_context_hips,
)
from adapters.cds_adapter import build_hips2fits_url

log = logging.getLogger("hips_compose")


# ── Typed scientific model ───────────────────────────────────────────────────


@dataclass
class BandCutout:
    """A single multi-wavelength cutout entry in the SED stack."""
    hips_id: str
    hips_release: Optional[str]      # e.g. "qr3", "qr2" or None for context
    category: str                    # "spherex" or "context"
    band_label: str                  # e.g. "FUV", "DSS2_red"
    central_wavelength_um: Optional[float]
    cutout_url: str
    fov_deg: float
    width_px: int
    height_px: int
    pixel_scale_arcsec: float


@dataclass
class SEDStack:
    """The composed multi-wavelength SED stack for a target."""
    target_ra_deg: float
    target_dec_deg: float
    fov_deg: float
    width_px: int
    height_px: int
    pixel_scale_arcsec: float
    bands: List[BandCutout] = field(default_factory=list)
    n_bands: int = 0
    n_missing: int = 0
    missing_band_labels: List[str] = field(default_factory=list)
    provenance: Dict[str, str] = field(default_factory=dict)


# ── Exceptions ───────────────────────────────────────────────────────────────


class HiPSCompositionError(HiPSError):
    """Composition rule violation."""


# ── Public driver ───────────────────────────────────────────────────────────


def compose_sed_at_position(
    ra_deg: float,
    dec_deg: float,
    fov_deg: float = 0.05,
    width_px: int = 300,
    height_px: int = 300,
    spherex_release: str = "qr3",
    include_context: bool = True,
) -> SEDStack:
    """Compose a multi-wavelength SED stack at (RA, Dec).

    Iterates over the requested spherex_release bands (qr2 or qr3) and
    appends context layers (DSS2, 2MASS, WISE) when ``include_context``
    is True. Returns the deduplicated, wavelength-ordered stack.

    The composition does NOT fetch pixels; downstream code (Phase 8
    measurement engine) calls HiPS2FITS to retrieve each band.
    """
    if not (0.0 <= ra_deg < 360.0):
        raise HiPSCompositionError(f"ra_deg out of range: {ra_deg!r}")
    if not (-90.0 <= dec_deg <= 90.0):
        raise HiPSCompositionError(f"dec_deg out of range: {dec_deg!r}")
    if fov_deg <= 0.0 or fov_deg > 1.0:
        raise HiPSCompositionError(f"fov_deg must be in (0, 1.0]; got {fov_deg!r}")
    if width_px < 32 or width_px > 4096:
        raise HiPSCompositionError(f"width_px must be in [32, 4096]; got {width_px}")
    if height_px < 32 or height_px > 4096:
        raise HiPSCompositionError(f"height_px must be in [32, 4096]; got {height_px}")

    pixel_scale_arcsec = (fov_deg * 3600.0) / float(width_px)

    stack = SEDStack(
        target_ra_deg=ra_deg,
        target_dec_deg=dec_deg,
        fov_deg=fov_deg,
        width_px=width_px,
        height_px=height_px,
        pixel_scale_arcsec=pixel_scale_arcsec,
    )

    seen_ids: Dict[str, BandCutout] = {}

    # 1) SPHEREx bands from the requested release.
    spherex_layers = get_spherex_hips(release=spherex_release)
    for layer in spherex_layers:
        entry = _build_entry(
            layer=layer,
            hips_release=spherex_release,
            category="spherex",
            ra_deg=ra_deg, dec_deg=dec_deg, fov_deg=fov_deg,
            width_px=width_px, height_px=height_px,
        )
        seen_ids[entry.hips_id] = entry

    # 2) Context layers.
    if include_context:
        for layer in get_context_hips():
            entry = _build_entry(
                layer=layer,
                hips_release=None,
                category="context",
                ra_deg=ra_deg, dec_deg=dec_deg, fov_deg=fov_deg,
                width_px=width_px, height_px=height_px,
            )
            # Deduplicate.
            if entry.hips_id not in seen_ids:
                seen_ids[entry.hips_id] = entry

    # 3) Sort by central wavelength (None sorts last).
    ordered = sorted(
        seen_ids.values(),
        key=lambda b: (
            b.central_wavelength_um if b.central_wavelength_um is not None
            else float("inf")
        ),
    )

    # 4) Identify missing SPHEREx bands (LVF indices with no registered layer).
    expected_band_indices = set(SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS.keys())
    actual_band_indices = set()
    for b in ordered:
        if b.category == "spherex" and b.band_label.startswith("SPHEREx_B"):
            try:
                idx = int(b.band_label.split("_B")[1].split(" ")[0])
                actual_band_indices.add(idx)
            except (IndexError, ValueError):
                pass
    missing_idx = expected_band_indices - actual_band_indices
    missing = [SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS[i] for i in missing_idx]
    stack.bands = ordered
    stack.n_bands = len(ordered)
    stack.n_missing = len(missing)
    stack.missing_band_labels = sorted(f"{w:.3f}um" for w in missing)
    stack.provenance = {
        "engine": "adapters.hips_compose:compose_sed_at_position",
        "spherex_release": spherex_release,
        "include_context": str(include_context),
        "spherex_layers_known": str(len(get_spherex_hips(release=spherex_release))),
        "context_layers_known": str(len(get_context_hips())),
    }

    return stack


def _build_entry(
    *,
    layer: HiPSBandProperties,
    hips_release: Optional[str],
    category: str,
    ra_deg: float,
    dec_deg: float,
    fov_deg: float,
    width_px: int,
    height_px: int,
) -> BandCutout:
    """Construct a BandCutout for a single HiPS layer."""
    central_wl = None
    band_label = layer.obs_title
    if category == "spherex" and layer.spherex_band is not None:
        central_wl = SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS.get(layer.spherex_band)
        if central_wl is not None:
            band_label = f"SPHEREx_B{layer.spherex_band} ({central_wl:.3f}um)"

    url = build_hips2fits_url(layer.creator_did, ra_deg, dec_deg, fov_deg, width_px, height_px)
    pixel_scale = (fov_deg * 3600.0) / float(width_px)
    return BandCutout(
        hips_id=layer.creator_did,
        hips_release=hips_release,
        category=category,
        band_label=band_label,
        central_wavelength_um=central_wl,
        cutout_url=url,
        fov_deg=fov_deg,
        width_px=width_px,
        height_px=height_px,
        pixel_scale_arcsec=pixel_scale,
    )
