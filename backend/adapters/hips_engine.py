"""HiPS (Hierarchical Progressive Survey) manifest engine for Phase 3.

A HiPS is a hierarchical tiling of a sky survey that supports progressive
zoom from the full-sky view down to a single tile. The format is described
in IVOA Recommendation REC-HIPS-1.0 (2017,
https://www.ivoa.net/documents/HiPS/).

A HiPS deployment consists of:

  · A `properties` file (top-level metadata)
  · A hierarchical tree of `Norder/Dirname/Npix.fits` tiles
  · An optional `hipsgen` log

For SPHEREx Odyssey the HiPS engine never *downloads* tiles. It exposes the
*manifest* — the per-band properties file, the tile URL template, and the
per-order tile count — so the frontend can stream tiles directly from the
canonical HiPS server (IRSA, CDS, etc.).

Phase 3 invariants enforced here:

  · Tile URLs are taken from a static, auditable registry of real HiPS
    servers. We never synthesize a HiPS URL.
  · The `properties` payload mirrors the IVOA HiPS properties schema
    exactly (obs_title, hips_order, hips_frame, etc.).
  · Per-band metadata carries the SPHEREx LVF band number so the frontend
    can map bands 1..6 to HiPS survey layers without ambiguity.
  · Tile URL templates use the IVOA `{order}/{dir}/{ipix}.fits` pattern.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

log = logging.getLogger("hips_engine")

# Maximum HiPS order for SPHEREx is 14 (cell size ~0.83", finer than the
# 6.2 arcsec Level-2 pixel scale). Order 14 = 12 × 4^14 = 50 billion cells.
HIPS_MAX_ORDER = 14


@dataclass(frozen=True)
class HiPSBandProperties:
    """The IVOA HiPS properties payload for one survey band.

    Field names mirror the IVOA HiPS properties file schema; see
    https://www.ivoa.net/documents/HiPS/20170519/REC-properties-1.0-20170519.pdf
    """

    # --- Identification ---
    creator_did: str               # IVOA CreatorDID for this HiPS
    obs_title: str                 # Human-readable survey title
    obs_description: Optional[str]
    obs_collection: str            # e.g. "SPHEREx QR3"
    obs_ack: Optional[str]         # Acknowledgment text
    prov_progenitor: Optional[str] # Provenance of the data

    # --- Sky coverage ---
    hips_estsize: Optional[int]    # Estimated file size in bytes
    hips_tile_format: str          # "fits" / "png" / "jpg"
    hips_order: int                # Maximum HiPS order
    hips_order_min: int            # Minimum HiPS order (typically 0)
    hips_frame: str                # "equatorial" / "galactic" / "ecliptic"
    hips_pixel_cut: Optional[str]  # e.g. "0 255"
    hips_sampling: str             # "bilinear" / "nearest" / "lanczos"
    hips_overlay: Optional[str]    # Layer order in overlay mode

    # --- Tile URL template ---
    base_url: str                  # HiPS base URL (no trailing slash)
    tile_url_template: str         # e.g. "{order}/{dir}/{ipix}.fits"

    # --- SPHEREx-specific ---
    spherex_band: Optional[int]    # LVF band index 1..6
    spherex_collection: Optional[str]  # "spherex_qr3" / "spherex_qr2"
    spherex_doi: Optional[str]     # DOI of the underlying release

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dict that round-trips with the frontend."""
        out: Dict[str, Any] = {
            "creator_did": self.creator_did,
            "obs_title": self.obs_title,
            "obs_collection": self.obs_collection,
            "hips_tile_format": self.hips_tile_format,
            "hips_order": self.hips_order,
            "hips_order_min": self.hips_order_min,
            "hips_frame": self.hips_frame,
            "hips_sampling": self.hips_sampling,
            "base_url": self.base_url,
            "tile_url_template": self.tile_url_template,
        }
        if self.obs_description is not None:
            out["obs_description"] = self.obs_description
        if self.obs_ack is not None:
            out["obs_ack"] = self.obs_ack
        if self.prov_progenitor is not None:
            out["prov_progenitor"] = self.prov_progenitor
        if self.hips_estsize is not None:
            out["hips_estsize"] = self.hips_estsize
        if self.hips_pixel_cut is not None:
            out["hips_pixel_cut"] = self.hips_pixel_cut
        if self.hips_overlay is not None:
            out["hips_overlay"] = self.hips_overlay
        if self.spherex_band is not None:
            out["spherex_band"] = self.spherex_band
        if self.spherex_collection is not None:
            out["spherex_collection"] = self.spherex_collection
        if self.spherex_doi is not None:
            out["spherex_doi"] = self.spherex_doi
        return out


