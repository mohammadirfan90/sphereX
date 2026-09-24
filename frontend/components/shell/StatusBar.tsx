'use client';

import React from 'react';
import { Compass, Plus, Minus, Grid, Globe, Layers } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';
import { CelestialFrame, formatMultiFrameCoordinates } from '@/lib/astronomicalCoordinates';

export default function StatusBar() {
  const activeRelease = useUniverseStore((state) => state.activeRelease);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const coords = useUniverseStore((state) => state.coords);
  const setCoords = useUniverseStore((state) => state.setCoords);
  const coordinateFrame = useUniverseStore((state) => state.coordinateFrame);
  const setCoordinateFrame = useUniverseStore((state) => state.setCoordinateFrame);
  const activeProjection = useUniverseStore((state) => state.activeProjection);
  const setActiveProjection = useUniverseStore((state) => state.setActiveProjection);
  const cursorCoords = useUniverseStore((state) => state.cursorCoords);
  const isCooGridVisible = useUniverseStore((state) => state.isCooGridVisible);
  const toggleCooGrid = useUniverseStore((state) => state.toggleCooGrid);
  const activeObservationEpoch = useUniverseStore((state) => state.activeObservationEpoch);

  // Exact instrument array characteristics
  const getArrayMeta = (ch: number) => {
    if (ch <= 17) return { lvf: 'LVF 1', wl: (0.75 + (ch - 1) * (0.35 / 17)).toFixed(2), R: 39 };
    if (ch <= 34) return { lvf: 'LVF 2', wl: (1.10 + (ch - 18) * (0.50 / 16)).toFixed(2), R: 41 };
    if (ch <= 51) return { lvf: 'LVF 3', wl: (1.60 + (ch - 35) * (0.80 / 16)).toFixed(2), R: 41 };
    if (ch <= 68) return { lvf: 'LVF 4', wl: (2.40 + (ch - 52) * (1.40 / 16)).toFixed(2), R: 35 };
    if (ch <= 85) return { lvf: 'LVF 5', wl: (3.80 + (ch - 69) * (0.60 / 16)).toFixed(2), R: 112 };
    return { lvf: 'LVF 6', wl: (4.40 + (ch - 86) * (0.60 / 16)).toFixed(2), R: 128 };
  };

  const meta = getArrayMeta(activeBandIndex);

  // Fallback multi-frame coordinates for viewport center when cursor is idle
  const centerMulti = formatMultiFrameCoordinates(coords.ra, coords.dec);
  const displayCoords = cursorCoords || centerMulti;

  const handleZoomIn = () => {
    const aladin = typeof window !== 'undefined' ? (window as any).__aladin : null;
    if (aladin && typeof aladin.setFov === 'function' && typeof aladin.getFov === 'function') {
      const currentFov = aladin.getFov()[0] || coords.fov;
      const nextFov = Math.max(0.05, Number((currentFov * 0.65).toFixed(3)));
      aladin.setFov(nextFov);
      setCoords({ ...coords, fov: nextFov });
    } else {
      setCoords({ ...coords, fov: Math.max(0.05, Number((coords.fov * 0.65).toFixed(3))) });
    }
  };

  const handleZoomOut = () => {
    const aladin = typeof window !== 'undefined' ? (window as any).__aladin : null;
    if (aladin && typeof aladin.setFov === 'function' && typeof aladin.getFov === 'function') {
      const currentFov = aladin.getFov()[0] || coords.fov;
      const nextFov = Math.min(135.0, Number((currentFov * 1.4).toFixed(3)));
      aladin.setFov(nextFov);
      setCoords({ ...coords, fov: nextFov });
    } else {
      setCoords({ ...coords, fov: Math.min(135.0, Number((coords.fov * 1.4).toFixed(3))) });
    }
  };

  const handleResetNorth = () => {
    const aladin = typeof window !== 'undefined' ? (window as any).__aladin : null;
    if (aladin) {
      if (typeof aladin.setProjection === 'function') aladin.setProjection('MER');
      if (typeof aladin.setFrame === 'function') aladin.setFrame('Galactic');
      if (aladin.view?.wasm?.setRotation) aladin.view.wasm.setRotation(0);
      if (typeof aladin.setRotation === 'function') aladin.setRotation(0);
      if (aladin.view?.wasm?.lockNorthUp) aladin.view.wasm.lockNorthUp();
      if (aladin.view?.wasm?.setInertia) aladin.view.wasm.setInertia(false);
      aladin.lockNorthUp = true;
      if (typeof aladin.gotoPosition === 'function') aladin.gotoPosition(0, 0);
      if (typeof aladin.setFov === 'function') aladin.setFov(130);
    }
    setCoords({ ...coords, ra: 0, dec: 0, fov: 130 });
  };

  return (
    <footer className="absolute bottom-0 inset-x-0 z-30 h-8 shrink-0 bg-[#0d1017]/95 backdrop-blur-md border-t border-white/10 px-3 flex items-center justify-between text-[11px] font-mono text-[#9aa0a6] select-none">
      {/* 1. Left: Mission status, spectral channel, and live celestial coordinates */}
      <div className="flex items-center gap-2.5 truncate">
        {/* Mission Release Badge */}
        <span className="text-[#f8f9fa] font-medium flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#81c995]" />
          SPHEREx {activeRelease.toUpperCase()}
        </span>

        <span className="opacity-30">·</span>

        {/* Spectral Band */}
        <span className="hidden sm:inline text-[#8ab4f8] shrink-0">
          λ {meta.wl} μm ({meta.lvf}, R={meta.R})
        </span>

        <span className="opacity-30">·</span>

        {/* Live Coordinate Readout (ICRS) */}
        <div className="flex items-center gap-1.5 text-[#f8f9fa] shrink-0">
          <span className="text-[#9aa0a6]">ICRS</span>
          <span className="text-[#8ab4f8] font-semibold">{displayCoords.icrs.ra_hms}</span>
          <span className="text-[#8ab4f8] font-semibold">{displayCoords.icrs.dec_dms}</span>
          <span className="hidden md:inline text-[10px] text-[#9aa0a6]">
            ({displayCoords.icrs.ra_deg.toFixed(4)}°, {displayCoords.icrs.dec_deg.toFixed(4)}°)
          </span>
        </div>

        <span className="opacity-30">·</span>

        {/* Active Celestial Frame Coords */}
        <div className="hidden lg:flex items-center gap-1.5 text-[#e3e3e3] shrink-0">
          {coordinateFrame === 'Galactic' && (
            <span className="text-[#c58af9] font-medium">{displayCoords.galactic.formatted}</span>
          )}
          {coordinateFrame === 'Ecliptic' && (
            <span className="text-[#fdd663] font-medium">{displayCoords.ecliptic.formatted}</span>
          )}
          {coordinateFrame === 'ICRS' && (
            <span className="text-[#81c995] font-medium">J2000.0 Barycentric</span>
          )}
        </div>

        <span className="opacity-30">·</span>

        {/* Field of View */}
        <span className="hidden xl:inline text-[#9aa0a6] shrink-0">
          FOV <strong className="text-[#f8f9fa] font-semibold">{coords.fov.toFixed(2)}°</strong>
        </span>

        {/* Epistemic Status Tag */}
        <span className="hidden 2xl:inline px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-[#8ab4f8]/10 text-[#8ab4f8] border border-[#8ab4f8]/25 shrink-0">
          DERIVED COORD
        </span>
      </div>

      {/* 2. Right: Interactive Scientific State Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Celestial Frame Selector */}
        <div className="flex items-center rounded bg-white/5 border border-white/10 p-0.5 text-[10px]">
          {(['ICRS', 'Galactic', 'Ecliptic'] as CelestialFrame[]).map((frame) => (
            <button
              key={frame}
              onClick={() => setCoordinateFrame(frame)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                coordinateFrame === frame
                  ? 'bg-[#8ab4f8] text-[#0d1017] font-semibold'
                  : 'text-[#9aa0a6] hover:text-[#f8f9fa]'
              }`}
              title={`Switch canonical celestial display to ${frame}`}
            >
              {frame}
            </button>
          ))}
        </div>

        {/* Projection Selector */}
        <div className="hidden sm:flex items-center rounded bg-white/5 border border-white/10 p-0.5 text-[10px]">
          {[
            { id: 'MER', label: 'MER' },
            { id: 'AIT', label: 'AIT' },
            { id: 'MOL', label: 'MOL' },
            { id: 'SIN', label: 'SIN' },
          ].map((proj) => (
            <button
              key={proj.id}
              onClick={() => setActiveProjection(proj.id)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                activeProjection === proj.id
                  ? 'bg-[#c58af9] text-[#0d1017] font-semibold'
                  : 'text-[#9aa0a6] hover:text-[#f8f9fa]'
              }`}
              title={`Projection: ${proj.label}`}
            >
              {proj.label}
            </button>
          ))}
        </div>

        {/* Coordinate Grid Toggle */}
        <button
          onClick={toggleCooGrid}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
            isCooGridVisible
              ? 'bg-[#8ab4f8]/15 border-[#8ab4f8]/40 text-[#8ab4f8]'
              : 'bg-white/5 border-white/10 text-[#9aa0a6] hover:text-[#f8f9fa]'
          }`}
          title="Toggle Mathematical Astronomical Grid"
        >
          <Grid className="w-3 h-3" />
          <span className="hidden md:inline font-medium">GRID</span>
        </button>

        {/* Navigation Zoom / North Controls */}
        <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
          <button
            onClick={handleResetNorth}
            title="Reset Celestial North"
            className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-[#8ab4f8] hover:text-[#f8f9fa] transition-colors"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-[#9aa0a6] hover:text-[#f8f9fa] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-[#9aa0a6] hover:text-[#f8f9fa] transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}
