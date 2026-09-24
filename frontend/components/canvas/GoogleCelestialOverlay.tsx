'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  MAJOR_CONSTELLATIONS,
  CELESTIAL_REGIONS,
  LANDMARK_STARS,
  getGalacticPlanePoints,
  getEclipticPlanePoints,
  CelestialRegionDef,
  LandmarkStarDef,
} from '@/lib/celestialAtlas';
import { useUniverseStore } from '@/store/useUniverseStore';
import { Compass, Sparkles, Disc, Radio } from 'lucide-react';

interface ProjectedItem {
  id: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  type: 'constellation' | 'region' | 'star' | 'plane';
  data?: any;
}

interface AsterismLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  visible: boolean;
}

export default function GoogleCelestialOverlay() {
  const mapStyle = useUniverseStore((state) => state.mapStyle);
  const spherexProducts = useUniverseStore((state) => state.spherexProducts);
  const catalogLayers = useUniverseStore((state) => state.catalogLayers);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);

  const [projectedStars, setProjectedStars] = useState<ProjectedItem[]>([]);
  const [projectedRegions, setProjectedRegions] = useState<ProjectedItem[]>([]);
  const [projectedConstellations, setProjectedConstellations] = useState<ProjectedItem[]>([]);
  const [asterismLines, setAsterismLines] = useState<AsterismLine[]>([]);
  const [galacticPlaneSvg, setGalacticPlaneSvg] = useState<string>('');
  const [celestialEquatorSvg, setCelestialEquatorSvg] = useState<string>('');
  const [eclipticPlaneSvg, setEclipticPlaneSvg] = useState<string>('');

  const [hoveredStar, setHoveredStar] = useState<LandmarkStarDef | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<CelestialRegionDef | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // If map style is clean, hide all labels and overlays
  const isClean = mapStyle === 'clean';
  const isEverything = mapStyle === 'everything';
  const showFootprints = spherexProducts.footprints || isEverything;

  const updateProjections = useCallback(() => {
    const aladin = (window as any).__aladin;
    if (!aladin || !containerRef.current || isClean) {
      setProjectedStars([]);
      setProjectedRegions([]);
      setProjectedConstellations([]);
      setAsterismLines([]);
      setGalacticPlaneSvg('');
      setCelestialEquatorSvg('');
      setEclipticPlaneSvg('');
      return;
    }

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;
    const fov = aladin.getFov ? aladin.getFov()[0] : 180;

    const isVisibleInViewport = (pt: any) => {
      if (!pt) return false;
      const x = pt[0] ?? pt.x;
      const y = pt[1] ?? pt.y;
      if (typeof x !== 'number' || typeof y !== 'number') return false;
      return x >= -40 && x <= width + 40 && y >= -40 && y <= height + 40;
    };

    // 1. Project Major Constellations
    const pConstellations: ProjectedItem[] = [];
    MAJOR_CONSTELLATIONS.forEach((c) => {
      const pt = aladin.world2pix(c.centerRa, c.centerDec);
      if (isVisibleInViewport(pt)) {
        pConstellations.push({
          id: c.id,
          name: c.name,
          x: pt[0],
          y: pt[1],
          visible: true,
          type: 'constellation',
          data: c,
        });
      }
    });
    setProjectedConstellations(pConstellations);

    // 2. Project Constellation Asterism Lines
    const pLines: AsterismLine[] = [];
    MAJOR_CONSTELLATIONS.forEach((c) => {
      for (let i = 0; i < c.asterism.length; i += 2) {
        if (i + 1 >= c.asterism.length) break;
        const p1 = aladin.world2pix(c.asterism[i][0], c.asterism[i][1]);
        const p2 = aladin.world2pix(c.asterism[i + 1][0], c.asterism[i + 1][1]);
        if (p1 && p2 && isVisibleInViewport(p1) && isVisibleInViewport(p2)) {
          // Check line length to prevent wrapping around edge of sphere
          const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          if (dist < Math.max(width, height) * 0.75) {
            pLines.push({
              id: `${c.id}_${i}`,
              x1: p1[0],
              y1: p1[1],
              x2: p2[0],
              y2: p2[1],
              visible: true,
            });
          }
        }
      }
    });
    setAsterismLines(pLines);

    // 3. Project Astronomical Regions (Continents & Complexes)
    const pRegions: ProjectedItem[] = [];
    CELESTIAL_REGIONS.forEach((r) => {
      const pt = aladin.world2pix(r.ra, r.dec);
      if (isVisibleInViewport(pt)) {
        pRegions.push({
          id: r.id,
          name: r.name,
          x: pt[0],
          y: pt[1],
          visible: true,
          type: 'region',
          data: r,
        });
      }
    });
    setProjectedRegions(pRegions);

    // 4. Project Landmark Stars
    const pStars: ProjectedItem[] = [];
    LANDMARK_STARS.forEach((s) => {
      const pt = aladin.world2pix(s.ra, s.dec);
      if (isVisibleInViewport(pt)) {
        pStars.push({
          id: s.name,
          name: s.name,
          x: pt[0],
          y: pt[1],
          visible: true,
          type: 'star',
          data: s,
        });
      }
    });
    setProjectedStars(pStars);

    // 5. Great Reference Circles (Galactic Plane, Celestial Equator, Ecliptic)
    const buildPathSvg = (points: Array<[number, number]>) => {
      let d = '';
      let prevPt: any = null;
      for (const [ra, dec] of points) {
        const pt = aladin.world2pix(ra, dec);
        if (pt && isVisibleInViewport(pt)) {
          if (!prevPt) {
            d += `M ${pt[0].toFixed(1)} ${pt[1].toFixed(1)} `;
          } else {
            const dist = Math.hypot(pt[0] - prevPt[0], pt[1] - prevPt[1]);
            if (dist < 150) {
              d += `L ${pt[0].toFixed(1)} ${pt[1].toFixed(1)} `;
            } else {
              d += `M ${pt[0].toFixed(1)} ${pt[1].toFixed(1)} `;
            }
          }
          prevPt = pt;
        } else {
          prevPt = null;
        }
      }
      return d;
    };

    if (isEverything) {
      setGalacticPlaneSvg(buildPathSvg(getGalacticPlanePoints(3)));
      // Celestial Equator (dec = 0)
      const eqPts: Array<[number, number]> = [];
      for (let r = 0; r <= 360; r += 3) eqPts.push([r, 0]);
      setCelestialEquatorSvg(buildPathSvg(eqPts));
      setEclipticPlaneSvg(buildPathSvg(getEclipticPlanePoints(3)));
    } else {
      setGalacticPlaneSvg('');
      setCelestialEquatorSvg('');
      setEclipticPlaneSvg('');
    }
  }, [isClean, isEverything]);

  // Hook into Aladin Lite animation frame and view updates
  useEffect(() => {
    let active = true;

    const checkAndBind = () => {
      const aladin = (window as any).__aladin;
      if (aladin && typeof aladin.on === 'function') {
        aladin.on('positionChanged', updateProjections);
        aladin.on('zoomChanged', updateProjections);
        updateProjections();
      } else if (active) {
        setTimeout(checkAndBind, 200);
      }
    };

    checkAndBind();

    // High performance smooth interpolation loop
    const tick = () => {
      if (active) {
        updateProjections();
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const aladin = (window as any).__aladin;
      if (aladin && typeof aladin.removeListener === 'function') {
        aladin.removeListener('positionChanged', updateProjections);
        aladin.removeListener('zoomChanged', updateProjections);
      }
    };
  }, [updateProjections]);

  if (isClean) return null;

  return (
    <div
      ref={containerRef}
      id="google-celestial-overlay"
      className="absolute inset-0 pointer-events-none select-none z-10 overflow-hidden"
    >
      {/* ── SVG Canvas for Asterism Lines & Celestial Circles ── */}
      <svg className="w-full h-full absolute inset-0">
        <defs>
          <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Constellation Asterism Lines */}
        {asterismLines.map((line) => (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(138, 180, 248, 0.35)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            filter="url(#glow-line)"
          />
        ))}

        {/* 2. Galactic Plane (Milky Way Disk) */}
        {galacticPlaneSvg && (
          <path
            d={galacticPlaneSvg}
            fill="none"
            stroke="rgba(251, 188, 4, 0.45)"
            strokeWidth="1.8"
            strokeDasharray="8 6"
          />
        )}

        {/* 3. Celestial Equator */}
        {celestialEquatorSvg && (
          <path
            d={celestialEquatorSvg}
            fill="none"
            stroke="rgba(77, 208, 225, 0.40)"
            strokeWidth="1.4"
            strokeDasharray="6 4"
          />
        )}

        {/* 4. Ecliptic Plane */}
        {eclipticPlaneSvg && (
          <path
            d={eclipticPlaneSvg}
            fill="none"
            stroke="rgba(206, 147, 216, 0.35)"
            strokeWidth="1.4"
            strokeDasharray="5 5"
          />
        )}
      </svg>

      {/* ── Constellation Names (Google Earth Large Geographies) ── */}
      {projectedConstellations.map((item) => (
        <div
          key={item.id}
          style={{
            transform: `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%)`,
          }}
          className="absolute flex flex-col items-center justify-center transition-transform duration-75 ease-out"
        >
          <span className="text-[13px] sm:text-[15px] font-sans font-black tracking-[0.3em] uppercase text-white/80 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
            {item.name}
          </span>
          <span className="text-[10px] font-sans tracking-widest text-[#9AA0A6]/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] italic">
            {item.data?.englishName}
          </span>
        </div>
      ))}

      {/* ── Astronomical Regions (Google Earth Regional Labels & Complexes) ── */}
      {projectedRegions.map((item) => {
        const r = item.data as CelestialRegionDef;
        return (
          <div
            key={item.id}
            style={{
              transform: `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%)`,
            }}
            className="absolute pointer-events-auto transition-transform duration-75 ease-out"
            onMouseEnter={() => setHoveredRegion(r)}
            onMouseLeave={() => setHoveredRegion(null)}
          >
            <button
              onClick={() => {
                const aladin = (window as any).__aladin;
                if (aladin && typeof aladin.animateToRaDec === 'function') {
                  aladin.animateToRaDec(r.ra, r.dec, 1.2);
                }
                fetchAndSelectTarget(r.name);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1B1C1D]/80 hover:bg-[#1B1C1D] border border-[#8AB4F8]/40 hover:border-[#8AB4F8] shadow-[0_4px_16px_rgba(0,0,0,0.7)] backdrop-blur-md text-left group transition-all"
            >
              <div className="w-2 h-2 rounded-full bg-[#8AB4F8] animate-pulse shadow-[0_0_8px_#8AB4F8]" />
              <span className="text-[11px] font-sans font-bold text-[#E3E3E3] group-hover:text-white tracking-wide">
                {r.name}
              </span>
            </button>
          </div>
        );
      })}

      {/* ── Landmark Stars (Google Earth Cities & Landmark Pins) ── */}
      {projectedStars.map((item) => {
        const star = item.data as LandmarkStarDef;
        const isSelected = item.name.toLowerCase().includes('0855') || item.name.toLowerCase().includes('barnard');

        return (
          <div
            key={item.id}
            style={{
              transform: `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%)`,
            }}
            className="absolute pointer-events-auto transition-transform duration-75 ease-out"
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(null)}
          >
            <button
              onClick={() => {
                const aladin = (window as any).__aladin;
                if (aladin && typeof aladin.animateToRaDec === 'function') {
                  aladin.animateToRaDec(star.ra, star.dec, 1.2);
                }
                fetchAndSelectTarget(star.name);
              }}
              className="flex items-center gap-1.5 group cursor-pointer"
            >
              {/* Star Pinpoint Dot */}
              <div
                className={`w-2.5 h-2.5 rounded-full border border-white flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-[#FF7563] shadow-[0_0_12px_#FF7563] scale-125'
                    : 'bg-[#8AB4F8] shadow-[0_0_8px_#8AB4F8] group-hover:scale-125'
                }`}
              >
                <div className="w-1 h-1 rounded-full bg-white" />
              </div>

              {/* Star Name & Magnitude Pill */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#131314]/80 group-hover:bg-[#131314] border border-white/15 group-hover:border-[#8AB4F8]/60 shadow-[0_2px_8px_rgba(0,0,0,0.8)] backdrop-blur-sm transition-all">
                <span className="text-[11px] font-sans font-semibold text-[#E3E3E3] group-hover:text-white leading-none whitespace-nowrap">
                  {star.name}
                </span>
                <span className="text-[10px] font-mono text-[#9AA0A6] leading-none">
                  {star.vMag > 0 ? `+${star.vMag}` : star.vMag}m
                </span>
              </div>
            </button>
          </div>
        );
      })}

      {/* ── Hovered Star Preview Card (Google Earth Landmark Card) ── */}
      {hoveredStar && (
        <div className="fixed top-20 right-6 z-50 w-72 bg-[#1B1C1D]/95 backdrop-blur-2xl rounded-2xl border border-white/15 p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.8)] text-xs text-[#E3E3E3] pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
            <div>
              <h4 className="font-bold text-sm text-white">{hoveredStar.name}</h4>
              <span className="text-[11px] text-[#8AB4F8] font-mono">
                {hoveredStar.bayer} · {hoveredStar.constellation}
              </span>
            </div>
            <div className="px-2 py-0.5 rounded bg-white/10 font-mono text-[10px]">
              {hoveredStar.spectralType}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-2">
            <div>
              <span className="text-[#9AA0A6] block text-[10px]">Distance</span>
              <span>{hoveredStar.distanceLy} ly</span>
            </div>
            <div>
              <span className="text-[#9AA0A6] block text-[10px]">Apparent Mag</span>
              <span>{hoveredStar.vMag}</span>
            </div>
            <div>
              <span className="text-[#9AA0A6] block text-[10px]">Coordinates</span>
              <span>
                {hoveredStar.ra.toFixed(2)}°, {hoveredStar.dec.toFixed(2)}°
              </span>
            </div>
          </div>
          {hoveredStar.notes && (
            <p className="text-[11px] text-[#9AA0A6] border-t border-white/10 pt-2 leading-relaxed">
              {hoveredStar.notes}
            </p>
          )}
        </div>
      )}

      {/* ── Hovered Region Preview Card (Google Earth Continent/Region Card) ── */}
      {hoveredRegion && (
        <div className="fixed top-20 right-6 z-50 w-80 bg-[#1B1C1D]/95 backdrop-blur-2xl rounded-2xl border border-[#8AB4F8]/30 p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.8)] text-xs text-[#E3E3E3] pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#8AB4F8]/15 border border-[#8AB4F8]/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-[#8AB4F8]" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">{hoveredRegion.name}</h4>
              <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-mono">
                {hoveredRegion.category.replace('_', ' ')}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-[#BDC1C6] leading-relaxed mb-2.5">
            {hoveredRegion.description}
          </p>
          <div className="border-t border-white/10 pt-2">
            <span className="text-[10px] font-mono text-[#8AB4F8] block mb-1">
              Key Features:
            </span>
            <div className="flex flex-wrap gap-1">
              {hoveredRegion.keyFeatures.map((f, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#E3E3E3]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
