'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, X, ChevronsLeft, ChevronsRight, Layers, Bookmark } from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function MapContentsSidebar() {
  const isMapContentsOpen = useUniverseStore((state) => state.isMapContentsOpen);
  const toggleMapContents = useUniverseStore((state) => state.toggleMapContents);

  // Layer States
  const activeRelease = useUniverseStore((state) => state.activeRelease);
  const setActiveRelease = useUniverseStore((state) => state.setActiveRelease);

  const spherexProducts = useUniverseStore((state) => state.spherexProducts);
  const toggleSpherexProduct = useUniverseStore((state) => state.toggleSpherexProduct);

  const historicalSurveys = useUniverseStore((state) => state.historicalSurveys);
  const toggleHistoricalSurvey = useUniverseStore((state) => state.toggleHistoricalSurvey);

  const solarSystemLayers = useUniverseStore((state) => state.solarSystemLayers);
  const toggleSolarSystemLayer = useUniverseStore((state) => state.toggleSolarSystemLayer);

  const catalogLayers = useUniverseStore((state) => state.catalogLayers);
  const toggleCatalogLayer = useUniverseStore((state) => state.toggleCatalogLayer);

  const scienceLayers = useUniverseStore((state) => state.scienceLayers);
  const toggleScienceLayer = useUniverseStore((state) => state.toggleScienceLayer);

  // Expandable sections (Level 1) - default SPHEREx open
  const [expandedSection, setExpandedSection] = useState<string>('spherex');

  const handleToggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? '' : section));
  };

  // If collapsed: Show compact Google Earth Pro edge handle
  if (!isMapContentsOpen) {
    return (
      <div className="relative z-30 h-full flex flex-col justify-start bg-[#10131A] border-r border-[#2B3140]">
        <button
          onClick={toggleMapContents}
          title="Show Map Contents Sidebar (Layers)"
          className="w-7 h-12 flex flex-col items-center justify-center text-[#A8B0BF] hover:text-[#F5F7FA] hover:bg-[#151922] transition-colors border-b border-[#2B3140]"
        >
          <ChevronsRight className="w-4 h-4" />
          <span className="text-[9px] mt-0.5 font-mono">◫</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="relative z-30 w-[340px] shrink-0 h-full bg-[#151922] border-r border-[#2B3140] flex flex-col select-none text-xs font-sans">
      {/* 1. Sidebar Header */}
      <div className="h-9 px-3 border-b border-[#2B3140] flex items-center justify-between bg-[#10131A]">
        <div className="flex items-center gap-1.5 font-semibold text-[#F5F7FA] tracking-tight">
          <Layers className="w-3.5 h-3.5 text-[#3159C7]" />
          <span>Map Contents</span>
        </div>
        <button
          onClick={toggleMapContents}
          title="Collapse Sidebar"
          className="text-[#A8B0BF] hover:text-[#F5F7FA] p-1 rounded hover:bg-[#2B3140]/60 transition-colors flex items-center"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Hierarchical Layer Tree */}
      <div className="flex-1 overflow-y-auto py-2 divide-y divide-[#2B3140]/40">
        {/* ================= SECTION 1: SPHEREx ================= */}
        <div className="py-1">
          <button
            onClick={() => handleToggleSection('spherex')}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[#F5F7FA] font-medium hover:bg-[#2B3140]/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {expandedSection === 'spherex' ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#A8B0BF]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#A8B0BF]" />
              )}
              <span className="text-[#00A6C7] font-semibold">SPHEREx</span>
            </div>
            <span className="text-[10px] font-mono text-[#A8B0BF]">All-Sky IR</span>
          </button>

          {expandedSection === 'spherex' && (
            <div className="pl-6 pr-3 py-1.5 space-y-2">
              {/* Releases Radio Options */}
              <div className="space-y-1 pl-1 border-l border-[#2B3140]">
                <label className="flex items-center gap-2 text-[#F5F7FA] cursor-pointer hover:text-white">
                  <input
                    type="radio"
                    name="spherexRelease"
                    checked={activeRelease === 'qr3'}
                    onChange={() => setActiveRelease('qr3')}
                    className="w-3.5 h-3.5"
                  />
                  <span>QR3 Default (Sep 2026)</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="radio"
                    name="spherexRelease"
                    checked={activeRelease === 'qr2'}
                    onChange={() => setActiveRelease('qr2')}
                    className="w-3.5 h-3.5"
                  />
                  <span>QR2 Compare (Mar 2026)</span>
                </label>
              </div>

              {/* Products Sub-tree */}
              <div className="pt-1.5 space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#A8B0BF]">
                  Products
                </div>
                <div className="space-y-1 pl-1 border-l border-[#2B3140]">
                  <label className="flex items-center gap-2 text-[#F5F7FA] cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={spherexProducts.imagery}
                      onChange={() => toggleSpherexProduct('imagery')}
                      className="w-3.5 h-3.5"
                    />
                    <span>Sky Imagery (HiPS)</span>
                  </label>

                  <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={spherexProducts.footprints}
                      onChange={() => toggleSpherexProduct('footprints')}
                      className="w-3.5 h-3.5"
                    />
                    <span>Observation Footprints</span>
                  </label>

                  <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={spherexProducts.wavelengthView}
                      onChange={() => toggleSpherexProduct('wavelengthView')}
                      className="w-3.5 h-3.5"
                    />
                    <span>Wavelength View</span>
                  </label>

                  <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={spherexProducts.sourceMarkers}
                      onChange={() => toggleSpherexProduct('sourceMarkers')}
                      className="w-3.5 h-3.5"
                    />
                    <span>Source Markers</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================= SECTION 2: HISTORICAL SURVEYS ================= */}
        <div className="py-1">
          <button
            onClick={() => handleToggleSection('historical')}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[#F5F7FA] font-medium hover:bg-[#2B3140]/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {expandedSection === 'historical' ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#A8B0BF]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#A8B0BF]" />
              )}
              <span>Historical Surveys</span>
            </div>
            <span className="text-[10px] font-mono text-[#A8B0BF]">2010–2024</span>
          </button>

          {expandedSection === 'historical' && (
            <div className="pl-6 pr-3 py-1.5 space-y-1">
              <div className="space-y-1 pl-1 border-l border-[#2B3140]">
                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={historicalSurveys.wise}
                    onChange={() => toggleHistoricalSurvey('wise')}
                    className="w-3.5 h-3.5"
                  />
                  <span>WISE (2010 All-Sky IR)</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={historicalSurveys.neowise}
                    onChange={() => toggleHistoricalSurvey('neowise')}
                    className="w-3.5 h-3.5"
                  />
                  <span>NEOWISE (2024 Final)</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={historicalSurveys.two_mass}
                    onChange={() => toggleHistoricalSurvey('two_mass')}
                    className="w-3.5 h-3.5"
                  />
                  <span>2MASS (1998 Near-IR)</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={historicalSurveys.dss2}
                    onChange={() => toggleHistoricalSurvey('dss2')}
                    className="w-3.5 h-3.5"
                  />
                  <span>DSS2 (Optical Baseline)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ================= SECTION 3: SOLAR SYSTEM ================= */}
        <div className="py-1">
          <button
            onClick={() => handleToggleSection('solarsystem')}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[#F5F7FA] font-medium hover:bg-[#2B3140]/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {expandedSection === 'solarsystem' ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#A8B0BF]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#A8B0BF]" />
              )}
              <span>Solar System</span>
            </div>
            <span className="text-[10px] font-mono text-[#A8B0BF]">JPL Horizons</span>
          </button>

          {expandedSection === 'solarsystem' && (
            <div className="pl-6 pr-3 py-1.5 space-y-1">
              <div className="space-y-1 pl-1 border-l border-[#2B3140]">
                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={solarSystemLayers.asteroids}
                    onChange={() => toggleSolarSystemLayer('asteroids')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Asteroids</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={solarSystemLayers.comets}
                    onChange={() => toggleSolarSystemLayer('comets')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Comets</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={solarSystemLayers.nearEarthObjects}
                    onChange={() => toggleSolarSystemLayer('nearEarthObjects')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Near-Earth Objects</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={solarSystemLayers.jplTrajectories}
                    onChange={() => toggleSolarSystemLayer('jplTrajectories')}
                    className="w-3.5 h-3.5"
                  />
                  <span>JPL Trajectories</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ================= SECTION 4: CATALOGS ================= */}
        <div className="py-1">
          <button
            onClick={() => handleToggleSection('catalogs')}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[#F5F7FA] font-medium hover:bg-[#2B3140]/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {expandedSection === 'catalogs' ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#A8B0BF]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#A8B0BF]" />
              )}
              <span>Catalogs</span>
            </div>
            <span className="text-[10px] font-mono text-[#A8B0BF]">CDS & ESA</span>
          </button>

          {expandedSection === 'catalogs' && (
            <div className="pl-6 pr-3 py-1.5 space-y-1">
              <div className="space-y-1 pl-1 border-l border-[#2B3140]">
                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={catalogLayers.gaia}
                    onChange={() => toggleCatalogLayer('gaia')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Gaia DR3 (Astrometry)</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={catalogLayers.simbad}
                    onChange={() => toggleCatalogLayer('simbad')}
                    className="w-3.5 h-3.5"
                  />
                  <span>SIMBAD (Stars & Galaxies)</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={catalogLayers.vizier}
                    onChange={() => toggleCatalogLayer('vizier')}
                    className="w-3.5 h-3.5"
                  />
                  <span>VizieR Catalogs</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={catalogLayers.jplSbdb}
                    onChange={() => toggleCatalogLayer('jplSbdb')}
                    className="w-3.5 h-3.5"
                  />
                  <span>JPL SBDB (Small Bodies)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ================= SECTION 5: SCIENCE ================= */}
        <div className="py-1">
          <button
            onClick={() => handleToggleSection('science')}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[#F5F7FA] font-medium hover:bg-[#2B3140]/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {expandedSection === 'science' ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#A8B0BF]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#A8B0BF]" />
              )}
              <span>Science</span>
            </div>
            <span className="text-[10px] font-mono text-[#A8B0BF]">Overlays</span>
          </button>

          {expandedSection === 'science' && (
            <div className="pl-6 pr-3 py-1.5 space-y-1">
              <div className="space-y-1 pl-1 border-l border-[#2B3140]">
                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={scienceLayers.movingObjects}
                    onChange={() => toggleScienceLayer('movingObjects')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Moving Objects</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={scienceLayers.variableSources}
                    onChange={() => toggleScienceLayer('variableSources')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Variable Sources</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={scienceLayers.changeDetection}
                    onChange={() => toggleScienceLayer('changeDetection')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Change Detection</span>
                </label>

                <label className="flex items-center gap-2 text-[#A8B0BF] cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={scienceLayers.spectralFeatures}
                    onChange={() => toggleScienceLayer('spectralFeatures')}
                    className="w-3.5 h-3.5"
                  />
                  <span>Spectral Features</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ================= SECTION 6: MY SKY ================= */}
        <div className="py-1">
          <button
            onClick={() => handleToggleSection('mysky')}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[#F5F7FA] font-medium hover:bg-[#2B3140]/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {expandedSection === 'mysky' ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#A8B0BF]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#A8B0BF]" />
              )}
              <span>My Sky</span>
            </div>
            <Bookmark className="w-3 h-3 text-[#A8B0BF]" />
          </button>

          {expandedSection === 'mysky' && (
            <div className="pl-6 pr-3 py-2 text-[#A8B0BF] text-[11px]">
              <p className="italic">No saved placemarks or custom coordinates.</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
