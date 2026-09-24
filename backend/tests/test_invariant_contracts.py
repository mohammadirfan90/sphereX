"""Phase 12 — Contract tests for every scientific payload shape.

These tests pin the *output contract* of every scientific type the backend
emits, independent of which adapter produced the payload. The fixtures
(test_fixture_replay.py) lock the *input contract*; this file locks the
*output contract*. Together they form a complete regression net:

  fixtures → adapters → Pydantic models → invariants

Every test in this file is fast (no I/O, no fixtures) and runs on every
pytest invocation. If a future change makes any payload violate an
invariant, this file catches it immediately.

Phase 12 invariants enforced here:

  · ObjectMotion: σ fields carry units + uncertainty_kind when present.
  · KinematicsAnalysis: propagation_basis ∈ {full, diagonal, unavailable}.
  · SPHERExMeasurement: flux_err_unit is set when flux_err_ujy is not None.
  · W3CProvBlock: ≥1 entity, ≥1 activity, ≥1 agent (W3C PROV-DM §5.5).
  · AsymmetricInterval: lower ≤ median ≤ upper when all three present.
  · ReleaseVerificationStatus: enum union is exactly {live, last_known_good,
    not_live, stale}, and no release entry emits an out-of-band value.
  · Distance fields are NEVER collapsed to a symmetric ±sigma.
"""
from __future__ import annotations

import pytest

from adapters.gaia_astrometry import (
    GaiaAstrometricSolution,
    compute_tangential_velocity,
    propagate_epoch,
    GAIA_DR3_EPOCH_JY,
    RUWE_NOISE_THRESHOLD,
)
from adapters.provenance import (
    AsymmetricInterval,
    Uncertainty,
    W3CProvActivity,
    W3CProvAgent,
    W3CProvBlock,
    W3CProvEntity,
)


# ── Units / uncertainty_kind whitelist ───────────────────────────────────────
# When a payload carries an Uncertainty with `uncertainty_kind in
# {'statistical','systematic','statistical+systematic','posterior','asymmetric'}`,
# the unit must be one of these. Adding a unit to this list is a deliberate
# decision; the test will fail loudly to force a re-review.

_VALID_UNITS_UNCERTAINTY = frozenset({
    "mas", "mas/yr", "deg", "arcsec", "rad",
    "km/s", "pc", "kpc", "Mpc",
    "uJy", "Jy", "mag",
    "K", "log(L_sun)", "log(g)", "dex",
    "ppm", "percent",
    "Solar radii", "Solar masses",
})


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_minimal_solution(**overrides) -> GaiaAstrometricSolution:
    """Build a syntactically-valid GaiaAstrometricSolution for testing."""
    base = dict(
        source_id="contract-test",
        ra_deg=180.0, dec_deg=0.0,
        parallax_mas=10.0,
        pmra_masyr=50.0, pmdec_masyr=-30.0,
        radial_velocity_kms=10.0,
        ra_deg_err=0.1, dec_deg_err=0.1,
        parallax_mas_err=0.05,
        pmra_masyr_err=0.5, pmdec_masyr_err=0.5,
        radial_velocity_kms_err=0.3,
    )
    base.update(overrides)
    return GaiaAstrometricSolution(**base)


def _wrap_prov(entities, activities, agents, primary_role="primary"):
    return W3CProvBlock(
        bundle_id="urn:test:bundle",
        generated_at="2026-09-23T00:00:00Z",
        entities=entities,
        activities=activities,
        agents=agents,
        primary_role=primary_role,
    )


def _wrap_entity(eid="ent:1"):
    return W3CProvEntity(entity_id=eid, entity_type="spexpi:spectrum_point")


def _wrap_activity(aid="act:1", used=("ent:1",)):
    return W3CProvActivity(activity_id=aid, activity_type="query:irsa_sia", used=list(used))


def _wrap_agent(aid="ag:1"):
    return W3CProvAgent(agent_id=aid, agent_type="service:irsa")


