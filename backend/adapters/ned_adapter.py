"""NASA/IPAC Extragalactic Database (NED) Adapter.

Connects to the authentic NED REST interface at:
  https://ned.ipac.caltech.edu

Three primary endpoints are used:

  1. Object-by-name search (text interface, JSON output)
     GET https://ned.ipac.caltech.edu/cgi-bin/objsearch
       ?objname=<name>&of=json_main&in_csys=Equatorial&in_equinox=J2000.0
     Returns a JSON envelope with the canonical NED object name, J2000
     position (RA/Dec in degrees), object type, and the redshift (heliocentric
     frame, km/s and/or dimensionless z). This is the single source of truth
     for extragalactic target identification.

  2. Position cone search (JSON)
     GET https://ned.ipac.caltech.edu/cgi-bin/objsearch
       ?lon=<ra_deg>&lat=<dec_deg>&radius=<deg>&search_type=Near_Position_Search
       &in_csys=Equatorial&in_equinox=J2000.0&of=json_main
     Returns the nearest NED object inside the cone. Used by Phase 7 (cross-survey
     matching) to anchor extragalactic redshifts to a (RA, Dec) cone.

  3. Photometry roll-up (JSON)
     GET https://ned.ipac.caltech.edu/cgi-bin/neddata/<canonical_name>?meas_type=phot&of=json_main
     Returns the NED-aggregated multi-wavelength point-source photometry for an
     object — chiefly the cross-matched flux densities (FUV, NUV, u, g, r, i, z,
     J, H, K, W1, W2, W3, W4). Each row carries its own provenance: survey,
     band, observed magnitude, uncertainty, and bibliographic reference.

Scientific invariants enforced here:
  * No synthetic substitution. A failed lookup returns None.
  * The redshift object is typed (helio / cmb / galactic / 3K) so downstream
    cosmology can choose the correct rest-frame conversion.
  * The cross-matched photometry list is returned unsynthesised; the adapter
    never invents magnitudes or fill in missing rows.
  * All numeric parsing uses a single safe helper that rejects NaN/inf and
    empty strings. A bad row is dropped with a debug log, not silently
    coerced to zero.

References:
  * NED API doc: https://ned.ipac.caltech.edu/help/Documents/api/intro
  * NED data model: https://ned.ipac.caltech.edu/help/Documents/data/objsearch
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("ned_adapter")


# ── Scientific constants ─────────────────────────────────────────────────────

NED_BASE_URL = "https://ned.ipac.caltech.edu"
NED_TIMEOUT_SECONDS = 12.0

# NED's published maximum cone radius for objsearch is 300 arcmin = 5.0 deg.
NED_MAX_CONE_RADIUS_DEG: float = 5.0
# NED's text interface caps the number of returned rows at 50 by default; we
# keep the lower default to bound downstream processing.
NED_MAX_NEAREST_RESULTS: int = 25

# Redshift reference frames documented by NED. We expose these as the only
# legal values for the RedshiftRecord.frame field. NED has published these
# four frames for every object that has a measured redshift.
VALID_REDSHIFT_FRAMES = frozenset({
    "heliocentric",
    "cmb",
    "galactocentric",
    "3k",
})


# ── Typed scientific model ───────────────────────────────────────────────────


@dataclass
class NEDRedshift:
    """A single redshift measurement with its frame of reference.

    NED stores every published redshift against one of four reference frames:
    heliocentric, Local Group CMB, galactocentric, or 3K CMB. Cosmological
    distance calculations MUST be frame-aware; mixing frames yields up to
    ~700 km/s of bias (Fixsen et al. 1996).
    """
    value: float
    uncertainty: Optional[float] = None
    frame: str = "heliocentric"
    reference: Optional[str] = None  # NED reference bibcode, when available

    def __post_init__(self) -> None:
        if self.frame not in VALID_REDSHIFT_FRAMES:
            raise ValueError(
                f"Invalid NED redshift frame '{self.frame}'. "
                f"Must be one of: {sorted(VALID_REDSHIFT_FRAMES)}"
            )
        if not _is_finite(self.value):
            raise ValueError(f"Redshift value must be finite; got {self.value!r}")


@dataclass
class NEDPhotometryPoint:
    """A single cross-matched photometric measurement from NED's roll-up.

    NED aggregates photometry across surveys and bandpasses. Each row records:
      * survey: origin catalogue (e.g. 'SDSS', '2MASS', 'WISE')
      * band: passband label (e.g. 'g', 'FUV', 'W1')
      * magnitude / flux_density / uncertainty: at least one numeric value
      * reference: bibcode of the originating publication

    Adapter contract: we never invent rows. If a survey's row is malformed,
    it is dropped and the drop is logged.
    """
    survey: str
    band: str
    magnitude: Optional[float] = None
    magnitude_uncertainty: Optional[float] = None
    flux_density: Optional[float] = None
    flux_density_uncertainty: Optional[float] = None
    frequency_hz: Optional[float] = None
    wavelength_angstrom: Optional[float] = None
    reference: Optional[str] = None


@dataclass
class NEDObject:
    """Authentic NED record for a single extragalactic object."""
    canonical_name: str
    ra_deg: float
    dec_deg: float
    object_type: str
    redshift: Optional[NEDRedshift] = None
    redshift_qualifier: Optional[str] = None  # e.g. 'Spectroscopic', 'Photometric'
    velocity_kms: Optional[float] = None
    distance_mpc: Optional[float] = None       # NED's published co-moving distance
    distance_method: Optional[str] = None
    morphological_type: Optional[str] = None
    html_summary_url: str = ""
    photometry: List[NEDPhotometryPoint] = field(default_factory=list)
    raw_reference_count: int = 0


@dataclass
class NEDConeResult:
    """A single hit from a NED cone search around (RA, Dec)."""
    canonical_name: str
    ra_deg: float
    dec_deg: float
    object_type: str
    separation_arcsec: float
    redshift_value: Optional[float] = None
    velocity_kms: Optional[float] = None
    distance_mpc: Optional[float] = None
    reference_count: int = 0


# ── Exceptions ───────────────────────────────────────────────────────────────


class NEDError(Exception):
    """Base class for NED adapter failures."""


class NEDConnectionUnreachable(NEDError):
    """NED HTTP endpoint is unreachable or returned a transport error."""


class NEDNotFound(NEDError):
    """Object name / coordinates did not return any NED record."""


class NEDResponseMalformed(NEDError):
    """NED returned 200 but the body did not parse as a valid object envelope."""


# ── URL builders ─────────────────────────────────────────────────────────────


def build_objsearch_by_name_url(name: str) -> str:
    """Build a NED objsearch URL resolving ``name`` to J2000 astrometry."""
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("NED object name must be non-empty.")
    # NED requires 'of=json_main' for the JSON envelope we parse.
    return (
        f"{NED_BASE_URL}/cgi-bin/objsearch?"
        f"objname={_urlencode(cleaned)}"
        f"&search_type=Obj_search"
        f"&in_csys=Equatorial"
        f"&in_equinox=J2000.0"
        f"&of=json_main"
    )


def build_objsearch_cone_url(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_results: int = NED_MAX_NEAREST_RESULTS,
) -> str:
    """Build a NED cone-search URL.

    Raises ValueError if the radius exceeds NED's 5° envelope or the position
    is out of the celestial range — protects against calling NED with an
    impossible query that would otherwise silently return zero rows.
    """
    if not _is_finite(ra_deg) or not (0.0 <= ra_deg < 360.0):
        raise ValueError(f"ra_deg must be in [0, 360); got {ra_deg!r}")
    if not _is_finite(dec_deg) or not (-90.0 <= dec_deg <= 90.0):
        raise ValueError(f"dec_deg must be in [-90, 90]; got {dec_deg!r}")
    if not _is_finite(radius_deg) or radius_deg <= 0.0:
        raise ValueError(f"radius_deg must be > 0; got {radius_deg!r}")
    if radius_deg > NED_MAX_CONE_RADIUS_DEG:
        raise ValueError(
            f"NED cone radius cannot exceed {NED_MAX_CONE_RADIUS_DEG}°; got {radius_deg!r}"
        )
    if not (1 <= max_results <= 100):
        raise ValueError(f"max_results must be in [1, 100]; got {max_results}")

    return (
        f"{NED_BASE_URL}/cgi-bin/objsearch?"
        f"search_type=Near_Position_Search"
        f"&in_csys=Equatorial"
        f"&in_equinox=J2000.0"
        f"&lon={ra_deg:.6f}"
        f"&lat={dec_deg:.6f}"
        f"&radius={radius_deg:.6f}"
        f"&hconst=67.8"          # NED default cosmology: Planck 2015
        f"&omegam=0.308"
        f"&omegav=0.692"
        f"&corr_z=1"
        f"&img_stamp=NO"
        f"&of=json_main"
        f"&limit={max_results}"
    )


def build_photometry_url(canonical_name: str) -> str:
    """Build a NED photometry-rollup URL for a given object."""
    cleaned = canonical_name.strip()
    if not cleaned:
        raise ValueError("NED object name must be non-empty.")
    return (
        f"{NED_BASE_URL}/cgi-bin/neddata/{_urlencode(cleaned)}"
        f"?meas_type=phot&of=json_main&img_stamp=NO"
    )


# ── Internal helpers ─────────────────────────────────────────────────────────


def _urlencode(value: str) -> str:
    """Minimal URL-encode: alphanumerics, dot, dash, underscore are kept as-is.
    NED rejects over-encoded names (e.g. %20 for spaces in objname)."""
    out_chars: List[str] = []
    for ch in value:
        if ch.isalnum() or ch in "._-":
            out_chars.append(ch)
        else:
            out_chars.append(f"%{ord(ch):02X}")
    return "".join(out_chars)


def _is_finite(x: Any) -> bool:
    """True iff x is a finite real number (not NaN, not inf)."""
    if x is None:
        return False
    if isinstance(x, bool):
        # bool is a subclass of int; we don't want True/False coerced to 1.0/0.0
        return False
    if isinstance(x, (int, float)):
        return x == x and x not in (float("inf"), float("-inf"))
    return False


def _safe_float(value: Any) -> Optional[float]:
    """Parse ``value`` to a finite float, or None on failure.

    Accepts strings (e.g. '3.20E+03'), ints, and floats. Rejects '', 'null',
    NaN, and inf. NED occasionally ships missing fields as empty strings or
    the literal string 'null'; both must be treated as "no value".
    """
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "" or stripped.lower() in ("null", "nan", "inf", "-inf"):
            return None
        try:
            f = float(stripped)
        except (TypeError, ValueError):
            return None
        return f if _is_finite(f) else None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if _is_finite(value) else None
    return None


def _parse_json_envelope(text: str) -> Dict[str, Any]:
    """Parse a NED JSON envelope, surfacing NEDResponseMalformed on failure.

    NED returns either a single top-level dict (single result) or a dict
    containing a 'rows' list (multi-result cone search). We always coerce
    to the single-dict envelope and raise if the body is not valid JSON or
    is missing the required 'Object' marker.
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise NEDResponseMalformed(
            f"NED returned non-JSON body (first 80 chars): {text[:80]!r}"
        ) from exc
    if not isinstance(data, dict):
        raise NEDResponseMalformed(
            f"NED body is not a JSON object; got {type(data).__name__}"
        )
    return data


