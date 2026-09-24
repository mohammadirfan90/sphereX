'use client';

import React from 'react';
import { ExternalLink, CheckCircle2, ShieldCheck, Database, BookOpen } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface ProvenanceSectionProps {
  object: UnifiedOdysseyObject;
}

export default function ProvenanceSection({ object }: ProvenanceSectionProps) {
  const literature = object.literature || [];

  return (
    <div className="space-y-3 font-mono text-[11px]">
      {/* Scientific Integrity Attestation */}
      <div className="p-3.5 rounded-2xl bg-[#81c995]/10 border border-[#81c995]/25 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[#81c995] font-bold text-xs font-sans">
          <ShieldCheck className="w-4 h-4" />
          <span>Scientific Data Provenance</span>
        </div>
        <p className="text-[10px] text-[#9aa0a6] font-sans leading-relaxed">
          Zero synthetic or fabricated data. All coordinates, spectrophotometry, astrometry, and orbital parameters are sourced from authentic live services or documented mission archives.
        </p>
      </div>

      {/* Mission Data Releases & DOIs */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-[#8ab4f8]" />
          <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider">
            Archive Data Releases & DOIs
          </span>
        </div>
        <div className="space-y-1.5 text-[10px]">
          <div className="p-2 rounded-xl bg-black/30 flex justify-between items-center">
            <div>
              <span className="text-[#f8f9fa] font-bold block">NASA SPHEREx Quick Release 3 (QR3)</span>
              <span className="text-[#9aa0a6]">IPAC / IRSA SIAv2 Service (Weekly Release)</span>
            </div>
            <a
              href="https://doi.org/10.26131/IRSA662"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#8ab4f8] hover:underline flex items-center gap-1"
            >
              <span>10.26131/IRSA662</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="p-2 rounded-xl bg-black/30 flex justify-between items-center">
            <div>
              <span className="text-[#f8f9fa] font-bold block">NASA SPHEREx Quick Release 2 (QR2)</span>
              <span className="text-[#9aa0a6]">IPAC / IRSA Reprocessed All-Sky Baseline</span>
            </div>
            <a
              href="https://doi.org/10.26131/IRSA652"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#8ab4f8] hover:underline flex items-center gap-1"
            >
              <span>10.26131/IRSA652</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Literature Citations */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-[#8ab4f8]" />
          <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider">
            NASA ADS Literature ({literature.length})
          </span>
        </div>

        {literature.length > 0 ? (
          <div className="space-y-2">
            {literature.map((lit, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-black/30 space-y-1">
                <a
                  href={lit.ads_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans font-medium text-[11px] text-[#8ab4f8] hover:underline flex items-start justify-between gap-2"
                >
                  <span className="line-clamp-2">{lit.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                </a>
                <div className="flex justify-between items-center text-[9px] text-[#9aa0a6]">
                  <span>Bibcode: {lit.bibcode}</span>
                  {lit.year && <span>{lit.year}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-black/20 text-center text-[#9aa0a6] font-sans text-[11px]">
            No direct NASA ADS papers indexed for this target name.
          </div>
        )}
      </div>
    </div>
  );
}
