"""Unified Odyssey Object Inspector & Live Resolver Router."""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from adapters.normalization import build_unified_object, UnifiedOdysseyObject

router = APIRouter(prefix="/api/object", tags=["Unified Science Object"])


@router.get("/unified", response_model=UnifiedOdysseyObject)
async def get_unified_object(
    query: str = Query(..., description="Target name, small body (Apophis, 67P), or coordinates (RA, Dec)"),
    release: str = Query(default="qr3", description="SPHEREx release: 'qr3' (default) or 'qr2' (compare)"),
):
    """Retrieve normalized live scientific object combining SPHEREx, JPL, CDS, and ESA data."""
    obj = await build_unified_object(query=query, release=release)
    if not obj:
        raise HTTPException(
            status_code=404,
            detail=f"Unable to resolve target '{query}' across JPL SBDB, CDS Sesame, or coordinate parsers.",
        )
    return obj
