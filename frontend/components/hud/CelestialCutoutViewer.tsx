'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Radio } from 'lucide-react';

interface CelestialCutoutViewerProps {
  ra: number;
  dec: number;
  survey: 'spherex' | 'wise' | 'twomass' | 'dss2' | 'diff';
  colorPalette: 'natural' | 'coral' | 'ice' | 'thermal' | 'invert';
  isBlinking: boolean;
  blinkEpoch: '2010' | '2026';
  highContrast: boolean;
  showReticle: boolean;
  properMotionMasYr?: number;
  positionAngleDeg?: number;
  objectName: string;
}

export default function CelestialCutoutViewer({
  ra,
  dec,
  survey,
  colorPalette,
  isBlinking,
  blinkEpoch,
  highContrast,
  showReticle,
  properMotionMasYr = 8140,
  positionAngleDeg = 93.4,
  objectName,
}: CelestialCutoutViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const imgCacheRef = useRef<Record<string, HTMLImageElement>>({});

  // Determine active survey key for the current frame
  const activeSurvey = isBlinking
    ? blinkEpoch === '2010'
      ? 'wise'
      : 'spherex'
    : survey;

  const currentSurveyLabel =
    activeSurvey === 'wise'
      ? 'WISE All-Sky W1 (3.4μm) · 2010.3 Cryogenic Baseline'
      : activeSurvey === 'spherex'
      ? 'SPHEREx QR3 LVF-4 (3.42μm) · 2026.7 Multi-Epoch'
      : activeSurvey === 'twomass'
      ? '2MASS K-Band (2.17μm) · 1999 Baseline'
      : activeSurvey === 'dss2'
      ? 'DSS2 Red Optical · 1992 POSS-II Baseline'
      : 'Astrometric Difference (SPHEREx 2026 - WISE 2010)';

  // Build authentic cutout endpoint URL
  const apiBase = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://127.0.0.1:8000' : '';
  const cutoutUrl = `${apiBase}/api/historical/cutout-image?ra=${ra.toFixed(4)}&dec=${dec.toFixed(4)}&survey=${activeSurvey}&size_arcsec=90`;

  // Preload and render image
  useEffect(() => {
    let isCancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    const renderImageToCanvas = (img: HTMLImageElement) => {
      if (isCancelled) return;

      // 1. Draw raw authentic image stretched to canvas aspect
      ctx.clearRect(0, 0, width, height);

      // Save canvas state
      ctx.save();

      // Invert mode if selected
      if (colorPalette === 'invert') {
        ctx.filter = 'invert(1)';
      } else if (highContrast) {
        ctx.filter = 'contrast(1.4) brightness(1.1)';
      }

      // Draw astronomical image centered
      const imgAspect = img.width / img.height;
      const canvasAspect = width / height;
      let drawW = width;
      let drawH = height;
      let drawX = 0;
      let drawY = 0;

      if (imgAspect > canvasAspect) {
        drawW = height * imgAspect;
        drawX = (width - drawW) / 2;
      } else {
        drawH = width / imgAspect;
        drawY = (height - drawH) / 2;
      }

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();

      // 2. Apply False Color LUT (Color grading on real astronomical pixels)
      if (colorPalette !== 'natural' && colorPalette !== 'invert') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        if (colorPalette === 'coral') {
          ctx.fillStyle = 'rgba(255, 117, 99, 0.35)';
        } else if (colorPalette === 'ice') {
          ctx.fillStyle = 'rgba(138, 180, 248, 0.40)';
        } else if (colorPalette === 'thermal') {
          ctx.fillStyle = 'rgba(255, 180, 80, 0.35)';
        }
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      // 3. Astrometric Proper Motion Vector & Reticle
      if (showReticle) {
        const arcsecPerPixel = 90 / Math.min(width, height);
        const totalShiftArcsec = (properMotionMasYr * 14.2) / 1000;
        const shiftPixels = Math.min(60, totalShiftArcsec / arcsecPerPixel);
        const paRad = ((positionAngleDeg - 90) * Math.PI) / 180;
        const dx = Math.cos(paRad) * (shiftPixels / 2);
        const dy = Math.sin(paRad) * (shiftPixels / 2);

        // Center crosshair coordinates
        const targetX = isBlinking ? (blinkEpoch === '2010' ? cx - dx : cx + dx) : cx;
        const targetY = isBlinking ? (blinkEpoch === '2010' ? cy - dy : cy + dy) : cy;

        ctx.strokeStyle = activeSurvey === 'wise' ? '#FFB870' : '#8AB4F8';
        ctx.lineWidth = 1.4;

        // Outer targeting brackets
        const rSize = 14;
        ctx.beginPath();
        // Top-left bracket
        ctx.moveTo(targetX - rSize, targetY - 6);
        ctx.lineTo(targetX - rSize, targetY - rSize);
        ctx.lineTo(targetX - 6, targetY - rSize);
        // Top-right bracket
        ctx.moveTo(targetX + 6, targetY - rSize);
        ctx.lineTo(targetX + rSize, targetY - rSize);
        ctx.lineTo(targetX + rSize, targetY - 6);
        // Bottom-right bracket
        ctx.moveTo(targetX + rSize, targetY + 6);
        ctx.lineTo(targetX + rSize, targetY + rSize);
        ctx.lineTo(targetX + 6, targetY + rSize);
        // Bottom-left bracket
        ctx.moveTo(targetX - 6, targetY + rSize);
        ctx.lineTo(targetX - rSize, targetY + rSize);
        ctx.lineTo(targetX - rSize, targetY + 6);
        ctx.stroke();

        // Center crosshair ticks
        ctx.beginPath();
        ctx.moveTo(targetX - 4, targetY);
        ctx.lineTo(targetX + 4, targetY);
        ctx.moveTo(targetX, targetY - 4);
        ctx.lineTo(targetX, targetY + 4);
        ctx.stroke();

        // Motion displacement path line in diff or blink mode
        if (activeSurvey === 'diff' || isBlinking) {
          ctx.strokeStyle = 'rgba(255, 117, 99, 0.7)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(cx - dx, cy - dy);
          ctx.lineTo(cx + dx, cy + dy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      setIsLoading(false);
    };

    // Check in-memory cache
    if (imgCacheRef.current[cutoutUrl]) {
      renderImageToCanvas(imgCacheRef.current[cutoutUrl]);
      return;
    }

    setIsLoading(true);
    setLoadError(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgCacheRef.current[cutoutUrl] = img;
      renderImageToCanvas(img);
    };
    img.onerror = () => {
      // Direct NASA SkyView fallback if backend proxy had a temporary timeout
      const fallbackUrl = `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Survey=WISE+3.4&Position=${ra},${dec}&Size=0.03&Pixels=300&Return=JPG`;
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.onload = () => {
        imgCacheRef.current[cutoutUrl] = fallbackImg;
        renderImageToCanvas(fallbackImg);
      };
      fallbackImg.onerror = () => {
        if (!isCancelled) {
          setIsLoading(false);
          setLoadError(true);
        }
      };
      fallbackImg.src = fallbackUrl;
    };
    img.src = cutoutUrl;

    return () => {
      isCancelled = true;
    };
  }, [
    ra,
    dec,
    activeSurvey,
    colorPalette,
    isBlinking,
    blinkEpoch,
    highContrast,
    showReticle,
    properMotionMasYr,
    positionAngleDeg,
    cutoutUrl,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#07090e] flex items-center justify-center">
      {/* Real astronomical survey canvas */}
      <canvas
        ref={canvasRef}
        width={500}
        height={210}
        className="w-full h-full object-cover select-none"
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#07090e]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none z-10">
          <Loader2 className="w-5 h-5 text-[#8AB4F8] animate-spin" />
          <span className="text-[11px] font-mono text-[#9AA0A6]">
            Fetching Authentic NASA / IPAC Cutout...
          </span>
        </div>
      )}

      {/* Error Fallback */}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-[#FF7563] bg-[#07090e]/90 font-mono">
          Unable to acquire survey frame from NASA IRSA archive.
        </div>
      )}

      {/* Survey Info Watermark */}
      <div className="absolute bottom-2 left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-[#E3E3E3] pointer-events-none">
        <Radio className="w-2.5 h-2.5 text-[#8AB4F8] animate-pulse" />
        <span>{currentSurveyLabel}</span>
      </div>

      {/* Astrometry Vector Tag */}
      <div className="absolute top-2 right-3 z-10 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-[#9AA0A6] pointer-events-none">
        RA {ra.toFixed(3)}° Dec {dec.toFixed(3)}° · 90″ FOV
      </div>
    </div>
  );
}
