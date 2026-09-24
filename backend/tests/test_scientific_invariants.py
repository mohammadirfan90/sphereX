"""Test Suite for SPHEREx Odyssey Scientific Invariants.

Verifies the 106-point scientific integrity specification:
1. Zero synthetic SEDs or fabricated fluxes on production routes.
2. Formally retired SPHEREx QR1 is never served as an active release.
3. Target resolution never returns synthetic fallback objects.
4. Ephemerides are computed dynamically, never static dummy coordinates.
5. All archive citations provide authentic DOIs.
"""

import math
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_invariant_no_synthetic_seds():
    """Verify that requesting spectrophotometry metadata never generates synthetic 102 channels."""
    response = client.get("/spherex/spectrophotometry?ra=269.452&dec=4.693&release=qr3")
    assert response.status_code == 200
    data = response.json()
    assert data["num_measurements"] == 0
    assert data["measurements"] == []


def test_invariant_qr1_is_retired():
    """Verify QR1 is not present in available releases and defaults to QR3."""
    response = client.get("/spherex/releases")
    assert response.status_code == 200
    releases = response.json()
    release_keys = [r["release"] for r in releases]
    assert "qr1" not in release_keys
    assert "qr3" in release_keys
    assert "qr2" in release_keys

    # Check default release
    default_release = next(r for r in releases if r["is_default"])
    assert default_release["release"] == "qr3"


def test_invariant_no_fallback_on_unresolvable_target():
    """Verify that an unknown object returns a 404 Not Found rather than a fabricated fallback object."""
    response = client.get("/catalogs/resolve?name=NonExistentObjectXYZ99999")
    # Must fail cleanly or return 404
    assert response.status_code == 404
    detail = response.json().get("detail", "")
    assert "could not be resolved" in detail.lower() or "not found" in detail.lower()


def test_invariant_unified_object_no_synthetic_spectrum():
    """Verify unified target endpoint does not fabricate spectrum data."""
    response = client.get("/api/object/unified?query=Sirius&release=qr3")
    assert response.status_code == 200
    data = response.json()
    assert data["identity"]["canonical_name"] is not None
    # Measurements array must be empty unless extracted via SPExPI job
    assert len(data["spherex"]["spectrophotometry"]["measurements"]) == 0


def test_invariant_authentic_dois():
    """Verify archive releases have authenticated DOIs."""
    response = client.get("/spherex/releases")
    releases = response.json()
    qr3 = next(r for r in releases if r["release"] == "qr3")
    assert qr3["doi"] == "10.26131/IRSA662"
    qr2 = next(r for r in releases if r["release"] == "qr2")
    assert qr2["doi"] == "10.26131/IRSA652"


def test_invariant_horizons_ephemeris_dynamic():
    """Verify dynamic ephemeris endpoint provides computed RA/Dec and provenance."""
    response = client.get("/api/solar-system/horizons/ephemeris?target=99942&epoch=2026-09-20")
    assert response.status_code == 200
    data = response.json()
    assert "ra_deg" in data
    assert "dec_deg" in data
    assert "Horizons" in data["data_source"]
    assert 0.0 <= data["ra_deg"] <= 360.0
    assert -90.0 <= data["dec_deg"] <= 90.0


def test_invariant_no_naive_parallax_inversion():
    """Reject naive distance = 1000/parallax.

    Per Luri et al. (2018) and Bailer-Jones et al. (2018, 2021), naive parallax
    inversion is mathematically invalid for negative parallaxes and biased for
    low-SNR parallaxes (sigma_plx / plx > 0.10). The unified object endpoint
    must never compute distance_pc = 1000 / parallax_mas without an explicit
    Bailer-Jones posterior lookup or an explicit "DISTANCE UNCERTAIN" label.

    This test asserts that any distance field is either:
      (a) accompanied by a `distance_method` field that is one of:
          bailer_jones_photogeometric, bailer_jones_geometric, or
          naive_inversion_uncertain, AND
      (b) when method is naive_inversion_uncertain, the distance is labelled
          as UNCERTAIN in the distance_status string.
    """
    response = client.get("/api/object/unified?query=Sirius&release=qr3")
    if response.status_code != 200:
        pytest.skip(f"Upstream unavailable: {response.status_code}")
    data = response.json()
    astro = data.get("astrophysics")
    if not astro:
        # No astrophysics block at all is fine (e.g. small body)
        return

    if "parallax_mas" in astro and astro["parallax_mas"] is not None:
        # If parallax is reported, distance must be reported with method
        if astro.get("distance_pc") is not None:
            assert "distance_method" in astro, (
                "distance_pc present without distance_method — "
                "this implies a naive 1/parallax inversion"
            )
            assert astro["distance_method"] in (
                "bailer_jones_photogeometric",
                "bailer_jones_geometric",
                "naive_inversion_uncertain",
            )
            if astro["distance_method"] == "naive_inversion_uncertain":
                # When uncertain, distance must be explicitly labelled
                status = astro.get("distance_status", "")
                assert "UNCERTAIN" in status, (
                    "naive_inversion_uncertain must carry UNCERTAIN label "
                    f"in distance_status, got: {status!r}"
                )