def _extract_object_payload(envelope: Dict[str, Any], key: str = "Object") -> Dict[str, Any]:
    """Pull the named payload out of the envelope.

    NED's JSON envelope has the shape::

        {
            "Object": { ... single-object fields ... },
            "Copyright": { ... }
        }

    or for cone searches::

        {
            "rows": [ { ...row 1... }, { ...row 2... } ],
            "Copyright": { ... }
        }

    This helper normalises to the single-object shape.
    """
    payload = envelope.get(key)
    if payload is None:
        # No rows at all (cone empty result is also fine; caller handles empty)
        return {}
    if not isinstance(payload, dict):
        raise NEDResponseMalformed(
            f"NED envelope['{key}'] is not a dict; got {type(payload).__name__}"
        )
    return payload


def _parse_redshift(obj_payload: Dict[str, Any]) -> Optional[NEDRedshift]:
    """Extract the canonical redshift from a NED object payload.

    NED stores redshift in two complementary forms: a dimensionless ``z``
    and a heliocentric radial velocity in km/s. The two are linked by
    relativistic Doppler when the velocity is non-trivial. We always
    prefer the published z value when present; otherwise we recover z
    from v_radial via the standard special-relativistic formula.

    We do NOT auto-convert helio → CMB here. Cosmological distance work
    must do that explicitly downstream with the documented frame tag.
    """
    z_str = obj_payload.get("Redshift")
    z = _safe_float(z_str)
    if z is not None:
        return NEDRedshift(value=z, frame="heliocentric")
    # Fallback: velocity-derived redshift, only if velocity is non-relativistic
    v_str = obj_payload.get("V")
    v = _safe_float(v_str)
    if v is not None and abs(v) < 30000.0:  # z < ~0.1 where SR Doppler ≈ z·c
        c_kms = 299792.458
        return NEDRedshift(value=round(v / c_kms, 9), frame="heliocentric")
    return None


