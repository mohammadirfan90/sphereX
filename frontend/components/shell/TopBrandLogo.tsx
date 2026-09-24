'use client';

import React from 'react';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function TopBrandLogo() {
  const setCoords = useUniverseStore((state) => state.setCoords);
  const setUnifiedObject = useUniverseStore((state) => state.setUnifiedObject);

  const handleLogoClick = () => {
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
    setCoords({ ra: 0, dec: 0, fov: 130 });
    setUnifiedObject(null);
  };

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto select-none flex items-center justify-center"
      title="SPHEREx Odyssey - Click to Reset View"
    >
      <button
        onClick={handleLogoClick}
        className="flex items-center focus:outline-none cursor-pointer group p-1 transition-transform"
      >
        <img
          src="/logo-light.png"
          alt="SPHEREx Odyssey"
          className="h-8 sm:h-9 w-auto object-contain filter drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] group-hover:scale-105 group-hover:opacity-95 transition-all"
        />
      </button>
    </div>
  );
}
