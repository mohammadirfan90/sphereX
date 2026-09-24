'use client';

import React from 'react';
import { Plus, Minus, Compass, Crosshair } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function GoogleNavControls() {
  const coords = useUniverseStore((state) => state.coords);
  const setCoords = useUniverseStore((state) => state.setCoords);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);

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
      if (aladin.view?.wasm?.lockNorthUp) aladin.view.wasm.lockNorthUp();
      if (aladin.view?.wasm?.setInertia) aladin.view.wasm.setInertia(false);
      aladin.lockNorthUp = true;
      if (typeof aladin.gotoPosition === 'function') aladin.gotoPosition(0, 0);
      if (typeof aladin.setFov === 'function') aladin.setFov(130);
    }
    setCoords({ ...coords, ra: 0, dec: 0, fov: 130 });
  };

  const handleCenterTarget = () => {
    if (unifiedObject) {
      setCoords({
        ra: unifiedObject.position.ra_deg,
        dec: unifiedObject.position.dec_deg,
        fov: 1.5,
      });
    }
  };

  return (
    <div className="absolute bottom-10 right-6 z-30 flex flex-col items-end gap-2.5 select-none">
      {/* 1. Compass Button */}
      <button
        onClick={handleResetNorth}
        className="w-10 h-10 rounded-full bg-[#1E1F20]/95 backdrop-blur-xl border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex items-center justify-center text-[#E3E3E3] hover:text-[#8AB4F8] hover:bg-white/10 transition-colors group relative"
        title="Reset Celestial North"
      >
        <Compass className="w-5 h-5 text-[#EA4335] group-hover:rotate-12 transition-transform" />
      </button>

      {/* 3. Re-center Target Button */}
      {unifiedObject && (
        <button
          onClick={handleCenterTarget}
          className="w-10 h-10 rounded-full bg-[#1E1F20]/95 backdrop-blur-xl border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex items-center justify-center text-[#8AB4F8] hover:bg-white/10 transition-colors"
          title={`Center on ${unifiedObject.identity.canonical_name}`}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      )}

      {/* 4. Joined Zoom In / Zoom Out Pill */}
      <div className="w-10 rounded-full bg-[#1E1F20]/95 backdrop-blur-xl border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex flex-col items-center overflow-hidden">
        <button
          onClick={handleZoomIn}
          className="w-10 h-9 flex items-center justify-center text-[#E3E3E3] hover:text-[#8AB4F8] hover:bg-white/10 transition-colors"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-white/10" />
        <button
          onClick={handleZoomOut}
          className="w-10 h-9 flex items-center justify-center text-[#E3E3E3] hover:text-[#8AB4F8] hover:bg-white/10 transition-colors"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