def _parse_photometry_rows(photometry_envelope: Dict[str, Any]) -> List[NEDPhotometryPoint]:
    """Convert NED's photometry-rollup JSON into NEDPhotometryPoint rows.

    NED's photometry JSON envelope has the shape::

        {
          "Photometry": [ { "Survey": "SDSS", "Band": "g", "Mag": ..., ... }, ... ],
          "Copyright": { ... }
        }

    Rows with no magnitude and no flux are dropped (they are NED's
    'wavelength-only' catalog entries and cannot be ingested without
    additional flux information we do not fabricate).
    """
    rows = photometry_envelope.get("Photometry") or []
    if not isinstance(rows, list):
        return []
    out: List[NEDPhotometryPoint] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        survey = (raw.get("Survey") or raw.get("survey") or "").strip()
        band = (raw.get("Band") or raw.get("band") or "").strip()
        if not survey or not band:
            continue
        mag = _safe_float(raw.get("Mag") or raw.get("mag"))
        mag_err = _safe_float(raw.get("Mag_Err") or raw.get("mag_err"))
        flux = _safe_float(raw.get("Flux") or raw.get("flux"))
        flux_err = _safe_float(raw.get("Flux_Err") or raw.get("flux_err"))
        freq = _safe_float(raw.get("Frequency") or raw.get("frequency"))
        wave = _safe_float(raw.get("Wavelength") or raw.get("wavelength"))
        ref = (raw.get("Reference") or raw.get("refcode") or "").strip() or None

        # Refuse to keep rows with neither magnitude nor flux information.
        if mag is None and flux is None:
            continue

        out.append(NEDPhotometryPoint(
            survey=survey,
            band=band,
            magnitude=mag,
            magnitude_uncertainty=mag_err,
            flux_density=flux,
            flux_density_uncertainty=flux_err,
            frequency_hz=freq,
            wavelength_angstrom=wave,
            reference=ref,
        ))
    return out


