/**
 * Authoritative Astronomical Survey Registry for SPHEREx Odyssey.
 *
 * Implements strict separation of:
 * 1. Science Layer: SPHEREx QR3 (0.75-5.0 μm, 102 channels, calibrated FITS + WCS + measurements)
 * 2. Navigation Layer: Wide-field progressive HiPS (AllWISE, 2MASS, SPHEREx coverage)
 * 3. Context Layers: High-resolution optical/NIR surveys (Pan-STARRS DR1, DESI Legacy, DSS2)
 *
 * Grounded in verified CDS / ESA / NASA IPAC registry metadata.
 */

export interface WavelengthRange {
  minMicron: number;
  maxMicron: number;
}

export interface ResolutionModel {
  nativePixelScaleArcsec: number;
  effectiveResolutionArcsec: number;
  maxHiPSOrder: number;
}

export interface CoverageDefinition {
  type: 'all-sky' | 'partial';
  skyFractionPct?: number;
  mocUrl?: string;
  description: string;
}

export interface HiPSConfig {
  serviceUrl: string;
  maxOrder: number;
  formats: string[];
}

export interface SurveyDefinition {
  id: string;
  name: string;
  provider: string;
  kind: 'hips' | 'fits' | 'catalog';
  role: 'science' | 'navigation' | 'context';
  wavelength: WavelengthRange;
  resolutionModel: ResolutionModel;
  coverage: CoverageDefinition;
  hips?: HiPSConfig;
  fitsBaseUrl?: string;
  description: string;
}

export const SURVEY_REGISTRY: Record<string, SurveyDefinition> = {
  // 1. Primary Science Layer: NASA SPHEREx Mission
  spherex_qr3: {
    id: 'spherex_qr3',
    name: 'SPHEREx QR3 (Quick Release 3)',
    provider: 'NASA / IPAC / Caltech (DOI: 10.26131/IRSA662)',
    kind: 'fits',
    role: 'science',
    wavelength: { minMicron: 0.75, maxMicron: 5.0 },
    resolutionModel: {
      nativePixelScaleArcsec: 6.2,
      effectiveResolutionArcsec: 6.2,
      maxHiPSOrder: 8,
    },
    coverage: {
      type: 'all-sky',
      skyFractionPct: 100,
      description: 'Entire celestial sphere observed in 102 near-infrared spectrophotometric channels.',
    },
    hips: {
      serviceUrl: 'https://skies.esac.esa.int/AllWISEColor',
      maxOrder: 8,
      formats: ['jpeg', 'png', 'fits'],
    },
    fitsBaseUrl: 'https://irsa.ipac.caltech.edu/ibe/data/spherex',
    description: 'Calibrated spectrophotometric all-sky data with 102 spectral channels, associated sky positions, flux, uncertainty, and WCS.',
  },

  // 2. Navigation & Mid-Infrared Baseline: NASA AllWISE
  allwise_color: {
    id: 'allwise_color',
    name: 'NASA / IPAC AllWISE Color (W4/W2/W1 RGB)',
    provider: 'NASA / IPAC / CDS (CDS/P/allWISE/color)',
    kind: 'hips',
    role: 'navigation',
    wavelength: { minMicron: 3.4, maxMicron: 22.0 },
    resolutionModel: {
      nativePixelScaleArcsec: 1.375, // AllWISE Atlas FITS native pixel sampling
      effectiveResolutionArcsec: 6.1, // W1 FWHM beam PSF
      maxHiPSOrder: 8,
    },
    coverage: {
      type: 'all-sky',
      skyFractionPct: 100,
      description: 'Full-sky mid-infrared baseline tracing warm cosmic dust, stellar populations, and galaxy halos.',
    },
    hips: {
      serviceUrl: 'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1',
      maxOrder: 8,
      formats: ['jpeg', 'png'],
    },
    fitsBaseUrl: 'https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd',
    description: 'All-sky composite from raw AllWISE Atlas FITS tiles (1.375″/pixel sampling).',
  },

  // 3. Near-Infrared High-Resolution Context: 2MASS
  twomass_color: {
    id: 'twomass_color',
    name: '2MASS Color (J, H, Ks Near-IR)',
    provider: 'UMass / IPAC / CDS (CDS/P/2MASS/color)',
    kind: 'hips',
    role: 'context',
    wavelength: { minMicron: 1.25, maxMicron: 2.17 },
    resolutionModel: {
      nativePixelScaleArcsec: 1.0,
      effectiveResolutionArcsec: 2.0,
      maxHiPSOrder: 9,
    },
    coverage: {
      type: 'all-sky',
      skyFractionPct: 100,
      description: 'All-sky near-infrared survey probing obscured Galactic stars and nearby galaxies.',
    },
    hips: {
      serviceUrl: 'https://alaskybis.cds.unistra.fr/2MASS/Color',
      maxOrder: 9,
      formats: ['jpeg', 'png'],
    },
    description: 'High-quality near-infrared survey spanning 1.0″ native pixel scale.',
  },

  // 4. Optical Context: Pan-STARRS DR1
  panstarrs_dr1: {
    id: 'panstarrs_dr1',
    name: 'Pan-STARRS DR1 Color (z-zg-g)',
    provider: 'STScI / CDS (CDS/P/PanSTARRS/DR1/color-z-zg-g)',
    kind: 'hips',
    role: 'context',
    wavelength: { minMicron: 0.4, maxMicron: 1.0 },
    resolutionModel: {
      nativePixelScaleArcsec: 0.25,
      effectiveResolutionArcsec: 0.7,
      maxHiPSOrder: 11,
    },
    coverage: {
      type: 'partial',
      skyFractionPct: 76, // Dec > -30°
      description: 'Covers 3/4 of the sky (Dec > -30°) with 0.25″/pixel optical imaging.',
    },
    hips: {
      serviceUrl: 'https://alasky.cds.unistra.fr/Pan-STARRS/DR1/color-z-zg-g',
      maxOrder: 11,
      formats: ['jpeg', 'png'],
    },
    description: 'Ultra-sharp optical context resolving individual stars, spiral arms, and background galaxies.',
  },

  // 5. Historic Optical Context: DSS2 Color
  dss2_color: {
    id: 'dss2_color',
    name: 'Digitized Sky Survey 2 Color',
    provider: 'STScI / CDS (CDS/P/DSS2/color)',
    kind: 'hips',
    role: 'context',
    wavelength: { minMicron: 0.4, maxMicron: 0.9 },
    resolutionModel: {
      nativePixelScaleArcsec: 1.0,
      effectiveResolutionArcsec: 1.5,
      maxHiPSOrder: 9,
    },
    coverage: {
      type: 'all-sky',
      skyFractionPct: 100,
      description: 'Historical full-sky optical survey across blue, red, and near-IR photographic plates.',
    },
    hips: {
      serviceUrl: 'https://skies.esac.esa.int/DSSColor',
      maxOrder: 9,
      formats: ['jpeg', 'png'],
    },
    description: 'Standard historical all-sky optical reference.',
  },
};

/**
 * Retrieve verified survey definition by ID, with fallback to allwise_color.
 */
export function getSurveyDefinition(surveyId: string): SurveyDefinition {
  return SURVEY_REGISTRY[surveyId] || SURVEY_REGISTRY.allwise_color;
}
