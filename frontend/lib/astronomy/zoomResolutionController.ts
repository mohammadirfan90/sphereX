/**
 * Physical Zoom Resolution & Camera Generation Controller.
 *
 * Implements:
 * 1. Physical Screen Scale Calculation: screen arcsec / pixel from viewport dimensions & FOV.
 * 2. Resolution Ceiling Detector: Determines whether current zoom exceeds native sampling.
 * 3. Request Generation Manager: Discards stale network tile responses from superseded camera movements.
 * 4. Science vs Context recommendation: Advises when to transition from wide HiPS to native FITS or high-res context.
 */

import { getSurveyDefinition, SurveyDefinition } from './surveyRegistry';

export interface CameraState {
  ra: number;
  dec: number;
  fov: number;
  viewportWidth: number;
  viewportHeight: number;
  generation: number;
}

export interface ResolutionAssessment {
  screenArcsecPerPixel: number;
  nativePixelScaleArcsec: number;
  effectiveResolutionArcsec: number;
  samplingRatio: number;
  isBeyondNativeResolution: boolean;
  magnificationFactor: number;
  recommendedMode: 'hips-navigation' | 'fits-science' | 'context-hires';
  statusBadge: string;
  statusDetails: string;
}

/**
 * Assess current camera viewport against survey physical resolution model.
 */
export function assessZoomResolution(
  fovDeg: number,
  viewportWidthPx: number,
  surveyId: string = 'spherex_qr3'
): ResolutionAssessment {
  const survey: SurveyDefinition = getSurveyDefinition(surveyId);
  const width = Math.max(viewportWidthPx || 1920, 320);

  // Physical screen scale: total arcseconds across horizontal viewport divided by screen pixels
  const screenArcsecPerPixel = (fovDeg * 3600) / width;
  const nativeScale = survey.resolutionModel.nativePixelScaleArcsec;
  const effectiveRes = survey.resolutionModel.effectiveResolutionArcsec;

  // Sampling ratio: < 1.0 means screen has more pixels than the detector sampled
  const samplingRatio = screenArcsecPerPixel / nativeScale;
  const isBeyondNative = samplingRatio < 1.0;
  const magnificationFactor = isBeyondNative ? Number((1.0 / samplingRatio).toFixed(1)) : 1.0;

  // Determine architectural representation
  let recommendedMode: 'hips-navigation' | 'fits-science' | 'context-hires' = 'hips-navigation';
  if (fovDeg < 0.25) {
    recommendedMode = 'fits-science';
  } else if (fovDeg < 1.5) {
    recommendedMode = 'context-hires';
  }

  // Clear, honest scientific status message
  let statusBadge = 'NATIVE SAMPLING';
  let statusDetails = `FOV: ${fovDeg.toFixed(2)}° · Scale: ${screenArcsecPerPixel.toFixed(2)}″/px · Native: ${nativeScale.toFixed(2)}″ · PSF: ~${effectiveRes.toFixed(1)}″`;

  if (isBeyondNative) {
    statusBadge = 'DATA RESOLUTION LIMIT';
    statusDetails = `Native pixels magnified ${magnificationFactor}× · Original detector sampling: ${nativeScale.toFixed(2)}″/pixel`;
  }

  return {
    screenArcsecPerPixel: Number(screenArcsecPerPixel.toFixed(3)),
    nativePixelScaleArcsec: nativeScale,
    effectiveResolutionArcsec: effectiveRes,
    samplingRatio: Number(samplingRatio.toFixed(3)),
    isBeyondNativeResolution: isBeyondNative,
    magnificationFactor,
    recommendedMode,
    statusBadge,
    statusDetails,
  };
}

/**
 * Camera Generation Scheduler.
 *
 * Prevents network tile storms by assigning a monotonic generation ID
 * to every camera state change, and invalidating stale async payloads.
 */
export class CameraGenerationScheduler {
  private currentGeneration: number = 0;
  private pendingTimer: NodeJS.Timeout | null = null;
  private debounceMs: number = 150;

  /**
   * Advance generation ID immediately (used on every camera frame/scroll).
   */
  public nextGeneration(): number {
    this.currentGeneration += 1;
    return this.currentGeneration;
  }

  /**
   * Get current generation counter.
   */
  public getGeneration(): number {
    return this.currentGeneration;
  }

  /**
   * Check if an asynchronous response is still valid for current generation.
   */
  public isValid(generation: number): boolean {
    return generation === this.currentGeneration;
  }

  /**
   * Schedule expensive data decision (e.g. FITS cutout query / deep context lookup)
   * debounced by 150ms while keeping camera pan/zoom instant.
   */
  public scheduleDataDecision(callback: (generation: number) => void): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }
    const targetGen = this.currentGeneration;
    this.pendingTimer = setTimeout(() => {
      if (this.isValid(targetGen)) {
        callback(targetGen);
      }
    }, this.debounceMs);
  }

  /**
   * Cancel any pending scheduled decisions.
   */
  public cancel(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}
