'use client';

import React from 'react';
import { X, Database, Compass, Waves, BookOpen, ExternalLink } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function HelpModal() {
  const isHelpOpen = useUniverseStore((state) => state.isHelpOpen);
  const toggleHelp = useUniverseStore((state) => state.toggleHelp);

  if (!isHelpOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-2xl bg-[#1E1F20]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_16px_50px_rgba(0,0,0,0.7)] overflow-hidden font-sans text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#131314]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
              <img
                src="/logo icon.png"
                alt="SPHEREx Odyssey"
                className="w-8 h-8 object-contain rounded-full"
              />
            </div>
            <div>
              <h2 className="font-bold text-sm text-[#E3E3E3]">SPHEREx Odyssey — Google Earth for the Cosmos</h2>
              <p className="text-[11px] text-[#9AA0A6]">NASA All-Sky Spectral Survey (QR3 & QR2) Reference Guide</p>
            </div>
          </div>
          <button
            onClick={toggleHelp}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Mission Characteristics */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-[#E3E3E3] flex items-center gap-2">
              <Waves className="w-4 h-4 text-[#8AB4F8]" />
              Authentic NASA SPHEREx Mission Design
            </h3>
            <p className="text-[#9AA0A6] leading-relaxed">
              NASA&apos;s Spectro-Photometer for the History of the Universe, Epoch of Reionization, and Ices Explorer
              (SPHEREx) maps the entire celestial sphere every 6 months across 102 near-infrared spectral channels
              (0.75 – 5.00 μm) using 6 Linear Variable Filter (LVF) detector arrays:
            </p>
            <div className="grid grid-cols-3 gap-2.5 pt-1 font-mono text-[11px]">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                <span className="text-[#8AB4F8] font-bold block">LVF 1–3</span>
                <div className="text-[#9AA0A6] text-[10px]">0.75–2.40 μm (R ≈ 39–41)</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                <span className="text-[#78D9EC] font-bold block">LVF 4</span>
                <div className="text-[#9AA0A6] text-[10px]">2.40–3.80 μm (R ≈ 35)</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                <span className="text-[#FF7563] font-bold block">LVF 5–6</span>
                <div className="text-[#9AA0A6] text-[10px]">3.80–5.00 μm (R ≈ 112–128)</div>
              </div>
            </div>
          </div>

          {/* Ice Absorption Science */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-[#E3E3E3] flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#78D9EC]" />
              Prebiotic Volatile Ice Diagnostics
            </h3>
            <p className="text-[#9AA0A6] leading-relaxed">
              SPHEREx directly surveys molecular ices in star-forming regions and planetary disks via spectroscopic
              absorption features:
            </p>
            <ul className="space-y-1.5 text-[#9AA0A6] pl-2 font-mono text-[11px]">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#8AB4F8]" />
                <span><strong className="text-[#E3E3E3]">3.05 μm</strong> — Water ice (H₂O) absorption</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#FF7563]" />
                <span><strong className="text-[#E3E3E3]">4.27 μm</strong> — Carbon dioxide ice (CO₂) absorption</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#FBBC05]" />
                <span><strong className="text-[#E3E3E3]">4.67 μm</strong> — Carbon monoxide (CO) absorption</span>
              </li>
            </ul>
          </div>

          {/* Scientific Catalogs & Grounding */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-[#E3E3E3] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#34A853]" />
              Integrated Observational Catalogs
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5">
                <div className="font-semibold text-[#E3E3E3]">NASA IPAC IRSA</div>
                <div className="text-[#9AA0A6]">SIAv2 cutouts & Tractor photometry</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5">
                <div className="font-semibold text-[#E3E3E3]">NASA JPL Horizons / SBDB</div>
                <div className="text-[#9AA0A6]">Minor planet & asteroid orbital elements</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5">
                <div className="font-semibold text-[#E3E3E3]">ESA Gaia DR3</div>
                <div className="text-[#9AA0A6]">Stellar parallaxes & proper motions</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/5">
                <div className="font-semibold text-[#E3E3E3]">CDS SIMBAD & VizieR</div>
                <div className="text-[#9AA0A6]">Sesame astronomical name resolver</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#131314]/80 flex items-center justify-between text-[11px] text-[#9AA0A6]">
          <span>Designed with Google Material 3 Design System</span>
          <button
            onClick={toggleHelp}
            className="px-4 py-1.5 rounded-full bg-[#8AB4F8] hover:bg-[#AECBFA] text-[#131314] font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
