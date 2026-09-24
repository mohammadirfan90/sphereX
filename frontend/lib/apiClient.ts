/**
 * API Client for SPHEREx Odyssey Science Backend.
 *
 * Directs all frontend requests to the local FastAPI backend,
 * keeping all credentials, rate-limiting, and validation on the server.
 *
 * Zero synthetic data: strictly returns authentic data or raises typed errors.
 */

import {
  UnifiedOdysseyObject,
  SPHERExReleaseSummary,
  SPHERExReleaseDiagnostics,
  SpectralBandMeta,
} from '@/types';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class NoCoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoCoverageError';
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

const API_BASE_URL = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000');

export async function fetchUnifiedObject(
  query: string,
  release: 'qr3' | 'qr2' = 'qr3'
): Promise<UnifiedOdysseyObject> {
  const url = `${API_BASE_URL}/api/object/unified?query=${encodeURIComponent(query)}&release=${release}`;
  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 404) {
    const err = await res.json().catch(() => ({}));
    throw new NotFoundError(err?.detail || `Target '${query}' not found across SIMBAD, Gaia, or JPL databases.`);
  }

  if (res.status === 503) {
    const err = await res.json().catch(() => ({}));
    throw new ServiceUnavailableError(err?.detail || 'Upstream astronomical service temporarily unavailable.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Unified object resolution failed with HTTP ${res.status}`);
  }

  return res.json();
}

export async function fetchSPHERExReleases(): Promise<SPHERExReleaseSummary[]> {
  const url = `${API_BASE_URL}/api/spherex/releases`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error('Failed to load SPHEREx release catalog');
  return res.json();
}

/**
 * Live IRSA release verification snapshot from the backend registry.
 *
 * Returns per-release status (live / last_known_good / not_live / stale) plus
 * the IRSA ObsTAP probe metadata. Call this on app boot to seed the active
 * release rather than trusting a hardcoded 'qr3' default.
 *
 * Pass `force=true` to issue a fresh probe (same as POST /spherex/releases/refresh).
 */
export async function fetchSPHERExReleaseDiagnostics(
  force: boolean = false,
): Promise<SPHERExReleaseDiagnostics> {
  const url = `${API_BASE_URL}/api/spherex/releases/diagnostics${force ? '?refresh=true' : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load SPHEREx release registry diagnostics');
  return res.json();
}

export async function refreshSPHERExReleaseRegistry(): Promise<SPHERExReleaseDiagnostics> {
  const res = await fetch(`${API_BASE_URL}/api/spherex/releases/refresh`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to refresh SPHEREx release registry');
  return res.json();
}

export async function fetchInstrumentBands(): Promise<SpectralBandMeta[]> {
  const url = `${API_BASE_URL}/api/spherex/bands`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error('Failed to load instrument characteristics');
  return res.json();
}

// ── SPExPI Spectral Extraction Job API ────────────────────────────────────

export type JobPhase =
  | 'queued' | 'discovering' | 'downloading' | 'calibrating'
  | 'positioning' | 'photometry' | 'binning' | 'qa'
  | 'complete' | 'failed' | 'unavailable';

export interface SpectrumJobStatus {
  job_id: string;
  status: JobPhase;
  phase: JobPhase;
  progress: number;
  n_cutouts_found: number;
  n_measurements: number;
  data_release: string | null;
  error: string | null;
  reason: string | null;
  started_at: number;
  updated_at: number;
}

export interface SpectrumPoint {
  wavelength_um: number;
  flux_uJy: number | null;
  flux_err_uJy: number | null;
  snr: number | null;
  detector: number;
  photometry_method: string;
}

export interface SpectrumResult {
  source: 'spherex_real';
  data_release: string;
  photometry_method: string;
  target: {
    name: string;
    ra_deg: number;
    dec_deg: number;
  };
  spectrum: SpectrumPoint[];
  spectra: {
    aperture?: SpectrumPoint[];
    psf?: SpectrumPoint[];
  };
  diagnostics: {
    n_cutouts_found: number;
    n_cutouts_opened: number;
    n_aperture_measurements_ok: number;
    n_psf_measurements_ok: number;
    n_valid_measurements: number;
    aperture_psf_rms_diff_uJy: number | null;
    contamination_flag: boolean;
  };
  provenance: {
    pipeline: string;
    source: string;
    release: string;
    sapm_collection: string;
    spectral_channels_collection: string | null;
    photometry_method: string;
    aperture_radius_pix: number;
    n_cutouts_processed: number;
    n_valid_measurements: number;
    extracted_at: string;
  };
}

export interface SubmitJobRequest {
  ra: number;
  dec: number;
  target_name?: string;
  data_release?: 'qr3' | 'qr2' | 'latest';
  photometry_method?: 'aperture' | 'psf' | 'both';
  proper_motion?: {
    pmra_masyr: number;
    pmdec_masyr: number;
    reference_epoch_yr: number;
  };
}

/**
 * Submit a new SPExPI spectral extraction job. Returns immediately with job_id.
 */
export async function submitSpectrumJob(req: SubmitJobRequest): Promise<{ job_id: string; is_new: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/spectrophotometry/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Job submission failed (${res.status})`);
  }
  return res.json();
}

/**
 * Poll job status from SQLite registry. Call every ~2 s until status is 'complete', 'failed', or 'unavailable'.
 */
export async function pollSpectrumJob(jobId: string): Promise<SpectrumJobStatus> {
  const res = await fetch(`${API_BASE_URL}/api/spectrophotometry/jobs/${jobId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Job status fetch failed (${res.status})`);
  return res.json();
}

/**
 * Fetch completed SPHEREx spectrum result. Only call when status === 'complete'.
 */
export async function fetchSpectrumResult(jobId: string): Promise<SpectrumResult> {
  const res = await fetch(`${API_BASE_URL}/api/spectrophotometry/jobs/${jobId}/result`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail?.message || `Result fetch failed (${res.status})`);
  }
  return res.json();
}

/**
 * Check if a cached preview spectrum is available for this coordinate.
 */
export async function fetchSpectrumPreview(
  ra: number,
  dec: number
): Promise<{ available: boolean; job_id?: string; preview?: SpectrumResult }> {
  const res = await fetch(
    `${API_BASE_URL}/api/spectrophotometry/preview?ra=${ra}&dec=${dec}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return { available: false };
  return res.json();
}