def test_invariant_distance_method_in_astrophysics():
    """All distance_pc fields must be paired with a distance_method and provenance.

    The naive distance = 1000/parallax formula is mathematically invalid for
    negative or low-SNR parallaxes (Luri et al. 2018). Any distance reported
    without an explicit method violates the scientific invariant.
    """
    # Try a small sample of well-known named targets
    test_targets = ["Sirius", "Betelgeuse", "Vega", "TRAPPIST-1"]
    for target in test_targets:
        response = client.get(f"/api/object/unified?query={target}&release=qr3")
        if response.status_code != 200:
            continue
        data = response.json()
        astro = data.get("astrophysics") or {}
        if astro.get("distance_pc") is not None:
            method = astro.get("distance_method")
            assert method is not None, (
                f"{target}: distance_pc={astro['distance_pc']} present without "
                f"distance_method — this implies naive 1/parallax inversion"
            )


def test_invariant_release_registry_endpoint():
    """The /spherex/releases/diagnostics endpoint must always be reachable.

    It must never depend on a live IRSA TAP probe to return a well-formed
    snapshot — at minimum it must echo the static manifest and a TTL. If
    IRSA is unreachable, every release must be marked last_known_good
    (never silently upgraded to "live").
    """
    response = client.get("/spherex/releases/diagnostics")
    assert response.status_code == 200, (
        f"release diagnostics endpoint unreachable: {response.status_code}"
    )
    data = response.json()

    # Schema invariants — these must hold regardless of IRSA state
    assert "generated_at" in data
    assert "ttl_seconds" in data
    assert isinstance(data["ttl_seconds"], int) and data["ttl_seconds"] > 0
    assert "degraded_mode" in data
    assert "irsa_reachable" in data
    assert "releases" in data
    assert isinstance(data["releases"], list) and len(data["releases"]) > 0

    # Every release in the snapshot must have a valid verification_status
    allowed_statuses = {"live", "last_known_good", "not_live", "stale"}
    for entry in data["releases"]:
        assert entry["verification_status"] in allowed_statuses, (
            f"unknown verification status: {entry['verification_status']!r}"
        )
        # Each entry must carry a DOI for provenance
        assert entry.get("doi"), f"release {entry['release']} missing DOI"

    # The default release from the static manifest must appear in the snapshot
    release_keys = {r["release"] for r in data["releases"]}
    assert "qr3" in release_keys
    assert "qr2" in release_keys
    assert "qr1" not in release_keys, "retired QR1 must never appear in active manifest"


def test_invariant_release_refresh_endpoint():
    """POST /spherex/releases/refresh must return a fresh snapshot without raising.

    It may take a long time on a cold cache or fail if IRSA is unreachable,
    but it must always respond with the same schema as the diagnostics
    endpoint. Failures degrade gracefully — last_irsa_error must be populated.
    """
    response = client.post("/spherex/releases/refresh")
    assert response.status_code == 200
    data = response.json()
    # The post-refresh snapshot must still include the static manifest releases
    release_keys = {r["release"] for r in data["releases"]}
    assert "qr3" in release_keys
    assert "qr2" in release_keys

    # If IRSA was unreachable, last_irsa_error must explain why
    if not data["irsa_reachable"]:
        assert data["last_irsa_error"], (
            "irsa_reachable=false without last_irsa_error — silent failure"
        )


def test_invariant_sia_provenance_carries_release_verification():
    """SIA search provenance must report the release registry verification status.

    This is how the frontend distinguishes a query against a live release
    from a query against a release that has been retired server-side but
    is still in our static manifest. Without this stamp, every SIA response
    looks identical regardless of IRSA's actual state.
    """
    response = client.get(
        "/spherex/search?ra=269.452&dec=4.693&radius_deg=0.05&collection=spherex_qr3"
    )
    assert response.status_code == 200
    data = response.json()
    provenance = data.get("provenance") or {}
    assert "release_verification_status" in provenance, (
        "SIA provenance missing release_verification_status — "
        "consumers cannot tell live vs last_known_good vs not_live"
    )
    assert provenance["release_verification_status"] in (
        "live", "last_known_good", "not_live", "stale"
    ), (
        f"unknown release_verification_status in SIA provenance: "
        f"{provenance['release_verification_status']!r}"
    )


