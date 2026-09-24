"""CDS / ESA Astronomical Resolvers and Context Imagery Adapter.

Connects to authentic CDS and ESA services:
- CDS Sesame Name Resolver (https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV)
- CDS SIMBAD TAP (https://simbad.cds.unistra.fr/simbad/sim-tap/sync)
- ESA Gaia Archive TAP (https://gea.esac.esa.int/tap-server/tap/sync)
- CDS HiPS2FITS Cutout Engine (https://alasky.cds.unistra.fr/hips-image-services/hips2fits)

Zero synthetic data or hardcoded fallbacks: unresolved targets return None.
"""

from __future__ import annotations

import logging
from typing import Optional, Dict, Any, List
import httpx
from pydantic import BaseModel

log = logging.getLogger("cds_adapter")


class CDSResolvedTarget(BaseModel):
    query: str
    canonical_name: str
    ra_deg: float
    dec_deg: float
    simbad_id: Optional[str] = None
    gaia_dr3_id: Optional[str] = None
    object_type: Optional[str] = None
    spectral_type: Optional[str] = None
    parallax_mas: Optional[float] = None
    proper_motion_ra_masyr: Optional[float] = None
    proper_motion_dec_masyr: Optional[float] = None
    radial_velocity_kms: Optional[float] = None
    resolver_source: str = "CDS Sesame / SIMBAD"


class ContextCutouts(BaseModel):
    wise_cutout_url: str
    twomass_cutout_url: str
    dss2_cutout_url: str


def build_hips2fits_url(
    hips_id: str,
    ra: float,
    dec: float,
    fov_deg: float = 0.08,
    width: int = 300,
    height: int = 300,
) -> str:
    """Construct authentic CDS HiPS2FITS cutout URL for context/historical layers."""
    encoded_hips = hips_id.replace("/", "%2F")
    return (
        f"https://alasky.cds.unistra.fr/hips-image-services/hips2fits?"
        f"hips={encoded_hips}&ra={ra}&dec={dec}&fov={fov_deg}&width={width}&height={height}&format=jpg"
    )


def get_context_cutouts(ra: float, dec: float, fov_deg: float = 0.08) -> ContextCutouts:
    """Generate authentic HiPS2FITS cutout URLs for historical/context infrared & optical baselines."""
    return ContextCutouts(
        wise_cutout_url=build_hips2fits_url("P/allWISE/color", ra, dec, fov_deg),
        twomass_cutout_url=build_hips2fits_url("P/2MASS/color", ra, dec, fov_deg),
        dss2_cutout_url=build_hips2fits_url("P/DSS2/color", ra, dec, fov_deg),
    )


