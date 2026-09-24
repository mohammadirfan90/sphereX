"""W3C PROV-DM Provenance Router (Phase 9).

Exposes the in-memory ProvenanceService so clients can retrieve the full W3C
PROV-DM lineage bundle(s) attached to any unified object that was previously
resolved by /api/object/unified.

Each bundle is a PROV-JSON-compatible dict containing:
  - prov:Entity records (the artifacts produced)
  - prov:Activity records (the queries / derivations that produced them)
  - prov:Agent records (the services / catalogues responsible)
  - primary_role (one of: primary, derived, calibrated, reference, validation, fallback)

The endpoint is intentionally read-only and additive — once a bundle is
recorded it is never overwritten. New bundles referencing prior ones via
`wasRevisionOf` extend the lineage without mutating prior state.

References:
  - W3C PROV-DM: https://www.w3.org/TR/prov-dm/
  - W3C PROV-JSON: https://www.w3.org/Submission/prov-json/
"""

from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException, Query

from adapters.provenance import provenance_service, W3CProvBlock

router = APIRouter(prefix="/provenance", tags=["W3C PROV-DM Provenance (Phase 9)"])


@router.get(
    "/{object_id:path}",
    response_model=List[W3CProvBlock],
)
async def get_object_provenance(object_id: str) -> List[W3CProvBlock]:
    """Return all W3C PROV-DM bundles recorded against a unified object id.

    Each bundle is a self-contained PROV-DM document: prov:Entity +
    prov:Activity + prov:Agent records, linked via prov:used / prov:wasAttributedTo
    / prov:wasRevisionOf relationships captured in the entity attributes.

    Returns an empty list (200 OK) if no provenance has been recorded for
    the given object id — this is not an error condition, just an empty
    record. Clients should treat an empty response as "this object was never
    resolved through /api/object/unified, or its adapters do not record
    provenance (e.g. older targets resolved before Phase 9)."

    A 404 is reserved for the (impossible) case where the object_id is
    malformed — we accept any non-empty string to match the unified object's
    id generation rules (e.g. "target-sirius", "jpl-99942", "coord-269.4520-4.6930").
    """
    if not object_id or not object_id.strip():
        raise HTTPException(
            status_code=400,
            detail="object_id must be a non-empty string (the unified object's id field).",
        )
    return provenance_service.for_object(object_id.strip())


@router.get(
    "/bundle/{bundle_id}",
    response_model=W3CProvBlock,
)
async def get_bundle(bundle_id: str) -> W3CProvBlock:
    """Return a single W3C PROV-DM bundle by its bundle_id.

    A 404 is returned when no bundle matches. Bundle ids are UUIDs prefixed
    with `prov:` and are returned in the `bundle_id` field of each bundle
    from the for-object endpoint.
    """
    bundle = provenance_service.get(bundle_id)
    if bundle is None:
        raise HTTPException(
            status_code=404,
            detail=f"No W3C PROV-DM bundle found with id {bundle_id!r}.",
        )
    return bundle