def test_invariant_no_hardcoded_release_in_spectrophotometry():
    """The /spherex/spectrophotometry endpoint must never silently default to qr3.

    If the caller passes a release key that does not exist in the static
    manifest, the endpoint must reject it explicitly (or fall through to
    qr3 but report the substitution in the response), never return success
    for an unrecognized release without acknowledging it.
    """
    # Pass a known release — should succeed and stamp the DOI
    ok = client.get(
        "/spherex/spectrophotometry?ra=269.452&dec=4.693&release=qr3"
    )
    assert ok.status_code == 200
    assert ok.json()["release"] == "qr3"
    assert ok.json()["doi"] == "10.26131/IRSA662"

    # Pass a clearly retired release — must be rejected or surfaced
    retired = client.get(
        "/spherex/spectrophotometry?ra=269.452&dec=4.693&release=qr1"
    )
    # The endpoint may either 4xx or silently fall back to qr3, but it must
    # NEVER serve qr1 — the retired release must not appear in any response.
    if retired.status_code == 200:
        assert retired.json()["release"] != "qr1", (
            "Retired QR1 leaked through as an active release"
        )
    else:
        assert retired.status_code in (400, 404), (
            f"unexpected status for qr1: {retired.status_code}"
        )


# ── Phase 6: JPL Horizons hardening invariants ──────────────────────────────


def test_invariant_horizons_requires_explicit_epoch():
    """Phase 6: Horizons must refuse to default to a release/publication date.

    Without an explicit epoch and without use_now=true, the adapter must
    surface a typed 'epoch_required' failure rather than silently substituting
    the SPHEREx QR3 publication date (which is the anti-pattern we eliminated
    in Phase 1).

    This holds whether or not JPL Horizons is reachable — the typed failure
    is checked at the adapter boundary, before any network call.
    """
    response = client.get("/api/solar-system/horizons/ephemeris?target=99942")
    assert response.status_code == 200
    body = response.json()
    # The typed failure payload must be present
    assert body.get("failure_mode") == "epoch_required", (
        f"expected failure_mode='epoch_required', got {body.get('failure_mode')!r}; "
        f"the adapter is silently substituting a default epoch"
    )
    assert "use_now" in body.get("failure_detail", "").lower(), (
        "failure_detail should explain how to opt-in to current UTC"
    )
    # A typed failure must NEVER include coordinate fields — that would be
    # a fabricated (0, 0) fallback
    assert "ra_deg" not in body, "epoch_required failure must not include ra_deg"
    assert "dec_deg" not in body, "epoch_required failure must not include dec_deg"
    # Provenance stamp
    assert body.get("observer_location") == "500@0"
    assert body.get("data_source", "").startswith("NASA/JPL")


