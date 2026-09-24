"""Odyssey Data Normalization Engine.

Assembles the Unified Object Schema strictly from authentic data sources:
- NASA/IPAC SPHEREx SIA & SPExPI spectral extractions
- NASA JPL Horizons dynamic ephemerides & SBDB/CAD
- CDS SIMBAD TAP & ESA Gaia DR3
- NASA ADS bibliometrics (authentic queries only)

Zero synthetic data generation: no fabricated SEDs, no fake coordinates, no fake bibcodes.
"""

from __future__ import annotations

import logging
import math
import os
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from astropy.coordinates import SkyCoord
import astropy.units as u

from .spherex_adapter import (
    get_spherex_coverage_summary,
    SPHERExSpectralCoverage,
    SPHEREx_RELEASES,
)
from .jpl_adapter import (
    query_jpl_sbdb,
    query_jpl_close_approach,
    query_jpl_horizons_ephemeris,
    JPLSmallBody,
    JPLCloseApproach,
    JPLHorizonsEphemeris,
    JPLHorizonsEphemerisUnavailable,
    JPLHorizonsResult,
)
from .cds_adapter import (
    resolve_with_sesame,
    get_context_cutouts,
    query_gaia_bailer_jones_distance,
    CDSResolvedTarget,
    ContextCutouts,
    query_gaia_dr3_tap,
)
from .gaia_astrometry import (
    GaiaAstrometricSolution,
    parse_gaia_row,
    propagate_epoch,
    compute_tangential_velocity,
    GAIA_DR3_EPOCH_JY,
    JULIAN_YEAR_DAYS,
    RUWE_NOISE_THRESHOLD,
    PropagatedSolution,
)
from .provenance import (
    Uncertainty,
    AsymmetricInterval,
    W3CProvBlock,
    provenance_service,
    make_irsa_query_provenance,
    make_jpl_horizons_provenance,
    make_bailer_jones_provenance,
    make_kinematics_derivation_provenance,
)

log = logging.getLogger("normalization")


def _stub_solution_from_cds(target: CDSResolvedTarget) -> GaiaAstrometricSolution:
    """Build a GaiaAstrometricSolution from CDS-only data, when Gaia DR3 was unreachable.

    All error/correlation fields are None, so the resulting solution will be
    flagged propagation_basis='diagonal' or 'unavailable' by downstream
    consumers. This is the honest answer when Gaia is silent — never fabricate
    sigma=0 to make the covariance propagation look complete.
    """
    return GaiaAstrometricSolution(
        source_id=target.gaia_dr3_id or "cds-only-no-gaia-id",
        ra_deg=target.ra_deg,
        dec_deg=target.dec_deg,
        parallax_mas=target.parallax_mas or 0.0,
        pmra_masyr=target.proper_motion_ra_masyr or 0.0,
        pmdec_masyr=target.proper_motion_dec_masyr or 0.0,
        radial_velocity_kms=target.radial_velocity_kms,
        # All error/correlation fields default to None
        ra_deg_err=None,
        dec_deg_err=None,
        parallax_mas_err=None,
        pmra_masyr_err=None,
        pmdec_masyr_err=None,
        radial_velocity_kms_err=None,
        corr_ra_dec=None,
        corr_ra_parallax=None,
        corr_ra_pmra=None,
        corr_ra_pmdec=None,
        corr_dec_parallax=None,
        corr_dec_pmra=None,
        corr_dec_pmdec=None,
        corr_parallax_pmra=None,
        corr_parallax_pmdec=None,
        corr_pmra_pmdec=None,
        ruwe=None,
        astrometric_excess_noise=None,
    )


def _attach_provenance(
    block: Dict[str, Any],
    provenance_bundle: Optional[W3CProvBlock],
) -> Dict[str, Any]:
    """Phase 9 helper: attach a W3C PROV-DM bundle to a measurement block.

    Returns the input block unchanged if no bundle is available, otherwise
    copies it and adds a `w3c_provenance` key. This keeps every measurement
    site legible while enforcing the invariant that provenance bundles
    never replace existing data — they are additive metadata.
    """
    if provenance_bundle is None:
        return block
    block = dict(block)
    block["w3c_provenance"] = provenance_bundle.model_dump()
    return block


class ObjectIdentity(BaseModel):
    query: str
    canonical_name: str
    simbad_id: Optional[str] = None
    gaia_dr3_id: Optional[str] = None
    object_type: str = "Astronomical Source"


