export type OperationalMode = 'explorer' | 'pro';

export type ActiveTool = 'layers' | 'blink' | 'measure' | 'extract' | 'agentation' | null;

export type SPHERExRelease = 'qr3' | 'qr2';

export interface SPHERExMeasurement {
  wavelength_um: number;
  lambda_width_um?: number;
  flux_ujy?: number | null;
  flux_err_ujy?: number | null;
  /**
   * Phase 9: the flux uncertainty must be carried with units and provenance.
   * `flux_err_ujy` is the canonical value; `flux_err_unit` defaults to 'uJy'
   * for backwards compatibility but should be set explicitly by the backend.
   */
  flux_err_unit?: string;
  snr?: number | null;
  flags?: number;
  fit_quality?: number | null;
  mjd?: number | null;
  detector?: number;
  lvf_id?: string | number | null;
  det_id?: string | number | null;
  photometry_method?: string;
  data_collection?: string;
}

export interface SPHERExSpectrophotometryData {
  status?: string; // 'available' | 'no_coverage' | 'unavailable' | 'job_pending'
  release: string;
  doi: string;
  collection: string;
  target_ra: number;
  target_dec: number;
  num_measurements?: number;
  measurements?: SPHERExMeasurement[];
  diagnostics?: Record<string, unknown> | null;
  provenance?: Record<string, unknown> | null;
  /**
   * Phase 9: W3C PROV-DM lineage for the spectral extraction. Optional because
   * for zero-coverage targets there is nothing to attribute, but every
   * `status === 'available'` payload MUST carry provenance.
   */
  w3c_provenance?: W3CProvBlock | null;
  detail?: string | null;
}

/**
 * W3C PROV-DM Entity (https://www.w3.org/TR/prov-dm/#Entity).
 * The 'artifact' produced by an Activity. The backend serializes PROV bundles
 * as JSON-LD-compatible dicts so they round-trip cleanly.
 */
export interface W3CProvEntity {
  entity_id: string;
  entity_type: string; // e.g. "spexpi:spectrum_point", "gaia:astrometric_record"
  label?: string | null;
  attributes?: Record<string, unknown>;
  was_revision_of?: string | null;
}

/**
 * W3C PROV-DM Activity (https://www.w3.org/TR/prov-dm/#Activity).
 */
export interface W3CProvActivity {
  activity_id: string;
  activity_type: string; // e.g. "query:irsa_sia", "query:jpl_horizons"
  started_at?: string | null;
  ended_at?: string | null;
  used: string[];          // entity_ids consumed
  attributes?: Record<string, unknown>;
}

/**
 * W3C PROV-DM Agent (https://www.w3.org/TR/prov-dm/#Agent).
 */
export interface W3CProvAgent {
  agent_id: string;
  agent_type: string; // e.g. "service:irsa", "service:jpl_horizons", "catalog:gaia_dr3"
  label?: string | null;
  attributes?: Record<string, unknown>;
}

/**
 * Complete W3C PROV-DM provenance bundle (prov:Bundle in PROV-JSON).
 * Phase 9 invariant: every measurement flowing through the system must carry
 * (a) at least one Agent (the service that produced it), (b) at least one
 * Activity (the query or derivation), and (c) at least one Entity (the
 * artifact). All three are required by W3C PROV-DM §5.5.
 */
export interface W3CProvBlock {
  bundle_id: string;
  generated_at: string;
  entities: W3CProvEntity[];
  activities: W3CProvActivity[];
  agents: W3CProvAgent[];
  primary_role: 'primary' | 'derived' | 'calibrated' | 'reference' | 'validation' | 'fallback';
}

/**
 * Typed uncertainty value with units and provenance kind (Phase 9).
 * A bare `error: 0.05` without a unit field is a provenance violation.
 */