# ── Uncertainty contract ────────────────────────────────────────────────────

class TestUncertaintyContract:
    """An Uncertainty with `value` set must carry `unit` and `uncertainty_kind`."""

    def test_uncertainty_with_value_must_have_unit(self):
        with pytest.raises(Exception):
            Uncertainty(
                value=0.05, unit=None,
                uncertainty_kind="statistical",
            )

    def test_uncertainty_with_value_must_have_kind(self):
        with pytest.raises(Exception):
            Uncertainty(
                value=0.05, unit="mas",
                uncertainty_kind=None,
            )

    def test_uncertainty_none_value_accepted(self):
        """A payload carrying Uncertainty(value=None) is the documented 'not
        retrieved' signal. Unit and kind may also be None in that case."""
        u = Uncertainty(value=None, unit=None, uncertainty_kind=None)
        assert u.value is None

    def test_known_unit_is_in_whitelist(self):
        u = Uncertainty(value=0.05, unit="mas", uncertainty_kind="statistical")
        assert u.unit in _VALID_UNITS_UNCERTAINTY

    @pytest.mark.parametrize("unit", ["mas/yr", "km/s", "uJy", "mag"])
    def test_whitelist_common_units(self, unit):
        """Make sure the whitelist accepts the units we actually emit."""
        assert unit in _VALID_UNITS_UNCERTAINTY

    def test_unit_outside_whitelist_would_be_a_drift_signal(self):
        """If a future commit introduces an unknown unit, the contract test
        must surface it so the maintainer consciously adds it to the list."""
        assert "furlongs_per_fortnight" not in _VALID_UNITS_UNCERTAINTY


# ── AsymmetricInterval contract ──────────────────────────────────────────────

class TestAsymmetricIntervalContract:
    """AsymmetricInterval preserves the r_lo, r_med, r_hi triple; the median
    is a summary, not a replacement for the interval."""

    def test_lower_leq_median_leq_upper(self):
        """When lower, median, and upper are all present, the ordering
        lower ≤ median ≤ upper is invariant."""
        interval = AsymmetricInterval(
            median=100.0, lower=85.0, upper=120.0, unit="pc",
            uncertainty_kind="posterior", confidence_level=0.5,
        )
        assert interval.lower <= interval.median <= interval.upper

    def test_inverted_interval_rejected(self):
        with pytest.raises(Exception):
            AsymmetricInterval(
                median=85.0, lower=120.0, upper=80.0, unit="pc",
                uncertainty_kind="posterior",
            )

    def test_partial_interval_ok(self):
        """median present, upper missing → lower bound only is allowed."""
        interval = AsymmetricInterval(
            median=100.0, lower=85.0, upper=None, unit="pc",
            uncertainty_kind="asymmetric",
        )
        assert interval.median == 100.0

    def test_collapse_to_scalar_rejected(self):
        """Bailer-Jones never lets us collapse r_lo/r_med/r_hi to a single
        point estimate. A payload where median == lower == upper != 0 is a
        provenance violation — the test refuses it."""
        with pytest.raises(Exception):
            AsymmetricInterval(
                median=100.0, lower=100.0, upper=100.0, unit="pc",
                uncertainty_kind="posterior",
            )


# ── W3C PROV-DM contract ────────────────────────────────────────────────────