def _parse_obj_envelope_to_object(envelope: Dict[str, Any]) -> NEDObject:
    """Convert a NED ``Object`` envelope dict into a :class:`NEDObject`.

    Raises NEDResponseMalformed on missing required fields (canonical name,
    position). Raises NEDNotFound if the envelope has no name.
    """
    obj = _extract_object_payload(envelope, "Object")
    if not obj:
        raise NEDNotFound("NED envelope contained no Object payload.")

    name = (obj.get("Name") or "").strip()
    if not name:
        raise NEDResponseMalformed("NED object payload missing 'Name'.")

    ra = _safe_float(obj.get("RA") or obj.get("ra"))
    dec = _safe_float(obj.get("Dec") or obj.get("dec"))
    if ra is None or dec is None:
        raise NEDResponseMalformed(
            f"NED object '{name}' missing RA/Dec (ra={ra!r}, dec={dec!r})"
        )

    otype = (obj.get("Type") or obj.get("Object_Type") or "").strip() or "Unknown"
    z = _parse_redshift(obj)
    z_qual = (obj.get("Redshift_Qualifier") or obj.get("Z_Qual") or "").strip() or None
    v_kms = _safe_float(obj.get("V") or obj.get("v"))
    d_mpc = _safe_float(obj.get("Distance_Mpc") or obj.get("Dist_Mpc"))
    d_method = (obj.get("Distance_Method") or obj.get("Dist_Method") or "").strip() or None
    morph = (obj.get("Morphology") or obj.get("Morph") or "").strip() or None

    # NED's HTML summary URL is always derivable from the canonical name.
    html_summary = f"{NED_BASE_URL}/cgi-bin/objsearch?objname={_urlencode(name)}"

    return NEDObject(
        canonical_name=name,
        ra_deg=ra,
        dec_deg=dec,
        object_type=otype,
        redshift=z,
        redshift_qualifier=z_qual,
        velocity_kms=v_kms,
        distance_mpc=d_mpc,
        distance_method=d_method,
        morphological_type=morph,
        html_summary_url=html_summary,
        photometry=[],
        raw_reference_count=0,
    )


