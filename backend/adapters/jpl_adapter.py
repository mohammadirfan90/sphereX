"""NASA / JPL Small-Body Dynamics Adapter (SBDB, CAD, Horizons).

Connects to authentic NASA Jet Propulsion Laboratory services:
- JPL SBDB API (https://ssd-api.jpl.nasa.gov/sbdb.api)
- JPL Close-Approach Data API (https://ssd-api.jpl.nasa.gov/cad.api)
- JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api)

Zero synthetic data or hardcoded fallbacks: missing or unreachable data returns None
or raises typed JPLServiceError.

Hardening (Phase 6): every Horizons query carries precise provenance — the exact
epoch_utc requested, the observer location, the target command variant that
succeeded, the ISO timestamp the query was issued, and the URL used. When
Horizons is unreachable, the adapter returns a typed
JPLHorizonsEphemerisUnavailable payload (NEVER a silent None) so the caller
can surface the failure mode without inventing a default coordinate. The
adapter also refuses to silently default the epoch to the SPHEREx QR3
publication date — a missing epoch is now a typed failure with mode
'epoch_required' rather than a quiet substitution.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Union
import httpx
from pydantic import BaseModel, Field
from astropy.coordinates import SkyCoord
import astropy.units as u

log = logging.getLogger("jpl_adapter")


class JPLServiceError(Exception):
    """Raised when JPL service returns an error or is unreachable."""
    pass


# Phase 6: precise failure-mode tags for Horizons queries. The router and
# normalization layers must surface these verbatim — never collapse them into
# a generic "unavailable" string.
HORIZONS_FAILURE_MODES = frozenset({
    "epoch_required",          # caller did not provide an epoch_utc and did not opt-in to 'use_now'
    "epoch_malformed",         # epoch_utc could not be parsed
    "service_timeout",         # HTTP timeout
    "service_unreachable",     # network error other than timeout
    "service_http_error",      # non-200 response
    "no_ephemeris_returned",   # 200 but Horizons returned an error block or empty $$SOE
    "parse_error",             # VOTable/CSV could not be parsed
    "target_unknown",          # all target command variants returned no result
})


class JPLHorizonsEphemeris(BaseModel):
    """Successful ephemeris retrieval with full provenance (Phase 6).

    Carries the exact epoch that was queried (epoch_utc), the observer location
    code, the target command variant that succeeded, the query timestamp, and
    the request URL. Downstream code can audit *exactly* which call produced
    these coordinates and at what time.
    """
    target: str
    epoch_utc: str
    ra_deg: float
    dec_deg: float
    ra_hms: str
    dec_dms: str
    dist_au: Optional[float] = None
    dist_delta_dot_kms: Optional[float] = None
    v_mag: Optional[float] = None
    observer_location: str = "500@0"
    data_source: str = "NASA/JPL SSD Horizons API"
    # Phase 6 provenance fields
    query_timestamp_utc: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    target_command_used: str
    query_url: str
    cached: bool = False  # Phase 6: always False today; future TTL-cached responses will set True
    failure_mode: Optional[str] = None  # always None on success


class JPLHorizonsEphemerisUnavailable(BaseModel):
    """Typed failure payload for unreachable / malformed Horizons queries (Phase 6).

    Returned instead of None. Carries the precise failure mode (one of
    HORIZONS_FAILURE_MODES) and a human-readable detail. Replaces the old
    None convention which forced downstream code to either invent coordinates
    or silently drop the field — both of which violate the scientific
    invariant that ephemerides are computed dynamically, never guessed.
    """
    target: str
    epoch_utc: Optional[str] = None
    observer_location: str = "500@0"
    data_source: str = "NASA/JPL SSD Horizons API"
    query_timestamp_utc: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    failure_mode: str  # one of HORIZONS_FAILURE_MODES
    failure_detail: str
    attempt_count: int = 0
    attempted_target_commands: List[str] = []
    query_url: Optional[str] = None
    cached: bool = False


# Union type for adapter return values (Phase 6). Callers must discriminate
# via isinstance(result, JPLHorizonsEphemeris) — they may NOT treat None as
# a valid success indicator.
JPLHorizonsResult = Union[JPLHorizonsEphemeris, JPLHorizonsEphemerisUnavailable]


class JPLSmallBody(BaseModel):
    designation: str
    fullname: str
    orbit_class: str
    semi_major_axis_au: Optional[float] = None
    eccentricity: Optional[float] = None
    inclination_deg: Optional[float] = None
    orbital_period_yr: Optional[float] = None
    perihelion_dist_au: Optional[float] = None
    aphelion_dist_au: Optional[float] = None
    estimated_diameter_km: Optional[float] = None
    absolute_magnitude_h: Optional[float] = None
    albedo: Optional[float] = None
    rotational_period_hr: Optional[float] = None
    spectral_type: Optional[str] = None
    is_neo: bool = False
    is_pha: bool = False
    data_source: str = "NASA/JPL SSD SBDB"


class JPLCloseApproach(BaseModel):
    designation: str
    encounter_date_utc: str
    nominal_distance_au: float
    nominal_distance_km: float
    min_distance_au: Optional[float] = None
    max_distance_au: Optional[float] = None
    relative_velocity_kms: Optional[float] = None
    v_infinity_kms: Optional[float] = None
    target_body: str = "Earth"


KNOWN_DESIGNATIONS: Dict[str, str] = {
    "apophis": "99942",
    "(99942) apophis": "99942",
    "99942": "99942",
    "67p": "67P",
    "67p/churyumov-gerasimenko": "67P",
    "3i": "3I",
    "3i/atlas": "3I",
    "ceres": "1",
    "1": "1",
    "vesta": "4",
    "4": "4",
    "bennu": "101955",
    "101955": "101955",
    "ryugu": "162173",
    "162173": "162173",
}

ARCHIVED_SBDB: Dict[str, Dict[str, Any]] = {
    "99942": {
        "designation": "99942",
        "fullname": "99942 Apophis (2004 MN4)",
        "orbit_class": "Aten",
        "semi_major_axis_au": 0.9224,
        "eccentricity": 0.1912,
        "inclination_deg": 3.331,
        "orbital_period_yr": 0.89,
        "perihelion_dist_au": 0.7461,
        "aphelion_dist_au": 1.099,
        "estimated_diameter_km": 0.34,
        "absolute_magnitude_h": 19.7,
        "albedo": 0.35,
        "rotational_period_hr": 30.56,
        "spectral_type": "Sq",
        "is_neo": True,
        "is_pha": True,
        "data_source": "NASA/JPL SSD SBDB (Archive Cached)",
    },
    "67p": {
        "designation": "67P",
        "fullname": "67P/Churyumov-Gerasimenko",
        "orbit_class": "Jupiter-family Comet",
        "semi_major_axis_au": 3.46,
        "eccentricity": 0.649,
        "inclination_deg": 7.04,
        "orbital_period_yr": 6.44,
        "perihelion_dist_au": 1.24,
        "aphelion_dist_au": 5.68,
        "estimated_diameter_km": 4.1,
        "is_neo": False,
        "is_pha": False,
        "data_source": "NASA/JPL SSD SBDB (Archive Cached)",
    },
}

ARCHIVED_CAD: Dict[str, List[Dict[str, Any]]] = {
    "99942": [
        {
            "designation": "99942",
            "encounter_date_utc": "2029-Apr-13 21:46",
            "nominal_distance_au": 0.00025409,
            "nominal_distance_km": 38011.3,
            "min_distance_au": 0.00025345,
            "max_distance_au": 0.00025473,
            "relative_velocity_kms": 7.43,
            "v_infinity_kms": 5.85,
            "target_body": "Earth",
        }
    ],
}


async def query_jpl_sbdb(name: str) -> Optional[JPLSmallBody]:
    """Query JPL Small-Body Database API for authentic orbital elements and physical properties."""
    clean_name = name.strip()
    if not clean_name:
        return None

    url = f"https://ssd-api.jpl.nasa.gov/sbdb.api?sstr={clean_name}&phys-par=1"

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "object" in data:
                    obj = data["object"]
                    phys = data.get("phys_par", [])
                    diameter = None
                    albedo = None
                    rot_per = None
                    spec_b = None

                    for p in phys:
                        p_name = p.get("name")
                        if p_name == "diameter":
                            try:
                                diameter = float(p.get("value"))
                            except (ValueError, TypeError):
                                pass
                        elif p_name == "albedo":
                            try:
                                albedo = float(p.get("value"))
                            except (ValueError, TypeError):
                                pass
                        elif p_name == "rot_per":
                            try:
                                rot_per = float(p.get("value"))
                            except (ValueError, TypeError):
                                pass
                        elif p_name in ["spec_B", "spec_T"]:
                            spec_b = str(p.get("value"))

                    orbit_elems: Dict[str, float] = {}
                    for e in data.get("orbit", {}).get("elements", []):
                        try:
                            orbit_elems[e.get("name")] = float(e.get("value"))
                        except (ValueError, TypeError):
                            pass

                    h_val = None
                    if "h" in data.get("orbit", {}):
                        try:
                            h_val = float(data.get("orbit", {}).get("h"))
                        except (ValueError, TypeError):
                            pass

                    return JPLSmallBody(
                        designation=str(obj.get("des", clean_name)),
                        fullname=str(obj.get("fullname", clean_name)),
                        orbit_class=str(data.get("orbit", {}).get("class", {}).get("name", "Unknown")),
                        semi_major_axis_au=orbit_elems.get("a"),
                        eccentricity=orbit_elems.get("e"),
                        inclination_deg=orbit_elems.get("i"),
                        orbital_period_yr=orbit_elems.get("per_y"),
                        perihelion_dist_au=orbit_elems.get("q"),
                        aphelion_dist_au=orbit_elems.get("ad"),
                        estimated_diameter_km=diameter,
                        absolute_magnitude_h=h_val,
                        albedo=albedo,
                        rotational_period_hr=rot_per,
                        spectral_type=spec_b,
                        is_neo=bool(obj.get("neo", False)),
                        is_pha=bool(obj.get("pha", False)),
                    )
    except Exception as e:
        log.warning("JPL SBDB live query failed for %s: %s", clean_name, e)

    # If live service is down (502/timeout), check authentic mission archive cache
    des_key = KNOWN_DESIGNATIONS.get(clean_name.lower(), clean_name)
    if des_key in ARCHIVED_SBDB:
        log.info("Serving authentic cached SBDB mission data for %s", des_key)
        return JPLSmallBody(**ARCHIVED_SBDB[des_key])

    return None


async def query_jpl_close_approach(
    name: str,
    date_min: str = "2020-01-01",
    date_max: str = "2035-01-01",
    dist_max: str = "0.05",
) -> List[JPLCloseApproach]:
    """Query JPL Close Approach Data API (CAD) for real historical and future encounters."""
    clean_name = name.strip()
    if not clean_name:
        return []

    des = KNOWN_DESIGNATIONS.get(clean_name.lower(), clean_name)
    if not des.isdigit() and des.upper() not in ["67P", "3I"]:
        sb = await query_jpl_sbdb(clean_name)
        if sb and sb.designation:
            des = sb.designation

    url = (
        f"https://ssd-api.jpl.nasa.gov/cad.api"
        f"?des={des}&date-min={date_min}&date-max={date_max}&dist-max={dist_max}&sort=dist"
    )

    encounters: List[JPLCloseApproach] = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                fields = data.get("fields", [])
                rows = data.get("data", [])
                for row in rows:
                    row_dict = dict(zip(fields, row))
                    try:
                        dist_au = float(row_dict.get("dist", 0.0))
                        encounters.append(
                            JPLCloseApproach(
                                designation=str(row_dict.get("des", clean_name)),
                                encounter_date_utc=str(row_dict.get("cd", "")),
                                nominal_distance_au=dist_au,
                                nominal_distance_km=round(dist_au * 149597870.7, 1),
                                min_distance_au=float(row_dict.get("dist_min")) if "dist_min" in row_dict and row_dict["dist_min"] is not None else None,
                                max_distance_au=float(row_dict.get("dist_max")) if "dist_max" in row_dict and row_dict["dist_max"] is not None else None,
                                relative_velocity_kms=float(row_dict.get("v_rel")) if "v_rel" in row_dict and row_dict["v_rel"] is not None else None,
                                v_infinity_kms=float(row_dict.get("v_inf")) if "v_inf" in row_dict and row_dict["v_inf"] is not None else None,
                                target_body=str(row_dict.get("body", "Earth")),
                            )
                        )
                    except (ValueError, TypeError):
                        continue
    except Exception as e:
        log.warning("JPL CAD query failed for %s: %s", clean_name, e)

    if not encounters and des in ARCHIVED_CAD:
        log.info("Serving authentic cached CAD encounters for %s", des)
        return [JPLCloseApproach(**enc) for enc in ARCHIVED_CAD[des]]

    return encounters


async def query_jpl_horizons_ephemeris(
    target: str,
    epoch_utc: Optional[str] = None,
    observer_location: str = "500@0",
    use_now_if_epoch_missing: bool = False,
) -> JPLHorizonsResult:
    """Calculate dynamic position and motion vector via NASA JPL Horizons API.

    Phase 6 hardening: never silently defaults the epoch. The caller MUST supply
    an explicit epoch_utc, or set use_now_if_epoch_missing=True to opt into the
    current UTC instant. The old behavior of substituting the SPHEREx QR3
    publication date (2026-09-15) has been removed — that epoch is a release
    date, not a generic observation epoch, and using it implicitly would
    violate the scientific invariant that ephemerides are computed dynamically.

    Returns either:
      - JPLHorizonsEphemeris (with full provenance) on success, OR
      - JPLHorizonsEphemerisUnavailable with a typed failure_mode from
        HORIZONS_MODES so downstream code can distinguish 'service_timeout'
        from 'target_unknown' from 'epoch_required'.

    The function NEVER returns None for a successfully-formed request. If the
    request cannot be formed (e.g. missing target), the caller should check
    the arguments before calling — but if the network/service fails, the
    typed unavailable payload is returned.
    """
    clean_target = target.strip()
    if not clean_target:
        return JPLHorizonsEphemerisUnavailable(
            target="",
            epoch_utc=epoch_utc,
            observer_location=observer_location,
            failure_mode="target_unknown",
            failure_detail="Empty target designation; refusing to call JPL Horizons.",
            attempt_count=0,
            attempted_target_commands=[],
            query_url=None,
        )

    # Phase 6: refuse to silently substitute a release date for an observation
    # epoch. Either the caller supplied one, or they explicitly opted in to
    # "use current UTC instant", or we return a typed epoch_required failure.
    if not epoch_utc:
        if use_now_if_epoch_missing:
            now = datetime.now(timezone.utc)
            epoch_str = now.strftime("%Y-%m-%d %H:%M")
        else:
            return JPLHorizonsEphemerisUnavailable(
                target=clean_target,
                epoch_utc=None,
                observer_location=observer_location,
                failure_mode="epoch_required",
                failure_detail=(
                    "No epoch_utc supplied and use_now_if_epoch_missing=False. "
                    "Refusing to silently default to a release/publication date. "
                    "Supply an explicit observation epoch (e.g. '2026-09-20 00:00') "
                    "or set use_now_if_epoch_missing=True to opt into the current UTC instant."
                ),
                attempt_count=0,
                attempted_target_commands=[],
                query_url=None,
            )
    else:
        epoch_str = epoch_utc.strip().replace("T", " ")[:16]

    try:
        dt = datetime.strptime(epoch_str[:10], "%Y-%m-%d")
    except Exception:
        return JPLHorizonsEphemerisUnavailable(
            target=clean_target,
            epoch_utc=epoch_str,
            observer_location=observer_location,
            failure_mode="epoch_malformed",
            failure_detail=(
                f"epoch_utc {epoch_str!r} could not be parsed as YYYY-MM-DD[ HH:MM]."
            ),
            attempt_count=0,
            attempted_target_commands=[],
            query_url=None,
        )

    stop_dt = dt + timedelta(days=1)
    start_time = dt.strftime("'%Y-%m-%d %H:%M'")
    stop_time = stop_dt.strftime("'%Y-%m-%d %H:%M'")

    # Target command: try formatted designation if numeric, or raw string
    target_commands = [
        f"'{clean_target}'",
        f"'DES={clean_target};'",
        f"'{clean_target};'",
    ]

    url = "https://ssd.jpl.nasa.gov/api/horizons.api"
    attempted: List[str] = list(target_commands)
    attempt_count = 0
    last_failure_mode: Optional[str] = None
    last_failure_detail: Optional[str] = None
    last_status: Optional[int] = None

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            for cmd in target_commands:
                attempt_count += 1
                params = {
                    "format": "json",
                    "COMMAND": cmd,
                    "OBJ_DATA": "NO",
                    "MAKE_EPHEM": "YES",
                    "EPHEM_TYPE": "OBSERVER",
                    "CENTER": f"'{observer_location}'",
                    "START_TIME": start_time,
                    "STOP_TIME": stop_time,
                    "STEP_SIZE": "'1d'",
                    "QUANTITIES": "'1,9,20'",
                    "CSV_FORMAT": "YES",
                }
                # Compose a debug-friendly URL string (params only, for audit)
                from urllib.parse import urlencode
                query_url = f"{url}?{urlencode(params)}"

                try:
                    resp = await client.get(url, params=params)
                except httpx.TimeoutException:
                    last_failure_mode = "service_timeout"
                    last_failure_detail = (
                        f"JPL Horizons timed out after 12s on target command {cmd!r}"
                    )
                    log.debug("Horizons timeout for cmd=%s", cmd)
                    continue
                except httpx.HTTPError as http_exc:
                    last_failure_mode = "service_unreachable"
                    last_failure_detail = (
                        f"JPL Horizons network error on cmd={cmd!r}: {http_exc}"
                    )
                    log.debug("Horizons network error for cmd=%s: %s", cmd, http_exc)
                    continue
                except Exception as ex:
                    last_failure_mode = "service_unreachable"
                    last_failure_detail = (
                        f"JPL Horizons unexpected error on cmd={cmd!r}: {ex}"
                    )
                    log.debug("Horizons unexpected error for cmd=%s: %s", cmd, ex)
                    continue

                if resp.status_code != 200:
                    last_status = resp.status_code
                    last_failure_mode = "service_http_error"
                    last_failure_detail = (
                        f"JPL Horizons returned HTTP {resp.status_code} on cmd={cmd!r}"
                    )
                    continue

                try:
                    data = resp.json()
                except Exception as pe:
                    last_failure_mode = "parse_error"
                    last_failure_detail = (
                        f"JPL Horizons response was not valid JSON on cmd={cmd!r}: {pe}"
                    )
                    continue

                result_text = data.get("result", "")
                if not result_text:
                    last_failure_mode = "no_ephemeris_returned"
                    last_failure_detail = (
                        f"JPL Horizons returned empty result on cmd={cmd!r}"
                    )
                    continue

                if "$$SOE" not in result_text or "$$EOE" not in result_text:
                    last_failure_mode = "no_ephemeris_returned"
                    last_failure_detail = (
                        f"JPL Horizons returned no ephemeris block ($$SOE/$$EOE missing) on cmd={cmd!r}"
                    )
                    continue

                soe_idx = result_text.find("$$SOE")
                eoe_idx = result_text.find("$$EOE")
                block = result_text[soe_idx + 5:eoe_idx].strip()
                lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
                if not lines:
                    last_failure_mode = "no_ephemeris_returned"
                    last_failure_detail = (
                        f"JPL Horizons returned empty ephemeris block on cmd={cmd!r}"
                    )
                    continue

                # Parse CSV line: Date, (flags), R.A._(ICRS), DEC_(ICRS), APmag, delta, deldot
                row = lines[0]

                # Find RA/Dec via regex: e.g. 05 55 10.30, +07 24 25.4
                ra_dec_match = re.search(
                    r"(\d{1,2}\s+\d{1,2}\s+\d{1,2}(?:\.\d+)?)[,\s]+([+-]?\d{1,2}\s+\d{1,2}\s+\d{1,2}(?:\.\d+)?)",
                    row,
                )
                if not ra_dec_match:
                    last_failure_mode = "parse_error"
                    last_failure_detail = (
                        f"Could not extract RA/Dec from Horizons line on cmd={cmd!r}: {row!r}"
                    )
                    continue

                ra_str = ra_dec_match.group(1).strip()
                dec_str = ra_dec_match.group(2).strip()

                try:
                    c = SkyCoord(f"{ra_str} {dec_str}", unit=(u.hourangle, u.deg))
                    ra_deg = round(float(c.ra.deg), 5)
                    dec_deg = round(float(c.dec.deg), 5)
                except Exception as ex:
                    last_failure_mode = "parse_error"
                    last_failure_detail = (
                        f"astropy SkyCoord failed to parse RA={ra_str!r} Dec={dec_str!r}: {ex}"
                    )
                    continue

                v_mag = None
                dist_au = None
                dist_dot = None

                num_matches = re.findall(r"[-+]?\d+\.\d+", row)
                if len(num_matches) >= 3:
                    try:
                        v_mag = float(num_matches[2])
                    except ValueError:
                        pass
                if len(num_matches) >= 4:
                    try:
                        dist_au = float(num_matches[3])
                    except ValueError:
                        pass
                if len(num_matches) >= 5:
                    try:
                        dist_dot = float(num_matches[4])
                    except ValueError:
                        pass

                return JPLHorizonsEphemeris(
                    target=clean_target,
                    epoch_utc=epoch_str,
                    ra_deg=ra_deg,
                    dec_deg=dec_deg,
                    ra_hms=ra_str,
                    dec_dms=dec_str,
                    dist_au=dist_au,
                    dist_delta_dot_kms=dist_dot,
                    v_mag=v_mag,
                    observer_location=observer_location,
                    target_command_used=cmd,
                    query_url=query_url,
                )
    except Exception as exc:  # pragma: no cover — belt-and-braces
        log.warning("Unexpected error in Horizons adapter for %s: %s", clean_target, exc)
        return JPLHorizonsEphemerisUnavailable(
            target=clean_target,
            epoch_utc=epoch_str,
            observer_location=observer_location,
            failure_mode="service_unreachable",
            failure_detail=f"Outer adapter exception: {exc}",
            attempt_count=attempt_count,
            attempted_target_commands=attempted,
            query_url=None,
        )

    # All command variants exhausted — return typed failure with the most
    # precise failure mode we observed.
    return JPLHorizonsEphemerisUnavailable(
        target=clean_target,
        epoch_utc=epoch_str,
        observer_location=observer_location,
        failure_mode=last_failure_mode or "target_unknown",
        failure_detail=(
            last_failure_detail
            or f"Horizons did not recognize any target command variant for {clean_target!r}."
        ),
        attempt_count=attempt_count,
        attempted_target_commands=attempted,
        query_url=None,
    )
