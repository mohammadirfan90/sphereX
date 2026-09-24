"""Unit tests for JPL Horizons Ephemeris & SBDB queries."""

import pytest
from adapters.jpl_adapter import (
    query_jpl_horizons_ephemeris,
    query_jpl_sbdb,
    query_jpl_close_approach,
)


@pytest.mark.asyncio
async def test_horizons_ephemeris_calculation():
    """Verify Horizons ephemeris query returns valid sky coordinates and observation dates."""
    result = await query_jpl_horizons_ephemeris("99942", epoch_utc="2026-09-20 00:00:00")
    assert result.ra_deg is not None
    assert result.dec_deg is not None
    assert 0.0 <= result.ra_deg <= 360.0
    assert -90.0 <= result.dec_deg <= 90.0
    assert "Horizons" in result.data_source


@pytest.mark.asyncio
async def test_horizons_fallback_keplerian():
    """Verify known asteroid orbital elements resolution via JPL SBDB."""
    sb = await query_jpl_sbdb("99942")
    assert sb is not None
    assert "Apophis" in sb.fullname or "99942" in sb.designation
    assert sb.semi_major_axis_au is not None
    assert pytest.approx(sb.semi_major_axis_au, abs=0.05) == 0.922
    assert sb.is_pha is True


@pytest.mark.asyncio
async def test_close_approach_cad():
    """Verify close approach data for Apophis April 2029 encounter."""
    cad = await query_jpl_close_approach("Apophis")
    assert cad is not None
    assert len(cad) > 0
    assert any("2029" in c.encounter_date_utc for c in cad)
    assert cad[0].nominal_distance_km > 0
