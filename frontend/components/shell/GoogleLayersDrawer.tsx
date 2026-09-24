'use client';

import React from 'react';
import { X, Layers, Orbit, Database, Sliders, Check, Sparkles, Compass } from 'lucide-react';
import { useUniverseStore, GoogleMapStyle } from '@/store/useUniverseStore';

export default function GoogleLayersDrawer() {
  const isMapContentsOpen = useUniverseStore((state) => state.isMapContentsOpen);
  const toggleMapContents = useUniverseStore((state) => state.toggleMapContents);

  const mapStyle = useUniverseStore((state) => state.mapStyle);
  const setMapStyle = useUniverseStore((state) => state.setMapStyle);

  const activeRelease = useUniverseStore((state) => state.activeRelease);
  const setActiveRelease = useUniverseStore((state) => state.setActiveRelease);

  const spherexProducts = useUniverseStore((state) => state.spherexProducts);
  const toggleSpherexProduct = useUniverseStore((state) => state.toggleSpherexProduct);

  const historicalSurveys = useUniverseStore((state) => state.historicalSurveys);
  const toggleHistoricalSurvey = useUniverseStore((state) => state.toggleHistoricalSurvey);

  const solarSystemLayers = useUniverseStore((state) => state.solarSystemLayers);
  const toggleSolarSystemLayer = useUniverseStore((state) => state.toggleSolarSystemLayer);

  const catalogLayers = useUniverseStore((state) => state.catalogLayers);
  const toggleCatalogLayer = useUniverseStore((state) => state.toggleCatalogLayer);

  const scienceLayers = useUniverseStore((state) => state.scienceLayers);
  const toggleScienceLayer = useUniverseStore((state) => state.toggleScienceLayer);

  if (!isMapContentsOpen) return null;

  const styleOptions: { id: GoogleMapStyle; title: string; desc: string }[] = [
    {
      id: 'clean',
      title: 'Clean',
      desc: 'Pure deep-space IR imagery, no labels.',
    },
    {
      id: 'exploration',
      title: 'Exploration',
      desc: 'Major landmark stars, asteroids, and targets.',
    },
    {
      id: 'everything',
      title: 'Everything',
      desc: 'All 102 SPHEREx footprints, JPL & Gaia.',
    },
    {
      id: 'custom',
      title: 'Custom',
      desc: 'Custom astronomical overlay toggles.',
    },
  ];

  return (
    <div
      id="google-layers-wide-dock"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2.5rem)] max-w-[1240px] bg-[#1B1C1D]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4 select-none animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-3"
    >
      {/* 1. Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#8AB4F8]/15 border border-[#8AB4F8]/30 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-[#8AB4F8]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#E3E3E3] tracking-tight">Map Style & Layers</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-[#9AA0A6]">
                All-Sky Overlays
              </span>
            </div>
            <p className="text-[11px] text-[#9AA0A6] hidden sm:block">
              Astronomical Catalogs, SPHEREx Mission Releases & Multi-Epoch Survey Overlays
            </p>
          </div>
        </div>

        <button
          onClick={toggleMapContents}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
          title="Close Layers"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Wide Horizontal 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Column 1: Google Map Styles */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2 flex flex-col justify-between">
          <span className="text-[10px] text-[#9AA0A6] uppercase font-mono tracking-wider block">
            Google Map Styles
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {styleOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMapStyle(opt.id)}
                className={`p-2 rounded-xl border text-left transition-all relative ${
                  mapStyle === opt.id
                    ? 'bg-[#8AB4F8]/20 border-[#8AB4F8] text-[#E3E3E3]'
                    : 'bg-white/5 border-white/5 text-[#9AA0A6] hover:bg-white/10 hover:text-[#E3E3E3]'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-[11px] text-[#E3E3E3]">{opt.title}</span>
                  {mapStyle === opt.id && <Check className="w-3 h-3 text-[#8AB4F8]" />}
                </div>
                <p className="text-[9px] text-[#9AA0A6] leading-tight line-clamp-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Column 2: SPHEREx Mission Epoch & Baselines */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2 flex flex-col justify-between">
          <span className="text-[10px] text-[#9AA0A6] uppercase font-mono tracking-wider block">
            Mission Epoch & Baselines
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'qr3', label: 'QR3 (Sep 2026)', desc: '102-Band Calibrated' },
              { id: 'qr2', label: 'QR2 (Mar 2026)', desc: 'Quick Release 2' },
            ].map((rel) => (
              <button
                key={rel.id}
                onClick={() => setActiveRelease(rel.id as any)}
                className={`p-2 rounded-xl border text-left transition-all ${
                  activeRelease === rel.id
                    ? 'bg-[#8AB4F8]/20 border-[#8AB4F8] text-[#8AB4F8] font-semibold'
                    : 'bg-white/5 border-white/5 text-[#9AA0A6] hover:bg-white/10'
                }`}
              >
                <div className="text-[11px] font-bold text-[#E3E3E3]">{rel.label}</div>
                <div className="text-[9px] text-[#9AA0A6]">{rel.desc}</div>
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 cursor-pointer">
            <div>
              <span className="text-[11px] font-medium text-[#E3E3E3] block">SPHEREx QR2 Baseline Overlay</span>
              <span className="text-[9px] text-[#9AA0A6]">6-month calibrated temporal diff</span>
            </div>
            <input
              type="checkbox"
              checked={spherexProducts.imagery}
              onChange={() => toggleSpherexProduct('imagery')}
              className="w-3.5 h-3.5 rounded accent-[#8AB4F8] cursor-pointer"
            />
          </label>
        </div>

        {/* Column 3: SPHEREx Mission Overlays */}
        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1.5 flex flex-col justify-between">
          <span className="text-[10px] text-[#9AA0A6] uppercase font-mono tracking-wider block">
            SPHEREx Mission Overlays
          </span>

          <div className="space-y-1">
            <label className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer">
              <span className="text-[11px] text-[#E3E3E3]">SPHEREx 6-Detector Footprints</span>
              <input
                type="checkbox"
                checked={spherexProducts.footprints}
                onChange={() => toggleSpherexProduct('footprints')}
                className="w-3.5 h-3.5 rounded accent-[#8AB4F8] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer">
              <span className="text-[11px] text-[#E3E3E3]">SPHEREx Source Spectrophotometry</span>
              <input
                type="checkbox"
                checked={spherexProducts.sourceMarkers}
                onChange={() => toggleSpherexProduct('sourceMarkers')}
                className="w-3.5 h-3.5 rounded accent-[#8AB4F8] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer">
              <span className="text-[11px] text-[#E3E3E3]">Molecular Ice Features (3.05 μm H₂O)</span>
              <input
                type="checkbox"
                checked={scienceLayers.spectralFeatures}
                onChange={() => toggleScienceLayer('spectralFeatures')}
                className="w-3.5 h-3.5 rounded accent-[#8AB4F8] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer">
              <span className="text-[11px] text-[#E3E3E3]">SPHEREx 102-Band Wavelength View</span>
              <input
                type="checkbox"
                checked={spherexProducts.wavelengthView}
                onChange={() => toggleSpherexProduct('wavelengthView')}
                className="w-3.5 h-3.5 rounded accent-[#8AB4F8] cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
