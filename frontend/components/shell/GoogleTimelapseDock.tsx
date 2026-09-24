'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Clock, X } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

function formatDecimalYear(yearDec: number): string {
  const year = Math.floor(yearDec);
  const remainder = yearDec - year;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalDays = isLeap ? 366 : 365;
  const dayOfYear = Math.floor(remainder * totalDays) + 1;

  const date = new Date(Date.UTC(year, 0, dayOfYear));
  const day = date.getUTCDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  return `${day} ${month} ${year}`;
}

export default function GoogleTimelapseDock() {
  const isTimelineOpen = useUniverseStore((state) => state.isTimelineOpen);
  const closeTimeline = useUniverseStore((state) => state.closeTimeline);
  const observationYear = useUniverseStore((state) => state.observationYear);
  const setObservationYear = useUniverseStore((state) => state.setObservationYear);
  const isTimelinePlaying = useUniverseStore((state) => state.isTimelinePlaying);
  const setIsTimelinePlaying = useUniverseStore((state) => state.setIsTimelinePlaying);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Playback timer loop
  useEffect(() => {
    if (!isTimelinePlaying) return;

    const step = 0.015 * playbackSpeed;
    const interval = setInterval(() => {
      const current = useUniverseStore.getState().observationYear;
      const next = current + step;
      setObservationYear(next > 2027.0 ? 2025.5 : Number(next.toFixed(3)));
    }, 150);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, playbackSpeed, setObservationYear]);

  const dateLabel = useMemo(() => formatDecimalYear(observationYear), [observationYear]);

  // Authentic SPHEREx Survey Milestones
  const milestones = [
    { year: 2025.75, label: 'SPHEREx QR2 (Nov 2025)' },
    { year: 2026.25, label: 'Pass 1 (Mar 2026)' },
    { year: 2026.708, label: 'SPHEREx QR3 (Sep 2026)' },
    { year: 2027.0, label: 'Pass 2 (Jan 2027)' },
  ];

  if (!isTimelineOpen) return null;

  return (
    <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-30 select-none max-w-[calc(100vw-3rem)] animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Floating Glass Dock */}
      <div className="flex items-center gap-3.5 px-4 py-2.5 rounded-full bg-[#1E1F20]/95 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
        {/* Play/Pause Google Blue Circular FAB */}
        <button
          onClick={() => setIsTimelinePlaying(!isTimelinePlaying)}
          aria-label={isTimelinePlaying ? 'Pause Timelapse' : 'Play Timelapse'}
          className="w-9 h-9 rounded-full bg-[#8AB4F8] hover:bg-[#AECBFA] text-[#131314] flex items-center justify-center transition-transform active:scale-95 shadow-md shrink-0"
        >
          {isTimelinePlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Current Date & Year Display */}
        <div className="flex flex-col shrink-0 min-w-[96px]">
          <span className="text-[10px] text-[#9AA0A6] uppercase font-mono tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#8AB4F8]" />
            <span>Epoch</span>
          </span>
          <span className="text-xs font-semibold font-mono text-[#E3E3E3]">
            {dateLabel}
          </span>
        </div>

        {/* Scrubber Container */}
        <div className="flex flex-col w-64 sm:w-80 md:w-96 gap-1">
          {/* Milestone Labels */}
          <div className="flex justify-between text-[10px] font-mono text-[#9AA0A6] px-1">
            {milestones.map((m) => (
              <button
                key={m.year}
                onClick={() => setObservationYear(m.year)}
                className={`hover:text-[#8AB4F8] transition-colors cursor-pointer ${
                  Math.abs(observationYear - m.year) < 0.5 ? 'text-[#8AB4F8] font-bold' : ''
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Interactive Range Input (2025.5 to 2027.0 SPHEREx Mission) */}
          <input
            type="range"
            min={2025.5}
            max={2027.0}
            step={0.01}
            value={observationYear}
            onChange={(e) => setObservationYear(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
        </div>

        {/* Speed Multiplier Chip */}
        <button
          onClick={() => {
            const speeds = [1, 2, 4];
            const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
            setPlaybackSpeed(next);
          }}
          className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono font-medium text-[#E3E3E3] transition-colors shrink-0"
          title="Playback speed"
        >
          {playbackSpeed}x
        </button>

        {/* Reset to QR3 Default */}
        <button
          onClick={() => setObservationYear(2026.708)}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors shrink-0"
          title="Reset to 2026 SPHEREx QR3"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* Close Timeline Dock */}
        <button
          onClick={closeTimeline}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors shrink-0"
          title="Close Timelapse"
          aria-label="Close Timelapse"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
