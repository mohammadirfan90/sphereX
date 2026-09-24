'use client';

import React from 'react';
import { Database, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface ObservationSectionProps {
  object: UnifiedOdysseyObject;
  activeRelease: 'qr3' | 'qr2';
  onSelectRelease: (rel: 'qr3' | 'qr2') => void;
}

export default function ObservationSection({
  object,
  activeRelease,
  onSelectRelease,
}: ObservationSectionProps) {
  const spherex = object.spherex;
  const spectro = spherex?.spectrophotometry;
  const coverageStatus = spectro?.status || spherex?.coverage_status || 'unknown';

  const isObserved = coverageStatus === 'available';

  return (
    <div className="p-4 border-b border-white/10 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-[#81c995]">
          <Database className="w-3.5 h-3.5" />
          <span>SPHEREx SIA Observation Status</span>
        </div>

        {/* Release Switcher */}
        <div className="flex gap-1">
          <button
            onClick={() => onSelectRelease('qr3')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
              activeRelease === 'qr3'
                ? 'bg-[#8ab4f8] text-[#0d111a]'
                : 'bg-white/10 text-[#9aa0a6] hover:text-[#f8f9fa]'
            }`}
          >
            QR3 (Default)
          </button>
          <button
            onClick={() => onSelectRelease('qr2')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
              activeRelease === 'qr2'
                ? 'bg-[#8ab4f8] text-[#0d111a]'
                : 'bg-white/10 text-[#9aa0a6] hover:text-[#f8f9fa]'
            }`}
          >
            QR2 (Baseline)
          </button>
        </div>
      </div>

      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          {isObserved ? (
            <CheckCircle2 className="w-4 h-4 text-[#81c995]" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#fdd663]" />
          )}
          <div>
            <div className="text-[#f8f9fa] font-bold">
              {isObserved ? 'SPHEREx Footprint Coverage Confirmed' : 'No Coverage in Selected Release'}
            </div>
            <div className="text-[10px] text-[#9aa0a6]">
              {isObserved
                ? `NASA/IPAC IRSA SIA validated (${spectro?.diagnostics?.sia_product_count || 'multiple'} L2 products)`
                : 'Target lies outside observed survey tiles for this release'}
            </div>
          </div>
        </div>
      </div>

      {spectro?.detail && (
        <p className="text-[11px] text-[#9aa0a6] leading-relaxed">
          {spectro.detail}
        </p>
      )}
    </div>
  );
}
