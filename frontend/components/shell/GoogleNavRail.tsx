'use client';

import React from 'react';
import {
  Compass,
  Layers,
  Ruler,
  Sliders,
  GitCompare,
  HelpCircle,
  Clock,
  Bot,
} from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

export default function GoogleNavRail() {
  const isAgentationOpen = useUniverseStore((state) => state.isAgentationOpen);
  const toggleAgentation = useUniverseStore((state) => state.toggleAgentation);
  const isVoyagerOpen = useUniverseStore((state) => state.isVoyagerOpen);
  const toggleVoyager = useUniverseStore((state) => state.toggleVoyager);

  const isTimelineOpen = useUniverseStore((state) => state.isTimelineOpen);
  const toggleTimeline = useUniverseStore((state) => state.toggleTimeline);

  const isMapContentsOpen = useUniverseStore((state) => state.isMapContentsOpen);
  const toggleMapContents = useUniverseStore((state) => state.toggleMapContents);

  const isWavelengthOpen = useUniverseStore((state) => state.isWavelengthOpen);
  const toggleWavelength = useUniverseStore((state) => state.toggleWavelength);

  const isHelpOpen = useUniverseStore((state) => state.isHelpOpen);
  const toggleHelp = useUniverseStore((state) => state.toggleHelp);

  const activeContextPanel = useUniverseStore((state) => state.activeContextPanel);
  const setActiveContextPanel = useUniverseStore((state) => state.setActiveContextPanel);

  const activeTool = useUniverseStore((state) => state.activeTool);
  const setActiveTool = useUniverseStore((state) => state.setActiveTool);

  const navItems: NavItem[] = [
    {
      id: 'voyager',
      label: 'SPHEREx Voyager (Mission Field Tours)',
      icon: <Compass className="w-5 h-5" />,
      isActive: isVoyagerOpen,
      onClick: toggleVoyager,
    },
    {
      id: 'timeline',
      label: 'SPHEREx Timeline & Releases (QR2 / QR3)',
      icon: <Clock className="w-5 h-5" />,
      isActive: isTimelineOpen,
      onClick: toggleTimeline,
    },
    {
      id: 'layers',
      label: 'SPHEREx Survey Layers & Footprints',
      icon: <Layers className="w-5 h-5" />,
      isActive: isMapContentsOpen,
      onClick: toggleMapContents,
    },
    {
      id: 'measure',
      label: 'Measure Angular Separation & Scale',
      icon: <Ruler className="w-5 h-5" />,
      isActive: activeContextPanel === 'measure',
      onClick: () => setActiveContextPanel(activeContextPanel === 'measure' ? 'none' : 'measure'),
    },
    {
      id: 'wavelength',
      label: 'SPHEREx 102-Band Spectrogram',
      icon: <Sliders className="w-5 h-5" />,
      isActive: isWavelengthOpen,
      onClick: toggleWavelength,
    },
    {
      id: 'blink',
      label: 'SPHEREx QR2 vs QR3 Temporal Comparator',
      icon: <GitCompare className="w-5 h-5" />,
      isActive: activeTool === 'blink',
      onClick: () => setActiveTool(activeTool === 'blink' ? null : 'blink'),
    },
    {
      id: 'agentation',
      label: 'Agentation MCP (Visual Agent Feedback)',
      icon: (
        <div className="relative flex items-center justify-center">
          <Bot className="w-5 h-5 text-[#C58AF9]" />
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#81C995] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#81C995]"></span>
          </span>
        </div>
      ),
      isActive: isAgentationOpen,
      onClick: toggleAgentation,
    },
    {
      id: 'help',
      label: 'NASA SPHEREx Mission Citations & DOIs',
      icon: <HelpCircle className="w-5 h-5" />,
      isActive: isHelpOpen,
      onClick: toggleHelp,
    },
  ];

  return (
    <aside className="absolute left-5 top-20 z-30 flex flex-col items-center select-none">
      <div className="w-12 py-2 px-1 rounded-2xl bg-[#1E1F20]/95 backdrop-blur-xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.55)] flex flex-col items-center gap-1.5">
        {navItems.map((item) => (
          <div key={item.id} className="relative group flex items-center justify-center">
            <button
              onClick={item.onClick}
              aria-label={item.label}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 ${
                item.isActive
                  ? 'bg-[#8AB4F8]/20 text-[#8AB4F8] shadow-inner'
                  : 'text-[#9AA0A6] hover:text-[#E3E3E3] hover:bg-white/10'
              }`}
            >
              {item.icon}
            </button>

            {/* Google M3 Floating Tooltip to the right */}
            <div className="absolute left-14 hidden group-hover:flex items-center z-50 pointer-events-none">
              <div className="px-3 py-1 rounded-full bg-[#282A2C] text-[#E3E3E3] text-xs font-medium whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.5)] border border-white/10 animate-in fade-in zoom-in-95 duration-100">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