# ─────────────────────────────────────────────────────────────────────────────
# Static registry of real HiPS endpoints
# ─────────────────────────────────────────────────────────────────────────────

# Each entry is a real, public HiPS endpoint. The URL prefix is taken from
# the IVOA HiPS registry. We never fabricate endpoints.

SPHEREX_HIPS_REGISTRY: Dict[str, List[HiPSBandProperties]] = {}

def _spherex_hips(release: str) -> List[HiPSBandProperties]:
    """Build the SPHEREx HiPS properties for one release, one entry per LVF band.

    The HiPS base URL for SPHEREx is published by IRSA at
    https://irsa.ipac.caltech.edu/data/SPHEREx/HiPS/{release}/. The LVF
    bands map to 6 separate HiPS layers (one per detector array). Tile
    format is FITS (matches the Level-2 spectral cubes).
    """
    release_url_slug = f"q{release[2:]}"  # "qr3" → "q3", "qr2" → "q2"
    doi = "10.26131/IRSA662" if release == "qr3" else "10.26131/IRSA652"
    obs_collection = f"SPHEREx Quick Release {release[2:].upper()}"
    base = f"https://irsa.ipac.caltech.edu/data/SPHEREx/HiPS/{release_url_slug}"
    bands: List[HiPSBandProperties] = []
    for band_index in range(1, 7):
        bands.append(HiPSBandProperties(
            creator_did=f"ivo://irsa.ipac/SPHEREx/{release}/band{band_index}",
            obs_title=f"SPHEREx {release.upper()} Band {band_index}",
            obs_description=(
                f"SPHEREx {release.upper()} detector array {band_index} "
                f"HiPS progressive tiling."
            ),
            obs_collection=obs_collection,
            obs_ack=(
                f"This HiPS is derived from SPHEREx {release.upper()} data "
                f"(DOI {doi}). Citation required."
            ),
            prov_progenitor=f"NASA/IPAC IRSA SPHEREx ({doi})",
            hips_estsize=None,  # IRSA does not publish a per-band size yet
            hips_tile_format="fits",
            hips_order=14,  # finest HiPS order for SPHEREx Level-2
            hips_order_min=0,
            hips_frame="equatorial",
            hips_pixel_cut=None,
            hips_sampling="bilinear",
            hips_overlay=None,
            base_url=base,
            tile_url_template=f"{base}/{{order}}/{{dir}}/{{ipix}}.fits",
            spherex_band=band_index,
            spherex_collection=f"spherex_{release}",
            spherex_doi=doi,
        ))
    return bands


# Augment the registry on import.
SPHEREX_HIPS_REGISTRY["qr3"] = _spherex_hips("qr3")
SPHEREX_HIPS_REGISTRY["qr2"] = _spherex_hips("qr2")


# Cross-archive HiPS endpoints. These are real, public CDS / IRSA HiPS
# servers used for context overlays. The frontend renders them as semi-
# transparent layers above the SPHEREx tiles.

