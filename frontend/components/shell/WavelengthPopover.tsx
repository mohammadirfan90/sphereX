'use client';

import React, { useMemo } from 'react';
import { X, Waves, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

interface SpectralPreset {
  label: string;
  band: number;
  wavelength: number;
  species: string;
}

const PRESETS: SpectralPreset[] = [
  { label: 'Stellar NIR', band: 13, wavelength: 1.25, species: 'J-Band Continuum' },
  { label: 'H₂ Gas', band: 34, wavelength: 2.12, species: 'Molecular H₂ 1-0 S(1)' },
  { label: 'H₂O Ice', band: 56, wavelength: 3.05, species: 'Interstellar Water-Ice' },
  { label: 'PAH Dust', band: 62, wavelength: 3.30, species: 'Aromatic Hydrocarbons' },
  { label: 'CO₂ Ice', band: 85, wavelength: 4.27, species: 'Solid Carbon Dioxide' },
  { label: 'CO Gas', band: 94, wavelength: 4.67, species: 'Carbon Monoxide Fundamental' },
];

export default function WavelengthPopover() {
  const isWavelengthOpen = useUniverseStore((state) => state.isWavelengthOpen);
  const toggleWavelength = useUniverseStore((state) => state.toggleWavelength);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const setActiveBandIndex = useUniverseStore((state) => state.setActiveBandIndex);

  // Exact SPHEREx channel wavelength in micrometers (0.75 - 5.00 μm across 102 bands)
  const wavelengthUm = useMemo(() => {
    return Number((0.75 + (5.00 - 0.75) * ((activeBandIndex - 1) / 101)).toFixed(3));
  }, [activeBandIndex]);

  // Wavenumber in cm⁻¹
  const wavenumber = useMemo(() => {
    return Math.round(10000 / wavelengthUm);
  }, [wavelengthUm]);

  // Dynamic IR regime detection
  const regime = useMemo(() => {
    if (activeBandIndex <= 32) {
      return { name: 'NIR', full: 'Near-Infrared (0.75–1.45 μm)', color: 'text-[#3159C7]', bg: 'bg-[#3159C7]/20', border: 'border-[#3159C7]' };
    }
    if (activeBandIndex <= 68) {
      return { name: 'SWIR', full: 'Short-Wave IR (1.45–3.10 μm)', color: 'text-[#00A6C7]', bg: 'bg-[#00A6C7]/20', border: 'border-[#00A6C7]' };
    }
    return { name: 'MWIR', full: 'Mid-Wave IR (3.10–5.00 μm)', color: 'text-[#F28C28]', bg: 'bg-[#F28C28]/20', border: 'border-[#F28C28]' };
  }, [activeBandIndex]);

  // SPHEREx 6 Focal Plane Linear Variable Filter (LVF) Arrays with authentic R values
  const lvfArray = useMemo(() => {
    if (activeBandIndex <= 17) return { name: 'LVF 1', range: '0.75–1.10 μm', r: 'R ≈ 39' };
    if (activeBandIndex <= 34) return { name: 'LVF 2', range: '1.10–1.60 μm', r: 'R ≈ 41' };
    if (activeBandIndex <= 51) return { name: 'LVF 3', range: '1.60–2.40 μm', r: 'R ≈ 41' };
    if (activeBandIndex <= 68) return { name: 'LVF 4', range: '2.40–3.80 μm', r: 'R ≈ 35' };
    if (activeBandIndex <= 85) return { name: 'LVF 5', range: '3.80–4.40 μm', r: 'R ≈ 112' };
    return { name: 'LVF 6', range: '4.40–5.00 μm', r: 'R ≈ 128' };
  }, [activeBandIndex]);

  // Real-time molecular feature detection at the current cursor wavelength
  const detectedFeature = useMemo(() => {
    if (wavelengthUm >= 2.98 && wavelengthUm <= 3.12) {
      return { title: 'Water Ice (H₂O) Absorption', desc: 'Interstellar Cloud & Planetary Ice (3.05 μm)' };
    }
    if (wavelengthUm >= 3.26 && wavelengthUm <= 3.36) {
      return { title: 'PAH Hydrocarbon Emission', desc: 'Polycyclic Aromatic Hydrocarbons (3.30 μm)' };
    }
    if (wavelengthUm >= 4.22 && wavelengthUm <= 4.32) {
      return { title: 'Carbon Dioxide (CO₂) Ice', desc: 'Deep Cometary / Circumstellar Feature (4.27 μm)' };
    }
    if (wavelengthUm >= 4.62 && wavelengthUm <= 4.72) {
      return { title: 'Carbon Monoxide (CO) Gas', desc: 'CO Fundamental Vibration-Rotation Band (4.67 μm)' };
    }
    if (wavelengthUm >= 2.08 && wavelengthUm <= 2.16) {
      return { title: 'Molecular Hydrogen (H₂)', desc: 'Shocked Interstellar Gas 1-0 S(1) (2.12 μm)' };
    }
    if (wavelengthUm >= 0.98 && wavelengthUm <= 1.08) {
      return { title: 'Olivine / Silicate 1μm Band', desc: 'Near-Earth Asteroid Mineralogy Diagnostic' };
    }
    return null;
  }, [wavelengthUm]);

  if (!isWavelengthOpen) return null;

  return (
    <div className="absolute top-12 right-12 z-40 w-96 max-w-[calc(100vw-4rem)] bg-[#151922] border border-[#2B3140] rounded shadow-2xl select-none font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#2B3140] bg-[#10131A]">
        <div className="flex items-center gap-2">
          <Waves className="w-3.5 h-3.5 text-[#F28C28]" />
          <span className="font-semibold text-[#F5F7FA]">
            SPHEREx Spectral Tuning (0.75–5.00 μm)
          </span>
        </div>
        <button
          onClick={toggleWavelength}
          className="text-[#A8B0BF] hover:text-[#F5F7FA] p-1 rounded hover:bg-[#2B3140]/60"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3.5 space-y-3">
        {/* Readout stats */}
        <div className="flex items-center justify-between p-2.5 rounded bg-[#10131A] border border-[#2B3140]">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${regime.bg} ${regime.color} ${regime.border}`}>
                Band {activeBandIndex}/102
              </span>
              <span className="text-sm font-mono text-[#F5F7FA] font-bold">
                {wavelengthUm.toFixed(3)} μm
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#A8B0BF] mt-0.5">
              {wavenumber} cm⁻¹ • {regime.name}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono font-semibold text-[#00A6C7]">
              {lvfArray.name} ({lvfArray.r})
            </span>
            <div className="text-[10px] font-mono text-[#A8B0BF] mt-0.5">
              {lvfArray.range}
            </div>
          </div>
        </div>

        {/* Diagnostic Feature Alert */}
        {detectedFeature && (
          <div className="px-2.5 py-1.5 rounded bg-[#00A6C7]/10 border border-[#00A6C7]/40 text-xs text-[#F5F7FA]">
            <div className="font-bold text-[#00A6C7]">{detectedFeature.title}</div>
            <div className="text-[10px] text-[#A8B0BF]">{detectedFeature.desc}</div>
          </div>
        )}

        {/* Dispersion Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#A8B0BF]">
            <span>0.75 μm (LVF 1)</span>
            <span>5.00 μm (LVF 6)</span>
          </div>

          <input
            type="range"
            min={1}
            max={102}
            step={1}
            value={activeBandIndex}
            onChange={(e) => setActiveBandIndex(Number(e.target.value))}
            className="w-full"
            title={`SPHEREx Band ${activeBandIndex} (${wavelengthUm} μm)`}
          />

          <div className="flex items-center justify-between pt-1 font-mono text-[11px]">
            <button
              onClick={() => activeBandIndex > 1 && setActiveBandIndex(activeBandIndex - 1)}
              disabled={activeBandIndex <= 1}
              className="px-2 py-0.5 rounded bg-[#10131A] hover:bg-[#2B3140] border border-[#2B3140] disabled:opacity-30 text-[#F5F7FA] flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" /> Prev Band
            </button>
            <button
              onClick={() => activeBandIndex < 102 && setActiveBandIndex(activeBandIndex + 1)}
              disabled={activeBandIndex >= 102}
              className="px-2 py-0.5 rounded bg-[#10131A] hover:bg-[#2B3140] border border-[#2B3140] disabled:opacity-30 text-[#F5F7FA] flex items-center gap-1"
            >
              Next Band <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Diagnostic Presets */}
        <div className="space-y-1 pt-2 border-t border-[#2B3140]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#A8B0BF]">
            Key Molecular Diagnostics
          </div>
          <div className="grid grid-cols-3 gap-1">
            {PRESETS.map((p) => {
              const isCurrent = activeBandIndex === p.band;
              return (
                <button
                  key={p.label}
                  onClick={() => setActiveBandIndex(p.band)}
                  title={`${p.species} (${p.wavelength} μm)`}
                  className={`px-1.5 py-1 rounded text-[10px] font-mono border text-left transition-colors ${
                    isCurrent
                      ? 'bg-[#3159C7] text-white border-[#3159C7] font-semibold'
                      : 'bg-[#10131A] text-[#A8B0BF] border-[#2B3140] hover:text-[#F5F7FA] hover:bg-[#2B3140]'
                  }`}
                >
                  <div className="truncate font-medium">{p.label}</div>
                  <div className="text-[9px] opacity-75">{p.wavelength} μm</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