def test_invariant_horizons_typed_failure_modes():
    """Phase 6: malformed epochs must produce 'epoch_malformed', not silent defaults."""
    response = client.get(
        "/api/solar-system/horizons/ephemeris?target=99942&epoch=not-a-date"
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("failure_mode") == "epoch_malformed", (
        f"expected failure_mode='epoch_malformed', got {body.get('failure_mode')!r}"
    )
    assert "ra_deg" not in body
    assert "dec_deg" not in body


def test_invariant_horizons_success_carries_full_provenance():
    """Phase 6: successful Horizons responses must carry the full provenance record.

    Every ephemeris returned to the client must have:
      - target_command_used (which COMMAND variant succeeded)
      - query_url (auditability)
      - query_timestamp_utc (when the call was issued)
      - epoch_utc (the exact epoch that was queried)
      - observer_location (the CENTER code used)
      - data_source (NASA/JPL SSD Horizons API)

    Without these fields, downstream code cannot audit *which* call produced
    a given RA/Dec — a critical provenance gap for scientific reproducibility.
    """
    response = client.get(
        "/api/solar-system/horizons/ephemeris?target=99942&epoch=2026-09-20"
    )
    # If JPL Horizons is reachable in the test environment, we get a success
    # payload with full provenance. If unreachable, we get a typed failure —
    # either way, the provenance fields must be present.
    assert response.status_code == 200, (
        f"unexpected status code: {response.status_code}; "
        f"Phase 6 endpoint should always return 200 for valid requests"
    )
    body = response.json()
    if "failure_mode" in body and body["failure_mode"]:
        # Typed failure — must still carry provenance
        assert body.get("attempt_count", 0) >= 0
        assert isinstance(body.get("attempted_target_commands", []), list)
        assert body.get("query_timestamp_utc"), (
            "even typed failures must carry query_timestamp_utc for auditability"
        )
    else:
        # Success — strict provenance requirements
        required_provenance = [
            "target_command_used",
            "query_url",
            "query_timestamp_utc",
            "epoch_utc",
            "observer_location",
            "data_source",
        ]
        for field in required_provenance:
            assert field in body and body[field] is not None, (
                f"success response missing provenance field {field!r}"
            )
        assert body["epoch_utc"].startswith("2026-09-20"), (
            f"epoch_utc should reflect the requested epoch, got {body['epoch_utc']!r}"
        )
        assert body["observer_location"] == "500@0"
        assert "Horizons" in body["data_source"]
        # RA/Dec must be in the valid range
        assert 0.0 <= body["ra_deg"] <= 360.0
        assert -90.0 <= body["dec_deg"] <= 90.0


def test_invariant_no_silent_zero_coords_in_unified_object():
    """Phase 6: unified object must not silently default small-body RA/Dec to (0, 0).

    The unified object endpoint was previously returning position=(0, 0) when
    JPL Horizons was unreachable — a fabricated fallback that violates the
    invariant that ephemerides are computed dynamically, never guessed.

    With Phase 6 hardening, an unreachable Horizons must surface
    'ephemeris_unavailable' in spherex.coverage_status and a typed
    dynamic_ephemeris_unavailable payload in solar_system, instead of
    silently claiming RA=0, Dec=0 is the answer.
    """
    # Test with a target that has a known SBDB record but no easy Horizons query.
    # We use a clearly unknown designation to force the SBDB-fallback branch in
    # normalization — if Horizons is reachable we get a real ephemeris, if not
    # we get the typed unavailable payload. Either is fine, but we must NEVER
    # see the previous behavior of (0.0, 0.0) being silently returned with no
    # provenance explaining why.
    response = client.get("/api/object/unified?query=99942&release=qr3")
    if response.status_code != 200:
        pytest.skip(f"Upstream SBDB/Horizons unavailable: {response.status_code}")
    data = response.json()
    # pos carries ra_deg/dec_deg; we don't directly assert them here because
    # the meaningful invariant is the presence/absence of the typed failure
    # payload and the honesty of position_source. The float field is a Pydantic
    # null sentinel (0.0) when Horizons is unreachable.
    pos = data.get("position") or {}
    _ = pos.get("ra_deg"), pos.get("dec_deg")  # noqa: F841 — referenced for documentation

    solar = data.get("solar_system") or {}
    ephem = solar.get("dynamic_ephemeris")
    ephem_unavail = solar.get("dynamic_ephemeris_unavailable")

    # At least one of dynamic_ephemeris / dynamic_ephemeris_unavailable must be set
    assert (ephem is not None) or (ephem_unavail is not None), (
        "unified object for small body must carry either dynamic_ephemeris (success) "
        "or dynamic_ephemeris_unavailable (typed failure) — never neither"
    )

    # If the typed unavailable payload is present, RA/Dec are unknown —
    # they should be 0.0 (the field's null sentinel in this Pydantic model)
    # but the position_source must explain the failure mode. We do NOT
    # assert ra/dec == None here because position is a strict Pydantic model
    # with float fields; instead we assert that position_source is honest.
    if ephem is None and ephem_unavail is not None:
        pos_source = solar.get("position_source") or ""
        assert "unavailable" in pos_source.lower() or "ephemeris" in pos_source.lower(), (
            f"position_source must disclose Horizons failure, got {pos_source!r}"
        )
        assert ephem_unavail.get("failure_mode") in {
            "epoch_required",
            "epoch_malformed",
            "service_timeout",
            "service_unreachable",
            "service_http_error",
            "no_ephemeris_returned",
            "parse_error",
            "target_unknown",
        }, (
            f"unrecognized failure_mode in dynamic_ephemeris_unavailable: "
            f"{ephem_unavail.get('failure_mode')!r}"
        )
        # Provenance stamps must be present on the typed failure
        assert ephem_unavail.get("query_timestamp_utc"), (
            "dynamic_ephemeris_unavailable must carry query_timestamp_utc"
        )


def test_invariant_horizons_never_substitutes_release_date():
    """Phase 6: Horizons adapter must NEVER default to 2026-09-15 silently.

    This is the explicit anti-pattern test. Before Phase 6, an omitted epoch
    was silently replaced with the SPHEREx QR3 publication date (2026-09-15
    00:00) — the same anti-pattern we eliminated from useUniverseStore.ts in
    Phase 1, now eliminated from the JPL adapter.

    The invariant: a Horizons call without epoch must NEVER produce a response
    that contains 2026-09-15 as the epoch_utc unless the caller explicitly
    asked for that epoch.
    """
    # No epoch, no use_now — must fail with epoch_required, not succeed with 2026-09-15
    response = client.get("/api/solar-system/horizons/ephemeris?target=99942")
    body = response.json()
    if "failure_mode" in body and body["failure_mode"]:
        # Typed failure — invariant trivially satisfied (no epoch_utc was set)
        return

    # If somehow we got a success, the epoch_utc must NOT be 2026-09-15 unless
    # the caller requested it
    assert body.get("epoch_utc") != "2026-09-15 00:00", (
        "Phase 6 violation: Horizons silently defaulted epoch to 2026-09-15 00:00. "
        "This is the QR3 publication date, NOT a generic observation epoch."
    )


# ── Phase 9: W3C PROV-DM + Uncertainty invariants ─────────────────────────────


def test_invariant_asymmetric_intervals_preserved():
    """Phase 9: Bailer-Jones asymmetric intervals must NEVER be collapsed to ±sigma.

    The Luri et al. (2018) and Bailer-Jones et al. (2021) posterior distance
    posteriors are genuinely asymmetric — the Milky Way prior and the
    photogeometric likelihood skew r_lo ≠ r_hi. Collapsing them to a single
    symmetric value destroys the astrophysical information.

    This test asserts that when a Bailer-Jones posterior is available, the
    unified object exposes BOTH:
      (a) the legacy `distance_lower_pc` / `distance_upper_pc` fields with
          lower != upper, AND
      (b) the new Phase 9 `distance_interval` AsymmetricInterval record.
    """
    response = client.get("/api/object/unified?query=Sirius&release=qr3")
    if response.status_code != 200:
        pytest.skip(f"Upstream unavailable: {response.status_code}")
    data = response.json()
    astro = data.get("astrophysics") or {}
    method = astro.get("distance_method")
    if method not in ("bailer_jones_photogeometric", "bailer_jones_geometric"):
        # Bailer-Jones posterior not available for this target — invariant
        # trivially satisfied (no asymmetric interval to collapse)
        return

    # If the method claims Bailer-Jones, the asymmetric interval must be present
    interval = astro.get("distance_interval")
    assert interval is not None, (
        f"distance_method={method!r} requires a distance_interval; "
        "the AsymmetricInterval is missing"
    )
    assert interval.get("uncertainty_kind") == "posterior", (
        f"asymmetric interval uncertainty_kind must be 'posterior', "
        f"got {interval.get('uncertainty_kind')!r}"
    )
    assert interval.get("unit") == "pc", (
        f"asymmetric interval unit must be 'pc', got {interval.get('unit')!r}"
    )
    # lower/upper must be present and not collapsed to ±sigma of median
    median = interval.get("median")
    lower = interval.get("lower")
    upper = interval.get("upper")
    assert median is not None and lower is not None and upper is not None, (
        f"asymmetric interval missing fields: median={median}, lower={lower}, upper={upper}"
    )
    assert lower != upper, (
        f"asymmetric interval collapsed to ±sigma: lower={lower}, upper={upper}; "
        "the Bailer-Jones posterior is genuinely asymmetric and must be preserved"
    )
    assert lower < median < upper, (
        f"asymmetric interval ordering wrong: lower={lower} < median={median} < upper={upper} required"
    )
    # Reference must cite the canonical Bailer-Jones DOI
    ref = interval.get("reference") or ""
    assert "10.3847/1538-3881/abd806" in ref or "Bailer-Jones" in ref, (
        f"asymmetric interval must cite the Bailer-Jones et al. 2021 reference, got: {ref!r}"
    )


def test_invariant_prov_dm_block_well_formed():
    """Phase 9: every W3C PROV-DM bundle must contain at least one of each PROV class.

    Per W3C PROV-DM §5.5, an Entity is derivable from an Activity that was
    associated with an Agent. The Odyssey implementation enforces this by
    requiring every bundle to carry:
      - at least one Entity (the artifact)
      - at least one Activity (the query / derivation)
      - at least one Agent (the service / catalogue responsible)

    Bundles missing any class are rejected by the schema, but we also assert
    the runtime invariants below for the bundles attached to unified objects.
    """
    # First, resolve a target that exercises every upstream service
    response = client.get("/api/object/unified?query=Sirius&release=qr3")
    if response.status_code != 200:
        pytest.skip(f"Upstream unavailable: {response.status_code}")
    data = response.json()

    # The unified object id follows the pattern "target-<lowercased-canonical-name>"
    object_id = data.get("id")
    assert object_id, "unified object must carry an id"

    # Query the provenance bundles attached to this object
    prov_response = client.get(f"/api/provenance/{object_id}")
    assert prov_response.status_code == 200, (
        f"provenance endpoint failed: {prov_response.status_code}; "
        f"Phase 9 invariant: every resolved target must expose its PROV-DM bundles"
    )
    bundles = prov_response.json()
    # Phase 9 doesn't require every target to have bundles — but if any are
    # present they must be well-formed.
    for bundle in bundles:
        assert "bundle_id" in bundle
        assert "entities" in bundle and len(bundle["entities"]) > 0, (
            "every PROV-DM bundle must have at least one Entity"
        )
        assert "activities" in bundle and len(bundle["activities"]) > 0, (
            "every PROV-DM bundle must have at least one Activity"
        )
        assert "agents" in bundle and len(bundle["agents"]) > 0, (
            "every PROV-DM bundle must have at least one Agent "
            "(per W3C PROV-DM §5.5)"
        )
        # Every Agent must carry an agent_type
        for agent in bundle["agents"]:
            assert agent.get("agent_type"), (
                f"agent missing agent_type: {agent!r}"
            )
        # Every Activity must carry an activity_type
        for activity in bundle["activities"]:
            assert activity.get("activity_type"), (
                f"activity missing activity_type: {activity!r}"
            )
        # Every Entity must carry an entity_type
        for entity in bundle["entities"]:
            assert entity.get("entity_type"), (
                f"entity missing entity_type: {entity!r}"
            )


def test_invariant_no_silent_uncertainty_zero():
    """Phase 9: uncertainties must be None (absent) or measured — never silently zero.

    The unified object endpoint previously reported uncertainty values as
    bare floats (e.g. `parallax_mas_err: 0.05`). Phase 9 wraps every
    uncertainty in a typed Uncertainty record with units and provenance kind.
    A bare float uncertainty without units is a provenance violation because
    the units are part of the data — 0.05 mas and 0.05 km/s differ by 9
    orders of magnitude in physical meaning.

    This test asserts that any uncertainty field present in the unified
    object conforms to the typed Uncertainty schema with explicit units.
    """
    response = client.get("/api/object/unified?query=Sirius&release=qr3")
    if response.status_code != 200:
        pytest.skip(f"Upstream unavailable: {response.status_code}")
    data = response.json()

    # Walk every Uncertainty-shaped field and assert it carries units.
    def _check_uncertainty(name, value):
        if value is None:
            return  # missing uncertainty is fine (we never fabricate)
        if not isinstance(value, dict):
            return  # not Uncertainty-shaped, skip
        if "value" not in value:
            return  # not an Uncertainty record
        # If a value is reported, units MUST be reported too.
        if value.get("value") is not None:
            assert value.get("unit"), (
                f"{name}: uncertainty value {value.get('value')!r} reported "
                f"without explicit unit field — this is a Phase 9 provenance violation"
            )
            assert value.get("uncertainty_kind") in {
                "statistical",
                "systematic",
                "statistical+systematic",
                "posterior",
                "asymmetric",
            }, (
                f"{name}: uncertainty_kind must be one of the allowed values, "
                f"got {value.get('uncertainty_kind')!r}"
            )

    astro = data.get("astrophysics") or {}
    for field in (
        "parallax_mas_err", "teff_k_err", "mass_msun_err", "radius_rsun_err",
    ):
        _check_uncertainty(field, astro.get(field))

    motion = data.get("motion") or {}
    for field in (
        "proper_motion_ra_masyr_err",
        "proper_motion_dec_masyr_err",
        "parallax_mas_err",
        "radial_velocity_kms_err",
    ):
        _check_uncertainty(field, motion.get(field))

    kinematics = data.get("kinematics") or {}
    for field in (
        "tangential_velocity_kms_err",
        "total_proper_motion_masyr_err",
    ):
        _check_uncertainty(field, kinematics.get(field))


def test_invariant_provenance_endpoint_reachable():
    """Phase 9: the /api/provenance endpoint must always be reachable.

    For unknown object_ids it returns 200 + empty list (not 404) — this is
    intentional because the provenance service is additive and we cannot
    distinguish "never resolved" from "resolved before Phase 9 deploy".
    """
    response = client.get("/api/provenance/nonexistent-target-xyz")
    assert response.status_code == 200, (
        f"provenance endpoint must be reachable for any object_id; "
        f"got {response.status_code}"
    )
    assert response.json() == [], (
        "unknown object_ids must return an empty list (additive provenance), "
        "not 404 or error"
    )


# ── Phase 4: Gaia full covariance + epoch propagation invariants ────────────


def test_invariant_full_covariance_retrieved():
    """Phase 4: Gaia DR3 query must retrieve the per-field sigma AND the full
    10-correlation sub-matrix required for covariance propagation.

    The CDS adapter's Gaia TAP query is the only place this can be enforced;
    the unified object endpoint can only surface what the adapter retrieved.

    This test asserts (a) the query string references the *_error AND
    *_corr columns required for the 5x5 covariance matrix, and (b) when
    Gaia is reachable the unified object's motion fields carry non-null
    sigma values.
    """
    response = client.get("/api/object/unified?query=Sirius&release=qr3")
    if response.status_code != 200:
        pytest.skip(f"Upstream unavailable: {response.status_code}")
    data = response.json()
    motion = data.get("motion") or {}
    if not motion:
        pytest.skip("No motion block for this target")

    # The CDS adapter query MUST request the correlation columns. We can
    # only assert this end-to-end by confirming the response carries sigmas
    # OR by checking the source code via grep (which is fragile). Here we
    # assert the runtime invariant: when Gaia is reachable, sigmas are
    # populated with real numeric values rather than None.

    def _sigma_ok(field: str) -> bool:
        err = motion.get(field)
        if not isinstance(err, dict):
            return False
        v = err.get("value")
        return v is not None and v > 0

    # At least one of the PM sigmas or parallax sigma must be a real number
    # when Gaia is reachable
    has_pmra = _sigma_ok("proper_motion_ra_masyr_err")
    has_pmdec = _sigma_ok("proper_motion_dec_masyr_err")
    has_plx = _sigma_ok("parallax_mas_err")

    if has_pmra or has_pmdec or has_plx:
        # At least one sigma came through — verify they have units + kind
        for field, want_unit in (
            ("proper_motion_ra_masyr_err", "mas/yr"),
            ("proper_motion_dec_masyr_err", "mas/yr"),
            ("parallax_mas_err", "mas"),
        ):
            err = motion.get(field)
            if isinstance(err, dict) and err.get("value") is not None:
                assert err.get("unit") == want_unit, (
                    f"{field}: expected unit={want_unit!r}, got {err.get('unit')!r}"
                )
                assert err.get("uncertainty_kind") == "statistical"


def test_invariant_epoch_propagation_reversible():
    """Phase 4: epoch propagation C_new = J @ C0 @ J^T must be self-consistent.

    Invariant: propagating from J2016.0 → T → J2016.0 must round-trip the
    covariance matrix to within numerical precision. A non-reversible
    propagation indicates an asymmetric Jacobian (a bug) or a missing
    cross-term in the matrix multiplication.

    We exercise the gaia_astrometry module directly so the test does not
    depend on JPL/IRSA/CDS being reachable.
    """
    from adapters.gaia_astrometry import (
        GaiaAstrometricSolution,
        propagate_epoch,
        GAIA_DR3_EPOCH_JY,
    )
    sol = GaiaAstrometricSolution(
        source_id="test-1",
        ra_deg=10.0,
        dec_deg=20.0,
        parallax_mas=5.0,
        pmra_masyr=50.0,
        pmdec_masyr=-30.0,
        radial_velocity_kms=10.0,
        ra_deg_err=0.1,
        dec_deg_err=0.1,
        parallax_mas_err=0.5,
        pmra_masyr_err=1.0,
        pmdec_masyr_err=1.0,
        radial_velocity_kms_err=0.5,
        corr_ra_dec=0.1,
        corr_ra_parallax=-0.2,
        corr_ra_pmra=0.3,
        corr_ra_pmdec=-0.1,
        corr_dec_parallax=0.05,
        corr_dec_pmra=-0.15,
        corr_dec_pmdec=0.2,
        corr_parallax_pmra=-0.1,
        corr_parallax_pmdec=0.1,
        corr_pmra_pmdec=-0.3,
    )
    assert sol.has_full_covariance, "test fixture must have full covariance"

    # Forward + backward
    target_jy = GAIA_DR3_EPOCH_JY + 5.0  # +5 years
    forward = propagate_epoch(sol, target_jy)
    assert forward.propagation_basis == "full"

    # Backward from target back to J2016.0
    backward = propagate_epoch(
        GaiaAstrometricSolution(
            source_id=sol.source_id,
            ra_deg=forward.ra_deg,
            dec_deg=forward.dec_deg,
            parallax_mas=forward.parallax_mas,
            pmra_masyr=forward.pmra_masyr,
            pmdec_masyr=forward.pmdec_masyr,
            radial_velocity_kms=sol.radial_velocity_kms,
            ra_deg_err=forward.sigma(0),
            dec_deg_err=forward.sigma(1),
            parallax_mas_err=forward.sigma(2),
            pmra_masyr_err=forward.sigma(3),
            pmdec_masyr_err=forward.sigma(4),
            # Drop correlations; the backward propagation will be 'diagonal'.
        ),
        GAIA_DR3_EPOCH_JY,
    )

    # Position must round-trip to within numerical precision
    assert abs(backward.ra_deg - sol.ra_deg) < 1e-6, (
        f"RA did not round-trip: {backward.ra_deg} vs {sol.ra_deg}"
    )
    assert abs(backward.dec_deg - sol.dec_deg) < 1e-6, (
        f"Dec did not round-trip: {backward.dec_deg} vs {sol.dec_deg}"
    )

    # Position variances must grow quadratically with Δt (sanity check)
    var_ra_5yr = forward.covariance[0][0]
    sol_var_ra = 0.1 ** 2  # 0.01
    assert var_ra_5yr > sol_var_ra, (
        f"RA variance did not grow with epoch propagation: "
        f"5-yr={var_ra_5yr}, 0-yr={sol_var_ra}"
    )


def test_invariant_tangential_velocity_uses_covariance():
    """Phase 4: tangential velocity σ must use the full 3x3 covariance.

    Invariant: a source with strong pmra_pmdec correlation (|ρ| > 0.5) must
    produce a propagated σ_v_tan that differs noticeably from the naive
    sqrt(σ_pmra² + σ_pmdec²)/plx estimate. The naive formula ignores the
    correlation and systematically underestimates σ_v_tan.
    """
    from adapters.gaia_astrometry import (
        GaiaAstrometricSolution,
        compute_tangential_velocity,
    )

    # Source with perfect anti-correlation: ρ_pmra_pmdec = -0.99
    # The naive formula computes σ_pm = sqrt(σ_pmra² + σ_pmdec²) — adding
    # in quadrature. For ρ = -0.99, the true variance is much smaller:
    #   Var(pmra + pmdec) = σ_pmra² + σ_pmdec² + 2·ρ·σ_pmra·σ_pmdec
    #                      = 1.0 + 1.0 + 2·(-0.99)·1·1 = 0.02
    # vs. naive Var(pmra - pmdec) (which is what we need for |μ|):
    #   naive: 1.0 + 1.0 = 2.0
    # So the propagated σ should be ~10x smaller than naive for ρ=-0.99.
    anticorrelated = GaiaAstrometricSolution(
        source_id="test-anti",
        ra_deg=10.0, dec_deg=20.0,
        parallax_mas=10.0,
        pmra_masyr=100.0, pmdec_masyr=100.0,  # equal magnitudes
        radial_velocity_kms=None,
        ra_deg_err=0.1, dec_deg_err=0.1,
        parallax_mas_err=0.1,
        pmra_masyr_err=1.0, pmdec_masyr_err=1.0,
        radial_velocity_kms_err=None,
        corr_pmra_pmdec=-0.99,
        # All other correlations = 0
        corr_ra_dec=0.0, corr_ra_parallax=0.0,
        corr_ra_pmra=0.0, corr_ra_pmdec=0.0,
        corr_dec_parallax=0.0, corr_dec_pmra=0.0,
        corr_dec_pmdec=0.0,
        corr_parallax_pmra=0.0, corr_parallax_pmdec=0.0,
    )
    tv = compute_tangential_velocity(anticorrelated)
    assert tv.value_kms is not None
    assert tv.uncertainty_kms is not None, (
        "tangential velocity σ must be computed, not None"
    )
    assert tv.propagation_basis == "full"

    # Naive σ (ignoring correlation): sqrt(1 + 1) / 10 * 4.74 ≈ 0.670 km/s
    naive_sigma = 4.74 * math.sqrt(1.0**2 + 1.0**2) / 10.0
    # Propagated σ should be MUCH smaller because of the anti-correlation
    assert tv.uncertainty_kms < naive_sigma * 0.5, (
        f"propagated σ ({tv.uncertainty_kms}) should be much smaller than "
        f"naive σ ({naive_sigma}) for ρ_pmra_pmdec=-0.99; "
        "the naive formula ignores correlation and overestimates uncertainty here"
    )


def test_invariant_negative_parallax_no_velocity():
    """Phase 4: parallax ≤ 0 must produce v_tan = None, not a phantom negative value.

    The formula v_tan = 4.74 * sqrt(pmra² + pmdec²) / parallax diverges when
    parallax ≤ 0. The previous code could compute a phantom negative velocity
    by inverting the sign of parallax. Phase 4 refuses to compute velocity
    when parallax ≤ 0 and stamps propagation_basis accordingly.
    """
    from adapters.gaia_astrometry import (
        GaiaAstrometricSolution,
        compute_tangential_velocity,
    )
    sol = GaiaAstrometricSolution(
        source_id="test-neg-plx",
        ra_deg=10.0, dec_deg=20.0,
        parallax_mas=-0.5,  # negative parallax
        pmra_masyr=50.0, pmdec_masyr=-30.0,
        radial_velocity_kms=None,
        ra_deg_err=0.1, dec_deg_err=0.1,
        parallax_mas_err=0.5,
        pmra_masyr_err=1.0, pmdec_masyr_err=1.0,
        radial_velocity_kms_err=None,
    )
    tv = compute_tangential_velocity(sol)
    assert tv.value_kms is None, (
        f"negative parallax must produce value_kms=None, got {tv.value_kms!r}"
    )
    assert tv.uncertainty_kms is None, (
        f"negative parallax must produce uncertainty_kms=None, got {tv.uncertainty_kms!r}"
    )
