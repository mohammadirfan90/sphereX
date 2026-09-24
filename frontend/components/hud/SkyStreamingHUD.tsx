'use client';

import React, { useState } from 'react';
import { RefreshCw, Activity, CheckCircle2, ChevronDown, ChevronUp, Layers, Radio } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function SkyStreamingHUD() {
  const tileStatus = useUniverseStore((state) => state.tileStreamingStatus);
  const activeContextPanel = useUniverseStore((state) => state.activeContextPanel);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // Manual force sync action to trigger Aladin Lite WASM redraw & fetch
  const handleForceSync = () => {
    setIsManualSyncing(true);
    if (typeof window !== 'undefined' && (window as any).__forceSyncHiPS) {
      (window as any).__forceSyncHiPS();
    } else if (typeof window !== 'undefined' && (window as any).__aladin?.view?.requestRedraw) {
      (window as any).__aladin.view.requestRedraw();
    }
    setTimeout(() => {
      setIsManualSyncing(false);
    }, 800);
  };

  const isLoading = tileStatus.isLoading || isManualSyncing || tileStatus.activeRequests > 0;
  const isHD = tileStatus.currentOrder >= 7;

  // Reposition if knowledge panel is open
  const containerPositionClass =
    activeContextPanel !== 'none'
      ? 'top-4 right-[460px]'
      : 'top-4 right-4 sm:top-5 sm:right-6';

  return (
    <aside
      aria-label="Celestial Survey Streaming Telemetry"
      className={`fixed ${containerPositionClass} z-30 transition-all duration-300 pointer-events-none select-none`}
    >
      <div className="pointer-events-auto bg-[#0d111a]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] p-3 text-xs w-72 sm:w-80 text-[#E3E3E3] font-sans flex flex-col gap-2.5 transition-all">
        {/* 1. Header Row: Status badge, Survey, Order pill, and Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Live activity indicator */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isLoading ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38BDF8] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#38BDF8]" />
                </span>
              ) : (
                <span className="inline-flex rounded-full h-2.5 w-2.5 bg-[#34D399] shadow-[0_0_8px_#34d399]" />
              )}
              <span
                className={`text-[10px] font-mono font-bold tracking-wider uppercase ${
                  isLoading ? 'text-[#38BDF8]' : 'text-[#34D399]'
                }`}
              >
                {isLoading ? 'STREAMING' : 'SYNCHRONIZED'}
              </span>
            </div>

            <span className="text-white/20">|</span>

            {/* Current survey name */}
            <span className="text-[11px] font-medium text-[#9AA0A6] truncate" title={tileStatus.surveyName}>
              {tileStatus.surveyName || 'AllWISE IR'}
            </span>
          </div>

          {/* Right Action Icons: Force Sync & Expand */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleForceSync}
              disabled={isManualSyncing}
              className={`p-1.5 rounded-lg text-[#9AA0A6] hover:text-[#8AB4F8] hover:bg-white/10 transition-colors ${
                isManualSyncing ? 'text-[#8AB4F8]' : ''
              }`}
              title="Force sync & reload HiPS survey tiles"
              aria-label="Force reload celestial survey tiles"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-[#9AA0A6] hover:text-[#E3E3E3] hover:bg-white/10 transition-colors"
              title={isExpanded ? 'Collapse details' : 'Expand streaming metrics'}
              aria-label="Toggle telemetry details"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 2. Progress Bar Row */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#9AA0A6]">
            <span className="flex items-center gap-1 truncate">
              {isLoading ? (
                <>
                  <Activity className="w-3 h-3 text-[#38BDF8] animate-pulse" />
                  <span>Loading deep survey tiles...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-[#34D399]" />
                  <span>All-sky view ready</span>
                </>
              )}
            </span>
            <span className="font-bold text-[#E3E3E3] ml-2 shrink-0">{tileStatus.percent}%</span>
          </div>

          {/* The Progress Bar */}
          <div className="relative h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isLoading
                  ? 'bg-gradient-to-r from-[#38BDF8] via-[#818CF8] to-[#34D399] shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                  : 'bg-[#34D399]'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, tileStatus.percent))}%` }}
            />
          </div>
        </div>

        {/* 3. Essential Telemetry Badges */}
        <div className="flex items-center justify-between gap-1 pt-0.5 text-[10px] font-mono">
          <div className="flex items-center gap-1 text-[#9AA0A6]">
            <Layers className="w-3 h-3 text-[#8AB4F8]" />
            <span>
              Order {tileStatus.currentOrder}/{tileStatus.maxOrder}
            </span>
            {isHD && (
              <span className="px-1 py-0.2 bg-[#8AB4F8]/15 border border-[#8AB4F8]/30 text-[#8AB4F8] rounded text-[9px] font-semibold">
                UHD
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[#9AA0A6]">
            <Radio className="w-3 h-3 text-[#A8B0BF]" />
            <span>{tileStatus.samplingScaleArcsec.toFixed(2)}″/px</span>
          </div>
        </div>

        {/* 4. Expandable Telemetry Drawer */}
        {isExpanded && (
          <div className="pt-2 mt-1 border-t border-white/10 flex flex-col gap-1.5 text-[10px] font-mono text-[#9AA0A6] animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span>Tiles in Memory:</span>
              <span className="text-[#E3E3E3] font-semibold">{tileStatus.tilesLoaded} cached</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Active Network Streams:</span>
              <span className={`${tileStatus.activeRequests > 0 ? 'text-[#38BDF8]' : 'text-[#9AA0A6]'}`}>
                {tileStatus.activeRequests} active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Data Origin:</span>
              <span className="text-[#E3E3E3] truncate max-w-[170px]" title="CDS Strasbourg / NASA IPAC IVOA HiPS">
                CDS Strasbourg / IPAC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status:</span>
              <span className="text-[#E3E3E3]">{tileStatus.statusText}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
