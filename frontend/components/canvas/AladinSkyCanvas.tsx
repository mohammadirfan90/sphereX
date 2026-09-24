'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BenchmarkTarget } from '@/lib/benchmarkTargets';
import { UnifiedOdysseyObject } from '@/types';
import Script from 'next/script';
import { useUniverseStore } from '@/store/useUniverseStore';
import { formatMultiFrameCoordinates } from '@/lib/astronomicalCoordinates';
import { CameraGenerationScheduler } from '@/lib/astronomy/zoomResolutionController';
import { getSurveyDefinition } from '@/lib/astronomy/surveyRegistry';

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
  if (!url) return 'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (url.includes('AllWISEColor')) {
      return 'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1';
    }
    return url;
  }
  const clean = url.replace(/^CDS\//i, '');
  if (clean.includes('allWISE') || clean.includes('wise')) {
    return 'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1';
  }
  if (clean.includes('2MASS')) {
    return 'https://alaskybis.cds.unistra.fr/2MASS/Color';
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
  const generationSchedulerRef = useRef<CameraGenerationScheduler>(new CameraGenerationScheduler());

  // Global astronomical state
  const coordinateFrame = useUniverseStore((state) => state.coordinateFrame);
  const activeProjection = useUniverseStore((state) => state.activeProjection);
  const isCooGridVisible = useUniverseStore((state) => state.isCooGridVisible);
  const setCursorCoords = useUniverseStore((state) => state.setCursorCoords);
  const setTileStreamingStatus = useUniverseStore((state) => state.setTileStreamingStatus);

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
    let resizeObserver: ResizeObserver | null = null;
    let perfObserver: PerformanceObserver | null = null;
    let telemetryTimer: NodeJS.Timeout | null = null;
    let loadedTilesCount = 0;
    let activeRequestsCount = 0;
    let stalledOrderCycles = 0;

    // Intercept fetch for real-time in-flight HiPS tile request tracking
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] && (args[0] as Request).url
          ? (args[0] as Request).url
          : '';
      const isHiPSTile =
        url.includes('/Norder') ||
        url.includes('.jpg') ||
        url.includes('.fits') ||
        url.includes('hips');
      if (isHiPSTile) {
        activeRequestsCount++;
      }
      try {
        const res = await originalFetch.apply(this, args);
        if (isHiPSTile) {
          activeRequestsCount = Math.max(0, activeRequestsCount - 1);
          loadedTilesCount++;
        }
        return res;
      } catch (err) {
        if (isHiPSTile) {
          activeRequestsCount = Math.max(0, activeRequestsCount - 1);
        }
        throw err;
      }
    };

    // PerformanceObserver to track resource transfer
    try {
      perfObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (
            entry.name.includes('/Norder') ||
            entry.name.includes('.jpg') ||
            entry.name.includes('.fits')
          ) {
            loadedTilesCount++;
          }
        }
      });
      perfObserver.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // PerformanceObserver fallback
    }

    // Expose global force sync
    (window as any).__forceSyncHiPS = () => {
      if (aladinInstanceRef.current?.view) {
        if (typeof aladinInstanceRef.current.view.requestRedraw === 'function') {
          aladinInstanceRef.current.view.requestRedraw();
        }
        if (
          aladinInstanceRef.current.view.wasm &&
          typeof aladinInstanceRef.current.view.wasm.update === 'function'
        ) {
          aladinInstanceRef.current.view.wasm.update();
        }
      }
    };

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
            cooFrame: 'ICRS',
            fov: 130,
            target: '0 0',
            lockNorthUp: true,
            inertia: false,
            pixelateCanvas: false,
            reduceDeformations: true,
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
            aladin.setFrame(coordinateFrame || 'ICRS');
          }
          if (typeof aladin.setFov === 'function') {
            aladin.setFov(130);
          }

          // Enable mathematical coordinate grid with subtle styling
          if (isCooGridVisible) {
            if (typeof aladin.setCooGrid === 'function') {
              aladin.setCooGrid({
                enabled: true,
                color: '#9aa0a6',
                opacity: 0.15,
                thickness: 0.5,
                labelSize: 10,
                showLabels: true,
                fmt: 'decimal',
              });
            } else if (typeof aladin.showCooGrid === 'function') {
              aladin.showCooGrid({ color: '#9aa0a6', opacity: 0.15, labelColor: '#9aa0a6' });
            }
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

          // Telemetry and auto-recovery watchdog loop
          telemetryTimer = setInterval(() => {
            if (!isMounted || !aladinInstanceRef.current) return;
            const inst = aladinInstanceRef.current;
            const wasm = inst.view?.wasm;
            const currentOrder =
              wasm && typeof wasm.getNOrder === 'function' ? wasm.getNOrder() : 1;
            const bkg = inst.getBaseImageLayer ? inst.getBaseImageLayer() : null;
            const maxOrder = bkg?.maxOrder || 8;
            const fov =
              typeof inst.getFov === 'function' ? inst.getFov()[0] : 130;
            const width = containerRef.current?.clientWidth || 1920;
            const arcsecPerPx = (fov * 3600) / Math.max(width, 1);

            // Deep zoom watchdog: if fov < 5.0 but order < 6 for consecutive cycles, trigger redraw to load high order tiles
            if (fov < 5.0 && currentOrder < 6) {
              stalledOrderCycles++;
              if (stalledOrderCycles >= 4) {
                if (inst.view && typeof inst.view.requestRedraw === 'function') {
                  inst.view.requestRedraw();
                }
                stalledOrderCycles = 0;
              }
            } else {
              stalledOrderCycles = 0;
            }

            const isLoading = activeRequestsCount > 0;
            let percent = 100;
            if (isLoading) {
              percent = Math.min(
                96,
                Math.max(15, Math.round((currentOrder / Math.max(maxOrder, 1)) * 90))
              );
            }

            let cleanSurveyName = 'AllWISE Infrared (W1-W4)';
            if (bkg?.name && !bkg.name.startsWith('http')) {
              cleanSurveyName = bkg.name.replace(/^CDS\//i, '');
            } else if (activeSurveyUrl.includes('2MASS')) {
              cleanSurveyName = '2MASS Color (JHK)';
            } else if (activeSurveyUrl.includes('DSS')) {
              cleanSurveyName = 'DSS2 Optical Color';
            } else if (activeSurveyUrl.includes('AllWISE') || activeSurveyUrl.includes('wise')) {
              cleanSurveyName = 'AllWISE Infrared (W1-W4)';
            }

            setTileStreamingStatus({
              isLoading,
              tilesLoaded: loadedTilesCount,
              tilesPending: activeRequestsCount,
              activeRequests: activeRequestsCount,
              percent,
              currentOrder,
              maxOrder,
              surveyName: cleanSurveyName,
              samplingScaleArcsec: arcsecPerPx,
              statusText: isLoading
                ? `Streaming ${activeRequestsCount} HiPS tiles...`
                : 'Synchronized',
            });
          }, 250);

          // Fluid responsiveness on viewport / window resize
          if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
            resizeObserver = new ResizeObserver(() => {
              if (aladin?.view) {
                if (typeof aladin.view.debounceResize === 'function') {
                  aladin.view.debounceResize();
                }
                if (typeof aladin.view.requestRedraw === 'function') {
                  aladin.view.requestRedraw();
                }
              }
            });
            resizeObserver.observe(containerRef.current);
          }

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

          // Listen for view changes with CameraGenerationScheduler
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
      if (resizeObserver && containerRef.current) {
        resizeObserver.disconnect();
      }
      if (telemetryTimer) {
        clearInterval(telemetryTimer);
      }
      if (perfObserver) {
        perfObserver.disconnect();
      }
      window.fetch = originalFetch;
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
        if (isCooGridVisible) {
          if (typeof aladinInstanceRef.current.setCooGrid === 'function') {
            aladinInstanceRef.current.setCooGrid({
              enabled: true,
              color: '#9aa0a6',
              opacity: 0.15,
              thickness: 0.5,
              labelSize: 10,
              showLabels: true,
              fmt: 'decimal',
            });
          } else if (typeof aladinInstanceRef.current.showCooGrid === 'function') {
            aladinInstanceRef.current.showCooGrid({ color: '#9aa0a6', opacity: 0.15, labelColor: '#9aa0a6' });
          }
        } else {
          if (typeof aladinInstanceRef.current.setCooGrid === 'function') {
            aladinInstanceRef.current.setCooGrid({ enabled: false });
          } else if (typeof aladinInstanceRef.current.hideCooGrid === 'function') {
            aladinInstanceRef.current.hideCooGrid();
          }
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
    </div>
  );
}
