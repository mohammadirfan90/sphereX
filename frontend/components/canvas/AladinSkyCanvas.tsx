'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BenchmarkTarget } from '@/lib/benchmarkTargets';
import { UnifiedOdysseyObject } from '@/types';
import Script from 'next/script';
import { useUniverseStore } from '@/store/useUniverseStore';
import { formatMultiFrameCoordinates } from '@/lib/astronomicalCoordinates';

interface AladinSkyCanvasProps {
  currentEpochId: string;
  activeBandIndex: number;
  selectedTarget: BenchmarkTarget | UnifiedOdysseyObject | null;
  onSelectTarget: (target: BenchmarkTarget) => void;
  onCoordinatesChange: (coords: { ra: number; dec: number; fov: number }) => void;
  targets: BenchmarkTarget[];
  activeSurveyUrl: string;
}

declare global {
  interface Window {
    A?: {
      init?: Promise<void>;
      aladin: (
        container: string | HTMLElement,
        options: Record<string, unknown>
      ) => any;
      catalog: (options: Record<string, unknown>) => any;
      marker: (ra: number, dec: number, options: Record<string, unknown>) => any;
    };
    __aladin?: any;
  }
}

function normalizeHiPSSurvey(url?: string): string {
  if (!url) return 'https://skies.esac.esa.int/AllWISEColor';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const clean = url.replace(/^CDS\//i, '');
  if (clean.includes('allWISE') || clean.includes('wise')) {
    return 'https://skies.esac.esa.int/AllWISEColor';
  }
  if (clean.includes('2MASS')) {
    return 'https://skies.esac.esa.int/2MASS/Color';
  }
  if (clean.includes('DSS')) {
    return 'https://skies.esac.esa.int/DSSColor';
  }
  return clean;
}

export default function AladinSkyCanvas({
  currentEpochId,
  activeBandIndex,
  selectedTarget,
  onSelectTarget,
  onCoordinatesChange,
  targets,
  activeSurveyUrl,
}: AladinSkyCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aladinInstanceRef = useRef<any>(null);
  const [isAladinLoaded, setIsAladinLoaded] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  // Global astronomical state
  const coordinateFrame = useUniverseStore((state) => state.coordinateFrame);
  const activeProjection = useUniverseStore((state) => state.activeProjection);
  const isCooGridVisible = useUniverseStore((state) => state.isCooGridVisible);
  const setCursorCoords = useUniverseStore((state) => state.setCursorCoords);

  // Initialize Aladin Lite v3 instance
  useEffect(() => {
    // Watchdog timeout to ensure UI is never permanently blocked
    const watchdogTimer = setTimeout(() => {
      if (!canvasReady) {
        setCanvasReady(true);
      }
    }, 2500);

    if (!isAladinLoaded || !containerRef.current || aladinInstanceRef.current) {
      return () => clearTimeout(watchdogTimer);
    }

    let isMounted = true;

    const initAladin = async () => {
      try {
        if (window.A) {
          if (window.A.init) {
            await window.A.init;
          }
          if (!isMounted || !containerRef.current || aladinInstanceRef.current) return;

          const validSurvey = normalizeHiPSSurvey(activeSurveyUrl);
          const aladin = window.A.aladin(containerRef.current, {
            survey: validSurvey,
            projection: 'MER',
            cooFrame: 'Galactic',
            fov: 130,
            target: '0 0', // Galactic center (l=0, b=0)
            lockNorthUp: true,
            inertia: false,
            showReticle: false,
            showZoomControl: false,
            showFullscreenControl: false,
            showLayersControl: false,
            showGotoControl: false,
            showShareControl: false,
            showCoordinates: false,
            showProjectionControl: false,
            showFrame: false,
            showContextMenu: false,
          });

          // Ensure 2D planar projection and active celestial frame
          if (typeof aladin.setProjection === 'function') {
            aladin.setProjection(activeProjection || 'MER');
          }
          if (typeof aladin.setFrame === 'function') {
            aladin.setFrame(coordinateFrame || 'Galactic');
          }
          if (typeof aladin.setFov === 'function') {
            aladin.setFov(130);
          }

          // Enable mathematical coordinate grid
          if (typeof aladin.showCooGrid === 'function' && isCooGridVisible) {
            aladin.showCooGrid({ color: '#8ab4f8', opacity: 0.35, labelColor: '#e3e3e3' });
          }

          // Lock orientation and disable slippery inertia for solid, user-friendly 2D navigation
          if (aladin.view && aladin.view.wasm) {
            if (typeof aladin.view.wasm.lockNorthUp === 'function') {
              aladin.view.wasm.lockNorthUp();
            }
            if (typeof aladin.view.wasm.setInertia === 'function') {
              aladin.view.wasm.setInertia(false);
            }
          }
          aladin.lockNorthUp = true;

          aladinInstanceRef.current = aladin;
          if (typeof window !== 'undefined') {
            window.__aladin = aladin;
          }
          setCanvasReady(true);

          // Safeguard: Prevent Aladin Lite's default ondrop from crashing on non-FITS files or images without WCS
          if (containerRef.current) {
            const containerEl = containerRef.current;
            containerEl.ondragover = (ev: DragEvent) => ev.preventDefault();
            containerEl.ondrop = (ev: DragEvent) => {
              ev.preventDefault();
              ev.stopPropagation();
            };
            const innerCanvas = containerEl.querySelector('canvas');
            if (innerCanvas) {
              innerCanvas.ondragover = (ev: DragEvent) => ev.preventDefault();
              innerCanvas.ondrop = (ev: DragEvent) => {
                ev.preventDefault();
                ev.stopPropagation();
              };
            }

            // Real-time mouse inverse projection to true celestial coordinates
            const handleMouseMove = (ev: MouseEvent) => {
              if (!aladinInstanceRef.current || !containerRef.current) return;
              const rect = containerRef.current.getBoundingClientRect();
              const x = ev.clientX - rect.left;
              const y = ev.clientY - rect.top;
              try {
                if (typeof aladinInstanceRef.current.pix2world === 'function') {
                  const world = aladinInstanceRef.current.pix2world(x, y, 'icrs');
                  if (world && Array.isArray(world) && world.length >= 2) {
                    const [ra, dec] = world;
                    if (typeof ra === 'number' && typeof dec === 'number' && !isNaN(ra) && !isNaN(dec)) {
                      const multi = formatMultiFrameCoordinates(ra, dec);
                      setCursorCoords(multi);
                    }
                  }
                }
              } catch (err) {
                // Ignore off-sky / projection singularity coordinates
              }
            };

            const handleMouseLeave = () => {
              setCursorCoords(null);
            };

            containerEl.addEventListener('mousemove', handleMouseMove);
            containerEl.addEventListener('mouseleave', handleMouseLeave);
          }

          // Listen for view changes
          aladin.on('positionChanged', () => {
            if (!isMounted) return;
            const [ra, dec] = aladin.getRaDec();
            const fov = aladin.getFov()[0];
            onCoordinatesChange({ ra: Number(ra.toFixed(4)), dec: Number(dec.toFixed(4)), fov: Number(fov.toFixed(2)) });
          });
        }
      } catch (e) {
        console.warn('Aladin Lite WebGL initialization notice:', e);
        if (isMounted) setCanvasReady(true);
      }
    };

    // Catch and gracefully handle any asynchronous Aladin Lite FITS/WCS parse rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason || '');
      if (
        reason.includes('No WCS have been found') ||
        reason.includes('Image HDU not found') ||
        reason.includes('Fail to interpret')
      ) {
        event.preventDefault();
        console.warn('Aladin Lite file format handled gracefully:', reason);
      }
    };

    const handleError = (event: ErrorEvent) => {
      const msg = String(event.message || '');
      if (
        msg.includes('No WCS have been found') ||
        msg.includes('Image HDU not found') ||
        msg.includes('Fail to interpret')
      ) {
        event.preventDefault();
        console.warn('Aladin Lite internal file error suppressed:', msg);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    initAladin();

    return () => {
      isMounted = false;
      clearTimeout(watchdogTimer);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      if (typeof window !== 'undefined' && window.__aladin === aladinInstanceRef.current) {
        delete window.__aladin;
      }
      aladinInstanceRef.current = null;
    };
  }, [isAladinLoaded, onSelectTarget, onCoordinatesChange, targets, activeSurveyUrl]);

  // Smooth flight to target when selectedTarget changes
  useEffect(() => {
    if (aladinInstanceRef.current && selectedTarget) {
      try {
        const ra = 'ra_deg' in selectedTarget ? selectedTarget.ra_deg : (selectedTarget as UnifiedOdysseyObject).position?.ra_deg;
        const dec = 'dec_deg' in selectedTarget ? selectedTarget.dec_deg : (selectedTarget as UnifiedOdysseyObject).position?.dec_deg;
        if (ra !== undefined && dec !== undefined) {
          aladinInstanceRef.current.animateToRaDec(ra, dec, 1.2);
        }
      } catch (e) {
        console.warn('Aladin navigation animation error:', e);
      }
    }
  }, [selectedTarget]);

  // Dynamically update survey when activeSurveyUrl changes
  useEffect(() => {
    if (aladinInstanceRef.current && activeSurveyUrl) {
      try {
        const norm = normalizeHiPSSurvey(activeSurveyUrl);
        aladinInstanceRef.current.setImageSurvey(norm);
      } catch (e) {
        console.warn('Aladin setImageSurvey notice:', e);
      }
    }
  }, [activeSurveyUrl]);

  // Synchronize coordinate frame
  useEffect(() => {
    if (aladinInstanceRef.current && coordinateFrame) {
      try {
        if (typeof aladinInstanceRef.current.setFrame === 'function') {
          aladinInstanceRef.current.setFrame(coordinateFrame);
        }
      } catch (e) {
        console.warn('Aladin setFrame notice:', e);
      }
    }
  }, [coordinateFrame]);

  // Synchronize projection
  useEffect(() => {
    if (aladinInstanceRef.current && activeProjection) {
      try {
        if (typeof aladinInstanceRef.current.setProjection === 'function') {
          aladinInstanceRef.current.setProjection(activeProjection);
        }
      } catch (e) {
        console.warn('Aladin setProjection notice:', e);
      }
    }
  }, [activeProjection]);

  // Synchronize coordinate grid visibility
  useEffect(() => {
    if (aladinInstanceRef.current) {
      try {
        if (isCooGridVisible && typeof aladinInstanceRef.current.showCooGrid === 'function') {
          aladinInstanceRef.current.showCooGrid({ color: '#8ab4f8', opacity: 0.35, labelColor: '#e3e3e3' });
        } else if (!isCooGridVisible && typeof aladinInstanceRef.current.hideCooGrid === 'function') {
          aladinInstanceRef.current.hideCooGrid();
        }
      } catch (e) {
        console.warn('Aladin showCooGrid notice:', e);
      }
    }
  }, [isCooGridVisible]);

  return (
    <div className="relative w-full h-full bg-[#080a0f] overflow-hidden">
      {/* Aladin Lite v3 Official Stylesheet */}
      <link
        rel="stylesheet"
        href="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.min.css"
      />

      {/* Aladin Lite v3 External CDN Script */}
      <Script
        src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"
        strategy="afterInteractive"
        onLoad={() => setIsAladinLoaded(true)}
      />

      {/* Aladin Canvas Mount Container */}
      <div
        id="aladin-lite-div"
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Photorealistic Celestial Canvas Fallback / Ambient Overlay */}
      {!canvasReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#080a0f] via-[#0d111a] to-[#080a0f] pointer-events-none">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 rounded-full border border-[#8ab4f8]/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-t-[#8ab4f8] border-r-[#ff7563] border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-6 rounded-full bg-[#121620] flex items-center justify-center text-xs font-mono text-[#8ab4f8]">
              SPX
            </div>
          </div>
          <p className="text-sm font-sans tracking-wide text-[#f8f9fa] font-medium">
            Loading Celestial HiPS Survey...
          </p>
          <p className="text-xs font-mono text-[#9aa0a6] mt-1">
            SPHEREx 102-Band Near-IR WebGL Canvas
          </p>
        </div>
      )}
    </div>
  );
}
