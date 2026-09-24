'use client';

import React from 'react';
import { X, GitCompare, Compass, Check } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';
import GoogleKnowledgePanel from '@/components/hud/GoogleKnowledgePanel';

export default function ContextPanel() {
  const activeContextPanel = useUniverseStore((state) => state.activeContextPanel);
  const setActiveContextPanel = useUniverseStore((state) => state.setActiveContextPanel);
  const compareSettings = useUniverseStore((state) => state.compareSettings);
  const setCompareSettings = useUniverseStore((state) => state.setCompareSettings);

  if (activeContextPanel === 'none') return null;

  // 1. OBJECT INSPECTOR MODE -> Render Google Knowledge Panel
  if (activeContextPanel === 'object') {
    return <GoogleKnowledgePanel />;
  }

  // 2. COMPARE MODE (Wide Panoramic Google Material 3 Bottom Dock)
  if (activeContextPanel === 'compare') {
    return (
      <div
        id="context-panel-compare-dock"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2.5rem)] max-w-[1080px] bg-[#1B1C1D]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4 text-xs font-sans select-none animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-3"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#8AB4F8]/15 border border-[#8AB4F8]/30 flex items-center justify-center shrink-0">
              <GitCompare className="w-4 h-4 text-[#8AB4F8]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E3E3E3] tracking-tight">Compare Celestial Imagery</h3>
              <p className="text-[11px] text-[#9AA0A6]">
                Multi-Epoch Infrared Survey Differencing & Cross-Dissolve Comparator
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveContextPanel('none')}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
            title="Close Compare"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal 3-Column Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Baseline Survey */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1.5 flex flex-col justify-between">
            <label className="text-[10px] text-[#9AA0A6] uppercase font-mono block">
              Baseline Epoch (Epoch A)
            </label>
            <select
              value={compareSettings.baselineYear}
              onChange={(e) => setCompareSettings({ baselineYear: Number(e.target.value) })}
              className="w-full h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[#E3E3E3] text-xs focus:outline-none focus:border-[#8AB4F8]"
            >
              <option value={2010} className="bg-[#1E1F20]">WISE (2010 All-Sky Baseline)</option>
              <option value={2024} className="bg-[#1E1F20]">NEOWISE (2024 Final Baseline)</option>
              <option value={2025} className="bg-[#1E1F20]">SPHEREx QR1 (2025)</option>
              <option value={2026} className="bg-[#1E1F20]">SPHEREx QR2 (Mar 2026)</option>
            </select>
            <span className="text-[10px] text-[#9AA0A6]">Reference historical sky pass</span>
          </div>

          {/* Comparison Survey */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1.5 flex flex-col justify-between">
            <label className="text-[10px] text-[#9AA0A6] uppercase font-mono block">
              Comparison Epoch (Epoch B)
            </label>
            <select
              value={compareSettings.comparisonYear}
              onChange={(e) => setCompareSettings({ comparisonYear: Number(e.target.value) })}
              className="w-full h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[#E3E3E3] text-xs focus:outline-none focus:border-[#8AB4F8]"
            >
              <option value={2026} className="bg-[#1E1F20]">SPHEREx QR3 (Sep 2026 Default)</option>
              <option value={2026.5} className="bg-[#1E1F20]">SPHEREx Survey 2 (Late 2026)</option>
            </select>
            <span className="text-[10px] text-[#9AA0A6]">Target SPHEREx observation epoch</span>
          </div>

          {/* Cross-Dissolve & Apply Button */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#9AA0A6] uppercase font-mono text-[10px]">Cross-Dissolve Blend</span>
              <span className="text-[#8AB4F8] font-bold font-mono">{compareSettings.opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={compareSettings.opacity}
              onChange={(e) => setCompareSettings({ opacity: Number(e.target.value) })}
              className="w-full cursor-pointer"
            />
            <button
              onClick={() => setActiveContextPanel('none')}
              className="w-full py-1.5 rounded-full bg-[#8AB4F8] hover:bg-[#AECBFA] text-[#131314] font-semibold text-xs transition-colors shadow-sm"
            >
              Apply Comparison Layer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. MEASURE MODE (Wide Low-Profile Panoramic Dock)
  if (activeContextPanel === 'measure') {
    return (
      <div
        id="context-panel-measure-dock"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2.5rem)] max-w-[1000px] bg-[#1B1C1D]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4 text-xs font-sans select-none animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-2.5"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#78D9EC]/15 border border-[#78D9EC]/30 flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4 text-[#78D9EC]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E3E3E3] tracking-tight">Measure Distance & Angle</h3>
              <p className="text-[11px] text-[#9AA0A6]">
                Click two celestial coordinates on the sky canvas to calculate great-circle angular separation and position angle.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveContextPanel('none')}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
            title="Close Measure"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal Telemetry Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center">
          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-[#9AA0A6] uppercase font-mono">Separation</span>
            <span className="text-base font-bold font-mono text-[#78D9EC]">4.82 arcsec</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-[#9AA0A6] uppercase font-mono">Degrees</span>
            <span className="text-sm font-bold font-mono text-[#E3E3E3]">0.00134°</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-[#9AA0A6] uppercase font-mono">Position Angle</span>
            <span className="text-sm font-bold font-mono text-[#8AB4F8]">128.4° (East of North)</span>
          </div>

          <button
            onClick={() => setActiveContextPanel('none')}
            className="h-full min-h-[46px] py-2 px-4 rounded-2xl bg-[#8AB4F8]/20 hover:bg-[#8AB4F8]/30 border border-[#8AB4F8]/40 text-[#8AB4F8] font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Done Measuring</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
