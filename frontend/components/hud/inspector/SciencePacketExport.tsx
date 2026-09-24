'use client';

import React, { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Code2, Check, Copy } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface SciencePacketExportProps {
  object: UnifiedOdysseyObject;
}

export default function SciencePacketExport({ object }: SciencePacketExportProps) {
  const [copiedCode, setCopiedCode] = useState(false);

  const measurements = object.spherex?.spectrophotometry?.measurements || [];

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(object, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `SPHEREx_${object.identity.canonical_name.replace(/\s+/g, '_')}_packet.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCSV = () => {
    if (measurements.length === 0) return;
    const headers = 'band_index,wavelength_um,flux_ujy,flux_err_ujy,snr,lvf_id,det_id\n';
    const rows = measurements
      .map((m, idx) => {
        const snr = (m.flux_ujy != null && m.flux_err_ujy != null && m.flux_err_ujy > 0)
          ? (m.flux_ujy / m.flux_err_ujy).toFixed(1)
          : (m.snr != null ? m.snr.toFixed(1) : '');
        return `${idx + 1},${m.wavelength_um},${m.flux_ujy ?? ''},${m.flux_err_ujy ?? ''},${snr},${m.lvf_id ?? ''},${m.det_id ?? ''}`;
      })
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPHEREx_SED_${object.identity.canonical_name.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pythonSnippet = `# Programmatic retrieval via Astropy & IRSA TAP
from astropy.coordinates import SkyCoord
import astropy.units as u
from astroquery.ipac.irsa import Irsa

coord = SkyCoord(ra=${object.position.ra_deg.toFixed(5)}*u.deg, dec=${object.position.dec_deg.toFixed(5)}*u.deg, frame='icrs')
print(f"Querying SPHEREx QR3 at: {coord.to_string('hmsdms')}")

# Direct SIAv2 query
# query_url = f"https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr3&POS=CIRCLE+{coord.ra.deg}+{coord.dec.deg}+0.01"
`;

  const handleCopyCode = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(pythonSnippet);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="space-y-3 font-mono text-[11px]">
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
        <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider block">
          Export Scientific Data Packets
        </span>

        <div className="grid grid-cols-2 gap-2">
          {/* JSON Export */}
          <button
            onClick={handleExportJSON}
            className="p-3 rounded-xl bg-black/30 hover:bg-white/10 border border-white/5 hover:border-[#8ab4f8]/30 transition-all flex flex-col items-center gap-1.5 text-center group"
          >
            <FileJson className="w-5 h-5 text-[#8ab4f8] group-hover:scale-110 transition-transform" />
            <span className="font-bold text-[11px] text-[#f8f9fa]">Full JSON Packet</span>
            <span className="text-[9px] text-[#9aa0a6]">Metadata, Kinematics, Citations</span>
          </button>

          {/* CSV Export */}
          <button
            onClick={handleExportCSV}
            disabled={measurements.length === 0}
            className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1.5 text-center group ${
              measurements.length > 0
                ? 'bg-black/30 hover:bg-white/10 border-white/5 hover:border-[#81c995]/30'
                : 'bg-black/10 border-white/5 opacity-50 cursor-not-allowed'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5 text-[#81c995] group-hover:scale-110 transition-transform" />
            <span className="font-bold text-[11px] text-[#f8f9fa]">Photometry CSV</span>
            <span className="text-[9px] text-[#9aa0a6]">
              {measurements.length > 0 ? `${measurements.length} Channels` : 'Requires Extracted Spectrum'}
            </span>
          </button>
        </div>
      </div>

      {/* Astropy / Astroquery Code Snippet */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-[#fbbc04]" />
            <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider">
              Python / Astropy Query
            </span>
          </div>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 text-[10px] text-[#8ab4f8] hover:text-[#aecbfa]"
          >
            {copiedCode ? <Check className="w-3 h-3 text-[#81c995]" /> : <Copy className="w-3 h-3" />}
            <span>{copiedCode ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <pre className="p-2.5 rounded-xl bg-black/50 text-[9px] text-[#9aa0a6] overflow-x-auto border border-white/5 font-mono">
          {pythonSnippet}
        </pre>
      </div>
    </div>
  );
}
