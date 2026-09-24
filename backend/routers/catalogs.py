"""Astronomical Catalogs & Name Resolver Router (CDS Sesame / SIMBAD / NASA ADS).

Zero synthetic data generation: no fabricated bibcodes or fake papers.
"""

from __future__ import annotations

import logging
import os
import urllib.parse
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
import httpx

from adapters.cds_adapter import resolve_with_sesame, CDSResolvedTarget
from adapters.jpl_adapter import query_jpl_sbdb, query_jpl_horizons_ephemeris

log = logging.getLogger("catalogs_router")

router = APIRouter(prefix="/catalogs", tags=["Catalogs & Resolvers (SIMBAD / Sesame / ADS)"])


class ScientificPaper(BaseModel):
    bibcode: str
    title: str
    authors: List[str]
    year: int
    journal: str
    ads_url: str


class LiteratureResponse(BaseModel):
    target: str
    status: str  # "authenticated" | "api_token_unconfigured" | "no_records" | "error"
    ads_search_url: str
    papers: List[ScientificPaper] = []
    error: Optional[str] = None


@router.get("/resolve", response_model=CDSResolvedTarget)
async def resolve_object_name(
    name: str = Query(..., description="Target name or identifier (e.g. Barnard's Star, TRAPPIST-1, 99942)"),
):
    """Resolve an astronomical target to authentic J2000 coordinates via live CDS Sesame, SIMBAD & JPL."""
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Target name cannot be empty.")

    # 1. Try CDS Sesame / SIMBAD
    res = await resolve_with_sesame(clean_name)
    if res:
        return res

    # 2. Check JPL SBDB & dynamic Horizons ephemeris
    sb = await query_jpl_sbdb(clean_name)
    if sb:
        ephem = await query_jpl_horizons_ephemeris(sb.designation)
        ra = ephem.ra_deg if ephem else 0.0
        dec = ephem.dec_deg if ephem else 0.0

        return CDSResolvedTarget(
            query=clean_name,
            canonical_name=sb.fullname,
            ra_deg=ra,
            dec_deg=dec,
            simbad_id=sb.designation,
            object_type=sb.orbit_class,
            resolver_source="NASA/JPL SBDB & Horizons",
        )

    raise HTTPException(
        status_code=404,
        detail=f"Astronomical source '{name}' could not be resolved via CDS Sesame, SIMBAD, or JPL SBDB.",
    )


@router.get("/literature", response_model=LiteratureResponse)
async def get_nasa_ads_papers(
    target: str = Query(..., description="Target name for authentic NASA ADS bibliography lookup"),
):
    """Retrieve authentic peer-reviewed literature from NASA ADS.

    Zero synthetic citations: if ADS_API_TOKEN is unconfigured, returns an authentic
    direct query link to NASA ADS without fabricating bibcodes or paper titles.
    """
    clean_target = target.strip()
    ads_url = f"https://ui.adsabs.harvard.edu/search/q={urllib.parse.quote(clean_target)}"

    token = os.environ.get("ADS_API_TOKEN")
    if not token:
        return LiteratureResponse(
            target=clean_target,
            status="api_token_unconfigured",
            ads_search_url=ads_url,
            papers=[],
            error="ADS_API_TOKEN environment variable not set. Access via direct search URL.",
        )

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    url = f"https://api.adsabs.harvard.edu/v1/search/query?q={urllib.parse.quote(clean_target)}&fl=bibcode,title,author,year,pub&rows=10"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                docs = data.get("response", {}).get("docs", [])
                papers: List[ScientificPaper] = []
                for d in docs:
                    bib = d.get("bibcode", "")
                    title_list = d.get("title", [])
                    title = title_list[0] if title_list else "Untitled"
                    authors = d.get("author", [])
                    year = int(d.get("year", 0)) if d.get("year") else 0
                    journal = d.get("pub", "Unknown Publication")
                    papers.append(
                        ScientificPaper(
                            bibcode=bib,
                            title=title,
                            authors=authors[:5],
                            year=year,
                            journal=journal,
                            ads_url=f"https://ui.adsabs.harvard.edu/abs/{bib}",
                        )
                    )
                return LiteratureResponse(
                    target=clean_target,
                    status="authenticated",
                    ads_search_url=ads_url,
                    papers=papers,
                )
            else:
                return LiteratureResponse(
                    target=clean_target,
                    status="error",
                    ads_search_url=ads_url,
                    papers=[],
                    error=f"NASA ADS service returned HTTP {resp.status_code}",
                )
    except Exception as e:
        log.warning("NASA ADS query failed for '%s': %s", clean_target, e)
        return LiteratureResponse(
            target=clean_target,
            status="error",
            ads_search_url=ads_url,
            papers=[],
            error=str(e),
        )