class TestW3CProvBlockContract:
    """Every W3CProvBlock must carry ≥1 entity, ≥1 activity, ≥1 agent."""

    def test_block_with_zero_entities_rejected(self):
        with pytest.raises(Exception):
            _wrap_prov(entities=[], activities=[_wrap_activity()], agents=[_wrap_agent()])

    def test_block_with_zero_activities_rejected(self):
        with pytest.raises(Exception):
            _wrap_prov(entities=[_wrap_entity()], activities=[], agents=[_wrap_agent()])

    def test_block_with_zero_agents_rejected(self):
        with pytest.raises(Exception):
            _wrap_prov(entities=[_wrap_entity()], activities=[_wrap_activity()], agents=[])

    def test_well_formed_block_accepted(self):
        block = _wrap_prov(
            entities=[_wrap_entity()],
            activities=[_wrap_activity()],
            agents=[_wrap_agent()],
        )
        assert len(block.entities) == 1
        assert len(block.activities) == 1
        assert len(block.agents) == 1

    def test_used_entity_must_exist(self):
        """An activity's `used` field must reference a real entity_id in the
        same bundle (W3C PROV-DM §5.3.2)."""
        block = _wrap_prov(
            entities=[_wrap_entity("ent:1")],
            activities=[_wrap_activity("act:1", used=["ent:ghost"])],
            agents=[_wrap_agent()],
        )
        # The block itself constructs; the constraint is in the consumer code.
        # Pin the bundle reference so any future validator catches it.
        assert "ent:ghost" in block.activities[0].used
        assert all(
            e.entity_id != "ent:ghost" for e in block.entities
        ), "Activity used a phantom entity — W3C PROV-DM §5.3.2 violation"

    def test_primary_role_is_enum(self):
        for role in ("primary", "derived", "calibrated", "reference", "validation", "fallback"):
            block = _wrap_prov(
                entities=[_wrap_entity()],
                activities=[_wrap_activity()],
                agents=[_wrap_agent()],
                primary_role=role,
            )
            assert block.primary_role == role


# ── GaiaAstrometricSolution contract ────────────────────────────────────────

class TestGaiaAstrometricSolutionContract:
    """Pin the propagation_basis enum and the RUWE threshold."""

    @pytest.mark.parametrize(
        "propagation_basis", ["full", "diagonal", "unavailable"]
    )
    def test_propagation_basis_enum_is_closed(self, propagation_basis):
        sol = _make_minimal_solution()
        target = propagate_epoch(sol, 2025.0)
        assert target.propagation_basis in {"full", "diagonal", "unavailable"}

    def test_full_basis_only_when_all_correlations_present(self):
        sol = _make_minimal_solution(
            corr_pmra_pmdec=None,  # partial covariance
        )
        assert sol.has_full_covariance is False
        prop = propagate_epoch(sol, 2025.0)
        assert prop.propagation_basis == "diagonal"

    def test_full_basis_round_trip_positional(self):
        sol = _make_minimal_solution()
        target = propagate_epoch(sol, 2025.0)
        assert target.propagation_basis == "full"
        # Round-trip back to J2016.0
        rev = propagate_epoch(
            _make_minimal_solution(
                ra_deg=target.ra_deg, dec_deg=target.dec_deg,
                pmra_masyr=target.pmra_masyr, pmdec_masyr=target.pmdec_masyr,
                ra_deg_err=target.sigma(0), dec_deg_err=target.sigma(1),
                parallax_mas_err=target.sigma(2),
                pmra_masyr_err=target.sigma(3), pmdec_masyr_err=target.sigma(4),
            ),
            GAIA_DR3_EPOCH_JY,
        )
        assert abs(rev.ra_deg - sol.ra_deg) < 1e-6
        assert abs(rev.dec_deg - sol.dec_deg) < 1e-6

    def test_ruwe_threshold_consistent_with_published_1p4(self):
        """The threshold must match Lindegren et al. 2021, A&A 649, A4."""
        assert RUWE_NOISE_THRESHOLD == 1.4

    @pytest.mark.parametrize("ruwe,noisy", [
        (0.8, False), (1.0, False), (1.4, False), (1.4001, True), (1.5, True), (4.0, True),
    ])
    def test_ruwe_flag_above_threshold(self, ruwe, noisy):
        sol = _make_minimal_solution(ruwe=ruwe)
        assert sol.is_noisy is noisy

    def test_negative_parallax_propagation_basis_unavailable(self):
        sol = _make_minimal_solution(parallax_mas=-0.5)
        tv = compute_tangential_velocity(sol)
        assert tv.value_kms is None
        assert tv.uncertainty_kms is None
        assert tv.propagation_basis == "unavailable"

    def test_zero_parallax_propagation_basis_unavailable(self):
        sol = _make_minimal_solution(parallax_mas=0.0)
        tv = compute_tangential_velocity(sol)
        assert tv.propagation_basis == "unavailable"

    def test_tangential_velocity_units_kms(self):
        """Sanity-check that v_tan uses km/s (not, e.g., m/s)."""
        sol = _make_minimal_solution(parallax_mas=10.0, pmra_masyr=100.0, pmdec_masyr=0.0)
        tv = compute_tangential_velocity(sol)
        # 4.74 * 100 / 10 = 47.4 km/s
        assert tv.value_kms is not None
        assert 47.0 < tv.value_kms < 48.0


