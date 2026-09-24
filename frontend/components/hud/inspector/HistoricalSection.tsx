'use client';

import React from 'react';
import { Play, Pause, Clock, Sparkles } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface HistoricalSectionProps {
  object: UnifiedOdysseyObject;
  isBlinking: boolean;
  onToggleBlink: () => void;
  cutoutSurvey: string;
  onSelectSurvey: (survey: 'spherex' | 'wise' | 'twomass' | 'dss2' | 'diff') => void;
}

export default function HistoricalSection({
  object,
  isBlinking,
  onToggleBlink,
  cutoutSurvey,
  onSelectSurvey,
}: HistoricalSectionProps) {
  const pm = object.kinematics?.total_proper_motion_masyr;
  const displacement = object.kinematics?.displacement_14yr_arcsec;

  return (
    <div className="space-y-3 font-mono text-[11px]">
      {/* SPHEREx Multi-Epoch Temporal Baseline Card */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#8ab4f8]" />
            <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider">
              SPHEREx Temporal Baseline (QR2 ➔ QR3)
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-[#8ab4f8]/15 text-[#8ab4f8] text-[9px] font-bold">
            QR2 – QR3
          </span>
        </div>

        <p className="text-[10px] text-[#9aa0a6] font-sans leading-relaxed">
          Comparing SPHEREx QR2 (DOI: 10.26131/IRSA652) to SPHEREx QR3 (DOI: 10.26131/IRSA662) provides a calibrated 6-month temporal baseline to detect infrared photometric variability and transient phenomena across 102 spectral channels.
        </p>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-black/30 p-2.5 rounded-xl">
            <span className="text-[#9aa0a6] block">SPHEREx Cadence</span>
            <span className="font-bold text-[#8ab4f8]">6-Month All-Sky</span>
          </div>
          <div className="bg-black/30 p-2.5 rounded-xl">
            <span className="text-[#9aa0a6] block">Astrometric Shift</span>
            <span className="font-bold text-[#81c995]">
              {displacement != null ? `${displacement.toFixed(2)}″` : pm ? `${((pm * 0.5) / 1000).toFixed(3)}″` : '—'}
            </span>
          </div>
        </div>

        {/* Blink Toggle Button */}
        <button
          onClick={onToggleBlink}
          className={`w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            isBlinking
              ? 'bg-[#ff7563] text-white shadow-[0_0_15px_rgba(255,117,99,0.4)]'
              : 'bg-white/10 hover:bg-white/15 text-[#f8f9fa] border border-white/10'
          }`}
        >
          {isBlinking ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          <span>{isBlinking ? 'Pause SPHEREx Temporal Blink' : 'Start SPHEREx QR2 vs QR3 Blink'}</span>
        </button>
      </div>

      {/* SPHEREx Mission Data Releases */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider block">
          Authentic SPHEREx Releases & DOIs
        </span>

        <div className="space-y-1.5">
          {[
            {
              id: 'spherex',
              name: 'SPHEREx QR3 (Default)',
              epoch: 'Sep 2026 (Weekly)',
              bands: '0.75 – 5.00 μm (102 bands, R=35–130)',
              doi: '10.26131/IRSA662',
            },
            {
              id: 'spherex_qr2',
              name: 'SPHEREx QR2 (Baseline)',
              epoch: 'Nov 2025 (Reprocessed)',
              bands: '0.75 – 5.00 μm (All-sky baseline)',
              doi: '10.26131/IRSA652',
            },
          ].map((srv) => (
            <div
              key={srv.id}
              onClick={() => onSelectSurvey('spherex')}
              className="p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between bg-[#8ab4f8]/10 border-[#8ab4f8]/40 text-[#f8f9fa]"
            >
              <div>
                <div className="font-bold text-[11px] text-[#f8f9fa] flex items-center gap-1.5">
                  <span>{srv.name}</span>
                  <span className="text-[9px] font-normal text-[#9aa0a6]">({srv.epoch})</span>
                </div>
                <div className="text-[9px] text-[#9aa0a6] mt-0.5">{srv.bands}</div>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded bg-white/5 font-mono text-[#8ab4f8]">
                {srv.doi}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
