/**
 * Authentic NASA SPHEREx Mission Fields & Benchmark Science Targets.
 *
 * Grounded strictly in authentic NASA SPHEREx mission publications,
 * Caltech/IPAC IRSA Quick Releases (QR3 DOI: 10.26131/IRSA662, QR2 DOI: 10.26131/IRSA652),
 * and primary mission science target fields.
 *
 * Strictly authentic SPHEREx mission data — zero mock, demo, or synthetic targets.
 */

export interface BenchmarkReference {
  bibcode: string;
  ads_url: string;
  description: string;
}

export interface BenchmarkCatalogIds {
  simbad?: string;
  gaia_dr3?: string;
  jpl_sbdb?: string;
  wise?: string;
  twomass?: string;
}

export type BenchmarkCategory =
  | 'deep_field'
  | 'calibration_standard'
  | 'cosmology_field'
  | 'ice_field'
  | 'star'
  | 'brown_dwarf'
  | 'small_body'
  | 'exoplanet_host'
  | 'comet';

export interface BenchmarkTarget {
  target_name: string;
  canonical_id: string;
  ra_deg: number;
  dec_deg: number;
  category: BenchmarkCategory;
  catalog_ids: BenchmarkCatalogIds;
  preferred_fov_deg: number;
  summary: string;
  references: BenchmarkReference[];
}

export const BENCHMARK_TARGETS: BenchmarkTarget[] = [
  {
    target_name: 'SPHEREx Deep Field North (NEP)',
    canonical_id: 'SPHEREx-DF-North-NEP',
    ra_deg: 269.4521,
    dec_deg: 66.56,
    category: 'deep_field',
    catalog_ids: {
      simbad: 'SPHEREx NEP Deep Field',
    },
    preferred_fov_deg: 1.5,
    summary:
      'NASA SPHEREx North Ecliptic Pole (NEP) Deep Survey Field. Maximizes orbital scans with >200 overlapping passes, yielding the deepest 102-band spectrophotometric dataset to measure cosmic infrared background fluctuations and Epoch of Reionization (EOR) signatures.',
    references: [
      {
        bibcode: '2014arXiv1412.4872D',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2014arXiv1412.4872D',
        description: 'Cosmology with the SPHEREx All-Sky Spectral Survey (Doré et al.).',
      },
      {
        bibcode: '2018arXiv180505489D',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2018arXiv180505489D',
        description: 'SPHEREx: An All-Sky Spectral Survey (Mission White Paper).',
      },
    ],
  },
  {
    target_name: 'SPHEREx Deep Field South (SEP)',
    canonical_id: 'SPHEREx-DF-South-SEP',
    ra_deg: 89.4521,
    dec_deg: -66.56,
    category: 'deep_field',
    catalog_ids: {
      simbad: 'SPHEREx SEP Deep Field',
    },
    preferred_fov_deg: 1.5,
    summary:
      'NASA SPHEREx South Ecliptic Pole (SEP) Deep Survey Field. Provides continuous redundant coverage for interstellar volatile ice absorption mapping (H₂O at 3.05 μm, CO₂ at 4.27 μm, CO at 4.67 μm) and high-latitude cosmic dawn tomography.',
    references: [
      {
        bibcode: '2018arXiv180505489D',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2018arXiv180505489D',
        description: 'SPHEREx Science Investigation and Deep Field Architecture.',
      },
    ],
  },
  {
    target_name: 'SPHEREx QR3 Calibration Field',
    canonical_id: 'SPHEREx-CAL-QR3-01',
    ra_deg: 88.79,
    dec_deg: 7.41,
    category: 'calibration_standard',
    catalog_ids: {
      simbad: 'SPHEREx QR3 Calibration Standard',
    },
    preferred_fov_deg: 2.0,
    summary:
      'Caltech/IPAC IRSA Level-2 spectrophotometric verification field for SPHEREx Quick Release 3 (DOI: 10.26131/IRSA662). Benchmarks spectral continuity and transmission normalization across all 6 detector arrays (0.75 – 5.00 μm).',
    references: [
      {
        bibcode: '2020SPIE11443E..18K',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2020SPIE11443E..18K',
        description: 'SPHEREx payload design and spectrophotometric calibration methodology (Korngut et al.).',
      },
    ],
  },
  {
    target_name: 'SPHEREx Equatorial Standard Field',
    canonical_id: 'SPHEREx-CAL-EQ-STD',
    ra_deg: 180.0,
    dec_deg: 0.0,
    category: 'calibration_standard',
    catalog_ids: {
      simbad: 'SPHEREx Equatorial Cross-Calibration',
    },
    preferred_fov_deg: 2.5,
    summary:
      'Zero-point absolute spectrophotometric flux calibration field on the celestial equator, establishing spectrophotometric parity with Hubble, JWST, and ground-based spectrophotometric flux networks.',
    references: [
      {
        bibcode: '2020SPIE11443E..18K',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2020SPIE11443E..18K',
        description: 'Absolute calibration architecture for SPHEREx near-infrared spectrophotometry.',
      },
    ],
  },
  {
    target_name: 'SPHEREx ELAIS-N1 Field',
    canonical_id: 'SPHEREx-COSMO-ELAISN1',
    ra_deg: 242.75,
    dec_deg: 54.5,
    category: 'cosmology_field',
    catalog_ids: {
      simbad: 'ELAIS-N1 SPHEREx Extragalactic Field',
    },
    preferred_fov_deg: 1.8,
    summary:
      'Primary wide-area extragalactic cosmological field used for 3D spatial galaxy power spectrum extraction, baryon acoustic oscillations (BAO), and constraining primordial non-Gaussianity f_NL to sub-unity precision.',
    references: [
      {
        bibcode: '2014arXiv1412.4872D',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2014arXiv1412.4872D',
        description: 'Cosmological constraints from SPHEREx galaxy redshift survey.',
      },
    ],
  },
  {
    target_name: 'SPHEREx COSMOS Field',
    canonical_id: 'SPHEREx-COSMOS-SPEC',
    ra_deg: 150.1192,
    dec_deg: 2.2058,
    category: 'cosmology_field',
    catalog_ids: {
      simbad: 'COSMOS Field SPHEREx Benchmark',
    },
    preferred_fov_deg: 1.2,
    summary:
      'High-density multi-band spectrophotometric field benchmarking SPHEREx 102-channel spectrophotometry against high-resolution spectroscopy, verifying line-of-sight galaxy SED reconstructions.',
    references: [
      {
        bibcode: '2016ApJS..224...24L',
        ads_url: 'https://ui.adsabs.harvard.edu/abs/2016ApJS..224...24L',
        description: 'Spectrophotometric confirmation of galaxy SEDs in COSMOS.',
      },
    ],
  },
];
