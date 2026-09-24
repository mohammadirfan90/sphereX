'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Crosshair, Navigation } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';
import { BENCHMARK_TARGETS } from '@/lib/benchmarkTargets';

export default function GoogleSearchPill() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);
  const isLoadingTarget = useUniverseStore((state) => state.isLoadingTarget);

  // Filter benchmark suggestions
  const filteredTargets = BENCHMARK_TARGETS.filter((target) => {
    const matchesCategory =
      selectedCategory === 'all' || target.category === selectedCategory;

    const matchesQuery =
      !query.trim() ||
      target.target_name.toLowerCase().includes(query.toLowerCase()) ||
      target.canonical_id.toLowerCase().includes(query.toLowerCase()) ||
      target.summary.toLowerCase().includes(query.toLowerCase());

    return matchesCategory && matchesQuery;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    fetchAndSelectTarget(query.trim());
    setIsOpen(false);
  };

  const handleSelectTarget = (targetName: string) => {
    fetchAndSelectTarget(targetName);
    setQuery('');
    setIsOpen(false);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="absolute top-5 left-5 z-40 w-full max-w-[440px] select-none">
      {/* Google Search Pill Container */}
      <div
        className={`relative flex items-center h-12 px-4 rounded-full bg-[#1E1F20]/95 backdrop-blur-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.45)] transition-all duration-200 ${
          isOpen ? 'ring-2 ring-[#8AB4F8]/50 shadow-[0_8px_30px_rgba(0,0,0,0.6)]' : 'hover:border-white/20'
        }`}
      >
        {/* App Logo */}
        <div className="flex items-center shrink-0 mr-3 cursor-pointer" onClick={() => setIsOpen(true)}>
          <img
            src="/logo icon.png"
            alt="SPHEREx Logo"
            className="w-7 h-7 object-contain rounded-full hover:scale-105 transition-transform"
          />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search SPHEREx fields, coordinates, or targets..."
            className="w-full bg-transparent text-[#E3E3E3] placeholder-[#9AA0A6] text-sm focus:outline-none font-sans"
          />
        </form>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0 text-[#9AA0A6]">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-full hover:text-[#E3E3E3] hover:bg-white/10 transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Magnifying Glass Search Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            className="p-1.5 rounded-full text-[#8AB4F8] hover:bg-[#8AB4F8]/15 transition-colors"
            title="Search"
          >
            {isLoadingTarget ? (
              <span className="w-4 h-4 rounded-full border-2 border-[#8AB4F8] border-t-transparent animate-spin inline-block" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Google Autocomplete & Quick Discover Panel */}
      {isOpen && (
        <div className="mt-2 w-full bg-[#1E1F20]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.65)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Category Filter Chips */}
          <div className="p-3 pb-2 flex items-center gap-1.5 overflow-x-auto border-b border-white/10 text-xs scrollbar-none">
            {[
              { id: 'all', label: 'All SPHEREx Fields' },
              { id: 'deep_field', label: 'Deep Fields (NEP / SEP)' },
              { id: 'calibration_standard', label: 'Calibration Standards' },
              { id: 'cosmology_field', label: 'Cosmology Fields' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#8AB4F8]/20 text-[#8AB4F8] border border-[#8AB4F8]/30'
                    : 'bg-white/5 text-[#9AA0A6] hover:bg-white/10 hover:text-[#E3E3E3]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Target List */}
          <div className="max-h-72 overflow-y-auto py-1 divide-y divide-white/5">
            {filteredTargets.length > 0 ? (
              filteredTargets.map((target) => (
                <button
                  key={target.target_name}
                  onClick={() => handleSelectTarget(target.target_name)}
                  className="w-full px-4 py-2.5 text-left hover:bg-white/10 flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#8AB4F8] group-hover:bg-[#8AB4F8]/20 transition-colors">
                      <Crosshair className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-medium text-[#E3E3E3] group-hover:text-[#8AB4F8] transition-colors truncate">
                        {target.target_name}
                      </div>
                      <div className="text-[11px] text-[#9AA0A6] font-mono truncate">
                        {target.canonical_id} · RA {target.ra_deg.toFixed(2)}° Dec {target.dec_deg.toFixed(2)}°
                      </div>
                    </div>
                  </div>

                  <span className="shrink-0 text-xs text-[#8AB4F8] opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all transform translate-x-1 group-hover:translate-x-0">
                    <span>Fly to</span>
                    <Navigation className="w-3 h-3 rotate-90" />
                  </span>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-[#9AA0A6]">
                Press enter to search NASA IRSA SPHEREx archives for &quot;{query}&quot;
              </div>
            )}
          </div>

          {/* Footer Suggestion */}
          <div className="px-4 py-2.5 bg-white/5 border-t border-white/5 flex items-center justify-between text-[11px] text-[#9AA0A6]">
            <span>NASA SPHEREx Quick Releases</span>
            <span className="font-mono text-[10px] text-[#8AB4F8]">102 Bands · QR3 & QR2</span>
          </div>
        </div>
      )}
    </div>
  );
}
