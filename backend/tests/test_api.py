"""Unit and integration tests for SPHEREx Odyssey Real-Data Backend."""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"


def test_health_check():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_spherex_releases():
    response = client.get("/spherex/releases")
    assert response.status_code == 200
    releases = response.json()
    assert len(releases) == 2
    qr3 = next(r for r in releases if r["release"] == "qr3")
    assert qr3["is_default"] is True
    assert qr3["doi"] == "10.26131/IRSA662"
    qr2 = next(r for r in releases if r["release"] == "qr2")
    assert qr2["doi"] == "10.26131/IRSA652"
    # Ensure QR1 is retired and not present
    assert not any(r["release"] == "qr1" for r in releases)


def test_spherex_bands():
    response = client.get("/spherex/bands")
    assert response.status_code == 200
    bands = response.json()
    assert len(bands) == 6
    # Exact R values from mission specs
    expected_R = [39, 41, 41, 35, 112, 128]
    for i, b in enumerate(bands):
        assert b["resolving_power_R"] == expected_R[i]


def test_spherex_coverage_metadata():
    """Verify honest metadata: never returns synthetic 102 channels on coverage endpoint."""
    response = client.get("/spherex/spectrophotometry?ra=133.795&dec=-7.245&release=qr3")
    assert response.status_code == 200
    data = response.json()
    assert data["release"] == "qr3"
    assert data["collection"] == "spherex_qr3"
    assert data["num_measurements"] == 0
    assert data["measurements"] == []


def test_solar_system_cad():
    response = client.get("/solar-system/cad/object?name=Apophis")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list) and len(data) > 0
    assert "99942" in data[0]["designation"]
    assert pytest.approx(data[0]["nominal_distance_au"], abs=0.0001) == 0.000254


def test_catalog_resolve():
    response = client.get("/catalogs/resolve?name=Barnard's Star")
    assert response.status_code == 200
    data = response.json()
    assert "Barnard" in data["canonical_name"]
    assert pytest.approx(data["ra_deg"], abs=0.2) == 269.452


def test_unified_object_inspector():
    response = client.get("/api/object/unified?query=Barnard's Star&release=qr3")
    assert response.status_code == 200
    data = response.json()
    assert "Barnard" in data["identity"]["canonical_name"]
    assert "spherex" in data
    assert data["spherex"]["default_release"] == "qr3"
    # Verify no fake 102 measurements were injected into production object
    assert len(data["spherex"]["spectrophotometry"]["measurements"]) == 0
    assert data["kinematics"]["total_proper_motion_masyr"] is not None
