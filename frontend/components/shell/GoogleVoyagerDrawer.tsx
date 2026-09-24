'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  Compass,
  Navigation,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  Database,
  Eye,
  Sliders,
} from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

interface VoyagerStory {
  id: string;
  title: string;
  subtitle: string;
  targetName: string;
  spec: string;
  description: string;
  badge: string;
  badgeColor: string;
  accentColor: string;
  icon: React.ReactNode;
}

const VOYAGER_STORIES: VoyagerStory[] = [
  {
    id: 'deep-field-north',
    title: 'SPHEREx Deep Field North (NEP)',
    subtitle: 'North Ecliptic Pole Cosmic Dawn Survey',
    targetName: 'SPHEREx Deep Field North (NEP)',
    spec: '200+ Passes · Bands 1–6 (0.75–5.00 μm)',
    description:
      'Maximum-redundancy survey field at the NEP probing cosmic infrared background fluctuations and Epoch of Reionization (EOR) signatures.',
    badge: 'Deep Field',
    badgeColor: 'bg-[#8AB4F8]/15 text-[#8AB4F8] border-[#8AB4F8]/30',
    accentColor: '#8AB4F8',
    icon: <Sparkles className="w-3.5 h-3.5 text-[#8AB4F8]" />,
  },
  {
    id: 'deep-field-south',
    title: 'SPHEREx Deep Field South (SEP)',
    subtitle: 'Interstellar Volatile Ice Inventory',
    targetName: 'SPHEREx Deep Field South (SEP)',
    spec: '3.05 μm H₂O · 4.27 μm CO₂ · High S/N',
    description:
      'High-redundancy southern ecliptic pole field tracing prebiotic water and carbon monoxide ices across dense molecular clouds.',
    badge: 'Ice Survey',
    badgeColor: 'bg-[#78D9EC]/15 text-[#78D9EC] border-[#78D9EC]/30',
    accentColor: '#78D9EC',
    icon: <Sliders className="w-3.5 h-3.5 text-[#78D9EC]" />,
  },
  {
    id: 'qr3-primary-cal',
    title: 'SPHEREx QR3 Calibration Field',
    subtitle: '102-Band Spectrophotometric Standard',
    targetName: 'SPHEREx QR3 Calibration Field',
    spec: 'DOI: 10.26131/IRSA662 · 102 Channels',
    description:
      'Primary Caltech/IPAC IRSA verification field verifying end-to-end array transmission, throughput, and spectrophotometric flux calibration.',
    badge: 'QR3 Standard',
    badgeColor: 'bg-[#FBBC05]/15 text-[#FBBC05] border-[#FBBC05]/30',
    accentColor: '#FBBC05',
    icon: <Database className="w-3.5 h-3.5 text-[#FBBC05]" />,
  },
  {
    id: 'equatorial-standard',
    title: 'SPHEREx Equatorial Standard Field',
    subtitle: 'Zero-Point Flux Cross-Calibration',
    targetName: 'SPHEREx Equatorial Standard Field',
    spec: 'RA 180.0° · Dec 0.0° · Absolute Flux',
    description:
      'Equatorial reference field providing absolute spectrophotometric calibration parity against international flux networks and JWST standards.',
    badge: 'Calibration',
    badgeColor: 'bg-[#34A853]/15 text-[#81C995] border-[#34A853]/30',
    accentColor: '#81C995',
    icon: <Eye className="w-3.5 h-3.5 text-[#81C995]" />,
  },
  {
    id: 'elais-n1-cosmology',
    title: 'SPHEREx ELAIS-N1 Field',
    subtitle: 'Cosmic Inflation & Large-Scale Structure',
    targetName: 'SPHEREx ELAIS-N1 Field',
    spec: '3D Spatial Clustering · f_NL Probe',
    description:
      'Extragalactic wide-area cosmological field mapping hundreds of millions of galaxy spectrophotometric redshifts to probe cosmic inflation.',
    badge: 'Cosmology',
    badgeColor: 'bg-[#C58AF9]/15 text-[#C58AF9] border-[#C58AF9]/30',
    accentColor: '#C58AF9',
    icon: <Layers className="w-3.5 h-3.5 text-[#C58AF9]" />,
  },
];

export default function GoogleVoyagerDrawer() {
  const isVoyagerOpen = useUniverseStore((state) => state.isVoyagerOpen);
  const toggleVoyager = useUniverseStore((state) => state.toggleVoyager);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    updateScrollButtons();
  }, [isVoyagerOpen]);

  if (!isVoyagerOpen) return null;

  const handleLaunchTour = (targetName: string) => {
    fetchAndSelectTarget(targetName);
    toggleVoyager();
  };

  const scrollByAmount = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -340 : 340;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 350);
  };

  return (
    <div
      id="google-voyager-wide-dock"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2.5rem)] max-w-[1240px] bg-[#1B1C1D]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 sm:p-4 select-none animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-3"
    >
      {/* 1. Header Bar with Category, Carousel Controls & Close */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#8AB4F8]/15 border border-[#8AB4F8]/30 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 text-[#8AB4F8]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#E3E3E3] tracking-tight">SPHEREx Voyager</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-[#9AA0A6]">
                {VOYAGER_STORIES.length} Mission Fields
              </span>
            </div>
            <p className="text-[11px] text-[#9AA0A6] hidden sm:block">
              Authentic NASA SPHEREx Deep Fields, Spectrophotometric Standards & Cosmological Surveys
            </p>
          </div>
        </div>

        {/* Carousel Navigation Arrows & Close Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scrollByAmount('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#E3E3E3] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollByAmount('right')}
            disabled={!canScrollRight}
            aria-label="Scroll right"
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#E3E3E3] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={toggleVoyager}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
            title="Close Voyager"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Wide Horizontal Expedition Cards Shelf */}
      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        onWheel={(e) => {
          if (e.deltaY !== 0 && scrollRef.current) {
            scrollRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
          }
        }}
        className="flex flex-row overflow-x-auto gap-3 pb-1 scrollbar-none scroll-smooth snap-x snap-mandatory focus:outline-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {VOYAGER_STORIES.map((story) => (
          <div
            key={story.id}
            onClick={() => handleLaunchTour(story.targetName)}
            className="w-[290px] sm:w-[320px] shrink-0 snap-start p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-[#8AB4F8]/50 hover:bg-white/[0.08] transition-all flex flex-col justify-between gap-2.5 group cursor-pointer shadow-sm hover:shadow-md"
          >
            {/* Top row: Badge + Spec */}
            <div className="flex items-center justify-between gap-1.5">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${story.badgeColor}`}
              >
                {story.icon}
                <span>{story.badge}</span>
              </span>
              <span className="text-[10px] text-[#9AA0A6] font-mono truncate max-w-[130px]">
                {story.spec}
              </span>
            </div>

            {/* Middle: Title & Description */}
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-bold text-[#E3E3E3] group-hover:text-[#8AB4F8] transition-colors line-clamp-1">
                {story.title}
              </h4>
              <p className="text-[11px] text-[#9AA0A6] leading-snug line-clamp-2">
                {story.description}
              </p>
            </div>

            {/* Bottom: Fly CTA Button */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[11px] text-[#8AB4F8] font-medium flex items-center gap-1 group-hover:underline">
                <span>Fly to field</span>
                <Navigation className="w-3 h-3 rotate-90" />
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/5 group-hover:bg-[#8AB4F8] text-[#9AA0A6] group-hover:text-[#131314] text-[10px] font-mono font-medium transition-colors">
                Launch Survey →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
