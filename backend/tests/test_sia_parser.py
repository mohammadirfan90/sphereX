"""Unit tests for SPHEREx SIA VOTable parsing and validation."""

import io
import pytest
from astropy.io.votable import from_table, parse
from astropy.table import Table
from adapters.spherex_adapter import query_spherex_sia, SPHEREx_RELEASES


def create_mock_votable_xml(rows: list, columns: list) -> bytes:
    """Helper to generate valid VOTable XML bytes from table data."""
    t = Table(rows=rows, names=columns) if rows else Table(names=columns)
    vt = from_table(t)
    buf = io.BytesIO()
    vt.to_xml(buf)
    return buf.getvalue()


def test_mock_votable_parse_success():
    """Verify parsing of valid VOTable XML with standard SIA columns."""
    columns = ["access_url", "obs_id", "s_ra", "s_dec", "format", "dataproduct_type"]
    rows = [
        ["https://irsa.ipac.caltech.edu/data/SPHEREx/cube1.fits", "SPX_OBS_001", 150.0, 2.5, "image/fits", "cube"],
        ["https://irsa.ipac.caltech.edu/data/SPHEREx/cube2.fits", "SPX_OBS_002", 150.05, 2.52, "image/fits", "cube"],
    ]
    xml_bytes = create_mock_votable_xml(rows, columns)
    vt = parse(io.BytesIO(xml_bytes), verify="ignore")
    tbl = vt.get_first_table().to_table()
    assert len(tbl) == 2
    assert "access_url" in tbl.colnames
    assert tbl["obs_id"][0] == "SPX_OBS_001"


def test_mock_votable_empty_coverage():
    """Verify parsing of valid VOTable XML with zero rows (no coverage)."""
    columns = ["access_url", "obs_id", "s_ra", "s_dec"]
    xml_bytes = create_mock_votable_xml([], columns)
    vt = parse(io.BytesIO(xml_bytes), verify="ignore")
    tbl = vt.get_first_table().to_table()
    assert len(tbl) == 0


def test_release_metadata_integrity():
    """Verify SPHEREx release catalog metadata contains authentic DOIs and collections."""
    assert "qr3" in SPHEREx_RELEASES
    assert SPHEREx_RELEASES["qr3"]["doi"] == "10.26131/IRSA662"
    assert SPHEREx_RELEASES["qr3"]["collection"] == "spherex_qr3"
    assert SPHEREx_RELEASES["qr3"]["is_default"] is True

    assert "qr2" in SPHEREx_RELEASES
    assert SPHEREx_RELEASES["qr2"]["doi"] == "10.26131/IRSA652"
    assert SPHEREx_RELEASES["qr2"]["collection"] == "spherex_qr2"
    assert SPHEREx_RELEASES["qr2"]["is_default"] is False
