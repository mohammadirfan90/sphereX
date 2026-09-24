import { TimelineEpoch, SurveyLayer } from '@/types';

/**
 * Authentic NASA SPHEREx Mission Releases & Data Products.
 *
 * Strictly authentic SPHEREx data releases:
 * - QR3: Quick Release 3 (Default, DOI: 10.26131/IRSA662)
 * - QR2: Quick Release 2 Reprocessed Baseline (DOI: 10.26131/IRSA652)
 *
 * Zero synthetic, mock, or simulated survey data.
 */

/**
 * SPHEREx mission-specific note on timeline entries:
 *
 * These entries represent the *publication epoch* of each data release, i.e.
 * the calendar date when NASA/IPAC IRSA released the calibrated product
 * collection. They are NOT generic SPHEREx observation epochs.
 *
 * Every actual SPHEREx observation has its own MJD recorded in the L2 FITS
 * DATE-OBS / MJD-OBS headers, and the SPExPI adapter returns that value as
 * `SPHERExObservationRecord.mjd_obs`. The UI must surface the per-product
 * observation time from that field rather than defaulting to a release date.
 */
export const TIMELINE_EPOCHS: TimelineEpoch[] = [
  {
    id: 'spherex_qr2',
    label: 'SPHEREx QR2 (Baseline)',
    year: 2025.75,
    dateStr: '2025-11-20',
    mission: 'spherex',
    doi: '10.26131/IRSA652',
    surveyName: 'SPHEREx QR2 Reprocessed Baseline',
    description:
      'Reprocessed all-sky baseline providing direct 6-month temporal diffs ' +
      '(DOI: 10.26131/IRSA652). This is the release/publication date, NOT ' +
      'a generic observation epoch.',
    isPublicationEpoch: true,
  },
  {
    id: 'spherex_qr3',
    label: 'SPHEREx QR3 (Default)',
    year: 2026.75,
    dateStr: '2026-09-15',
    mission: 'spherex',
    doi: '10.26131/IRSA662',
    surveyName: 'SPHEREx QR3 Weekly Release',
    description:
      'Primary public release with weekly calibrated spectral products and ' +
      'improved L2 calibration (DOI: 10.26131/IRSA662). This is the ' +
      'release/publication date, NOT a generic observation epoch.',
    isPublicationEpoch: true,
  },
];

export const SURVEY_LAYERS: SurveyLayer[] = [
  {
    id: 'wise_allsky',
    name: 'WISE / AllWISE All-Sky Composite (3.4 & 4.6 μm)',
    wavelength: 'Mid-Infrared Baseline (NASA/IPAC IRSA)',
    hipsUrl: 'https://skies.esac.esa.int/AllWISEColor',
    visible: true,
    opacity: 1.0,
  },
  {
    id: 'twomass_allsky',
    name: '2MASS All-Sky Color Composite (1.25 – 2.17 μm)',
    wavelength: 'Near-Infrared J/H/Ks Baseline (NASA/IPAC IRSA)',
    hipsUrl: 'https://skies.esac.esa.int/2MASS/Color',
    visible: false,
    opacity: 0.8,
  },
  {
    id: 'dss2_optical',
    name: 'Digitized Sky Survey (DSS2 Color)',
    wavelength: 'Optical Red/Blue Baseline (STScI/ESO)',
    hipsUrl: 'https://skies.esac.esa.int/DSSColor',
    visible: false,
    opacity: 0.8,
  },
];
