'use client';

import React, { useState } from 'react';
import {
  Compass,
  Calendar,
  Layers,
  Waves,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  Crosshair,
  Sparkles,
  Sliders,
  Maximize2,
  Scan,
  Download,
  Info,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';
import { TIMELINE_EPOCHS } from '@/lib/surveyEpochs';

export type ConsoleMode = 'EXPLORE' | 'COMPARE' | 'MEASURE' | 'DISCOVER';

export default function BottomCommandConsole() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeMode, setActiveMode] = useState<ConsoleMode>('EXPLORE');

  // Store bindings
  const coords = useUniverseStore((state) => state.coords);
  const activeRelease = useUniverseStore((state) => state.activeRelease);
  const setActiveRelease = useUniverseStore((state) => state.setActiveRelease);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const setActiveBandIndex = useUniverseStore((state) => state.setActiveBandIndex);
  const observationYear = useUniverseStore((state) => state.observationYear);
  const setObservationYear = useUniverseStore((state) => state.setObservationYear);
  const isTimelinePlaying = useUniverseStore((state) => state.isTimelinePlaying);
  const setIsTimelinePlaying = useUniverseStore((state) => state.setIsTimelinePlaying);
  const toggleWavelength = useUniverseStore((state) => state.toggleWavelength);
  const toggleMapContents = useUniverseStore((state) => state.toggleMapContents);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);
  const setActiveContextPanel = useUniverseStore((state) => state.setActiveContextPanel);
  const setActiveTool = useUniverseStore((state) => state.setActiveTool);

  // Band characteristics (LVF Arrays 1-6)
  const getBandInfo = (index: number) => {
    if (index <= 17) return { array: 'LVF 1', range: '0.75 – 1.10 μm', R: 39 };
    if (index <= 34) return { array: 'LVF 2', range: '1.10 – 1.60 μm', R: 41 };
    if (index <= 51) return { array: 'LVF 3', range: '1.60 – 2.40 μm', R: 41 };
    if (index <= 68) return { array: 'LVF 4', range: '2.40 – 3.80 μm', R: 35 };
    if (index <= 85) return { array: 'LVF 5', range: '3.80 – 4.40 μm', R: 112 };
    return { array: 'LVF 6', range: '4.40 – 5.00 μm', R: 128 };
  };

  const bandInfo = getBandInfo(activeBandIndex);
  const currentWavelengthUm = (0.75 + (activeBandIndex - 1) * ((5.00 - 0.75) / 101)).toFixed(2);

  // Convert decimal degrees to sexagesimal for display
  const toSexagesimal = (raDeg: number, decDeg: number) => {
    const raH = Math.floor(raDeg / 15);
    const raM = Math.floor((raDeg / 15 - raH) * 60);
    const raS = ((raDeg / 15 - raH) * 60 - raM) * 60;
    const decSign = decDeg >= 0 ? '+' : '-';
    const absDec = Math.abs(decDeg);
    const decD = Math.floor(absDec);
    const decM = Math.floor((absDec - decD) * 60);
    const decS = ((absDec - decD) * 60 - decM) * 60;
    return `${raH.toString().padStart(2, '0')}:${raM.toString().padStart(2, '0')}:${raS.toFixed(1).padStart(4, '0')} ${decSign}${decD.toString().padStart(2, '0')}:${decM.toString().padStart(2, '0')}:${decS.toFixed(1).padStart(4, '0')}`;
  };

  return (
    <div
      id="bottom-command-console"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[1320px] px-3 pb-2 transition-all duration-300 select-none pointer-events-none"
    >
      <div className="bg-[#12151c] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-2.5 text-xs text-[#E3E3E3] pointer-events-auto flex flex-col gap-2">
        {/* Console Header / Mode Switcher */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
          {/* Modes Tabs */}
          <div className="flex items-center gap-1">
            {(['EXPLORE', 'COMPARE', 'MEASURE', 'DISCOVER'] as ConsoleMode[]).map((mode) => {
              const isActive = activeMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => {
                    setActiveMode(mode);
                    if (mode === 'COMPARE') setActiveContextPanel('compare');
                    else if (mode === 'MEASURE') setActiveContextPanel('measure');
                    else if (mode === 'EXPLORE') setActiveContextPanel(unifiedObject ? 'object' : 'none');
                  }}
                  className={`px-3 py-1 rounded-lg font-sans font-bold text-[11px] tracking-wider transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#8ab4f8] text-[#0d111a] shadow-sm'
                      : 'text-[#9aa0a6] hover:text-[#f8f9fa] hover:bg-white/[0.06]'
                  }`}
                >
                  {mode === 'EXPLORE' && <Compass className="w-3.5 h-3.5" />}
                  {mode === 'COMPARE' && <Sliders className="w-3.5 h-3.5" />}
                  {mode === 'MEASURE' && <Scan className="w-3.5 h-3.5" />}
                  {mode === 'DISCOVER' && <Sparkles className="w-3.5 h-3.5" />}
                  <span>{mode}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Context & Expand/Collapse */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-[#9aa0a6]">
              <span className="w-2 h-2 rounded-full bg-[#81c995] animate-pulse" />
              <span>SPHEREx {activeRelease.toUpperCase()} Active</span>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-lg hover:bg-white/10 text-[#9aa0a6] hover:text-[#f8f9fa] transition-colors"
              title={isExpanded ? 'Collapse Console' : 'Expand Console'}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Console Body */}
        {isExpanded && (
          <div className="flex flex-col gap-2.5 pt-0.5">
            {/* Dimensions Grid: WHERE | WHEN | WHAT | LIGHT | TOOLS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono text-[11px]">
              {/* 1. WHERE */}
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[#9aa0a6] text-[10px] font-sans font-bold uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1 text-[#8ab4f8]">
                    <Crosshair className="w-3 h-3" /> WHERE
                  </span>
                  <span>J2000</span>
                </div>
                <div className="text-[#f8f9fa] font-bold text-xs truncate">
                  {coords.ra.toFixed(3)}°, {coords.dec.toFixed(3)}°
                </div>
                <div className="text-[10px] text-[#9aa0a6] truncate mt-0.5">
                  FOV: {coords.fov.toFixed(1)}° · {toSexagesimal(coords.ra, coords.dec)}
                </div>
              </div>

              {/* 2. WHEN */}
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[#9aa0a6] text-[10px] font-sans font-bold uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1 text-[#ff7563]">
                    <Calendar className="w-3 h-3" /> WHEN
                  </span>
                  <span>Observation</span>
                </div>
                <div className="text-[#f8f9fa] font-bold text-xs">
                  {observationYear.toFixed(2)} Epoch
                </div>
                <div className="text-[10px] text-[#9aa0a6] truncate mt-0.5">
                  15 Sep 2026 (SPHEREx QR3)
                </div>
              </div>

              {/* 3. WHAT */}
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[#9aa0a6] text-[10px] font-sans font-bold uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1 text-[#81c995]">
                    <Layers className="w-3 h-3" /> WHAT
                  </span>
                  <button
                    onClick={toggleMapContents}
                    className="hover:underline text-[10px] text-[#8ab4f8]"
                  >
                    Layers
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#f8f9fa]">
                  <span>SPHEREx {activeRelease.toUpperCase()}</span>
                  <div className="flex gap-1 ml-auto">
                    <button
                      onClick={() => setActiveRelease('qr3')}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        activeRelease === 'qr3' ? 'bg-[#8ab4f8] text-[#0d111a]' : 'bg-white/10 text-[#9aa0a6]'
                      }`}
                    >
                      QR3
                    </button>
                    <button
                      onClick={() => setActiveRelease('qr2')}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        activeRelease === 'qr2' ? 'bg-[#8ab4f8] text-[#0d111a]' : 'bg-white/10 text-[#9aa0a6]'
                      }`}
                    >
                      QR2
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-[#9aa0a6] truncate mt-0.5">
                  DOI: {activeRelease === 'qr3' ? '10.26131/IRSA662' : '10.26131/IRSA652'}
                </div>
              </div>

              {/* 4. LIGHT */}
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[#9aa0a6] text-[10px] font-sans font-bold uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1 text-[#fdd663]">
                    <Waves className="w-3 h-3" /> LIGHT
                  </span>
                  <button
                    onClick={toggleWavelength}
                    className="hover:underline text-[10px] text-[#8ab4f8]"
                  >
                    Bands
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-[#f8f9fa]">
                  <span>λ {currentWavelengthUm} μm</span>
                  <span className="text-[10px] text-[#fdd663] bg-[#fdd663]/10 px-1.5 py-0.5 rounded border border-[#fdd663]/20">
                    {bandInfo.array}
                  </span>
                </div>
                <div className="text-[10px] text-[#9aa0a6] truncate mt-0.5">
                  R={bandInfo.R} · Ch #{activeBandIndex}/102
                </div>
              </div>

              {/* 5. TOOLS */}
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between col-span-2 md:col-span-1">
                <div className="flex items-center justify-between text-[#9aa0a6] text-[10px] font-sans font-bold uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1 text-[#d93025]">
                    <Activity className="w-3 h-3" /> TOOLS
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTool('blink')}
                    className="flex-1 py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-[#f8f9fa] text-[10px] font-bold transition-colors text-center"
                    title="Blink & Difference Comparison"
                  >
                    Blink
                  </button>
                  <button
                    onClick={() => setActiveContextPanel('object')}
                    className="flex-1 py-1 rounded bg-[#8ab4f8]/20 hover:bg-[#8ab4f8] text-[#8ab4f8] hover:text-[#0d111a] text-[10px] font-bold transition-colors text-center"
                    title="Spectral Inspector"
                  >
                    Inspect
                  </button>
                </div>
                <div className="text-[10px] text-[#9aa0a6] truncate mt-0.5">
                  {unifiedObject ? unifiedObject.identity.canonical_name : 'Click target or search'}
                </div>
              </div>
            </div>

            {/* Integrated Authentic Observation Timeline Scrubber */}
            <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsTimelinePlaying(!isTimelinePlaying)}
                    className="w-5 h-5 rounded-full bg-white/10 hover:bg-[#8ab4f8] text-[#f8f9fa] hover:text-[#0d111a] flex items-center justify-center transition-colors"
                    title={isTimelinePlaying ? 'Pause Time-Lapse' : 'Play Time-Lapse'}
                  >
                    {isTimelinePlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                  </button>
                  <span className="text-[11px] font-sans font-semibold text-[#f8f9fa]">
                    SPHEREx Survey Releases
                  </span>
                  <span className="text-[10px] font-mono text-[#9aa0a6]">
                    (QR2 – QR3)
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono text-[10px] text-[#9aa0a6]">
                  <span>Active:</span>
                  <span className="text-[#8ab4f8] font-bold">
                    {TIMELINE_EPOCHS.find((e) => Math.abs(e.year - observationYear) < 0.6)?.label || `${observationYear.toFixed(1)}`}
                  </span>
                </div>
              </div>

              {/* Epoch Ticks Bar */}
              <div className="grid grid-cols-2 gap-1 pt-0.5">
                {TIMELINE_EPOCHS.map((epoch) => {
                  const isSelected = Math.abs(epoch.year - observationYear) < 0.5;
                  return (
                    <button
                      key={epoch.id}
                      onClick={() => setObservationYear(epoch.year)}
                      className={`px-2 py-1 rounded-lg text-left transition-all flex flex-col ${
                        isSelected
                          ? 'bg-[#8ab4f8]/20 border border-[#8ab4f8]/60 text-[#f8f9fa]'
                          : 'bg-white/[0.02] border border-white/5 text-[#9aa0a6] hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold leading-tight truncate">
                        {epoch.label}
                      </span>
                      <span className="text-[9px] font-sans truncate text-[#8ab4f8]">
                        {epoch.doi}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