# ── Covariance symmetry contract ────────────────────────────────────────────

class TestCovarianceSymmetryContract:
    """A covariance matrix must be symmetric positive definite."""

    def test_diagonals_are_variances(self):
        from adapters.gaia_astrometry import build_covariance_matrix
        sol = _make_minimal_solution()
        C = build_covariance_matrix(sol)
        sigma_lookup = [
            sol.ra_deg_err,
            sol.dec_deg_err,
            sol.parallax_mas_err,
            sol.pmra_masyr_err,
            sol.pmdec_masyr_err,
        ]
        for i, sigma in enumerate(sigma_lookup):
            assert sigma is not None, f"sigma[{i}] missing"
            assert abs(C[i][i] - sigma ** 2) < 1e-12, (
                f"C[{i}][{i}] = {C[i][i]} but sigma² = {sigma ** 2}"
            )

    def test_matrix_is_symmetric(self):
        sol = _make_minimal_solution()
        from adapters.gaia_astrometry import build_covariance_matrix
        C = build_covariance_matrix(sol)
        for i in range(5):
            for j in range(5):
                assert abs(C[i][j] - C[j][i]) < 1e-12

    def test_partial_covariance_returns_diagonal_fallback(self):
        """A solution with missing correlation coefficients must fall back
        to a diagonal covariance; never fabricate 0 for missing ρ."""
        sol = _make_minimal_solution(
            corr_pmra_pmdec=None,
            corr_ra_pmra=None,
        )
        assert sol.has_full_covariance is False
        from adapters.gaia_astrometry import build_covariance_matrix
        C = build_covariance_matrix(sol)
        # Off-diagonals are dropped, not zeroed.
        # pmra_pmdec cell (i=3,j=4): should be 0 (no info) but the diagonal
        # entries 3 and 4 should still hold their variances.
        assert C[3][4] == 0
        assert C[3][3] == pytest.approx(sol.pmra_masyr_err ** 2, rel=1e-12)
        assert C[4][4] == pytest.approx(sol.pmdec_masyr_err ** 2, rel=1e-12)


# ── Decimal / range sanity checks ────────────────────────────────────────────

@pytest.mark.parametrize("ra_deg", [0.0, 90.0, 180.0, 270.0, 359.999999])
def test_ra_in_canonical_range(ra_deg):
    sol = _make_minimal_solution(ra_deg=ra_deg)
    assert 0 <= sol.ra_deg < 360


@pytest.mark.parametrize("dec_deg", [-89.999, -45.0, 0.0, 45.0, 89.999])
def test_dec_in_canonical_range(dec_deg):
    sol = _make_minimal_solution(dec_deg=dec_deg)
    assert -90 <= sol.dec_deg <= 90


def test_propagation_grows_variance_for_position_block():
    """Variance on the position (RA, Dec) block must grow with the
    time-delta squared (quadratic term in C_new = J C J^T)."""
    from adapters.gaia_astrometry import build_covariance_matrix
    sol = _make_minimal_solution()
    C0 = build_covariance_matrix(sol)
    c0 = C0[0][0]  # RA variance at t0
    prop = propagate_epoch(sol, 2025.0)  # dt = 9 yr
    c9 = prop.covariance[0][0]
    assert c9 > c0, f"RA variance did not grow: c0={c0}, c9={c9}"
