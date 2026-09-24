'use client';

import React from 'react';
import { Crosshair, Compass } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface CoordinatesSectionProps {
  object: UnifiedOdysseyObject;
}

export default function CoordinatesSection({ object }: CoordinatesSectionProps) {
  const { ra_deg, dec_deg } = object.position;

  const toSexagesimal = (ra: number, dec: number) => {
    const raH = Math.floor(ra / 15);
    const raM = Math.floor((ra / 15 - raH) * 60);
    const raS = ((ra / 15 - raH) * 60 - raM) * 60;
    const decSign = dec >= 0 ? '+' : '-';
    const absDec = Math.abs(dec);
    const decD = Math.floor(absDec);
    const decM = Math.floor((absDec - decD) * 60);
    const decS = ((absDec - decD) * 60 - decM) * 60;
    return `${raH.toString().padStart(2, '0')}h ${raM.toString().padStart(2, '0')}m ${raS.toFixed(2).padStart(5, '0')}s, ${decSign}${decD.toString().padStart(2, '0')}° ${decM.toString().padStart(2, '0')}' ${decS.toFixed(1).padStart(4, '0')}"`;
  };

  return (
    <div className="p-4 border-b border-white/10 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-[#8ab4f8]">
        <Crosshair className="w-3.5 h-3.5" />
        <span>Astrometric Coordinates (J2000)</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="text-[10px] text-[#9aa0a6]">Right Ascension</div>
          <div className="text-[#f8f9fa] font-bold mt-0.5">{ra_deg.toFixed(5)}°</div>
        </div>
        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="text-[10px] text-[#9aa0a6]">Declination</div>
          <div className="text-[#f8f9fa] font-bold mt-0.5">{dec_deg.toFixed(5)}°</div>
        </div>
      </div>

      <div className="text-[11px] font-mono text-[#9aa0a6] px-1">
        Sexagesimal: <span className="text-[#e3e3e3]">{toSexagesimal(ra_deg, dec_deg)}</span>
      </div>

      {object.astrophysics?.distance_ly && (
        <div className="text-[11px] font-mono text-[#9aa0a6] px-1">
          Distance: <span className="text-[#81c995] font-bold">{object.astrophysics.distance_ly.toLocaleString()} light-years</span>
          {object.astrophysics.distance_pc && (
            <span className="text-[#9aa0a6]"> ({object.astrophysics.distance_pc.toLocaleString()} pc)</span>
          )}
        </div>
      )}
    </div>
  );
}
