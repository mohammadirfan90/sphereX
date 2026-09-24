'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Layers,
  Waves,
  Wrench,
  HelpCircle,
  ChevronDown,
  X,
  SlidersHorizontal,
  Ruler,
  Orbit,
  GitCompare,
} from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';
import { BENCHMARK_TARGETS } from '@/lib/benchmarkTargets';

export default function TopToolbar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const isMapContentsOpen = useUniverseStore((state) => state.isMapContentsOpen);
  const toggleMapContents = useUniverseStore((state) => state.toggleMapContents);
  const isWavelengthOpen = useUniverseStore((state) => state.isWavelengthOpen);
  const toggleWavelength = useUniverseStore((state) => state.toggleWavelength);
  const isHelpOpen = useUniverseStore((state) => state.isHelpOpen);
  const toggleHelp = useUniverseStore((state) => state.toggleHelp);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);
  const setActiveContextPanel = useUniverseStore((state) => state.setActiveContextPanel);
  const setActiveTool = useUniverseStore((state) => state.setActiveTool);

  const wavelengthUm = (0.75 + (5.00 - 0.75) * ((activeBandIndex - 1) / 101)).toFixed(2);

  // Suggestions for autocomplete
  const suggestions = searchQuery.trim()
    ? BENCHMARK_TARGETS.filter(
        (t) =>
          t.target_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.canonical_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : BENCHMARK_TARGETS.slice(0, 5);

  const handleSelectTarget = (targetName: string) => {
    fetchAndSelectTarget(targetName);
    setSearchQuery('');
    setIsFocused(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    fetchAndSelectTarget(searchQuery.trim());
    setIsFocused(false);
  };

  // Close tools dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="relative z-40 w-full h-11 bg-[#10131A] border-b border-[#2B3140] px-3 flex items-center justify-between text-xs select-none">
      {/* 1. Brand & Search */}
      <div className="flex items-center gap-4 flex-1 max-w-2xl">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#00A6C7]" />
          <span className="font-semibold text-sm tracking-tight text-[#F5F7FA]">
            SPHEREx Odyssey
          </span>
        </div>

        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-[#A8B0BF] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="Search the Universe (stars, asteroids, coordinates)..."
              className="w-full h-7 pl-8 pr-7 rounded bg-[#151922] text-[#F5F7FA] placeholder-[#A8B0BF]/60 border border-[#2B3140] focus:border-[#3159C7] focus:outline-none transition-colors text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#A8B0BF] hover:text-[#F5F7FA]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </form>

          {/* Autocomplete Dropdown */}
          {isFocused && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsFocused(false)} />
              <div className="absolute top-8 left-0 w-full bg-[#151922] border border-[#2B3140] rounded shadow-xl overflow-hidden z-40 py-1">
                <div className="px-3 py-1 text-[10px] text-[#A8B0BF] uppercase tracking-wider border-b border-[#2B3140]/60">
                  {searchQuery.trim() ? 'Matched Celestial Objects' : 'Benchmark Science Targets'}
                </div>
                {suggestions.map((target) => (
                  <button
                    key={target.target_name}
                    onMouseDown={() => handleSelectTarget(target.target_name)}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#2B3140]/40 flex items-center justify-between group transition-colors"
                  >
                    <div>
                      <span className="text-[#F5F7FA] font-medium block text-xs group-hover:text-[#00A6C7]">
                        {target.target_name}
                      </span>
                      <span className="text-[10px] text-[#A8B0BF] font-mono">
                        {target.category} • RA {target.ra_deg.toFixed(2)}° Dec {target.dec_deg.toFixed(2)}°
                      </span>
                    </div>
                    <span className="text-[10px] text-[#3159C7] opacity-0 group-hover:opacity-100 transition-opacity">
                      Fly to →
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Utility Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Layers Toggle Button */}
        <button
          onClick={toggleMapContents}
          title="Toggle Map Contents Sidebar"
          className={`h-7 px-2.5 rounded flex items-center gap-1.5 transition-colors border ${
            isMapContentsOpen
              ? 'bg-[#3159C7]/20 border-[#3159C7] text-[#F5F7FA] font-medium'
              : 'bg-[#151922] border-[#2B3140] text-[#A8B0BF] hover:text-[#F5F7FA] hover:bg-[#2B3140]/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layers</span>
        </button>

        {/* Wavelength Popover Toggle Button */}
        <button
          onClick={toggleWavelength}
          title="Adjust SPHEREx Wavelength Dispersion (0.75 - 5.00 μm)"
          className={`h-7 px-2.5 rounded flex items-center gap-1.5 transition-colors border ${
            isWavelengthOpen
              ? 'bg-[#F28C28]/20 border-[#F28C28] text-[#F28C28] font-medium'
              : 'bg-[#151922] border-[#2B3140] text-[#A8B0BF] hover:text-[#F5F7FA] hover:bg-[#2B3140]/50'
          }`}
        >
          <Waves className="w-3.5 h-3.5" />
          <span>{wavelengthUm} μm</span>
        </button>

        {/* Tools Menu */}
        <div className="relative" ref={toolsMenuRef}>
          <button
            onClick={() => setIsToolsOpen(!isToolsOpen)}
            className={`h-7 px-2.5 rounded flex items-center gap-1.5 transition-colors border ${
              isToolsOpen
                ? 'bg-[#2B3140] border-[#2B3140] text-[#F5F7FA]'
                : 'bg-[#151922] border-[#2B3140] text-[#A8B0BF] hover:text-[#F5F7FA] hover:bg-[#2B3140]/50'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Tools</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {isToolsOpen && (
            <div className="absolute right-0 top-8 w-48 bg-[#151922] border border-[#2B3140] rounded shadow-xl py-1 z-50">
              <div className="px-3 py-1 text-[10px] text-[#A8B0BF] uppercase tracking-wider border-b border-[#2B3140]/60">
                Viewer Tools
              </div>
              <button
                onClick={() => {
                  setActiveContextPanel('compare');
                  setIsToolsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2B3140]/40 flex items-center gap-2 text-xs text-[#F5F7FA]"
              >
                <GitCompare className="w-3.5 h-3.5 text-[#F28C28]" />
                <span>SPHEREx Temporal Diff</span>
              </button>
              <button
                onClick={() => {
                  setActiveContextPanel('measure');
                  setIsToolsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2B3140]/40 flex items-center gap-2 text-xs text-[#F5F7FA]"
              >
                <Ruler className="w-3.5 h-3.5 text-[#00A6C7]" />
                <span>Measure Distance</span>
              </button>
              <button
                onClick={() => {
                  setActiveTool('blink');
                  setIsToolsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2B3140]/40 flex items-center gap-2 text-xs text-[#F5F7FA]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#3159C7]" />
                <span>Blink Comparator</span>
              </button>
            </div>
          )}
        </div>

        {/* Help Button */}
        <button
          onClick={toggleHelp}
          title="Data Sources & Mission Guide"
          className={`h-7 w-7 rounded flex items-center justify-center transition-colors border ${
            isHelpOpen
              ? 'bg-[#2B3140] border-[#2B3140] text-[#F5F7FA]'
              : 'bg-[#151922] border-[#2B3140] text-[#A8B0BF] hover:text-[#F5F7FA] hover:bg-[#2B3140]/50'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
