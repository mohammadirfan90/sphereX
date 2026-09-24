'use client';

import React from 'react';
import { X, Waves, Check, Sparkles } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function GoogleWavelengthSheet() {
  const isWavelengthOpen = useUniverseStore((state) => state.isWavelengthOpen);
  const toggleWavelength = useUniverseStore((state) => state.toggleWavelength);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const setActiveBandIndex = useUniverseStore((state) => state.setActiveBandIndex);

  if (!isWavelengthOpen) return null;

  const minUm = 0.75;
  const maxUm = 5.00;
  const totalBands = 102;
  const wavelengthUm = (minUm + (maxUm - minUm) * ((activeBandIndex - 1) / (totalBands - 1))).toFixed(2);

  // Detector array estimation
  let lvfArray = 'LVF 1–3';
  const wlNum = parseFloat(wavelengthUm);
  if (wlNum < 2.40) lvfArray = 'LVF 1–3 (R≈40)';
  else if (wlNum < 3.80) lvfArray = 'LVF 4 (R≈35)';
  else lvfArray = 'LVF 5–6 (R≈120)';

  // Diagnostic ice lines
  const diagnosticLines = [
    { name: 'Water Ice (H₂O)', wavelength: 3.05, band: 56, color: '#8AB4F8' },
    { name: 'PAH / Organics', wavelength: 3.30, band: 62, color: '#81C995' },
    { name: 'Carbon Dioxide (CO₂)', wavelength: 4.27, band: 85, color: '#FF7563' },
    { name: 'Carbon Monoxide (CO)', wavelength: 4.67, band: 95, color: '#FBBC05' },
  ];

  return (
    <div
      id="google-wavelength-wide-dock"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2.5rem)] max-w-[1240px] bg-[#1B1C1D]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4 select-none animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-3"
    >
      {/* 1. Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#FF7563]/15 border border-[#FF7563]/30 flex items-center justify-center shrink-0">
            <Waves className="w-4 h-4 text-[#FF7563]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#E3E3E3] tracking-tight">Infrared Spectrogram</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-[#9AA0A6]">
                102 Spectral Channels
              </span>
            </div>
            <p className="text-[11px] text-[#9AA0A6] hidden sm:block">
              Continuous Near-IR to Thermal-IR Dispersion (0.75 – 5.00 μm) · Linear Variable Filter (LVF) Arrays
            </p>
          </div>
        </div>

        <button
          onClick={toggleWavelength}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
          title="Close Spectrogram"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Wide 3-Section Horizontal Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-xs">
        {/* Left Section: Active Channel Display (3 cols) */}
        <div className="lg:col-span-3 p-3 rounded-2xl bg-white/[0.04] border border-white/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-[#9AA0A6] uppercase font-mono block">Selected Channel</span>
            <span className="text-xl font-bold font-mono text-[#8AB4F8]">
              {wavelengthUm} <span className="text-xs text-[#9AA0A6]">μm</span>
            </span>
            <span className="text-[10px] text-[#78D9EC] font-mono block mt-0.5">{lvfArray}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[#9AA0A6] uppercase font-mono block">Channel Index</span>
            <span className="text-base font-bold font-mono text-[#E3E3E3]">
              B{activeBandIndex} <span className="text-xs text-[#9AA0A6]">/ 102</span>
            </span>
          </div>
        </div>

        {/* Center Section: Dispersion Slider (5 cols) */}
        <div className="lg:col-span-5 p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2 flex flex-col justify-center">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#9AA0A6]">
            <span>0.75 μm (Near-IR)</span>
            <span className="text-[#8AB4F8] font-bold">Band {activeBandIndex}</span>
            <span>5.00 μm (Thermal-IR)</span>
          </div>
          <div className="relative">
            <div className="h-2.5 rounded-full bg-gradient-to-r from-[#D9381E] via-[#E28743] via-[#8AB4F8] to-[#9C27B0] shadow-inner" />
            <input
              type="range"
              min={1}
              max={102}
              value={activeBandIndex}
              onChange={(e) => setActiveBandIndex(Number(e.target.value))}
              className="w-full cursor-pointer absolute -top-1.5 left-0 opacity-80 hover:opacity-100 transition-opacity"
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-[#9AA0A6]/70">
            <span>LVF 1–3</span>
            <span>LVF 4</span>
            <span>LVF 5–6</span>
          </div>
        </div>

        {/* Right Section: Prebiotic Volatile Ice Chips (4 cols) */}
        <div className="lg:col-span-4 p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-[#9AA0A6] uppercase font-mono tracking-wider">
              Diagnostic Ice Lines
            </span>
            <Sparkles className="w-3 h-3 text-[#FBBC05]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {diagnosticLines.map((line) => (
              <button
                key={line.name}
                onClick={() => setActiveBandIndex(line.band)}
                className={`px-2 py-1.5 rounded-xl border text-left transition-all ${
                  activeBandIndex === line.band
                    ? 'bg-[#8AB4F8]/20 border-[#8AB4F8] text-[#E3E3E3]'
                    : 'bg-white/5 border-white/5 text-[#9AA0A6] hover:bg-white/10 hover:text-[#E3E3E3]'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold text-[10px] text-[#E3E3E3] truncate">{line.name}</span>
                  {activeBandIndex === line.band && <Check className="w-3 h-3 text-[#8AB4F8]" />}
                </div>
                <div className="text-[10px] font-mono font-bold" style={{ color: line.color }}>
                  {line.wavelength} μm
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
