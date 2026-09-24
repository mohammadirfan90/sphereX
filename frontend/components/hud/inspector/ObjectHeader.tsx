'use client';

import React, { useState } from 'react';
import { X, Bookmark, BookmarkCheck, Share2, Orbit, Sparkles } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface ObjectHeaderProps {
  object: UnifiedOdysseyObject;
  onClose: () => void;
}

export default function ObjectHeader({ object, onClose }: ObjectHeaderProps) {
  const [isSaved, setIsSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isSmallBody = !!object.solar_system;

  return (
    <div className="p-4 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider ${
              isSmallBody
                ? 'bg-[#ff7563]/15 text-[#ff7563] border border-[#ff7563]/30'
                : 'bg-[#8ab4f8]/15 text-[#8ab4f8] border border-[#8ab4f8]/30'
            }`}>
              {object.identity.object_type}
            </span>
            {object.status && (
              <span className="text-[10px] font-mono text-[#9aa0a6] bg-white/5 px-2 py-0.5 rounded-full">
                {object.status}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-[#f8f9fa] tracking-tight font-sans truncate">
            {object.identity.canonical_name}
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono text-[#9aa0a6] mt-0.5">
            {object.identity.simbad_id && (
              <span>SIMBAD: {object.identity.simbad_id}</span>
            )}
            {object.identity.gaia_dr3_id && (
              <>
                <span>·</span>
                <span>Gaia DR3: {object.identity.gaia_dr3_id}</span>
              </>
            )}
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSaved(!isSaved)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#9aa0a6] hover:text-[#f8f9fa] transition-colors"
            title={isSaved ? 'Remove Bookmark' : 'Save Celestial Target'}
          >
            {isSaved ? <BookmarkCheck className="w-4 h-4 text-[#8ab4f8]" /> : <Bookmark className="w-4 h-4" />}
          </button>
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#9aa0a6] hover:text-[#f8f9fa] transition-colors relative"
            title="Share Target"
          >
            <Share2 className="w-4 h-4" />
            {copied && (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#8ab4f8] text-[#0d111a] text-[10px] font-bold">
                Copied!
              </span>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#9aa0a6] hover:text-[#f8f9fa] transition-colors"
            title="Close Inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