export interface Uncertainty {
  value: number | null;
  unit: string | null;
  uncertainty_kind: 'statistical' | 'systematic' | 'statistical+systematic' | 'posterior' | 'asymmetric';
  confidence_level?: number | null;   // 0.68 for 1-sigma, 0.95 for 2-sigma, etc.
  reference?: string | null;          // bibcode, DOI, or upstream catalogue ID
  provenance?: W3CProvBlock | null;
}

/**
 * Asymmetric credible interval (Phase 9). Used for Bailer-Jones distance
 * posteriors and any other non-Gaussian uncertainty. The median is a
 * summary statistic and is NOT a substitute for the interval — both
 * `lower` and `upper` must be present and distinct.
 */
export interface AsymmetricInterval {
  median: number | null;
  lower: number | null;
  upper: number | null;
  unit: string | null;
  uncertainty_kind: 'posterior' | 'asymmetric';
  confidence_level?: number | null;   // 0.5 for the median-centered 50% interval
  reference?: string | null;
  provenance?: W3CProvBlock | null;
}

export interface JPLSmallBodyData {
  designation: string;
  fullname: string;
  orbit_class: string;
  semi_major_axis_au?: number | null;
  eccentricity?: number | null;
  inclination_deg?: number | null;
  orbital_period_yr?: number | null;
  perihelion_dist_au?: number | null;
  aphelion_dist_au?: number | null;
  estimated_diameter_km?: number | null;
  absolute_magnitude_h?: number | null;
  albedo?: number | null;
  rotational_period_hr?: number | null;
  spectral_type?: string | null;
  is_neo: boolean;
  is_pha: boolean;
  data_source: string;
}

export interface JPLCloseApproachData {
  designation: string;
  encounter_date_utc: string;
  nominal_distance_au: number;
  nominal_distance_km: number;
  min_distance_au?: number | null;
  max_distance_au?: number | null;
  relative_velocity_kms?: number | null;
  v_infinity_kms?: number | null;
  target_body: string;
}

export interface JPLHorizonsEphemerisData {
  target: string;
  epoch_utc: string;
  ra_deg: number;
  dec_deg: number;
  ra_hms: string;
  dec_dms: string;
  dist_au?: number | null;
  dist_delta_dot_kms?: number | null;
  v_mag?: number | null;
  observer_location: string;
  data_source: string;
}

export interface ObjectIdentity {
  query: string;
  canonical_name: string;
  simbad_id?: string | null;
  gaia_dr3_id?: string | null;
  object_type: string;
}

export interface ObjectPosition {
  ra_deg: number;
  dec_deg: number;
}

export interface ObjectMotion {
  source: string;
  proper_motion_ra_masyr?: number | null;
  proper_motion_dec_masyr?: number | null;
  parallax_mas?: number | null;
  radial_velocity_kms?: number | null;
  /**
   * Phase 9: per-field typed uncertainties with units. Optional for
   * backwards compatibility, but the unified object endpoint will populate
   * them whenever Gaia DR3 or SIMBAD provides a sigma.
   */
  proper_motion_ra_masyr_err?: Uncertainty | null;
  proper_motion_dec_masyr_err?: Uncertainty | null;
  parallax_mas_err?: Uncertainty | null;
  radial_velocity_kms_err?: Uncertainty | null;
  w3c_provenance?: W3CProvBlock | null;
}

export interface ContextCutouts {
  wise_cutout_url: string;
  twomass_cutout_url: string;
  dss2_cutout_url: string;
}

export interface ObjectLiterature {
  bibcode: string;
  title: string;
  ads_url: string;
  year?: number | string | null;
}

export interface ObjectProvenance {
  dataset: string;
  doi?: string | null;
  service: string;
  /** Phase 9: optional W3C PROV-DM bundle for this provenance record */
  w3c_provenance?: W3CProvBlock | null;
}