async def query_simbad_tap_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Query CDS SIMBAD TAP for authentic astrometry, proper motions, and spectral class."""
    clean_name = name.strip()
    escaped_name = clean_name.replace("'", "''")
    adql = (
        f"SELECT TOP 1 b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.plx_value, b.rvz_radvel, "
        f"b.sp_type, b.otype_txt FROM basic b JOIN ident i ON b.oid = i.oidref "
        f"WHERE i.id = '{escaped_name}'"
    )

    url = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
    params = {
        "request": "doQuery",
        "lang": "ADQL",
        "format": "json",
        "query": adql,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                rows = data.get("data", [])
                if rows and len(rows) > 0:
                    fields = [f.get("name", "").lower() for f in data.get("metadata", [])]
                    row = rows[0]
                    res = dict(zip(fields, row))
                    return res
    except Exception as e:
        log.warning("SIMBAD TAP query failed for '%s': %s", clean_name, e)

    return None


async def _query_simbad_around_coord(
    ra_deg: float, dec_deg: float, radius_deg: float = 0.001,
) -> List[Dict[str, Any]]:
    """SIMBAD TAP cone search around (RA, Dec) in degrees.

    Returns a list of dict rows keyed by the column names from the SIMBAD
    TAP JSON envelope (``main_id``, ``ra``, ``dec``, ``otype_txt``,
    ``sp_type``). An empty list means no source was found within the cone
    or the request failed.
    """
    adql = (
        f"SELECT TOP 5 main_id, ra, dec, otype_txt, sp_type "
        f"FROM basic "
        f"WHERE 1=CONTAINS(POINT('ICRS', ra, dec), "
        f"CIRCLE('ICRS', {ra_deg:.6f}, {dec_deg:.6f}, {radius_deg:.6f}))"
    )
    url = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
    params = {"request": "doQuery", "lang": "ADQL", "format": "json", "query": adql}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
        if resp.status_code != 200:
            return []
        data = resp.json()
        rows = data.get("data") or []
        if not rows:
            return []
        fields = [f.get("name", "").lower() for f in data.get("metadata", [])]
        return [dict(zip(fields, r)) for r in rows]
    except Exception as exc:
        log.warning("SIMBAD cone-by-coord failed at (%f, %f): %s", ra_deg, dec_deg, exc)
        return []


async def query_gaia_dr3_tap(ra: float, dec: float, radius_deg: float = 0.003) -> Optional[Dict[str, Any]]:
    """Query ESA Gaia Archive DR3 TAP for high-precision astrometry.

    Returns source_id, position, proper motion, parallax, parallax_error,
    radial velocity, and correlation coefficients required for proper
    epoch propagation and distance inference. The full set of correlations
    is required so downstream code can propagate astrometric covariance
    rather than collapsing it to a single scalar.
    """
    adql = (
        f"SELECT TOP 1 source_id, ra, dec, parallax, parallax_error, "
        f"pmra, pmra_error, pmdec, pmdec_error, "
        f"radial_velocity, radial_velocity_error, "
        f"ra_dec_corr, ra_parallax_corr, ra_pmra_corr, ra_pmdec_corr, "
        f"dec_parallax_corr, dec_pmra_corr, dec_pmdec_corr, "
        f"parallax_pmra_corr, parallax_pmdec_corr, pmra_pmdec_corr, "
        f"ruwe, astrometric_excess_noise, "
        f"phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag "
        f"FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS', ra, dec), "
        f"CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {radius_deg:.6f})) ORDER BY phot_g_mean_mag ASC"
    )

    url = "https://gea.esac.esa.int/tap-server/tap/sync"
    params = {
        "request": "doQuery",
        "lang": "ADQL",
        "format": "json",
        "query": adql,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                rows = data.get("data", [])
                if rows and len(rows) > 0:
                    fields = [f.get("name", "").lower() for f in data.get("metadata", [])]
                    return dict(zip(fields, rows[0]))
    except Exception as e:
        log.warning("Gaia DR3 TAP query failed for ra=%f, dec=%f: %s", ra, dec, e)

    return None


async def query_gaia_bailer_jones_distance(
    source_id: int | str,
) -> Optional[Dict[str, Any]]:
    """Query ESA Gaia Archive for Bailer-Jones et al. (2021) posterior distances.

    Per Luri et al. (2018) and Bailer-Jones et al. (2018, 2021), naive parallax
    inversion distance = 1 / parallax is mathematically invalid for:
      - negative parallaxes,
      - small SNR parallaxes (sigma_plx / plx > 0.10),
      - any measurement where parallax alone yields a biased estimate.

    This function retrieves authentic posterior summaries:
      - r_med_geo, r_lo_geo, r_hi_geo  (geometric, Milky Way prior)
      - r_med_photogeo, r_lo_photogeo, r_hi_photogeo (photogeometric, Gaia+2MASS)

    Returns None if the source is not in the catalogue (e.g. too faint for
    Bailer-Jones inference, or DR3 not yet matched).

    Source: https://gea.esac.esa.int/archive/documentation/GDR3/
            Gaia_archive/chap_datamodel/sec_dm_external_catalogues/
    Table: external.gaiadr3_geometric_distance and
           external.gaiadr3_photogeometric_distance
    Reference: Bailer-Jones et al. 2021, AJ 161, 147 (DOI: 10.3847/1538-3881/abd806)
    """
    clean_id = str(source_id).strip()
    if not clean_id:
        return None

    adql = (
        f"SELECT g.source_id, g.r_med_geo, g.r_lo_geo, g.r_hi_geo, "
        f"p.r_med_photogeo, p.r_lo_photogeo, p.r_hi_photogeo "
        f"FROM external.gaiadr3_geometric_distance AS g "
        f"LEFT JOIN external.gaiadr3_photogeometric_distance AS p "
        f"  ON g.source_id = p.source_id "
        f"WHERE g.source_id = {clean_id}"
    )

    url = "https://gea.esac.esa.int/tap-server/tap/sync"
    params = {
        "request": "doQuery",
        "lang": "ADQL",
        "format": "json",
        "query": adql,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                rows = data.get("data", [])
                if rows and len(rows) > 0:
                    fields = [f.get("name", "").lower() for f in data.get("metadata", [])]
                    return dict(zip(fields, rows[0]))
    except Exception as e:
        log.warning("Gaia Bailer-Jones query failed for source_id=%s: %s", clean_id, e)

    return None


async def resolve_with_sesame(name: str) -> Optional[CDSResolvedTarget]:
    """Resolve an astronomical target via live CDS Sesame & SIMBAD TAP.

    Zero synthetic fallback data: returns None if external resolution fails.
    """
    clean_name = name.strip()
    if not clean_name:
        return None

    # 1. Try SIMBAD TAP first for richest astrometry
    simbad_data = await query_simbad_tap_by_name(clean_name)
    if simbad_data and simbad_data.get("ra") is not None and simbad_data.get("dec") is not None:
        ra = float(simbad_data["ra"])
        dec = float(simbad_data["dec"])
        main_id = str(simbad_data.get("main_id") or clean_name).strip()

        # Query Gaia DR3 for sub-mas astrometric confirmation
        gaia_data = await query_gaia_dr3_tap(ra, dec)

        pmra = float(simbad_data["pmra"]) if simbad_data.get("pmra") is not None else (
            float(gaia_data["pmra"]) if gaia_data and gaia_data.get("pmra") is not None else None
        )
        pmdec = float(simbad_data["pmdec"]) if simbad_data.get("pmdec") is not None else (
            float(gaia_data["pmdec"]) if gaia_data and gaia_data.get("pmdec") is not None else None
        )
        plx = float(simbad_data["plx_value"]) if simbad_data.get("plx_value") is not None else (
            float(gaia_data["parallax"]) if gaia_data and gaia_data.get("parallax") is not None else None
        )
        rv = float(simbad_data["rvz_radvel"]) if simbad_data.get("rvz_radvel") is not None else (
            float(gaia_data["radial_velocity"]) if gaia_data and gaia_data.get("radial_velocity") is not None else None
        )

        return CDSResolvedTarget(
            query=clean_name,
            canonical_name=main_id,
            ra_deg=round(ra, 5),
            dec_deg=round(dec, 5),
            simbad_id=main_id,
            gaia_dr3_id=str(gaia_data.get("source_id")) if gaia_data and gaia_data.get("source_id") else None,
            object_type=str(simbad_data.get("otype_txt") or "Astronomical Source"),
            spectral_type=str(simbad_data.get("sp_type")) if simbad_data.get("sp_type") else None,
            parallax_mas=plx,
            proper_motion_ra_masyr=pmra,
            proper_motion_dec_masyr=pmdec,
            radial_velocity_kms=rv,
            resolver_source="CDS SIMBAD TAP & Gaia DR3",
        )

    # 2. Fallback to CDS Sesame text parser
    url = f"https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?{clean_name}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                text = resp.text
                ra = None
                dec = None
                oname = clean_name
                otype = None

                for line in text.splitlines():
                    if line.startswith("%J"):
                        parts = line.split()
                        if len(parts) >= 3:
                            try:
                                ra = float(parts[1])
                                dec = float(parts[2])
                            except (ValueError, IndexError):
                                pass
                    elif line.startswith("%I"):
                        oname = line[2:].strip()
                    elif line.startswith("%T"):
                        otype = line[2:].strip()

                if ra is not None and dec is not None:
                    # Query Gaia DR3 for coordinates
                    gaia_data = await query_gaia_dr3_tap(ra, dec)

                    return CDSResolvedTarget(
                        query=clean_name,
                        canonical_name=oname,
                        ra_deg=round(ra, 5),
                        dec_deg=round(dec, 5),
                        simbad_id=oname,
                        gaia_dr3_id=str(gaia_data.get("source_id")) if gaia_data and gaia_data.get("source_id") else None,
                        object_type=otype or "Astronomical Source",
                        parallax_mas=float(gaia_data["parallax"]) if gaia_data and gaia_data.get("parallax") is not None else None,
                        proper_motion_ra_masyr=float(gaia_data["pmra"]) if gaia_data and gaia_data.get("pmra") is not None else None,
                        proper_motion_dec_masyr=float(gaia_data["pmdec"]) if gaia_data and gaia_data.get("pmdec") is not None else None,
                        radial_velocity_kms=float(gaia_data["radial_velocity"]) if gaia_data and gaia_data.get("radial_velocity") is not None else None,
                        resolver_source="CDS Sesame & Gaia DR3",
                    )
    except Exception as e:
        log.warning("CDS Sesame query failed for '%s': %s", clean_name, e)

    return None