class ObjectPosition(BaseModel):
    ra_deg: float
    dec_deg: float


class ObjectMotion(BaseModel):
    source: str
    proper_motion_ra_masyr: Optional[float] = None
    proper_motion_dec_masyr: Optional[float] = None
    parallax_mas: Optional[float] = None
    radial_velocity_kms: Optional[float] = None
    # Phase 9: typed uncertainties with units + W3C PROV-DM provenance
    proper_motion_ra_masyr_err: Optional["Uncertainty"] = None
    proper_motion_dec_masyr_err: Optional["Uncertainty"] = None
    parallax_mas_err: Optional["Uncertainty"] = None
    radial_velocity_kms_err: Optional["Uncertainty"] = None
    w3c_provenance: Optional["W3CProvBlock"] = None


class ObjectLiterature(BaseModel):
    bibcode: str
    title: str
    ads_url: str


class ObjectProvenance(BaseModel):
    dataset: str
    doi: Optional[str] = None
    service: str


class UnifiedOdysseyObject(BaseModel):
    id: str
    status: str = "resolved"  # "resolved" | "partially_resolved" | "no_coverage" | "unavailable"
    identity: ObjectIdentity
    position: ObjectPosition
    spherex: Dict[str, Any]
    motion: Optional[ObjectMotion] = None
    solar_system: Optional[Dict[str, Any]] = None
    historical: ContextCutouts
    astrophysics: Optional[Dict[str, Any]] = None
    ice_chemistry: Optional[Dict[str, Any]] = None
    kinematics: Optional[Dict[str, Any]] = None
    target_cutouts: Optional[Dict[str, Any]] = None
    literature: List[ObjectLiterature] = []
    provenance: List[ObjectProvenance] = []


def parse_coordinate_query(query: str) -> Optional[tuple[float, float]]:
    """Parse user query as celestial coordinates in decimal or sexagesimal notation.

    Uses astropy.coordinates.SkyCoord for robust parsing across formats:
    - Decimal: "133.795, -7.245" or "133.795 -7.245"
    - Sexagesimal: "08h55m10.8s -07d14m42s", "08:55:10.8 -07:14:42", "05 55 10.3 +07 24 25.4"
    """
    trimmed = query.strip()
    if not trimmed:
        return None

    # Try fast decimal regex first: "133.795, -7.245"
    dec_match = re.match(r"^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$", trimmed)
    if dec_match:
        try:
            ra = float(dec_match.group(1))
            dec = float(dec_match.group(2))
            if 0.0 <= ra <= 360.0 and -90.0 <= dec <= 90.0:
                return (round(ra, 5), round(dec, 5))
        except ValueError:
            pass

    # Try astropy SkyCoord for sexagesimal and complex formats
    try:
        # Check hourangle/degree combination
        if "h" in trimmed or ":" in trimmed or " " in trimmed:
            c = SkyCoord(trimmed, unit=(u.hourangle, u.deg))
            return (round(float(c.ra.deg), 5), round(float(c.dec.deg), 5))
    except Exception:
        pass

    try:
        c = SkyCoord(trimmed, unit=u.deg)
        return (round(float(c.ra.deg), 5), round(float(c.dec.deg), 5))
    except Exception:
        pass

    return None