export interface AstrophysicalProperties {
  spectral_class?: string | null;
  teff_k?: number | null;
  distance_pc?: number | null;
  distance_ly?: number | null;
  /**
   * Phase 9: asymmetric credible interval for distance, populated from
   * Bailer-Jones et al. 2021 photogeometric or geometric posterior.
   * NEVER collapse to a symmetric ±sigma — preserve lower/upper verbatim.
   */
  distance_interval?: AsymmetricInterval | null;
  distance_lower_pc?: number | null;
  distance_upper_pc?: number | null;
  distance_method?: string | null;
  distance_status?: string | null;
  luminosity_log_lsun?: number | null;
  surface_gravity_log_g?: number | null;
  metallicity_fe_h?: number | null;
  mass_msun?: number | null;
  radius_rsun?: number | null;
  apparent_mag_v?: number | null;
  parallax_mas?: number | null;
  parallax_mas_err?: Uncertainty | null;
  teff_k_err?: Uncertainty | null;
  mass_msun_err?: Uncertainty | null;
  radius_rsun_err?: Uncertainty | null;
  photometry?: {
    gaia_g?: number;
    gaia_bp?: number;
    gaia_rp?: number;
    twomass_j?: number;
    twomass_h?: number;
    twomass_ks?: number;
    wise_w1?: number;
    wise_w2?: number;
  };
  w3c_provenance?: W3CProvBlock | null;
}

export interface IceChemistryAnalysis {
  h2o_ice_optical_depth?: number | null;
  h2o_ice_column_density_1e17?: number | null;
  co2_ice_optical_depth?: number | null;
  co2_ice_column_density_1e17?: number | null;
  co_optical_depth?: number | null;
  co_column_density_1e17?: number | null;
  pah_aromatic_depth?: number | null;
}

export interface KinematicsAnalysis {
  total_proper_motion_masyr?: number | null;
  position_angle_deg?: number | null;
  tangential_velocity_kms?: number | null;
  space_velocity_uvw_kms?: [number, number, number];
  displacement_14yr_arcsec?: number | null;
  pmra_masyr?: number | null;
  pmdec_masyr?: number | null;
  parallax_mas?: number | null;
  radial_velocity_kms?: number | null;
  /**
   * Phase 9: propagated uncertainty on tangential velocity from the Gaia
   * astrometric covariance. Only populated when the full correlation matrix
   * is available; otherwise left null rather than fabricated.
   */
  tangential_velocity_kms_err?: Uncertainty | null;
  total_proper_motion_masyr_err?: Uncertainty | null;
  /**
   * Phase 9: W3C PROV-DM lineage for the kinematics derivation, including
   * the propagation formula and the upstream entities it consumed.
   */
  w3c_provenance?: W3CProvBlock | null;
  /**
   * Phase 4: indicates whether the propagated σ was computed from the full
   * 10-correlation Gaia covariance ('full') or the diagonal-only fallback
   * ('diagonal'). 'unavailable' means propagation could not be performed.
   */
  propagation_basis?: 'full' | 'diagonal' | 'unavailable' | null;
  /**
   * Phase 4: true iff the Gaia DR3 RUWE for this source exceeds 1.4,
   * indicating a marginally resolved or astrometrically noisy fit
   * (Lindegren et al. 2021). null when RUWE was not retrieved.
   */
  gaia_ruwe?: boolean | null;
  /**
   * Phase 4: reference epoch (J2016.0 for Gaia DR3) as a Julian Year.
   */
  gaia_epoch_jy?: number | null;
  /**
   * Phase 4: target epoch the Gaia solution was propagated to.
   * For SPHEREx QR3 the QR3 publication date is the natural anchor.
   */
  propagated_epoch_jy?: number | null;
}

export interface TargetCutouts {
  spherex_cutout_url?: string;
  wise_cutout_url: string;
  twomass_cutout_url: string;
  dss2_cutout_url: string;
  diff_cutout_url?: string;
  high_res_url?: string;
}

