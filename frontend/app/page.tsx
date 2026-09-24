'use client';

import React from 'react';
import SkyViewer from '@/components/canvas/SkyViewer';
import GoogleSearchPill from '@/components/shell/GoogleSearchPill';
import TopBrandLogo from '@/components/shell/TopBrandLogo';
import GoogleLayersDrawer from '@/components/shell/GoogleLayersDrawer';
import GoogleVoyagerDrawer from '@/components/shell/GoogleVoyagerDrawer';
import GoogleWavelengthSheet from '@/components/shell/GoogleWavelengthSheet';
import GoogleAgentationDrawer from '@/components/shell/GoogleAgentationDrawer';
import GoogleNavControls from '@/components/shell/GoogleNavControls';
import ContextPanel from '@/components/hud/ContextPanel';
import HelpModal from '@/components/shell/HelpModal';
import BlinkDiffModal from '@/components/hud/BlinkDiffModal';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function SpherexOdysseyApp() {
  const activeTool = useUniverseStore((state) => state.activeTool);
  const setActiveTool = useUniverseStore((state) => state.setActiveTool);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#131314] text-[#E3E3E3] font-google-sans select-none flex flex-col justify-between">
      {/* 1. Fullscreen Edge-to-Edge Celestial Canvas (Google Earth Viewport) */}
      <div className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-[#131314]">
        <SkyViewer />
      </div>

      {/* 2. Floating Google Search Capsule (Top-Left) */}
      <GoogleSearchPill />

      {/* 2b. Light Mode Brand Logo (Top-Middle) */}
      <TopBrandLogo />

      {/* 3. Google Earth Drawers & Sheets */}
      <GoogleLayersDrawer />
      <GoogleVoyagerDrawer />
      <GoogleWavelengthSheet />
      <GoogleAgentationDrawer />

      {/* 4. Google Knowledge Card / Compare / Measure (Top-Right) */}
      <ContextPanel />

      {/* 5. Google Earth Navigation Controls (Bottom-Right) */}
      <GoogleNavControls />

      {/* 6. Fullscreen Tool Modals */}
      {activeTool === 'blink' && <BlinkDiffModal />}

      {/* 7. Contextual Documentation Guide */}
      <HelpModal />
    </main>
  );
}