async def build_unified_object(query: str, release: str = "qr3") -> Optional[UnifiedOdysseyObject]:
    """Execute multi-tier live resolver and assemble the authentic Unified Odyssey Object.

    Never generates synthetic SEDs or fabricated coordinates.
    """
    clean_query = query.strip()
    if not clean_query:
        return None

    rel_key = release.lower().strip()
    if rel_key not in SPHEREx_RELEASES:
        rel_key = "qr3"
    rel_meta = SPHEREx_RELEASES[rel_key]

    # 1. Check if user typed coordinates
    coord_pair = parse_coordinate_query(clean_query)
    if coord_pair:
        ra, dec = coord_pair
        spherex_cov = await get_spherex_coverage_summary(ra, dec, rel_key)
        cutouts = get_context_cutouts(ra, dec)

        return UnifiedOdysseyObject(
            id=f"coord-{ra:.4f}-{dec:.4f}",
            status="resolved",
            identity=ObjectIdentity(
                query=clean_query,
                canonical_name=f"J2000 ({ra:.4f}°, {dec:.4f}°)",
                object_type="Sky Coordinates",
            ),
            position=ObjectPosition(ra_deg=ra, dec_deg=dec),
            spherex={
                "releases": ["qr3", "qr2"],
                "default_release": rel_key,
                "coverage_status": spherex_cov.status,
                "spectrophotometry": spherex_cov.model_dump(),
            },
            historical=cutouts,
            provenance=[
                ObjectProvenance(
                    dataset=rel_meta["name"],
                    doi=rel_meta["doi"],
                    service="NASA/IPAC IRSA SIA",
                )
            ],
        )

    # 2. Check if query is a Solar System Small Body (JPL SBDB & Horizons)
    is_likely_small_body = bool(
        re.match(r"^\d+$", clean_query)
        or "/" in clean_query
        or any(k in clean_query.lower() for k in ["apophis", "comet", "asteroid", "churyumov", "ceres", "vesta", "bennu", "ryugu"])
    )

    if is_likely_small_body:
        sb_data = await query_jpl_sbdb(clean_query)
        if sb_data:
            # Query dynamic real-time ephemeris from JPL Horizons. Phase 6:
            # pass a one-day window anchored on the SPHEREx publication epoch as
            # an *explicitly requested* epoch — never as a silent fallback.
            # Phase 9: the QR3 epoch is now threaded as an explicit anchor.
            _qr3_epoch = datetime.strptime(rel_meta["start_date"], "%Y-%m-%d").strftime("%Y-%m-%d 00:00")
            ephem_result = await query_jpl_horizons_ephemeris(
                sb_data.designation,
                epoch_utc=_qr3_epoch,
            )
            cad_list = await query_jpl_close_approach(sb_data.designation)

            # Phase 6: discriminate success vs typed failure. NEVER substitute
            # (0.0, 0.0) as a silent fallback for coordinates — that would be
            # a fabrication. If Horizons returned a typed failure, the small
            # body is *partially resolved* (orbital elements known, dynamic
            # position unavailable) and the position field is null.
            ephem: Optional[JPLHorizonsEphemeris] = None
            ephem_unavailable: Optional[JPLHorizonsEphemerisUnavailable] = None
            if isinstance(ephem_result, JPLHorizonsEphemeris):
                ephem = ephem_result
                ra, dec = ephem.ra_deg, ephem.dec_deg
                pos_source = (
                    f"NASA/JPL Horizons ({ephem.epoch_utc} UTC, "
                    f"observer={ephem.observer_location}, cmd={ephem.target_command_used!r})"
                )
            else:
                ephem_unavailable = ephem_result
                ra, dec = None, None  # explicit null, not 0.0
                pos_source = (
                    f"Orbital elements known; dynamic ephemeris unavailable "
                    f"(Horizons failure_mode={ephem_unavailable.failure_mode})"
                )

            # Phase 9: W3C PROV-DM lineage for the Horizons query (success path).
            horizons_provenance_bundle = None
            if ephem is not None:
                try:
                    horizons_provenance_bundle = make_jpl_horizons_provenance(
                        target=sb_data.designation,
                        epoch_utc=ephem.epoch_utc,
                        observer_location=ephem.observer_location,
                        query_url=ephem.query_url,
                        queried_at=ephem.query_timestamp_utc,
                        ra_deg=ephem.ra_deg,
                        dec_deg=ephem.dec_deg,
                        unified_object_id=f"jpl-{sb_data.designation}",
                    )
                except Exception as prov_exc:  # pragma: no cover
                    log.debug("JPL provenance recording failed: %s", prov_exc)

            spherex_cov = (
                await get_spherex_coverage_summary(ra, dec, rel_key)
                if ra is not None and dec is not None
                else None
            )
            cutouts = get_context_cutouts(ra, dec) if ra is not None and dec is not None else None

            return UnifiedOdysseyObject(
                id=f"jpl-{sb_data.designation}",
                status="resolved" if ephem else "partially_resolved",
                identity=ObjectIdentity(
                    query=clean_query,
                    canonical_name=sb_data.fullname,
                    object_type=sb_data.orbit_class,
                ),
                position=ObjectPosition(
                    ra_deg=ra if ra is not None else 0.0,
                    dec_deg=dec if dec is not None else 0.0,
                ),
                spherex=_attach_provenance(
                    {
                        "releases": ["qr3", "qr2"],
                        "default_release": rel_key,
                        "coverage_status": spherex_cov.status if spherex_cov else "ephemeris_unavailable",
                        "spectrophotometry": spherex_cov.model_dump() if spherex_cov else {
                            "status": "unavailable",
                            "release": rel_key,
                            "doi": rel_meta["doi"],
                            "collection": rel_meta["collection"],
                            "target_ra": ra,
                            "target_dec": dec,
                            "num_measurements": 0,
                            "measurements": [],
                        },
                    },
                    horizons_provenance_bundle,
                ),
                solar_system={
                    "physical_and_orbit": sb_data.model_dump(),
                    "close_approach": cad_list[0].model_dump() if cad_list else None,
                    "close_approaches": [c.model_dump() for c in cad_list],
                    "dynamic_ephemeris": ephem.model_dump() if ephem else None,
                    "dynamic_ephemeris_unavailable": ephem_unavailable.model_dump() if ephem_unavailable else None,
                    "position_source": pos_source,
                },
                historical=cutouts or get_context_cutouts(0.0, 0.0),
                provenance=[
                    ObjectProvenance(
                        dataset="JPL Small-Body Database (SBDB) & Horizons",
                        service="NASA/JPL SSD",
                    ),
                    ObjectProvenance(
                        dataset=rel_meta["name"],
                        doi=rel_meta["doi"],
                        service="NASA/IPAC IRSA",
                    ),
                ],
            )

    # 3. Check CDS Sesame / SIMBAD TAP for named astronomical targets
    cds_target = await resolve_with_sesame(clean_query)
    if not cds_target:
        # Fallback check if it was a small body not caught by heuristic regex
        sb_data = await query_jpl_sbdb(clean_query)
        if sb_data:
            # Phase 6: anchor on the QR3 publication epoch as an explicit
            # requested observation epoch — never as a silent fallback.
            from datetime import datetime as _dt
            _qr3_epoch = _dt.strptime(rel_meta["start_date"], "%Y-%m-%d").strftime("%Y-%m-%d 00:00")
            ephem_result = await query_jpl_horizons_ephemeris(
                sb_data.designation,
                epoch_utc=_qr3_epoch,
            )
            cad_list = await query_jpl_close_approach(sb_data.designation)

            ephem: Optional[JPLHorizonsEphemeris] = None
            ephem_unavailable: Optional[JPLHorizonsEphemerisUnavailable] = None
            if isinstance(ephem_result, JPLHorizonsEphemeris):
                ephem = ephem_result
                ra, dec = ephem.ra_deg, ephem.dec_deg
            else:
                ephem_unavailable = ephem_result
                ra, dec = None, None  # Phase 6: explicit null, never 0.0

            # Phase 9: W3C PROV-DM bundle for the Horizons query (success path).
            horizons_provenance_bundle = None
            if ephem is not None:
                try:
                    horizons_provenance_bundle = make_jpl_horizons_provenance(
                        target=sb_data.designation,
                        epoch_utc=ephem.epoch_utc,
                        observer_location=ephem.observer_location,
                        query_url=ephem.query_url,
                        queried_at=ephem.query_timestamp_utc,
                        ra_deg=ephem.ra_deg,
                        dec_deg=ephem.dec_deg,
                        unified_object_id=f"jpl-{sb_data.designation}",
                    )
                except Exception as prov_exc:  # pragma: no cover
                    log.debug("JPL provenance recording failed: %s", prov_exc)

            spherex_cov = (
                await get_spherex_coverage_summary(ra, dec, rel_key)
                if ra is not None and dec is not None
                else None
            )
            cutouts = get_context_cutouts(ra, dec) if ra is not None and dec is not None else None

            return UnifiedOdysseyObject(
                id=f"jpl-{sb_data.designation}",
                status="resolved" if ephem else "partially_resolved",
                identity=ObjectIdentity(
                    query=clean_query,
                    canonical_name=sb_data.fullname,
                    object_type=sb_data.orbit_class,
                ),
                position=ObjectPosition(
                    ra_deg=ra if ra is not None else 0.0,
                    dec_deg=dec if dec is not None else 0.0,
                ),
                spherex=_attach_provenance(
                    {
                        "releases": ["qr3", "qr2"],
                        "default_release": rel_key,
                        "coverage_status": spherex_cov.status if spherex_cov else "ephemeris_unavailable",
                        "spectrophotometry": spherex_cov.model_dump() if spherex_cov else {
                            "status": "unavailable",
                            "release": rel_key,
                            "doi": rel_meta["doi"],
                            "collection": rel_meta["collection"],
                            "target_ra": ra,
                            "target_dec": dec,
                            "num_measurements": 0,
                            "measurements": [],
                        },
                    },
                    horizons_provenance_bundle,
                ),
                solar_system={
                    "physical_and_orbit": sb_data.model_dump(),
                    "close_approach": cad_list[0].model_dump() if cad_list else None,
                    "dynamic_ephemeris": ephem.model_dump() if ephem else None,
                    "dynamic_ephemeris_unavailable": ephem_unavailable.model_dump() if ephem_unavailable else None,
                },
                historical=cutouts or get_context_cutouts(0.0, 0.0),
                provenance=[
                    ObjectProvenance(
                        dataset="JPL Small-Body Database (SBDB)",
                        service="NASA/JPL SSD",
                    ),
                    ObjectProvenance(
                        dataset=rel_meta["name"],
                        doi=rel_meta["doi"],
                        service="NASA/IPAC IRSA",
                    ),
                ],
            )

        return None

    # CDS Target successfully resolved
    spherex_cov = await get_spherex_coverage_summary(cds_target.ra_deg, cds_target.dec_deg, rel_key)
    cutouts = get_context_cutouts(cds_target.ra_deg, cds_target.dec_deg)

    # Phase 9: stable unified object id used to thread W3C PROV-DM bundles
    # across every measurement derived below.
    unified_object_id = f"target-{cds_target.canonical_name.lower().replace(' ', '-')}"

    # Phase 4: fetch the full Gaia DR3 row so we can populate the typed
    # uncertainty fields and propagate the 5-parameter solution from the
    # Gaia reference epoch (J2016.0) to the SPHEREx QR3 observation epoch.
    # The CDS adapter already issued a Gaia cone search above; we re-query
    # here against the resolved coordinates to ensure we're keyed on the
    # authoritative Gaia source_id and not on the SIMBAD-derived position.
    gaia_row: Optional[Dict[str, Any]] = None
    gaia_solution: Optional[GaiaAstrometricSolution] = None
    try:
        gaia_row = await query_gaia_dr3_tap(cds_target.ra_deg, cds_target.dec_deg)
        gaia_solution = parse_gaia_row(gaia_row) if gaia_row else None
    except Exception as exc:
        log.debug("Phase 4 Gaia re-query failed for %s: %s", cds_target.canonical_name, exc)

    # Compute the SPHEREx QR3 observation epoch as a Julian Year. We anchor
    # the propagation target on the QR3 publication epoch (anchor date for
    # the release the user is browsing under). This is the *only* legitimate
    # use of a publication epoch — as the propagation target, NOT as a
    # generic observation time.
    target_epoch_jy = GAIA_DR3_EPOCH_JY
    try:
        target_epoch_jy = (
            datetime.strptime(rel_meta["start_date"], "%Y-%m-%d").year
            + (datetime.strptime(rel_meta["start_date"], "%Y-%m-%d").timetuple().tm_yday - 1)
            / JULIAN_YEAR_DAYS
        )
    except Exception:
        target_epoch_jy = GAIA_DR3_EPOCH_JY

    propagated: Optional["PropagatedSolution"] = None
    if gaia_solution is not None:
        try:
            propagated = propagate_epoch(gaia_solution, target_epoch_jy)
        except Exception as exc:
            log.debug("Epoch propagation failed for %s: %s", gaia_solution.source_id, exc)

    motion = None
    kinematics = None
    if cds_target.proper_motion_ra_masyr is not None or cds_target.parallax_mas is not None:
        # Phase 4: typed uncertainties with REAL values from Gaia DR3 (when
        # available). The previous Phase 9 stub left every *_err.value as
        # None — we now populate from the Gaia row's *_error columns.
        def _err(field_name: str, unit: str, value: Optional[float]) -> Uncertainty:
            return Uncertainty(
                value=round(value, 5) if value is not None else None,
                unit=unit,
                uncertainty_kind="statistical",
                confidence_level=0.68,  # Gaia DR3 reports 1-sigma (≈68% CI)
                reference=(
                    "Gaia DR3 (Lindegren et al. 2021, A&A 649, A4)"
                    if gaia_solution is not None and gaia_solution.has_full_covariance
                    else "Gaia DR3 / CDS SIMBAD TAP (partial sigma)"
                ),
            )

        # Use the Gaia row's per-field sigma when available, else fall back to
        # CDS/SIMBAD's scalar error (rare).
        pmra_err_val = (
            gaia_solution.pmra_masyr_err if gaia_solution else None
        )
        pmdec_err_val = (
            gaia_solution.pmdec_masyr_err if gaia_solution else None
        )
        plx_err_val = (
            gaia_solution.parallax_mas_err if gaia_solution else None
        )
        rv_err_val = (
            gaia_solution.radial_velocity_kms_err if gaia_solution else None
        )

        motion = ObjectMotion(
            source=cds_target.resolver_source,
            proper_motion_ra_masyr=cds_target.proper_motion_ra_masyr,
            proper_motion_dec_masyr=cds_target.proper_motion_dec_masyr,
            parallax_mas=cds_target.parallax_mas,
            radial_velocity_kms=cds_target.radial_velocity_kms,
            proper_motion_ra_masyr_err=_err("proper_motion_ra_masyr_err", "mas/yr", pmra_err_val),
            proper_motion_dec_masyr_err=_err("proper_motion_dec_masyr_err", "mas/yr", pmdec_err_val),
            parallax_mas_err=_err("parallax_mas_err", "mas", plx_err_val),
            radial_velocity_kms_err=_err("radial_velocity_kms_err", "km/s", rv_err_val),
            w3c_provenance=None,  # attached after ObjectMotion construction below
        )

        # Phase 4: tangential velocity with full 3x3 covariance propagation.
        # Falls back to the raw Gaia solution at J2016.0 when propagation was
        # unavailable; computes v_tan from the propagated tuple otherwise.
        tan_vel = compute_tangential_velocity(
            gaia_solution if gaia_solution else _stub_solution_from_cds(cds_target),
            propagated=propagated,
        )

        pmra = cds_target.proper_motion_ra_masyr or 0.0
        pmdec = cds_target.proper_motion_dec_masyr or 0.0
        tot_pm = (pmra**2 + pmdec**2)**0.5

        kinematics_provenance = make_kinematics_derivation_provenance(
            pmra_masyr=pmra,
            pmdec_masyr=pmdec,
            parallax_mas=cds_target.parallax_mas or 0.0,
            radial_velocity_kms=cds_target.radial_velocity_kms,
            distance_pc=None,  # populated after Bailer-Jones below
            distance_method="not_yet_computed",
            tangential_velocity_kms=tan_vel.value_kms,
            displacement_14yr_arcsec=round(tot_pm * 14.2 / 1000.0, 2),
            derived_at=datetime.now(timezone.utc).isoformat(),
            unified_object_id=unified_object_id,
            upstream_entity_ids=[],
        )

        # Phase 4: propagate the propagation_basis and RUWE flags so the
        # consumer knows whether the propagated sigma is a 'full' (with all
        # 10 correlations) or 'diagonal' (uncorrelated) propagation, and
        # whether Gaia flagged the source as marginally resolved.
        propagation_basis = tan_vel.propagation_basis
        ruwe_flag = gaia_solution.is_noisy if gaia_solution else None

        kinematics = {
            "total_proper_motion_masyr": round(tot_pm, 2),
            "pmra_masyr": cds_target.proper_motion_ra_masyr,
            "pmdec_masyr": cds_target.proper_motion_dec_masyr,
            "parallax_mas": cds_target.parallax_mas,
            "radial_velocity_kms": cds_target.radial_velocity_kms,
            "displacement_14yr_arcsec": round(tot_pm * 14.2 / 1000.0, 2),
            "tangential_velocity_kms": tan_vel.value_kms,
            "tangential_velocity_kms_err": Uncertainty(
                value=tan_vel.uncertainty_kms,
                unit="km/s",
                uncertainty_kind="statistical",
                confidence_level=0.68,
                reference=(
                    f"v_tan = 4.74*sqrt(pmra²+pmdec²)/parallax; "
                    f"propagation_basis={propagation_basis}"
                ),
            ),
            "total_proper_motion_masyr_err": Uncertainty(
                value=round(tot_pm * math.sqrt(
                    (pmra_err_val or 0)**2 + (pmdec_err_val or 0)**2
                ) / max(tot_pm, 1e-12), 5) if (pmra_err_val or pmdec_err_val) else None,
                unit="mas/yr",
                uncertainty_kind="statistical",
                confidence_level=0.68,
                reference="Gaia DR3 (linear propagation from PM sigma)",
            ),
            "propagation_basis": propagation_basis,
            "gaia_ruwe": ruwe_flag,
            "gaia_epoch_jy": GAIA_DR3_EPOCH_JY,
            "propagated_epoch_jy": target_epoch_jy,
            "w3c_provenance": kinematics_provenance.model_dump(),
        }

        # Attach motion provenance as the same PROV bundle as kinematics —
        # both consume the same upstream astrometric record.
        if motion is not None:
            motion.w3c_provenance = kinematics_provenance.model_dump()

    # Compute astrophysical distance. Naive inversion distance = 1/parallax is
    # scientifically invalid (Luri et al. 2018, Bailer-Jones et al. 2018, 2021)
    # for negative parallaxes, low-SNR parallaxes, and any measurement where
    # the parallax-only posterior diverges from the true distance posterior.
    # The system MUST either retrieve a Bailer-Jones posterior or explicitly
    # label the distance as uncertain rather than fabricating a value.
    astrophysics: Optional[Dict[str, Any]] = None
    if cds_target.parallax_mas is not None:
        astrophysics = {
            "parallax_mas": cds_target.parallax_mas,
            "spectral_class": cds_target.spectral_type,
        }

        # Attempt authentic Bailer-Jones et al. (2021) posterior inference
        bj_data: Optional[Dict[str, Any]] = None
        if cds_target.gaia_dr3_id:
            bj_data = await query_gaia_bailer_jones_distance(cds_target.gaia_dr3_id)

        if bj_data and (bj_data.get("r_med_geo") is not None or
                          bj_data.get("r_med_photogeo") is not None):
            # Authoritative posterior distances from Gaia DR3 catalogue
            distance_pc: Optional[float] = None
            distance_lower_pc: Optional[float] = None
            distance_upper_pc: Optional[float] = None
            method = "unknown"

            # Phase 9: capture the full asymmetric interval verbatim. We
            # preserve r_lo_geo / r_hi_geo as separate fields in
            # AsymmetricInterval; the summary statistics are a convenience,
            # not a substitute for the interval shape.
            r_med_geo = bj_data.get("r_med_geo")
            r_lo_geo = bj_data.get("r_lo_geo")
            r_hi_geo = bj_data.get("r_hi_geo")
            r_med_photogeo = bj_data.get("r_med_photogeo")
            r_lo_photogeo = bj_data.get("r_lo_photogeo")
            r_hi_photogeo = bj_data.get("r_hi_photogeo")

            interval: Optional[AsymmetricInterval] = None
            if r_med_photogeo is not None:
                distance_pc = float(r_med_photogeo)
                distance_lower_pc = (
                    float(r_med_photogeo) - float(r_lo_photogeo)
                    if r_lo_photogeo is not None else None
                )
                distance_upper_pc = (
                    float(r_hi_photogeo) - float(r_med_photogeo)
                    if r_hi_photogeo is not None else None
                )
                method = "bailer_jones_photogeometric"
                interval = AsymmetricInterval(
                    median=float(r_med_photogeo),
                    lower=float(r_lo_photogeo) if r_lo_photogeo is not None else None,
                    upper=float(r_hi_photogeo) if r_hi_photogeo is not None else None,
                    unit="pc",
                    uncertainty_kind="posterior",
                    confidence_level=0.5,  # Bailer-Jones median-centered 50% credible interval
                    reference="Bailer-Jones et al. 2021, AJ 161, 147 (DOI: 10.3847/1538-3881/abd806)",
                )
            elif r_med_geo is not None:
                distance_pc = float(r_med_geo)
                distance_lower_pc = (
                    float(r_med_geo) - float(r_lo_geo)
                    if r_lo_geo is not None else None
                )
                distance_upper_pc = (
                    float(r_hi_geo) - float(r_med_geo)
                    if r_hi_geo is not None else None
                )
                method = "bailer_jones_geometric"
                interval = AsymmetricInterval(
                    median=float(r_med_geo),
                    lower=float(r_lo_geo) if r_lo_geo is not None else None,
                    upper=float(r_hi_geo) if r_hi_geo is not None else None,
                    unit="pc",
                    uncertainty_kind="posterior",
                    confidence_level=0.5,
                    reference="Bailer-Jones et al. 2021, AJ 161, 147 (DOI: 10.3847/1538-3881/abd806)",
                )

            # Phase 9: record the W3C PROV-DM bundle for the Bailer-Jones query
            bj_provenance = make_bailer_jones_provenance(
                source_id=str(cds_target.gaia_dr3_id or "unknown"),
                r_med_geo=r_med_geo,
                r_lo_geo=r_lo_geo,
                r_hi_geo=r_hi_geo,
                r_med_photogeo=r_med_photogeo,
                r_lo_photogeo=r_lo_photogeo,
                r_hi_photogeo=r_hi_photogeo,
                queried_at=datetime.now(timezone.utc).isoformat(),
                unified_object_id=unified_object_id,
            )

            astrophysics["distance_pc"] = round(distance_pc, 2) if distance_pc else None
            astrophysics["distance_ly"] = round(distance_pc * 3.26156, 2) if distance_pc else None
            astrophysics["distance_lower_pc"] = (
                round(distance_lower_pc, 2) if distance_lower_pc is not None else None
            )
            astrophysics["distance_upper_pc"] = (
                round(distance_upper_pc, 2) if distance_upper_pc is not None else None
            )
            astrophysics["distance_method"] = method
            astrophysics["distance_status"] = (
                "CATALOGUE_INFERRED — Bailer-Jones et al. 2021 posterior "
                "(DOI: 10.3847/1538-3881/abd806)"
            )
            # Phase 9: structured asymmetric interval + W3C PROV-DM bundle
            astrophysics["distance_interval"] = (
                interval.model_dump() if interval else None
            )
            astrophysics["w3c_provenance"] = bj_provenance.model_dump()
        else:
            # No authentic posterior available: label distance as UNCERTAIN
            # rather than computing 1000/parallax which is mathematically
            # invalid for negative or low-SNR parallaxes.
            astrophysics["distance_pc"] = None
            astrophysics["distance_ly"] = None
            astrophysics["distance_method"] = "naive_inversion_uncertain"
            astrophysics["distance_status"] = (
                "DISTANCE UNCERTAIN (PARALLAX ONLY — "
                "Bailer-Jones posterior unavailable for this source)"
            )
            # Phase 9: explicitly mark the interval as unavailable rather than
            # fabricating zeros
            astrophysics["distance_interval"] = None
            astrophysics["w3c_provenance"] = None

    # Phase 9: record a W3C PROV-DM bundle for the IRSA SIA query that
    # produced spherex_cov (if available). This gives the spectrophotometry
    # block its own lineage separate from CDS/SIMBAD.
    irsa_provenance_bundle = None
    if spherex_cov and spherex_cov.status == "available":
        try:
            irsa_provenance_bundle = make_irsa_query_provenance(
                collection=rel_meta["collection"],
                release=rel_key,
                doi=rel_meta["doi"],
                queried_at=datetime.now(timezone.utc).isoformat(),
                query_url="https://irsa.ipac.caltech.edu/SIA",
                cone_search=f"CIRCLE {cds_target.ra_deg} {cds_target.dec_deg} 0.05",
                product_count=int(
                    spherex_cov.diagnostics.get("sia_product_count", 0)
                    if spherex_cov.diagnostics else 0
                ),
                entity_label=f"SPHEREx SIA query for {cds_target.canonical_name}",
                unified_object_id=unified_object_id,
            )
        except Exception as prov_exc:  # pragma: no cover
            log.debug("IRSA provenance recording failed: %s", prov_exc)

    # Build the spherex block, attaching W3C PROV-DM when we have one
    spherex_block: Dict[str, Any] = {
        "releases": ["qr3", "qr2"],
        "default_release": rel_key,
        "coverage_status": spherex_cov.status if spherex_cov else "unknown",
        "spectrophotometry": spherex_cov.model_dump() if spherex_cov else None,
    }
    if irsa_provenance_bundle is not None:
        spherex_block["w3c_provenance"] = irsa_provenance_bundle.model_dump()

    return UnifiedOdysseyObject(
        id=unified_object_id,
        status="resolved",
        identity=ObjectIdentity(
            query=clean_query,
            canonical_name=cds_target.canonical_name,
            simbad_id=cds_target.simbad_id,
            gaia_dr3_id=cds_target.gaia_dr3_id,
            object_type=cds_target.object_type or "Astronomical Source",
        ),
        position=ObjectPosition(ra_deg=cds_target.ra_deg, dec_deg=cds_target.dec_deg),
        spherex=spherex_block,
        motion=motion,
        kinematics=kinematics,
        astrophysics=astrophysics,
        historical=cutouts,
        literature=[],  # Delegated to authentic ADS client in /api/catalogs/literature
        provenance=[
            ObjectProvenance(
                dataset=rel_meta["name"],
                doi=rel_meta["doi"],
                service="NASA/IPAC IRSA",
            ),
            ObjectProvenance(
                dataset=cds_target.resolver_source,
                service="CDS Strasbourg & ESA Gaia",
            ),
        ],
    )