export interface UnifiedOdysseyObject {
  id: string;
  status?: string; // 'resolved' | 'partially_resolved' | 'no_coverage' | 'unavailable'
  identity: ObjectIdentity;
  position: ObjectPosition;
  spherex: {
    releases: string[];
    default_release: string;
    coverage_status?: string;
    spectrophotometry?: SPHERExSpectrophotometryData;
  };
  motion?: ObjectMotion | null;
  solar_system?: {
    physical_and_orbit: JPLSmallBodyData;
    close_approach?: JPLCloseApproachData | null;
    close_approaches?: JPLCloseApproachData[];
    dynamic_ephemeris?: JPLHorizonsEphemerisData | null;
    position_source?: string;
  } | null;
  astrophysics?: AstrophysicalProperties | null;
  ice_chemistry?: IceChemistryAnalysis | null;
  kinematics?: KinematicsAnalysis | null;
  cutouts?: TargetCutouts;
  target_cutouts?: TargetCutouts;
  historical: ContextCutouts;
  literature: ObjectLiterature[];
  provenance: ObjectProvenance[];
}

export interface SPHERExReleaseSummary {
  release: string;
  name: string;
  collection: string;
  doi: string;
  start_date: string;
  cadence: string;
  is_default: boolean;
  description: string;
}

/**
 * Live release verification status reported by the backend release registry.
 *
 * - 'live'             : Verified against IRSA's TAP catalogue within the TTL window.
 * - 'last_known_good'  : IRSA unreachable; static manifest is the only source of truth.
 * - 'not_live'         : Was previously live, but IRSA no longer publishes this collection.
 * - 'stale'            : Last successful verification is older than the registry TTL.
 */
export type ReleaseVerificationStatus =
  | 'live'
  | 'last_known_good'
  | 'not_live'
  | 'stale';

export interface SPHERExReleaseDiagnosticsEntry {
  release: string;
  collection: string;
  doi: string;
  is_default: boolean;
  verification_status: ReleaseVerificationStatus;
  last_verified_at: string | null;
  last_verification_error: string | null;
  irsa_product_count: number | null;
  irsa_query_url: string | null;
}

export interface SPHERExReleaseDiagnostics {
  generated_at: string;
  ttl_seconds: number;
  next_refresh_at: string | null;
  degraded_mode: boolean;
  irsa_reachable: boolean;
  last_irsa_check_at: string | null;
  last_irsa_error: string | null;
  irsa_query_url: string | null;
  releases: SPHERExReleaseDiagnosticsEntry[];
  retired_releases_present: string[];
}

export interface SpectralBandMeta {
  band_index: number;
  name: string;
  wavelength_min_um: number;
  wavelength_max_um: number;
  central_wavelength_um: number;
  resolving_power_R: number;
  pixel_scale_arcsec: number;
}

export interface TimelineEpoch {
  id: string;
  label: string;
  year: number;
  dateStr: string;
  mission: 'spherex' | 'neowise' | 'wise';
  doi?: string;
  surveyName: string;
  description: string;
  /**
   * True if this entry represents a publication/release epoch (a calendar date
   * when a survey's data product became public) rather than a per-observation
   * epoch. Every actual SPHEREx observation has its own MJD; this flag
   * clarifies that the timeline entry is the release date, not a generic
   * observation time.
   */
  isPublicationEpoch?: boolean;
}

/**
 * Per-observation SPHEREx metadata. The mission records DATE-OBS and MJD-OBS
 * in every L2 FITS header. This struct mirrors that record so the UI can
 * surface the actual observation time of a selected cutout rather than
 * defaulting to a generic release date.
 */
export interface SPHERExObservationEpoch {
  mjd_obs: number;
  date_obs_utc: string;
  obs_id: string;
  product_id?: string;
  detector?: number;
  band?: string;
}

export interface SurveyLayer {
  id: string;
  name: string;
  wavelength: string;
  hipsUrl: string;
  visible: boolean;
  opacity: number;
}