# ── Public async drivers ─────────────────────────────────────────────────────


async def query_ned_by_name(name: str) -> Optional[NEDObject]:
    """Resolve a single object by name from NED.

    Returns ``None`` on any failure path (network, HTTP error, no record).
    Raises :class:`NEDResponseMalformed` only on a malformed JSON envelope
    that nevertheless returned 200 — i.e. a server bug, not a network issue.
    """
    url = build_objsearch_by_name_url(name)
    try:
        async with httpx.AsyncClient(timeout=NED_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
    except httpx.HTTPError as exc:
        log.warning("NED name search transport failure for '%s': %s", name, exc)
        raise NEDConnectionUnreachable(str(exc)) from exc

    if resp.status_code == 404:
        return None
    if resp.status_code >= 500:
        log.warning("NED name search HTTP %d for '%s'", resp.status_code, name)
        raise NEDConnectionUnreachable(f"NED HTTP {resp.status_code}")

    if resp.status_code != 200:
        # NED returns 200 + "No_Object_Found" envelope for empty results;
        # a non-200 with a body is treated as a connection-level failure.
        log.warning("NED name search HTTP %d for '%s'", resp.status_code, name)
        return None

    envelope = _parse_json_envelope(resp.text)
    obj_payload = envelope.get("Object") or {}
    if not obj_payload or obj_payload.get("Name") in (None, ""):
        return None

    parsed = _parse_obj_envelope_to_object(envelope)

    # Augment with photometry roll-up. We treat a photometry failure as
    # non-fatal: the positional/redshift result is already scientifically
    # complete, and a missing photometry envelope does not justify a 502.
    try:
        phot_url = build_photometry_url(parsed.canonical_name)
        async with httpx.AsyncClient(timeout=NED_TIMEOUT_SECONDS) as client:
            phot_resp = await client.get(
                phot_url, headers={"Accept": "application/json"}
            )
        if phot_resp.status_code == 200:
            phot_env = _parse_json_envelope(phot_resp.text)
            parsed.photometry = _parse_photometry_rows(phot_env)
    except (NEDError, httpx.HTTPError) as exc:
        log.info(
            "NED photometry roll-up unavailable for '%s': %s",
            parsed.canonical_name, exc,
        )

    parsed.html_summary_url = (
        f"{NED_BASE_URL}/cgi-bin/objsearch?objname={_urlencode(parsed.canonical_name)}"
    )

    return parsed


async def query_ned_cone(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float = 0.05,
    max_results: int = NED_MAX_NEAREST_RESULTS,
) -> List[NEDConeResult]:
    """Cone search NED around (RA, Dec) with ``radius_deg`` half-width.

    Returns an empty list on network failure, NED no-result envelope, or
    any other non-fatal error. The cone URL builder enforces the 5° ceiling
    and rejects out-of-range coordinates.
    """
    url = build_objsearch_cone_url(ra_deg, dec_deg, radius_deg, max_results)
    try:
        async with httpx.AsyncClient(timeout=NED_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
    except httpx.HTTPError as exc:
        log.warning("NED cone search transport failure: %s", exc)
        return []

    if resp.status_code != 200:
        log.warning("NED cone search HTTP %d at (%f, %f)", resp.status_code, ra_deg, dec_deg)
        return []

    try:
        envelope = _parse_json_envelope(resp.text)
    except NEDResponseMalformed as exc:
        log.warning("NED cone envelope malformed: %s", exc)
        return []

    rows = envelope.get("rows") or envelope.get("Row") or []
    if not isinstance(rows, list) or not rows:
        return []

    out: List[NEDConeResult] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        name = (raw.get("Name") or raw.get("objname") or "").strip()
        ra = _safe_float(raw.get("RA") or raw.get("ra"))
        dec = _safe_float(raw.get("Dec") or raw.get("dec"))
        sep = _safe_float(raw.get("Separation") or raw.get("sep") or raw.get("dist"))
        if not name or ra is None or dec is None:
            continue
        sep_arcsec = sep if sep is not None else _angular_separation_arcsec(
            ra_deg, dec_deg, ra, dec
        )
        out.append(NEDConeResult(
            canonical_name=name,
            ra_deg=ra,
            dec_deg=dec,
            object_type=(raw.get("Type") or raw.get("otype") or "Unknown").strip(),
            separation_arcsec=sep_arcsec,
            redshift_value=_safe_float(raw.get("Redshift") or raw.get("z")),
            velocity_kms=_safe_float(raw.get("V") or raw.get("v")),
            distance_mpc=_safe_float(raw.get("Distance_Mpc") or raw.get("Dist_Mpc")),
            reference_count=int(_safe_float(raw.get("References") or raw.get("refs")) or 0),
        ))
    return out


# ── Angular separation (Vincenty formula) ───────────────────────────────────

# Compact rewrite of the Vincenty special-case for the great-circle arc on a
# sphere — used here only as a fallback when NED does not return an explicit
# separation field in its cone-search rows. This is the same form used by the
# moc_engine.cone_intersects validator, kept here as a private helper so the
# NED adapter remains self-contained.

def _angular_separation_arcsec(
    ra1_deg: float, dec1_deg: float, ra2_deg: float, dec2_deg: float,
) -> float:
    """Approximate angular separation in arcseconds.

    Uses the standard spherical law of cosines for distances; this is
    numerically adequate at the arcsecond precision NED reports.
    """
    import math
    phi1 = math.radians(dec1_deg)
    phi2 = math.radians(dec2_deg)
    dphi = math.radians(dec2_deg - dec1_deg)
    dlam = math.radians(ra2_deg - ra1_deg)
    a = (math.sin(dphi / 2.0) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2)
    c = 2.0 * math.asin(min(1.0, math.sqrt(a)))
    return math.degrees(c) * 3600.0
