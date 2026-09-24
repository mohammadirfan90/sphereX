'use client';

import React, { useState, useEffect } from 'react';
import { useUniverseStore } from '@/store/useUniverseStore';
import ObjectHeader from '@/components/hud/inspector/ObjectHeader';
import CoordinatesSection from '@/components/hud/inspector/CoordinatesSection';
import ObservationSection from '@/components/hud/inspector/ObservationSection';
import SpectrumSection from '@/components/hud/inspector/SpectrumSection';
import MotionSection from '@/components/hud/inspector/MotionSection';
import HistoricalSection from '@/components/hud/inspector/HistoricalSection';
import ProvenanceSection from '@/components/hud/inspector/ProvenanceSection';
import SciencePacketExport from '@/components/hud/inspector/SciencePacketExport';
import CelestialCutoutViewer from '@/components/hud/CelestialCutoutViewer';
import {
  Compass,
  BarChart3,
  Clock,
  Database,
  Download,
  Orbit,
  Crosshair,
} from 'lucide-react';

export default function GoogleKnowledgePanel() {
  const activeContextPanel = useUniverseStore((state) => state.activeContextPanel);
  const setActiveContextPanel = useUniverseStore((state) => state.setActiveContextPanel);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const setActiveBandIndex = useUniverseStore((state) => state.setActiveBandIndex);
  const activeRelease = useUniverseStore((state) => state.activeRelease);
  const setActiveRelease = useUniverseStore((state) => state.setActiveRelease);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'spectrum' | 'motion' | 'historical' | 'provenance' | 'export'
  >('overview');

  // Cutout & Observation state
  const [cutoutSurvey, setCutoutSurvey] = useState<'spherex' | 'wise' | 'twomass' | 'dss2' | 'diff'>('spherex');
  const [colorPalette, setColorPalette] = useState<'natural' | 'coral' | 'ice' | 'thermal' | 'invert'>('natural');
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkEpoch, setBlinkEpoch] = useState<'2010' | '2026'>('2026');
  const [showReticle, setShowReticle] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  // 14-year blink loop
  useEffect(() => {
    if (!isBlinking) return;
    const interval = setInterval(() => {
      setBlinkEpoch((prev) => (prev === '2010' ? '2026' : '2010'));
    }, 900);
    return () => clearInterval(interval);
  }, [isBlinking]);

  if (activeContextPanel !== 'object' || !unifiedObject) return null;

  const isSmallBody = !!unifiedObject.solar_system;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Compass },
    { id: 'spectrum', label: 'Spectrum', icon: BarChart3 },
    { id: 'motion', label: isSmallBody ? 'Orbit' : 'Motion', icon: Orbit },
    { id: 'historical', label: '14-Yr Baseline', icon: Clock },
    { id: 'provenance', label: 'Provenance', icon: Database },
    { id: 'export', label: 'Export', icon: Download },
  ];

  return (
    <aside
      aria-label="Celestial Object Inspector"
      className="absolute top-4 right-4 z-40 w-full max-w-[440px] max-h-[calc(100vh-2rem)] bg-[#0d111a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_16px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col select-none animate-in fade-in slide-in-from-right-4 duration-200"
    >
      {/* 1. Header with Canonical Identity & Actions */}
      <ObjectHeader
        object={unifiedObject}
        onClose={() => setActiveContextPanel('none')}
      />

      {/* 2. Authentic Cutout Studio Hero */}
      <div className="relative w-full h-40 bg-[#0a0c12] overflow-hidden shrink-0 group border-b border-white/10">
        <CelestialCutoutViewer
          ra={unifiedObject.position.ra_deg}
          dec={unifiedObject.position.dec_deg}
          survey={cutoutSurvey}
          colorPalette={colorPalette}
          isBlinking={isBlinking}
          blinkEpoch={blinkEpoch}
          highContrast={highContrast}
          showReticle={showReticle}
          properMotionMasYr={unifiedObject.kinematics?.total_proper_motion_masyr || 8140}
          positionAngleDeg={unifiedObject.kinematics?.position_angle_deg || 93.4}
          objectName={unifiedObject.identity.canonical_name}
        />

        {/* Field scale label */}
        <div className="absolute bottom-2 right-3 text-[9px] font-mono text-white/80 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded border border-white/10 pointer-events-none z-10">
          FOV: 0.06° (216″) · {cutoutSurvey.toUpperCase()}
        </div>

        {/* Live Epoch Indicator when Blinking */}
        {isBlinking && (
          <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-[#8ab4f8]/50 text-[10px] font-mono font-bold text-[#8ab4f8] flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#8ab4f8]" />
            <span>Epoch: {blinkEpoch === '2010' ? 'WISE 2010 (W1/W2)' : 'SPHEREx 2026 (QR3)'}</span>
          </div>
        )}
      </div>

      {/* Cutout Survey Selector Toolbar */}
      <div className="px-3 py-1.5 bg-[#121624] border-b border-white/10 flex items-center justify-between text-[10px] font-mono text-[#9aa0a6] shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: 'spherex', label: 'SPHEREx' },
            { id: 'wise', label: 'WISE 2010' },
            { id: 'twomass', label: '2MASS' },
            { id: 'dss2', label: 'DSS2' },
            { id: 'diff', label: 'Diff' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setIsBlinking(false);
                setCutoutSurvey(s.id as any);
              }}
              className={`px-2 py-0.5 rounded-full transition-colors ${
                cutoutSurvey === s.id && !isBlinking
                  ? 'bg-[#8ab4f8] text-[#0d111a] font-bold'
                  : 'hover:text-[#f8f9fa] hover:bg-white/5'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          <button
            onClick={() => {
              const pals: ('natural' | 'coral' | 'ice' | 'thermal' | 'invert')[] = ['natural', 'coral', 'ice', 'thermal', 'invert'];
              setColorPalette(pals[(pals.indexOf(colorPalette) + 1) % pals.length]);
            }}
            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] uppercase"
            title="Cycle false-color palette"
          >
            {colorPalette}
          </button>
          <button
            onClick={() => setHighContrast(!highContrast)}
            className={`px-1.5 py-0.5 rounded text-[9px] ${
              highContrast ? 'bg-[#ff7563] text-white font-bold' : 'bg-white/5 text-[#9aa0a6]'
            }`}
            title="Toggle high-contrast stretch"
          >
            HDR
          </button>
          <button
            onClick={() => setShowReticle(!showReticle)}
            className={`p-1 rounded ${showReticle ? 'text-[#8ab4f8]' : 'text-[#9aa0a6]'}`}
            title="Toggle crosshair reticle"
          >
            <Crosshair className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex border-b border-white/10 bg-[#0f131f] text-[11px] font-medium px-2 shrink-0 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-2.5 text-center transition-colors relative shrink-0 flex items-center gap-1.5 whitespace-nowrap ${
                isActive ? 'text-[#8ab4f8] font-bold' : 'text-[#9aa0a6] hover:text-[#f8f9fa]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#8ab4f8] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs text-[#f8f9fa] scrollbar-thin scrollbar-thumb-white/10">
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <ObservationSection
              object={unifiedObject}
              activeRelease={activeRelease}
              onSelectRelease={setActiveRelease}
            />

            <CoordinatesSection object={unifiedObject} />

            {/* Astrophysical Properties Grid */}
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-[#9aa0a6] block uppercase font-sans font-bold">Effective Temp</span>
                <span className="text-sm font-bold text-[#ff7563]">
                  {unifiedObject.astrophysics?.teff_k ? `${unifiedObject.astrophysics.teff_k} K` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-[#9aa0a6] block uppercase font-sans font-bold">Distance</span>
                <span className="text-sm font-bold text-[#8ab4f8]">
                  {unifiedObject.astrophysics?.distance_pc ? `${unifiedObject.astrophysics.distance_pc} pc` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-[#9aa0a6] block uppercase font-sans font-bold">Spectral Class</span>
                <span className="text-sm font-bold text-[#fbbc04]">
                  {unifiedObject.astrophysics?.spectral_class || '—'}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-[#9aa0a6] block uppercase font-sans font-bold">Data Status</span>
                <span className="text-sm font-bold text-[#81c995] capitalize">
                  {unifiedObject.status}
                </span>
              </div>
            </div>

            {/* Multi-Band Catalog Photometry */}
            {unifiedObject.astrophysics?.photometry && (
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <span className="text-[10px] text-[#9aa0a6] uppercase tracking-wider block font-sans font-bold">
                  Catalog Photometry Magnitudes
                </span>
                <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px] text-center">
                  <div className="p-1.5 rounded-xl bg-black/30">
                    <span className="text-[9px] text-[#9aa0a6] block">Gaia G</span>
                    <span className="font-bold text-[#f8f9fa]">{unifiedObject.astrophysics.photometry.gaia_g ?? '—'}</span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-black/30">
                    <span className="text-[9px] text-[#9aa0a6] block">2MASS J</span>
                    <span className="font-bold text-[#8ab4f8]">{unifiedObject.astrophysics.photometry.twomass_j ?? '—'}</span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-black/30">
                    <span className="text-[9px] text-[#9aa0a6] block">2MASS Ks</span>
                    <span className="font-bold text-[#ff7563]">{unifiedObject.astrophysics.photometry.twomass_ks ?? '—'}</span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-black/30">
                    <span className="text-[9px] text-[#9aa0a6] block">WISE W1</span>
                    <span className="font-bold text-[#fbbc04]">{unifiedObject.astrophysics.photometry.wise_w1 ?? '—'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'spectrum' && (
          <SpectrumSection
            object={unifiedObject}
            activeBandIndex={activeBandIndex}
            onSelectBand={setActiveBandIndex}
          />
        )}

        {activeTab === 'motion' && (
          <MotionSection object={unifiedObject} />
        )}

        {activeTab === 'historical' && (
          <HistoricalSection
            object={unifiedObject}
            isBlinking={isBlinking}
            onToggleBlink={() => setIsBlinking(!isBlinking)}
            cutoutSurvey={cutoutSurvey}
            onSelectSurvey={(s) => {
              setIsBlinking(false);
              setCutoutSurvey(s);
            }}
          />
        )}

        {activeTab === 'provenance' && (
          <ProvenanceSection object={unifiedObject} />
        )}

        {activeTab === 'export' && (
          <SciencePacketExport object={unifiedObject} />
        )}
      </div>

      {/* 5. Provenance Footer */}
      <div className="px-4 py-2 bg-[#090d16] border-t border-white/10 flex items-center justify-between text-[10px] text-[#9aa0a6] font-mono shrink-0">
        <span>NASA IPAC IRSA · JPL SBDB · Gaia DR3</span>
        <span className="text-[#8ab4f8]">SPHEREx {activeRelease.toUpperCase()}</span>
      </div>
    </aside>
  );
}
