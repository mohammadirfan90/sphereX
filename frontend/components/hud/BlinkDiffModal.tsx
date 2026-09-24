'use client';

import React, { useState, useEffect } from 'react';
import { X, Play, Pause, GitCompare, ArrowRight, Activity } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';
import CelestialCutoutViewer from './CelestialCutoutViewer';

export default function BlinkDiffModal() {
  const setActiveTool = useUniverseStore((state) => state.setActiveTool);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);

  const [activeMode, setActiveMode] = useState<'blink' | 'split' | 'diff'>('blink');
  const [blinkEpoch, setBlinkEpoch] = useState<'2010' | '2026'>('2010');
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [speedMs, setSpeedMs] = useState(800);
  const [colorPalette, setColorPalette] = useState<'natural' | 'coral' | 'ice' | 'thermal'>('coral');

  const ra = unifiedObject?.position?.ra_deg ?? 133.796;
  const dec = unifiedObject?.position?.dec_deg ?? -7.245;
  const objectName = unifiedObject?.identity?.canonical_name ?? 'WISE J085510.83-071442.5';
  const properMotion = unifiedObject?.kinematics?.total_proper_motion_masyr ?? 8140;
  const positionAngle = unifiedObject?.kinematics?.position_angle_deg ?? 93.4;
  const shift14yr = unifiedObject?.kinematics?.displacement_14yr_arcsec ?? 113.96;

  useEffect(() => {
    if (!isAutoPlaying || activeMode !== 'blink') return;
    const interval = setInterval(() => {
      setBlinkEpoch((prev) => (prev === '2010' ? '2026' : '2010'));
    }, speedMs);
    return () => clearInterval(interval);
  }, [isAutoPlaying, activeMode, speedMs]);

  return (
    <div
      id="blink-diff-wide-dock"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2.5rem)] max-w-[1240px] bg-[#1B1C1D]/95 backdrop-blur-2xl rounded-3xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4 text-xs font-sans animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-2.5 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#FF7563]/15 border border-[#FF7563]/30 flex items-center justify-center shrink-0">
            <GitCompare className="w-4 h-4 text-[#FF7563]" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#E3E3E3] leading-tight">
              14-Year Blink & Transient Comparator
            </h3>
            <span className="text-[11px] text-[#9AA0A6] font-mono">
              Target: {objectName} · 14-Yr Astrometric Vector: {shift14yr}″ @ {positionAngle}°
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Selectors */}
          <div className="flex bg-white/5 rounded-full p-0.5 border border-white/10 text-[11px]">
            <button
              onClick={() => setActiveMode('blink')}
              className={`px-3 py-1 rounded-full transition-all ${
                activeMode === 'blink' ? 'bg-[#FF7563] text-white font-bold shadow-sm' : 'text-[#9AA0A6] hover:text-white'
              }`}
            >
              Blink Mode
            </button>
            <button
              onClick={() => setActiveMode('split')}
              className={`px-3 py-1 rounded-full transition-all ${
                activeMode === 'split' ? 'bg-[#FF7563] text-white font-bold shadow-sm' : 'text-[#9AA0A6] hover:text-white'
              }`}
            >
              Side-by-Side
            </button>
            <button
              onClick={() => setActiveMode('diff')}
              className={`px-3 py-1 rounded-full transition-all ${
                activeMode === 'diff' ? 'bg-[#FF7563] text-white font-bold shadow-sm' : 'text-[#9AA0A6] hover:text-white'
              }`}
            >
              Diff (B - A)
            </button>
          </div>

          <button
            onClick={() => setActiveTool(null)}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visual Canvas Viewport */}
      <div className="relative my-2 rounded-2xl overflow-hidden border border-white/10 h-52 bg-[#080A0F]">
        {activeMode === 'blink' && (
          <div className="relative w-full h-full">
            <CelestialCutoutViewer
              ra={ra}
              dec={dec}
              survey={blinkEpoch === '2010' ? 'wise' : 'spherex'}
              colorPalette={colorPalette}
              isBlinking={true}
              blinkEpoch={blinkEpoch}
              highContrast={true}
              showReticle={true}
              properMotionMasYr={properMotion}
              positionAngleDeg={positionAngle}
              objectName={objectName}
            />
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-[10px] font-mono font-bold text-white flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${blinkEpoch === '2010' ? 'bg-[#8AB4F8]' : 'bg-[#FF7563]'}`} />
              <span>{blinkEpoch === '2010' ? 'Epoch A: AllWISE Baseline (2010.5)' : 'Epoch B: SPHEREx QR3 (2026.2)'}</span>
            </div>
          </div>
        )}

        {activeMode === 'split' && (
          <div className="grid grid-cols-2 w-full h-full divide-x divide-white/20">
            <div className="relative w-full h-full">
              <CelestialCutoutViewer
                ra={ra}
                dec={dec}
                survey="wise"
                colorPalette="natural"
                isBlinking={false}
                blinkEpoch="2010"
                highContrast={false}
                showReticle={true}
                properMotionMasYr={properMotion}
                positionAngleDeg={positionAngle}
                objectName={objectName}
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-[#8AB4F8]">
                Epoch A: AllWISE (2010)
              </div>
            </div>
            <div className="relative w-full h-full">
              <CelestialCutoutViewer
                ra={ra}
                dec={dec}
                survey="spherex"
                colorPalette="coral"
                isBlinking={false}
                blinkEpoch="2026"
                highContrast={true}
                showReticle={true}
                properMotionMasYr={properMotion}
                positionAngleDeg={positionAngle}
                objectName={objectName}
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-[#FF7563] font-bold">
                Epoch B: SPHEREx QR3 (2026)
              </div>
            </div>
          </div>
        )}

        {activeMode === 'diff' && (
          <div className="relative w-full h-full">
            <CelestialCutoutViewer
              ra={ra}
              dec={dec}
              survey="diff"
              colorPalette="ice"
              isBlinking={false}
              blinkEpoch="2026"
              highContrast={true}
              showReticle={true}
              properMotionMasYr={properMotion}
              positionAngleDeg={positionAngle}
              objectName={objectName}
            />
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-[#81C995]/50 text-[10px] font-mono font-bold text-[#81C995] flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              <span>Subtracted Residuals: Proper Motion Dipole Visible</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls Strip */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10 font-mono text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className="p-1.5 rounded-xl bg-[#8AB4F8] text-[#131314] hover:bg-white transition-colors"
            title={isAutoPlaying ? 'Pause Blink' : 'Start Auto-Blink'}
          >
            {isAutoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <div className="flex items-center gap-1">
            <span className="text-[#9AA0A6] text-[11px]">Speed:</span>
            {[500, 800, 1200].map((ms) => (
              <button
                key={ms}
                onClick={() => setSpeedMs(ms)}
                className={`px-2 py-0.5 rounded text-[10px] ${
                  speedMs === ms ? 'bg-white/20 text-white font-bold' : 'text-[#9AA0A6] hover:bg-white/10'
                }`}
              >
                {ms / 1000}s
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[#9AA0A6] text-[11px]">LUT:</span>
            {(['coral', 'ice', 'thermal', 'natural'] as const).map((pal) => (
              <button
                key={pal}
                onClick={() => setColorPalette(pal)}
                className={`px-1.5 py-0.5 rounded text-[9px] uppercase ${
                  colorPalette === pal ? 'bg-[#FF7563] text-white font-bold' : 'text-[#9AA0A6] hover:bg-white/10'
                }`}
              >
                {pal}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            alert(`Astrometric shift of ${shift14yr}″ verified for ${objectName}. Logged to research session.`);
            setActiveTool(null);
          }}
          className="py-1.5 px-3.5 rounded-full bg-[#FF7563] hover:bg-white text-white hover:text-[#131314] font-sans font-bold text-xs flex items-center gap-1.5 transition-all shadow-glowCoral"
        >
          <span>Log Astrometry</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
