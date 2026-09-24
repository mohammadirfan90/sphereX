'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Waves,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';
import {
  submitSpectrumJob,
  pollSpectrumJob,
  fetchSpectrumResult,
  type SpectrumJobStatus,
  type SpectrumResult,
  type SpectrumPoint,
} from '@/lib/apiClient';

interface SpectrumSectionProps {
  object: UnifiedOdysseyObject;
  activeBandIndex: number;
  onSelectBand: (band: number) => void;
}

type SpectrumState = 'idle' | 'running' | 'complete' | 'unavailable' | 'failed';

export default function SpectrumSection({
  object,
  activeBandIndex,
  onSelectBand,
}: SpectrumSectionProps) {
  const [specState, setSpecState] = useState<SpectrumState>('idle');
  const [specJobId, setSpecJobId] = useState<string | null>(null);
  const [specJobStatus, setSpecJobStatus] = useState<SpectrumJobStatus | null>(null);
  const [specResult, setSpecResult] = useState<SpectrumResult | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);
  const [photometryMethod, setPhotometryMethod] = useState<'aperture' | 'psf'>('aperture');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const PHASE_LABELS: Record<string, string> = {
    queued: 'Queued in SQLite pipeline',
    discovering: 'Querying IRSA SIAv2 observations',
    downloading: 'Downloading calibrated L2 cutouts',
    calibrating: 'Applying mission calibrations (SAPM)',
    positioning: 'Epoch astrometric alignment',
    photometry: 'Aperture & PSF photometry extraction',
    binning: '102-channel spectral binning',
    qa: 'Astrophysical quality assurance',
    complete: 'Calibrated Spectrum Complete',
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startExtraction = useCallback(async () => {
    setSpecState('running');
    setSpecError(null);
    setSpecResult(null);
    setSpecJobStatus(null);

    try {
      const pm = object.motion?.proper_motion_ra_masyr != null ? {
        pmra_masyr: object.motion.proper_motion_ra_masyr,
        pmdec_masyr: object.motion.proper_motion_dec_masyr ?? 0,
        reference_epoch_yr: 2016.0,
      } : undefined;

      const { job_id } = await submitSpectrumJob({
        ra: object.position.ra_deg,
        dec: object.position.dec_deg,
        target_name: object.identity.canonical_name,
        data_release: 'latest',
        photometry_method: 'both',
        proper_motion: pm,
      });

      setSpecJobId(job_id);

      pollRef.current = setInterval(async () => {
        try {
          const status = await pollSpectrumJob(job_id);
          setSpecJobStatus(status);

          if (status.status === 'complete') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            const res = await fetchSpectrumResult(job_id);
            setSpecResult(res);
            setSpecState('complete');
          } else if (status.status === 'unavailable') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setSpecState('unavailable');
            setSpecError(status.error || 'No SPHEREx coverage found at this celestial coordinate.');
          } else if (status.status === 'failed') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setSpecState('failed');
            setSpecError(status.error || 'SPExPI extraction failed.');
          }
        } catch (e: any) {
          logError('Poll error', e);
        }
      }, 2000);
    } catch (err: any) {
      setSpecState('failed');
      setSpecError(err.message || 'Job submission failed.');
    }
  }, [object]);

  const logError = (msg: string, e: any) => {
    console.debug(msg, e);
  };

  // Determine active points to display
  const points: SpectrumPoint[] = specResult
    ? (photometryMethod === 'psf' && specResult.spectra?.psf
        ? specResult.spectra.psf
        : specResult.spectrum)
    : [];

  // SVG SED Plot Dimensions
  const validPoints = points.filter((p) => p.flux_uJy != null && p.flux_uJy > 0);
  const minWl = 0.75;
  const maxWl = 5.00;
  const maxFlux = validPoints.length > 0 ? Math.max(...validPoints.map((p) => p.flux_uJy!)) * 1.15 : 100;
  const minFlux = 0;

  const svgWidth = 360;
  const svgHeight = 140;

  const getX = (wl: number) => ((wl - minWl) / (maxWl - minWl)) * (svgWidth - 40) + 30;
  const getY = (fl: number) => svgHeight - 20 - ((fl - minFlux) / (maxFlux - minFlux || 1)) * (svgHeight - 40);

  const polylinePoints = validPoints
    .map((p) => `${getX(p.wavelength_um).toFixed(1)},${getY(p.flux_uJy!).toFixed(1)}`)
    .join(' ');

  return (
    <div className="p-4 border-b border-white/10 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-[#fdd663]">
          <Waves className="w-3.5 h-3.5" />
          <span>SPExPI Calibrated Spectrophotometry</span>
        </div>

        {specState === 'complete' && specResult?.spectra?.psf && (
          <div className="flex gap-1">
            <button
              onClick={() => setPhotometryMethod('aperture')}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                photometryMethod === 'aperture' ? 'bg-[#fdd663] text-[#0d111a]' : 'bg-white/10 text-[#9aa0a6]'
              }`}
            >
              Aperture
            </button>
            <button
              onClick={() => setPhotometryMethod('psf')}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                photometryMethod === 'psf' ? 'bg-[#fdd663] text-[#0d111a]' : 'bg-white/10 text-[#9aa0a6]'
              }`}
            >
              PSF Fit
            </button>
          </div>
        )}
      </div>

      {/* State: IDLE */}
      {specState === 'idle' && (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col items-center text-center gap-2">
          <p className="text-xs text-[#9aa0a6]">
            Full 102-channel near-infrared spectrophotometry extracted directly from Level 2 FITS via the authentic SPExPI pipeline.
          </p>
          <button
            onClick={startExtraction}
            className="w-full py-2 rounded-xl bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#0d111a] font-sans font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Extract Authentic Spectrum (SPExPI)</span>
          </button>
        </div>
      )}

      {/* State: RUNNING */}
      {specState === 'running' && (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[#8ab4f8] animate-spin" />
              <span className="font-bold text-[#f8f9fa]">
                {PHASE_LABELS[specJobStatus?.phase || 'queued'] || 'Processing...'}
              </span>
            </div>
            <span className="font-mono text-[#8ab4f8] font-bold">
              {specJobStatus?.progress || 0}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8ab4f8] to-[#fdd663] transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, specJobStatus?.progress || 0)}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] font-mono text-[#9aa0a6]">
            <span>Job: {specJobId?.slice(0, 12)}...</span>
            <span>Cutouts: {specJobStatus?.n_cutouts_found || 0}</span>
          </div>
        </div>
      )}

      {/* State: UNAVAILABLE / FAILED */}
      {(specState === 'unavailable' || specState === 'failed') && (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-[#fdd663] shrink-0" />
            <div className="flex-1">
              <span className="font-bold text-[#f8f9fa]">
                {specState === 'unavailable' ? 'No SPHEREx Coverage' : 'Extraction Error'}
              </span>
              <p className="text-[11px] text-[#9aa0a6] mt-0.5 leading-snug">
                {specError}
              </p>
            </div>
          </div>
          <button
            onClick={startExtraction}
            className="self-start px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[#f8f9fa] text-[11px] font-sans font-semibold transition-colors flex items-center gap-1 mt-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Extraction</span>
          </button>
        </div>
      )}

      {/* State: COMPLETE (Real SED Plot + Measurement Table) */}
      {specState === 'complete' && specResult && (
        <div className="flex flex-col gap-2.5">
          {/* Authentic SED SVG Plot */}
          <div className="p-2 rounded-xl bg-black/40 border border-white/10">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#9aa0a6] mb-1 px-1">
              <span>Flux F_ν (μJy)</span>
              <span className="text-[#81c995]">
                {validPoints.length} Channels · {photometryMethod.toUpperCase()}
              </span>
            </div>

            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-32 overflow-visible">
              {/* Axes lines */}
              <line x1="30" y1="10" x2="30" y2={svgHeight - 20} stroke="#3c4043" strokeWidth="1" />
              <line x1="30" y1={svgHeight - 20} x2={svgWidth - 10} y2={svgHeight - 20} stroke="#3c4043" strokeWidth="1" />

              {/* Grid ticks */}
              {[1.0, 2.0, 3.0, 4.0, 5.0].map((wl) => (
                <g key={wl} transform={`translate(${getX(wl)}, 0)`}>
                  <line y1={svgHeight - 20} y2={svgHeight - 15} stroke="#5f6368" strokeWidth="1" />
                  <text y={svgHeight - 5} textAnchor="middle" fill="#9aa0a6" fontSize="9" fontFamily="monospace">
                    {wl}
                  </text>
                </g>
              ))}

              {/* Spectral curve */}
              {polylinePoints && (
                <polyline
                  fill="none"
                  stroke="#fdd663"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

              {/* Data points with error bars */}
              {validPoints.map((p, idx) => {
                const cx = getX(p.wavelength_um);
                const cy = getY(p.flux_uJy!);
                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r="2"
                    className="fill-[#fdd663] hover:fill-[#ffffff] hover:r-3 transition-all cursor-pointer"
                    onClick={() => onSelectBand(idx + 1)}
                  />
                );
              })}
            </svg>

            <div className="text-center text-[10px] font-mono text-[#9aa0a6]">
              Wavelength λ (μm)
            </div>
          </div>

          {/* Diagnostics Summary */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-[#9aa0a6]">Valid Channels</span>
              <div className="text-[#f8f9fa] font-bold mt-0.5">
                {specResult.diagnostics.n_valid_measurements}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-[10px] text-[#9aa0a6]">Aperture vs PSF Diff</span>
              <div className="text-[#f8f9fa] font-bold mt-0.5">
                {specResult.diagnostics.aperture_psf_rms_diff_uJy != null
                  ? `${specResult.diagnostics.aperture_psf_rms_diff_uJy} μJy`
                  : 'Not evaluated'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
