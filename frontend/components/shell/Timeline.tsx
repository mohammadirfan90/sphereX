'use client';

import React, { useEffect, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

// Convert decimal year (e.g. 2026.708) to authentic date string
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

export default function Timeline() {
  const observationYear = useUniverseStore((state) => state.observationYear);
  const setObservationYear = useUniverseStore((state) => state.setObservationYear);
  const isTimelinePlaying = useUniverseStore((state) => state.isTimelinePlaying);
  const setIsTimelinePlaying = useUniverseStore((state) => state.setIsTimelinePlaying);

  // Playback loop
  useEffect(() => {
    if (!isTimelinePlaying) return;

    const interval = setInterval(() => {
      const current = useUniverseStore.getState().observationYear;
      const next = current + 0.05;
      setObservationYear(next > 2027 ? 2025 : Number(next.toFixed(3)));
    }, 400);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, setObservationYear]);

  const dateLabel = useMemo(() => formatDecimalYear(observationYear), [observationYear]);

  // Percentage for current date scrubber pointer (2025.0 to 2027.0)
  const pct = Math.max(0, Math.min(100, ((observationYear - 2025) / 2) * 100));

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[620px] max-w-[calc(100vw-2.5rem)] select-none">
      <div className="bg-[#151922] border border-[#2B3140] rounded px-3.5 py-2 shadow-2xl flex flex-col gap-1.5 text-xs font-sans">
        {/* Top: Controls & Date Readout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTimelinePlaying(!isTimelinePlaying)}
              title={isTimelinePlaying ? 'Pause Playback' : 'Play Observation Timeline'}
              className={`w-6 h-6 rounded flex items-center justify-center transition-colors border ${
                isTimelinePlaying
                  ? 'bg-[#F28C28] border-[#F28C28] text-[#10131A]'
                  : 'bg-[#10131A] border-[#2B3140] text-[#F5F7FA] hover:bg-[#2B3140]'
              }`}
            >
              {isTimelinePlaying ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3 ml-0.5" />
              )}
            </button>

            <span className="text-[10px] text-[#A8B0BF] font-mono uppercase tracking-wider">
              Observation Timeline
            </span>
          </div>

          {/* Current Date Badge */}
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-[#3159C7] font-bold">▲</span>
            <span className="text-[#F5F7FA] font-semibold">{dateLabel}</span>
          </div>
        </div>

        {/* Timeline Track */}
        <div className="relative pt-1 pb-2">
          {/* Milestone Labels */}
          <div className="flex justify-between text-[10px] font-mono text-[#A8B0BF] mb-1">
            <span>2025</span>
            <span>2025.5</span>
            <span className="text-[#00A6C7] font-semibold">2026</span>
            <span>2026.5</span>
            <span>2027</span>
          </div>

          {/* Ticks and Track */}
          <div className="relative flex items-center">
            <div className="w-full h-1 bg-[#2B3140] rounded-sm relative">
              {/* Tick marks */}
              <div className="absolute top-0 bottom-0 left-[0%] w-0.5 bg-[#A8B0BF]" />
              <div className="absolute top-0 bottom-0 left-[25%] w-0.5 bg-[#A8B0BF]/60" />
              <div className="absolute top-0 bottom-0 left-[50%] w-0.5 bg-[#00A6C7]" />
              <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-[#A8B0BF]/60" />
              <div className="absolute top-0 bottom-0 left-[100%] w-0.5 bg-[#A8B0BF]" />

              {/* Progress filled bar */}
              <div
                className="h-full bg-[#3159C7] rounded-sm"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Input Slider */}
            <input
              type="range"
              min={2025}
              max={2027}
              step={0.01}
              value={observationYear}
              onChange={(e) => setObservationYear(Number(e.target.value))}
              className="absolute inset-x-0 opacity-0 cursor-pointer h-5 z-10"
            />

            {/* Pointer Handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none w-3 h-3 rounded-sm bg-[#3159C7] border border-[#F5F7FA] shadow"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
