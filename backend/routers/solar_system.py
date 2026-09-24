"""NASA / JPL Solar System Dynamics Router (JPL SBDB, CAD, Horizons)."""

from typing import Optional, List, Union
from fastapi import APIRouter, Query, HTTPException

from adapters.jpl_adapter import (
    query_jpl_sbdb,
    query_jpl_close_approach,
    query_jpl_horizons_ephemeris,
    JPLSmallBody,
    JPLCloseApproach,
    JPLHorizonsEphemeris,
    JPLHorizonsEphemerisUnavailable,
    HORIZONS_FAILURE_MODES,
)

router = APIRouter(prefix="/solar-system", tags=["Solar System Dynamics (JPL)"])


@router.get("/sbdb/object", response_model=JPLSmallBody)
async def get_small_body_orbit(
    name: str = Query(..., description="Asteroid or comet designation (e.g. 99942, Apophis, 67P)"),
):
    """Query JPL Small-Body Database API (SBDB) for authentic orbital elements and physical properties."""
    sb = await query_jpl_sbdb(name)
    if not sb:
        raise HTTPException(status_code=404, detail=f"Small body '{name}' not found in JPL SBDB.")
    return sb


@router.get("/cad/object", response_model=List[JPLCloseApproach])
async def get_close_approach(
    name: str = Query(..., description="Asteroid or comet designation (e.g. 99942, Apophis)"),
    date_min: str = Query(default="2020-01-01", description="Minimum encounter date (YYYY-MM-DD)"),
    date_max: str = Query(default="2035-01-01", description="Maximum encounter date (YYYY-MM-DD)"),
    dist_max: str = Query(default="0.05", description="Maximum encounter distance in AU"),
):
    """Query JPL Close Approach Data API (CAD) for authentic Earth and planetary encounters."""
    cad_list = await query_jpl_close_approach(name, date_min=date_min, date_max=date_max, dist_max=dist_max)
    if not cad_list:
        raise HTTPException(status_code=404, detail=f"Close approach records for '{name}' not found in JPL CAD.")
    return cad_list


@router.get(
    "/horizons/ephemeris",
    response_model=Union[JPLHorizonsEphemeris, JPLHorizonsEphemerisUnavailable],
)
async def get_horizons_ephemeris(
    target: str = Query(..., description="Small body designation or IAU name (e.g. 99942, Apophis, 67P)"),
    epoch: Optional[str] = Query(
        None,
        description=(
            "Observation epoch in UTC (YYYY-MM-DD or YYYY-MM-DD HH:MM). "
            "Phase 6: REQUIRED for a successful ephemeris. The adapter will NOT "
            "silently substitute a release/publication date for the observation "
            "epoch. Pass 'now' to opt into the current UTC instant."
        ),
    ),
    location: str = Query(default="500@0", description="Observer location code (default 500@0 for geocentric)"),
    use_now: bool = Query(
        default=False,
        description=(
            "Opt in to using the current UTC instant when 'epoch' is omitted. "
            "Defaults to False to make the missing-epoch case explicit."
        ),
    ),
):
    """Calculate authentic dynamic J2000 coordinates and motion vector via NASA JPL Horizons.

    Phase 6 hardening: the response is a Union of JPLHorizonsEphemeris (success)
    and JPLHorizonsEphemerisUnavailable (typed failure). Status codes:

      - 200 + JPLHorizonsEphemeris            -> success, full provenance
      - 200 + JPLHorizonsEphemerisUnavailable -> service or epoch failure; failure_mode explains
      - 404                                    -> empty target string

    The endpoint deliberately does NOT return synthetic (0, 0) coordinates when
    Horizons is unreachable. The failure mode is surfaced verbatim so callers
    can distinguish 'service_timeout' from 'target_unknown' from 'epoch_malformed'.
    """
    if not target.strip():
        raise HTTPException(
            status_code=404,
            detail="Empty target designation; JPL Horizons requires a designation.",
        )

    # Phase 6: 'now' is an opt-in shortcut for the current UTC instant — the
    # adapter refuses to substitute it without explicit consent.
    if epoch is not None and epoch.strip().lower() == "now":
        epoch_param: Optional[str] = None
        use_now_flag = True
    else:
        epoch_param = epoch
        use_now_flag = use_now

    result = await query_jpl_horizons_ephemeris(
        target=target,
        epoch_utc=epoch_param,
        observer_location=location,
        use_now_if_epoch_missing=use_now_flag,
    )

    # The adapter never returns None for a well-formed request. A 200 with a
    # typed failure payload is intentional — callers must discriminate.
    return result