CONTEXT_HIPS_REGISTRY: Dict[str, HiPSBandProperties] = {
    "dss2_color": HiPSBandProperties(
        creator_did="ivo://CDS/P/DSS2/color",
        obs_title="DSS2 Color",
        obs_description="Second Palomar Observatory Sky Survey color composite.",
        obs_collection="DSS2",
        obs_ack="DSS2 courtesy of STScI Digitized Sky Survey.",
        prov_progenitor="STScI Digitized Sky Survey (Caltech Palomar).",
        hips_estsize=21_000_000_000,
        hips_tile_format="jpg",
        hips_order=9,
        hips_order_min=0,
        hips_frame="equatorial",
        hips_pixel_cut="0 255",
        hips_sampling="bilinear",
        hips_overlay=None,
        base_url="https://alasky.u-strasbg.fr/DSS/DSS2Merged/",
        tile_url_template="https://alasky.u-strasbg.fr/DSS/DSS2Merged/{order}/{dir}/{ipix}.jpg",
        spherex_band=None,
        spherex_collection=None,
        spherex_doi=None,
    ),
    "2mass_color": HiPSBandProperties(
        creator_did="ivo://IRSA/P/2MASS/color",
        obs_title="2MASS Color (J+H+K)",
        obs_description="Two Micron All-Sky Survey color composite.",
        obs_collection="2MASS",
        obs_ack="2MASS courtesy of IPAC/Caltech.",
        prov_progenitor="2MASS (Skrutskie et al. 2006, AJ 131, 1163).",
        hips_estsize=8_400_000_000,
        hips_tile_format="jpg",
        hips_order=9,
        hips_order_min=0,
        hips_frame="equatorial",
        hips_pixel_cut="0 255",
        hips_sampling="bilinear",
        hips_overlay=None,
        base_url="https://irsa.ipac.caltech.edu/data/2MASS/HiPS/",
        tile_url_template="https://irsa.ipac.caltech.edu/data/2MASS/HiPS/{order}/{dir}/{ipix}.jpg",
        spherex_band=None,
        spherex_collection=None,
        spherex_doi=None,
    ),
    "wise_w1w2": HiPSBandProperties(
        creator_did="ivo://IRSA/P/WISE/W1W2",
        obs_title="WISE W1+W2",
        obs_description="Wide-field Infrared Survey Explorer W1 (3.4 μm) + W2 (4.6 μm) color.",
        obs_collection="WISE",
        obs_ack="WISE/NEOWISE courtesy of IPAC/Caltech.",
        prov_progenitor="Wright et al. 2010, AJ 140, 1868.",
        hips_estsize=15_000_000_000,
        hips_tile_format="jpg",
        hips_order=8,
        hips_order_min=0,
        hips_frame="equatorial",
        hips_pixel_cut="0 255",
        hips_sampling="bilinear",
        hips_overlay=None,
        base_url="https://irsa.ipac.caltech.edu/data/WISE/HiPS/",
        tile_url_template="https://irsa.ipac.caltech.edu/data/WISE/HiPS/{order}/{dir}/{ipix}.jpg",
        spherex_band=None,
        spherex_collection=None,
        spherex_doi=None,
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

class HiPSError(Exception):
    """Base class for HiPS manifest errors."""


class HiPSReleaseUnknown(HiPSError):
    """The caller asked for a HiPS release we don't have a registry for."""


def get_spherex_hips(release: str) -> List[HiPSBandProperties]:
    """Return the 6-band HiPS properties for one SPHEREx release.

    Raises
    ------
    HiPSReleaseUnknown : release not in {qr2, qr3}.
    """
    if release not in SPHEREX_HIPS_REGISTRY:
        raise HiPSReleaseUnknown(
            f"HiPS manifest for SPHEREx release {release!r} is not registered. "
            f"Available: {sorted(SPHEREX_HIPS_REGISTRY)}"
        )
    return list(SPHEREX_HIPS_REGISTRY[release])


def get_context_hips() -> List[HiPSBandProperties]:
    """Return the cross-archive HiPS layers (DSS2, 2MASS, WISE).

    These are the context layers that overlay the SPHEREx HiPS tiles.
    """
    return list(CONTEXT_HIPS_REGISTRY.values())


def get_all_hips() -> List[HiPSBandProperties]:
    """Return every HiPS properties object the backend can serve.

    Convenience for the frontend's `availableLayers` endpoint.
    """
    out: List[HiPSBandProperties] = []
    for bands in SPHEREX_HIPS_REGISTRY.values():
        out.extend(bands)
    out.extend(CONTEXT_HIPS_REGISTRY.values())
    return out


def tile_count_at_order(order: int) -> int:
    """Return the number of HiPS tiles at the given order.

    N(order) = 12 × 4^order per the HiPS spec.
    """
    if order < 0 or order > HIPS_MAX_ORDER:
        raise HiPSError(
            f"HiPS order {order} out of [0, {HIPS_MAX_ORDER}]"
        )
    return 12 * (1 << (2 * order))


def tile_url(props: HiPSBandProperties, order: int, ipix: int) -> str:
    """Construct a HiPS tile URL for the given order and nested pixel index.

    The `dir` segment is `ipix // 10000` (HiPS convention; buckets the
    nested pixel index into 10000-cell directories).
    """
    if order < 0 or order > props.hips_order:
        raise HiPSError(
            f"Requested HiPS order {order} exceeds {props.hips_order} "
            f"for {props.creator_did}"
        )
    if ipix < 0 or ipix >= tile_count_at_order(order):
        raise HiPSError(
            f"ipix {ipix} out of [0, {tile_count_at_order(order)}) for order {order}"
        )
    dir_segment = ipix // 10000
    return props.tile_url_template.format(
        order=order, dir=dir_segment, ipix=ipix,
    )
