"""NASA / IPAC IRSA SPHEREx Service Router.

Provides authentic access to:
- IRSA SIA search interface (/spherex/search)
- Calibrated Spectrophotometry Coverage (/spherex/spectrophotometry)
- SPHEREx Quick Releases: QR3 (Default, DOI 10.26131/IRSA662) + QR2 (Compare, DOI 10.26131/IRSA652)
- Exact LVF instrument characteristics (R = 39, 41, 41, 35, 112, 128)
- Phase 3: WCS solve (/spherex/wcs/solve), MOC cone-intersection
  (/spherex/moc/intersect), and HiPS manifest (/spherex/hips/manifest).

Zero synthetic data: spectral extraction is delegated to SPExPI (/api/spectrophotometry/jobs).
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Body
from pydantic import BaseModel

from adapters.spherex_adapter import (
    SPHEREx_BANDS_META,
    SPHEREx_RELEASES,
    query_spherex_sia,
    get_spherex_coverage_summary,
    SphereXDataProvider,
    SPHERExObservationRecord,
    SPHERExSpectralCoverage,
    SPHERExSIACoverageResponse,
    release_registry,
    ReleaseRegistrySnapshot,
    ReleaseVerificationStatus,
)
from adapters.wcs_engine import (
    solve_wcs,
    pixel_to_sky,
    sky_to_pixel,
    round_trip as wcs_round_trip,
    pixel_uncertainty,
    WCSSolveResult,
    WCSRoundTrip,
    WCSUncertainty,
    WCSIncompleteHeaders,
    WCSSIPDistortionMalformed,
    WCSProjectionUnsupported,
    WCSSolveFailed,
)
from adapters.moc_engine import (
    build_moc_from_points,
    cone_intersects,
    moc_intersection,
    moc_union,
    MOCRegion,
    MOCError,
    MOCEmptyInput,
    MOCOrderOutOfRange,
    MOCCoordinatesOutOfRange,
)
from adapters.hips_engine import (
    get_spherex_hips,
    get_context_hips,
    get_all_hips,
    HiPSBandProperties,
    tile_count_at_order,
    tile_url,
    HiPSReleaseUnknown,
    HiPSError,
)

router = APIRouter(prefix="/spherex", tags=["SPHEREx Science Products (IRSA)"])


class SPHERExReleaseSummary(BaseModel):
    release: str
    name: str
    collection: str
    doi: str
    start_date: str
    cadence: str
    is_default: bool
    description: str


class SpectralBandMeta(BaseModel):
    band_index: int
    name: str
    wavelength_min_um: float
    wavelength_max_um: float
    central_wavelength_um: float
    resolving_power_R: float
    pixel_scale_arcsec: float


@router.get("/releases", response_model=List[SPHERExReleaseSummary])
async def get_releases():
    """Retrieve available SPHEREx releases. QR3 is default; QR2 is compare baseline. QR1 retired.

    The list reflects the *static release manifest*. For live verification status
    of each release (live / last_known_good / not_live / stale), call
    /spherex/releases/diagnostics — never assume a release is queryable without it.
    """
    return [
        SPHERExReleaseSummary(
            release=k,
            name=v["name"],
            collection=v["collection"],
            doi=v["doi"],
            start_date=v["start_date"],
            cadence=v["cadence"],
            is_default=v["is_default"],
            description=v["description"],
        )
        for k, v in SPHEREx_RELEASES.items()
    ]


@router.get("/releases/diagnostics", response_model=ReleaseRegistrySnapshot)
async def get_releases_diagnostics(
    refresh: bool = Query(
        default=False,
        description="Force an immediate IRSA TAP probe. Use sparingly; respects TTL otherwise.",
    ),
):
    """Surface live IRSA release verification status for every release in the manifest.

    Returns:
      - irsa_reachable: whether the last probe to IRSA succeeded
      - last_irsa_check_at: ISO timestamp of the most recent probe
      - last_irsa_error: error from the most recent failed probe, if any
      - irsa_query_url: the ADQL query issued to IRSA (for auditability)
      - degraded_mode: True if any release is NOT_LIVE or STALE
      - releases: per-release verification status (live / last_known_good / not_live / stale)
      - retired_releases_present: collection ids IRSA still publishes that aren't in our manifest
        (e.g. legacy QR1 if IRSA has not yet retired it server-side)

    Frontends MUST surface `degraded_mode=True` to the user and refuse to issue
    search queries against any release whose verification_status is not_live.
    """
    return await release_registry.get_snapshot(force_refresh=refresh)


@router.post("/releases/refresh", response_model=ReleaseRegistrySnapshot)
async def refresh_releases():
    """Force an immediate re-probe of IRSA TAP. Used by operations after IRSA release events.

    Idempotent and concurrency-safe; returns the refreshed snapshot.
    """
    return await release_registry.refresh()


@router.get("/bands", response_model=List[SpectralBandMeta])
async def get_instrument_bands():
    """Retrieve exact SPHEREx 6 LVF detector array characteristics (R = 39, 41, 41, 35, 112, 128)."""
    return [
        SpectralBandMeta(
            band_index=b["band"],
            name=b["name"],
            wavelength_min_um=b["min_um"],
            wavelength_max_um=b["max_um"],
            central_wavelength_um=round((b["min_um"] + b["max_um"]) / 2.0, 3),
            resolving_power_R=float(b["R"]),
            pixel_scale_arcsec=b["pixel_arcsec"],
        )
        for b in SPHEREx_BANDS_META
    ]


@router.get("/search", response_model=SPHERExSIACoverageResponse)
async def search_spherex_sia(
    ra: float = Query(..., ge=0.0, lt=360.0, description="Right Ascension in degrees (J2000)"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in degrees (J2000)"),
    radius_deg: float = Query(default=0.05, gt=0.0, le=1.0, description="Search cone radius in degrees"),
    collection: str = Query(default="spherex_qr3", description="SPHEREx collection: 'spherex_qr3' (default) or 'spherex_qr2'"),
):
    """Execute IRSA SIA query with multi-layer VOTable validation for calibrated spectral images."""
    return await query_spherex_sia(ra=ra, dec=dec, radius_deg=radius_deg, collection=collection)


@router.get("/spectrophotometry", response_model=SPHERExSpectralCoverage)
async def get_spectrophotometry_coverage(
    ra: float = Query(..., ge=0.0, lt=360.0, description="Right Ascension in degrees (J2000)"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in degrees (J2000)"),
    release: str = Query(default="qr3", description="SPHEREx release: 'qr3' (default) or 'qr2' (compare)"),
):
    """Retrieve authentic SPHEREx spectral coverage metadata.

    Zero synthetic data: full extracted 102-channel spectrophotometry requires submitting
    an extraction job to the SPExPI pipeline queue at /api/spectrophotometry/jobs.
    """
    return await get_spherex_coverage_summary(ra=ra, dec=dec, release=release)


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: WCS, MOC, HiPS endpoints
# ─────────────────────────────────────────────────────────────────────────────


class WCSSolveRequest(BaseModel):
    """Body of POST /spherex/wcs/solve.

    The header is the FITS header as a dict (case-sensitive). It MUST carry
    the standard WCS keywords; the solver refuses to guess missing values.
    """
    header: Dict[str, Any]
    image_width_px: Optional[int] = None
    image_height_px: Optional[int] = None


class WCSSolveResponse(BaseModel):
    solve: WCSSolveResult
    uncertainty: WCSUncertainty
    w3c_provenance: Optional[Dict[str, Any]] = None


@router.post("/wcs/solve", response_model=WCSSolveResponse)
async def solve_wcs_endpoint(req: WCSSolveRequest):
    """Solve a WCS from a FITS header.

    Returns the WCS parameters (CRVAL, CRPIX, CD matrix, projection type,
    frame, SIP order) plus a per-pixel astrometric uncertainty. The solver
    refuses to fabricate any keyword; missing WCS keys raise
    WCSIncompleteHeaders.

    Optional round-trip: include `pixel_x` and `pixel_y` to verify that the
    WCS closes (px → sky → px) within 1e-3 pixel at the tangent point.
    """
    try:
        solve = solve_wcs(
            req.header,
            image_width_px=req.image_width_px,
            image_height_px=req.image_height_px,
        )
    except WCSIncompleteHeaders as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except WCSProjectionUnsupported as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except WCSSIPDistortionMalformed as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except WCSSolveFailed as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Per-pixel uncertainty: if the caller passed a Gaia σ in arcsec, fold it
    # in. The header convention is REFCAT_SIGMA in arcsec.
    ref_sigma_mas = req.header.get("REFCAT_SIGMA")
    if ref_sigma_mas is not None:
        try:
            ref_sigma_mas_f = float(ref_sigma_mas) * 1000.0  # arcsec → mas
        except (TypeError, ValueError):
            ref_sigma_mas_f = None
    else:
        ref_sigma_mas_f = None
    uncertainty = pixel_uncertainty(solve, reference_catalog_sigma_mas=ref_sigma_mas_f)

    # Build a Phase 9 PROV bundle for the WCS solve.
    from adapters.provenance import (
        W3CProvBlock, W3CProvEntity, W3CProvActivity, W3CProvAgent,
    )
    entity = W3CProvEntity(
        entity_id=f"wcs:{solve.frame}@{solve.crval_ra_deg:.4f},{solve.crval_dec_deg:.4f}",
        entity_type="wcs:tan_projection",
        attributes={
            "projection": solve.projection,
            "pixel_scale_x_arcsec": solve.pixel_scale_x_arcsec,
            "pixel_scale_y_arcsec": solve.pixel_scale_y_arcsec,
            "wcs_keys_used": solve.wcs_keys_used,
        },
    )
    activity = W3CProvActivity(
        activity_id="wcs:solve_v1",
        activity_type="derivation:wcs_solve",
        used=[entity.entity_id],
        attributes={"solver": "adapters.wcs_engine.solve_wcs"},
    )
    agent = W3CProvAgent(agent_id="agent:wcs_engine", agent_type="service:odyssey_wcs")
    bundle = W3CProvBlock(
        entities=[entity], activities=[activity], agents=[agent],
        primary_role="derived",
    )

    return WCSSolveResponse(
        solve=solve,
        uncertainty=uncertainty,
        w3c_provenance=bundle.model_dump(),
    )


@router.post("/wcs/round-trip", response_model=WCSRoundTrip)
async def wcs_round_trip_endpoint(
    header: Dict[str, Any] = Body(..., embed=True),
    pixel_x: float = Body(..., embed=True),
    pixel_y: float = Body(..., embed=True),
):
    """Round-trip a pixel coordinate through the WCS (px → sky → px) and
    report the residual. Use this to verify that a header is internally
    consistent before relying on it for downstream operations.
    """
    try:
        solve = solve_wcs(header)
    except WCSIncompleteHeaders as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except WCSSolveFailed as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return wcs_round_trip(solve, pixel_x, pixel_y)


class MOCBuildRequest(BaseModel):
    ra_list: List[float]
    dec_list: List[float]
    order: int = 8


class MOCBuildResponse(BaseModel):
    max_order: int
    cell_count: int


class MOCConeRequest(BaseModel):
    moc_a_cells: List[List[int]]  # list of [order, nested_index] pairs
    moc_a_max_order: int
    ra_deg: float
    dec_deg: float
    radius_deg: float


class MOCConeResponse(BaseModel):
    intersects: bool
    cells_evaluated: int


@router.post("/moc/build", response_model=MOCBuildResponse)
async def build_moc_endpoint(req: MOCBuildRequest):
    """Build a MOC from a list of sky positions.

    Returns the maximum order and the deduplicated cell count. The cells
    themselves are NOT returned — the frontend can issue a cone intersect
    against this MOC instead.
    """
    try:
        moc = build_moc_from_points(req.ra_list, req.dec_list, order=req.order)
    except MOCOrderOutOfRange as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except MOCEmptyInput as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except MOCCoordinatesOutOfRange as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return MOCBuildResponse(max_order=moc.max_order, cell_count=moc.cell_count)


@router.post("/moc/intersect", response_model=MOCConeResponse)
async def moc_cone_intersect_endpoint(req: MOCConeRequest):
    """Test whether a cone (ra, dec, radius) intersects a MOC.

    The caller passes the MOC as a list of [order, nested_index] pairs and
    the MOC's max_order. The backend reassembles the MOCRegion and runs the
    cone-intersection test.
    """
    try:
        cells = tuple(
            (int(pair[0]), int(pair[1])) for pair in req.moc_a_cells
        )
        cells_sorted = tuple(sorted(set(cells)))
        moc = MOCRegion(
            cells=cells_sorted,
            max_order=req.moc_a_max_order,
            cell_count=len(cells_sorted),
        )
        result = cone_intersects(moc, req.ra_deg, req.dec_deg, req.radius_deg)
    except MOCCoordinatesOutOfRange as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except MOCError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return MOCConeResponse(intersects=result, cells_evaluated=moc.cell_count)


class HiPSLayer(BaseModel):
    creator_did: str
    obs_title: str
    obs_collection: str
    hips_tile_format: str
    hips_order: int
    hips_order_min: int
    hips_frame: str
    hips_sampling: str
    base_url: str
    tile_url_template: str
    obs_description: Optional[str] = None
    obs_ack: Optional[str] = None
    prov_progenitor: Optional[str] = None
    hips_estsize: Optional[int] = None
    hips_pixel_cut: Optional[str] = None
    hips_overlay: Optional[str] = None
    spherex_band: Optional[int] = None
    spherex_collection: Optional[str] = None
    spherex_doi: Optional[str] = None


class HiPSManifestResponse(BaseModel):
    spherex_layers: List[HiPSLayer]
    context_layers: List[HiPSLayer]
    max_order_per_release: Dict[str, int]
    tile_count_at_order_5: int
    w3c_provenance: Dict[str, Any]


def _props_to_layer(p: HiPSBandProperties) -> HiPSLayer:
    d = p.to_dict()
    return HiPSLayer(**d)


@router.get("/hips/manifest", response_model=HiPSManifestResponse)
async def hips_manifest_endpoint(
    release: str = Query(default="qr3", description="SPHEREx release: 'qr3' or 'qr2'"),
):
    """Return the HiPS manifest for the requested SPHEREx release plus the
    context overlay layers (DSS2, 2MASS, WISE).

    Each layer is identified by its IVOA CreatorDID and exposes its
    per-order tile URL template so the frontend can stream tiles directly
    from the canonical HiPS server.
    """
    try:
        spherex_layers = get_spherex_hips(release)
    except HiPSReleaseUnknown as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    context_layers = get_context_hips()
    max_order_per_release = {
        rel: max(b.hips_order for b in bands)
        for rel, bands in [
            ("qr3", get_spherex_hips("qr3")),
            ("qr2", get_spherex_hips("qr2")),
        ]
    }
    from adapters.provenance import (
        W3CProvBlock, W3CProvEntity, W3CProvActivity, W3CProvAgent,
    )
    entity = W3CProvEntity(
        entity_id=f"hips:manifest:{release}",
        entity_type="hips:survey_manifest",
        attributes={"release": release, "layer_count": len(spherex_layers) + len(context_layers)},
    )
    activity = W3CProvActivity(
        activity_id="hips:manifest_build_v1",
        activity_type="derivation:hips_manifest",
        used=[entity.entity_id],
        attributes={"solver": "adapters.hips_engine"},
    )
    agent = W3CProvAgent(agent_id="agent:hips_engine", agent_type="service:odyssey_hips")
    bundle = W3CProvBlock(
        entities=[entity], activities=[activity], agents=[agent],
        primary_role="derived",
    )
    return HiPSManifestResponse(
        spherex_layers=[_props_to_layer(p) for p in spherex_layers],
        context_layers=[_props_to_layer(p) for p in context_layers],
        max_order_per_release=max_order_per_release,
        tile_count_at_order_5=tile_count_at_order(5),
        w3c_provenance=bundle.model_dump(),
    )
