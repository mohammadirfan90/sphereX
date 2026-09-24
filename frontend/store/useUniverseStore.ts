import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  TimelineEpoch,
  OperationalMode,
  ActiveTool,
  SurveyLayer,
  UnifiedOdysseyObject,
  SPHERExRelease,
  SPHERExObservationEpoch,
  SPHERExReleaseDiagnostics,
  ReleaseVerificationStatus,
} from '@/types';
import { BENCHMARK_TARGETS, BenchmarkTarget } from '@/lib/benchmarkTargets';
import { TIMELINE_EPOCHS, SURVEY_LAYERS } from '@/lib/surveyEpochs';
import {
  fetchUnifiedObject,
  fetchSPHERExReleaseDiagnostics,
} from '@/lib/apiClient';
import { CelestialFrame, MultiFrameCoordinates } from '@/lib/astronomicalCoordinates';

export type MissionFilter = 'all' | 'spherex' | 'neowise' | 'wise';

export type ContextPanelMode = 'none' | 'object' | 'compare' | 'measure' | 'spectrum';

export type GoogleMapStyle = 'clean' | 'exploration' | 'everything' | 'custom';

export interface SpherexProducts {
  imagery: boolean;
  footprints: boolean;
  wavelengthView: boolean;
  sourceMarkers: boolean;
}

export interface HistoricalSurveys {
  wise: boolean;
  neowise: boolean;
  two_mass: boolean;
  dss2: boolean;
}

export interface SolarSystemLayers {
  asteroids: boolean;
  comets: boolean;
  nearEarthObjects: boolean;
  jplTrajectories: boolean;
}

export interface CatalogLayers {
  gaia: boolean;
  simbad: boolean;
  vizier: boolean;
  jplSbdb: boolean;
}

export interface ScienceLayers {
  movingObjects: boolean;
  variableSources: boolean;
  changeDetection: boolean;
  spectralFeatures: boolean;
}

export interface CompareSettings {
  baselineYear: number;
  comparisonYear: number;
  opacity: number;
}

export interface UniverseState {
  // Navigation & Core Layers
  activeRelease: SPHERExRelease;
  mapStyle: GoogleMapStyle;
  spherexProducts: SpherexProducts;
  historicalSurveys: HistoricalSurveys;
  solarSystemLayers: SolarSystemLayers;
  catalogLayers: CatalogLayers;
  scienceLayers: ScienceLayers;

  // Observation Timeline (Decoupled from release versions)
  //
  // NOTE: observationYear is for *scrubbing the historical timeline UI*. It
  // does NOT represent a generic SPHEREx observation epoch. The actual
  // observation time of any selected SPHEREx cutout is recorded in
  // activeObservationMjd (sourced from L2 FITS DATE-OBS / MJD-OBS) and
  // surfaced as activeObservationEpoch only after a product is selected.
  observationYear: number;
  isTimelinePlaying: boolean;

  /**
   * Active per-observation SPHEREx MJD, sourced from the L2 FITS header of
   * the currently selected cutout. null when no specific observation is
   * selected. This is the astronomically correct observation epoch, distinct
   * from any release/publication date.
   */
  activeObservationMjd: number | null;

  /**
   * Per-observation epoch record. Mirrors DATE-OBS, MJD-OBS, detector and
   * band from the L2 FITS header of the currently selected SPHEREx
   * observation. null when no observation is selected.
   */
  activeObservationEpochRecord: SPHERExObservationEpoch | null;

  // Context Panel (Right-side Inspector)
  activeContextPanel: ContextPanelMode;
  compareSettings: CompareSettings;

  // Active Celestial Object (Authentic Data Only)
  unifiedObject: UnifiedOdysseyObject | null;
  isLoadingTarget: boolean;
  targetError: string | null;

  // Global Instruments & Canvas
  activeBandIndex: number;
  coords: { ra: number; dec: number; fov: number };
  coordinateFrame: CelestialFrame;
  activeProjection: string;
  cursorCoords: MultiFrameCoordinates | null;
  isCooGridVisible: boolean;
  activeObservationEpoch: string | null;
  projection3D: boolean;

  // UI Drawer & Sheet visibility
  isMapContentsOpen: boolean;
  isVoyagerOpen: boolean;
  isWavelengthOpen: boolean;
  isHelpOpen: boolean;
  isTimelineOpen: boolean;
  isAgentationOpen: boolean;

  // Survey layers & benchmarks
  epochs: TimelineEpoch[];
  currentEpoch: TimelineEpoch;
  selectedMission: MissionFilter;
  activeTool: ActiveTool;
  isBlinking: boolean;
  blinkSpeedMs: number;
  layers: SurveyLayer[];
  mode: OperationalMode;
  benchmarkTargets: BenchmarkTarget[];

  // Live IRSA release registry (Phase 2).
  //
  // `releaseRegistry` is the most recent snapshot returned by
  // /spherex/releases/diagnostics. It is null until the first probe completes.
  // The frontend MUST consult `releaseRegistry` before assuming a release is
  // queryable — see `setActiveRelease` and the consumer components below.
  releaseRegistry: SPHERExReleaseDiagnostics | null;
  isReleaseRegistryLoading: boolean;
  activeReleaseVerificationStatus: ReleaseVerificationStatus | null;
}

export interface UniverseActions {
  // Shell Drawer actions
  toggleMapContents: () => void;
  toggleVoyager: () => void;
  closeVoyager: () => void;
  toggleWavelength: () => void;
  toggleHelp: () => void;
  toggleTimeline: () => void;
  closeTimeline: () => void;
  toggleAgentation: () => void;
  closeAgentation: () => void;
  setMapStyle: (style: GoogleMapStyle) => void;

  // Layer toggles
  setActiveRelease: (release: SPHERExRelease) => void;
  toggleSpherexProduct: (product: keyof SpherexProducts) => void;
  toggleHistoricalSurvey: (survey: keyof HistoricalSurveys) => void;
  toggleSolarSystemLayer: (layer: keyof SolarSystemLayers) => void;
  toggleCatalogLayer: (layer: keyof CatalogLayers) => void;
  toggleScienceLayer: (layer: keyof ScienceLayers) => void;

  // Timeline actions
  setObservationYear: (year: number) => void;
  setIsTimelinePlaying: (playing: boolean) => void;

  /**
   * Set the active per-observation epoch from a selected SPHEREx L2 cutout.
   * Pass null to clear when no specific observation is selected. This is
   * the astronomically correct observation time, sourced from the L2 FITS
   * DATE-OBS / MJD-OBS headers via the SPHERExObservationRecord payload.
   */
  setActiveObservationEpochRecord: (
    record: SPHERExObservationEpoch | null,
  ) => void;

  // Context Panel actions
  setActiveContextPanel: (mode: ContextPanelMode) => void;
  setCompareSettings: (settings: Partial<CompareSettings>) => void;

  // Object & Search actions (Zero synthetic data)
  fetchAndSelectTarget: (query: string, release?: SPHERExRelease) => Promise<void>;
  setUnifiedObject: (obj: UnifiedOdysseyObject | null) => void;
  feelingLucky: () => void;

  // Instruments & Canvas
  setActiveBandIndex: (band: number) => void;
  setCoords: (coords: { ra: number; dec: number; fov: number }) => void;
  setCoordinateFrame: (frame: CelestialFrame) => void;
  setActiveProjection: (proj: string) => void;
  setCursorCoords: (coords: MultiFrameCoordinates | null) => void;
  toggleCooGrid: () => void;
  setActiveObservationEpoch: (epoch: string) => void;
  toggleProjection3D: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  setMode: (mode: OperationalMode) => void;

  // Release registry actions (Phase 2).
  //
  // `refreshReleaseRegistry` probes IRSA TAP via the backend and replaces the
  // current snapshot. The active release is re-seeded from the server-confirmed
  // default only if the user has not yet made an explicit selection.
  refreshReleaseRegistry: (force?: boolean) => Promise<void>;
  /**
   * Set the active release only if the registry confirms it is live (or, as a
   * last resort, last_known_good). Setting a release whose status is
   * `not_live` is rejected — we will not silently route queries to a retired
   * IRSA collection.
   */
  setActiveReleaseSafe: (release: SPHERExRelease) => boolean;
}

export type UniverseStore = UniverseState & UniverseActions;

export const useUniverseStore = create<UniverseStore>()(
  subscribeWithSelector((set, get) => ({
    // SPHEREx QR3 default release
    activeRelease: 'qr3',
    mapStyle: 'exploration',
    spherexProducts: {
      imagery: true,
      footprints: false,
      wavelengthView: false,
      sourceMarkers: true,
    },
    historicalSurveys: {
      wise: true,
      neowise: false,
      two_mass: false,
      dss2: false,
    },
    solarSystemLayers: {
      asteroids: true,
      comets: true,
      nearEarthObjects: true,
      jplTrajectories: false,
    },
    catalogLayers: {
      gaia: true,
      simbad: true,
      vizier: false,
      jplSbdb: true,
    },
    scienceLayers: {
      movingObjects: true,
      variableSources: false,
      changeDetection: false,
      spectralFeatures: true,
    },

    // Observation Timeline — defaults to the QR3 *publication* epoch.
    // This is the calendar date NASA/IPAC IRSA released the QR3 collection,
    // NOT a generic observation epoch. The actual per-product observation
    // time lives in activeObservationMjd and is null until a specific
    // SPHEREx L2 cutout is selected.
    observationYear: 2026.708,
    isTimelinePlaying: false,

    // No specific observation selected at startup — the per-product MJD
    // remains null until the user picks a cutout or the SPExPI job
    // identifies an observation record.
    activeObservationMjd: null,
    activeObservationEpochRecord: null,

    // Context Panel default closed: clean sky is hero
    activeContextPanel: 'none',
    compareSettings: {
      baselineYear: 2025,
      comparisonYear: 2026,
      opacity: 50,
    },

    // Initial state: no object selected until user searches or clicks landmark
    unifiedObject: null,
    isLoadingTarget: false,
    targetError: null,

    // Initial camera coordinates: Galactic Center 2D full-screen
    activeBandIndex: 1, // Array 1 (0.75 - 1.10 μm)
    coords: { ra: 0, dec: 0, fov: 130 },
    coordinateFrame: 'ICRS',
    activeProjection: 'MER',
    cursorCoords: null,
    isCooGridVisible: true,
    // activeObservationEpoch is the deprecated *legacy* string-form readout.
    // It is now derived from activeObservationEpochRecord.mjd_obs when a
    // specific L2 cutout is selected, and falls back to null until then.
    // Do NOT set this to a release/publication date string.
    activeObservationEpoch: null,
    projection3D: false,

    // Shell state
    isMapContentsOpen: false,
    isVoyagerOpen: false,
    isWavelengthOpen: false,
    isHelpOpen: false,
    isTimelineOpen: false,
    isAgentationOpen: false,

    // Compatibility fields
    epochs: TIMELINE_EPOCHS,
    currentEpoch: TIMELINE_EPOCHS.find((e) => e.id === 'spherex_qr3') || TIMELINE_EPOCHS[TIMELINE_EPOCHS.length - 1],
    selectedMission: 'spherex',
    activeTool: null,
    isBlinking: false,
    blinkSpeedMs: 1000,
    layers: SURVEY_LAYERS,
    mode: 'explorer',
    benchmarkTargets: BENCHMARK_TARGETS,

    // Release registry (Phase 2).
    // The optimistic default is 'qr3' — the static manifest's default. The
    // first refreshReleaseRegistry() call on app boot will overwrite this
    // with a server-confirmed value (which may downgrade verification_status
    // or mark the release not_live if IRSA has changed since the manifest
    // was authored).
    releaseRegistry: null,
    isReleaseRegistryLoading: false,
    activeReleaseVerificationStatus: null,

    // Actions
    toggleMapContents: () =>
      set((s) => ({
        isMapContentsOpen: !s.isMapContentsOpen,
        isVoyagerOpen: !s.isMapContentsOpen ? false : s.isVoyagerOpen,
        isTimelineOpen: !s.isMapContentsOpen ? false : s.isTimelineOpen,
        isWavelengthOpen: !s.isMapContentsOpen ? false : s.isWavelengthOpen,
        isAgentationOpen: !s.isMapContentsOpen ? false : s.isAgentationOpen,
        activeTool: !s.isMapContentsOpen ? null : s.activeTool,
      })),
    toggleVoyager: () =>
      set((s) => ({
        isVoyagerOpen: !s.isVoyagerOpen,
        isMapContentsOpen: !s.isVoyagerOpen ? false : s.isMapContentsOpen,
        isTimelineOpen: !s.isVoyagerOpen ? false : s.isTimelineOpen,
        isWavelengthOpen: !s.isVoyagerOpen ? false : s.isWavelengthOpen,
        isAgentationOpen: !s.isVoyagerOpen ? false : s.isAgentationOpen,
        activeTool: !s.isVoyagerOpen ? null : s.activeTool,
      })),
    closeVoyager: () => set({ isVoyagerOpen: false }),
    toggleWavelength: () =>
      set((s) => ({
        isWavelengthOpen: !s.isWavelengthOpen,
        isVoyagerOpen: !s.isWavelengthOpen ? false : s.isVoyagerOpen,
        isMapContentsOpen: !s.isWavelengthOpen ? false : s.isMapContentsOpen,
        isTimelineOpen: !s.isWavelengthOpen ? false : s.isTimelineOpen,
        isAgentationOpen: !s.isWavelengthOpen ? false : s.isAgentationOpen,
        activeTool: !s.isWavelengthOpen ? null : s.activeTool,
      })),
    toggleHelp: () => set((s) => ({ isHelpOpen: !s.isHelpOpen })),
    toggleTimeline: () =>
      set((s) => ({
        isTimelineOpen: !s.isTimelineOpen,
        isVoyagerOpen: !s.isTimelineOpen ? false : s.isVoyagerOpen,
        isMapContentsOpen: !s.isTimelineOpen ? false : s.isMapContentsOpen,
        isWavelengthOpen: !s.isTimelineOpen ? false : s.isWavelengthOpen,
        isAgentationOpen: !s.isTimelineOpen ? false : s.isAgentationOpen,
        activeTool: !s.isTimelineOpen ? null : s.activeTool,
      })),
    closeTimeline: () => set({ isTimelineOpen: false, isTimelinePlaying: false }),
    toggleAgentation: () =>
      set((s) => ({
        isAgentationOpen: !s.isAgentationOpen,
        isVoyagerOpen: false,
        isMapContentsOpen: false,
        isTimelineOpen: false,
        isWavelengthOpen: false,
        activeTool: !s.isAgentationOpen ? 'agentation' : null,
      })),
    closeAgentation: () => set({ isAgentationOpen: false, activeTool: null }),

    setMapStyle: (style: GoogleMapStyle) => {
      set({ mapStyle: style });
      if (style === 'clean') {
        set({
          spherexProducts: { imagery: true, footprints: false, wavelengthView: false, sourceMarkers: false },
          solarSystemLayers: { asteroids: false, comets: false, nearEarthObjects: false, jplTrajectories: false },
          catalogLayers: { gaia: false, simbad: false, vizier: false, jplSbdb: false },
          scienceLayers: { movingObjects: false, variableSources: false, changeDetection: false, spectralFeatures: false },
        });
      } else if (style === 'exploration') {
        set({
          spherexProducts: { imagery: true, footprints: false, wavelengthView: false, sourceMarkers: true },
          solarSystemLayers: { asteroids: true, comets: true, nearEarthObjects: true, jplTrajectories: false },
          catalogLayers: { gaia: true, simbad: true, vizier: false, jplSbdb: true },
          scienceLayers: { movingObjects: true, variableSources: false, changeDetection: false, spectralFeatures: true },
        });
      } else if (style === 'everything') {
        set({
          spherexProducts: { imagery: true, footprints: true, wavelengthView: true, sourceMarkers: true },
          solarSystemLayers: { asteroids: true, comets: true, nearEarthObjects: true, jplTrajectories: true },
          catalogLayers: { gaia: true, simbad: true, vizier: true, jplSbdb: true },
          scienceLayers: { movingObjects: true, variableSources: true, changeDetection: true, spectralFeatures: true },
        });
      }
    },

    setActiveRelease: (release) => {
      set({ activeRelease: release });
      const current = get().unifiedObject;
      if (current) {
        get().fetchAndSelectTarget(current.identity.canonical_name, release);
      }
    },

    toggleSpherexProduct: (product) =>
      set((s) => ({
        spherexProducts: {
          ...s.spherexProducts,
          [product]: !s.spherexProducts[product],
        },
      })),
    toggleHistoricalSurvey: (survey) =>
      set((s) => ({
        historicalSurveys: {
          ...s.historicalSurveys,
          [survey]: !s.historicalSurveys[survey],
        },
      })),
    toggleSolarSystemLayer: (layer) =>
      set((s) => ({
        solarSystemLayers: {
          ...s.solarSystemLayers,
          [layer]: !s.solarSystemLayers[layer],
        },
      })),
    toggleCatalogLayer: (layer) =>
      set((s) => ({
        catalogLayers: {
          ...s.catalogLayers,
          [layer]: !s.catalogLayers[layer],
        },
      })),
    toggleScienceLayer: (layer) =>
      set((s) => ({
        scienceLayers: {
          ...s.scienceLayers,
          [layer]: !s.scienceLayers[layer],
        },
      })),

    setObservationYear: (year) => set({ observationYear: year }),
    setIsTimelinePlaying: (playing) => set({ isTimelinePlaying: playing }),

    setActiveContextPanel: (mode) =>
      set((s) => ({
        activeContextPanel: mode,
        isMapContentsOpen: mode === 'measure' || mode === 'compare' ? false : s.isMapContentsOpen,
        isVoyagerOpen: mode === 'measure' || mode === 'compare' ? false : s.isVoyagerOpen,
        isTimelineOpen: mode === 'measure' || mode === 'compare' ? false : s.isTimelineOpen,
        isWavelengthOpen: mode === 'measure' || mode === 'compare' ? false : s.isWavelengthOpen,
      })),
    setCompareSettings: (settings) =>
      set((s) => ({ compareSettings: { ...s.compareSettings, ...settings } })),

    fetchAndSelectTarget: async (query: string, release?: SPHERExRelease) => {
      const activeRel = release || get().activeRelease;
      set({ isLoadingTarget: true, targetError: null });

      try {
        const unified = await fetchUnifiedObject(query, activeRel);
        set({
          unifiedObject: unified,
          coords: { ra: unified.position.ra_deg, dec: unified.position.dec_deg, fov: 1.5 },
          isLoadingTarget: false,
          activeContextPanel: 'object',
          targetError: null,
        });
      } catch (err: any) {
        set({
          unifiedObject: null,
          targetError: err?.message || `Target '${query}' could not be resolved.`,
          isLoadingTarget: false,
          activeContextPanel: 'none',
        });
      }
    },

    setUnifiedObject: (obj) =>
      set({
        unifiedObject: obj,
        activeContextPanel: obj ? 'object' : 'none',
      }),

    feelingLucky: () => {
      const targets = get().benchmarkTargets;
      const current = get().unifiedObject?.identity.canonical_name;
      const currentIndex = targets.findIndex((t) => t.target_name === current);
      // Deterministically pick the next benchmark target
      const nextTarget = targets[(currentIndex + 1) % targets.length] || targets[0];
      get().fetchAndSelectTarget(nextTarget.target_name);
    },

    setActiveBandIndex: (band) => set({ activeBandIndex: band }),
    setCoords: (coords) => set({ coords }),
    setCoordinateFrame: (frame) => {
      set({ coordinateFrame: frame });
      const aladin = typeof window !== 'undefined' ? (window as any).__aladin : null;
      if (aladin && typeof aladin.setFrame === 'function') {
        aladin.setFrame(frame);
      }
    },
    setActiveProjection: (proj) => {
      set({ activeProjection: proj });
      const aladin = typeof window !== 'undefined' ? (window as any).__aladin : null;
      if (aladin && typeof aladin.setProjection === 'function') {
        aladin.setProjection(proj);
      }
    },
    setCursorCoords: (coords) => set({ cursorCoords: coords }),
    toggleCooGrid: () => {
      set((s) => {
        const next = !s.isCooGridVisible;
        const aladin = typeof window !== 'undefined' ? (window as any).__aladin : null;
        if (aladin) {
          if (next) {
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
          } else {
            if (typeof aladin.setCooGrid === 'function') {
              aladin.setCooGrid({ enabled: false });
            } else if (typeof aladin.hideCooGrid === 'function') {
              aladin.hideCooGrid();
            }
          }
        }
        return { isCooGridVisible: next };
      });
    },
    setActiveObservationEpoch: (epoch) => set({ activeObservationEpoch: epoch }),

    /**
     * Set the per-observation SPHEREx epoch from a selected L2 cutout.
     * The legacy `activeObservationEpoch` string is derived from the
     * record's MJD and date_obs_utc so the UI displays the actual
     * observation time of the selected product, not a generic release date.
     * Pass null to clear when no specific observation is selected.
     */
    setActiveObservationEpochRecord: (record) => {
      if (record === null) {
        set({
          activeObservationEpochRecord: null,
          activeObservationMjd: null,
          activeObservationEpoch: null,
        });
        return;
      }
      const derived =
        `${record.date_obs_utc} (MJD ${record.mjd_obs.toFixed(4)})` +
        (record.detector != null ? ` · Detector ${record.detector}` : '');
      set({
        activeObservationEpochRecord: record,
        activeObservationMjd: record.mjd_obs,
        activeObservationEpoch: derived,
      });
    },
    toggleProjection3D: () => set((s) => ({ projection3D: !s.projection3D })),
    setActiveTool: (tool) =>
      set((s) => ({
        activeTool: tool,
        isVoyagerOpen: tool ? false : s.isVoyagerOpen,
        isTimelineOpen: tool ? false : s.isTimelineOpen,
        isWavelengthOpen: tool ? false : s.isWavelengthOpen,
        isMapContentsOpen: tool ? false : s.isMapContentsOpen,
        activeContextPanel: tool ? 'none' : s.activeContextPanel,
      })),
    setMode: (mode) => set({ mode }),

    /**
     * Refresh the IRSA release registry snapshot.
     *
     * On the very first call (releaseRegistry === null), the optimistic
     * activeRelease ('qr3' from the static manifest) is reseeded from the
     * server-confirmed default if and only if:
     *   (a) the user has not yet selected a non-default release (no explicit
     *       selection flag tracked — we simply re-resolve the default on
     *       first probe), AND
     *   (b) the server-confirmed default differs from our optimistic one.
     *
     * Subsequent calls update the registry snapshot and the
     * activeReleaseVerificationStatus, but DO NOT clobber a release the
     * user has explicitly chosen.
     */
    refreshReleaseRegistry: async (force: boolean = false) => {
      set({ isReleaseRegistryLoading: true });
      try {
        const snapshot = await fetchSPHERExReleaseDiagnostics(force);
        const currentActive = get().activeRelease;
        const currentEntry = snapshot.releases.find(
          (r) => r.release === currentActive,
        );
        const serverDefault = snapshot.releases.find((r) => r.is_default);
        const isFirstProbe = get().releaseRegistry === null;

        // Compute the new activeRelease:
        //   - If the user's current selection has gone not_live, fall back
        //     to the server-confirmed default (refuse to leave the user
        //     pinned to a retired collection).
        //   - If the user's current selection is still live/last_known_good,
        //     leave it alone (preserve user intent).
        //   - On the first probe, if the optimistic default is not the
        //     server-confirmed default, swap to the server one.
        let nextActive = currentActive;
        let nextStatus: ReleaseVerificationStatus | null =
          currentEntry?.verification_status ?? null;

        if (currentEntry && currentEntry.verification_status === 'not_live') {
          if (serverDefault) {
            nextActive = serverDefault.release as SPHERExRelease;
            nextStatus = serverDefault.verification_status;
          }
        } else if (isFirstProbe && serverDefault && serverDefault.release !== currentActive) {
          nextActive = serverDefault.release as SPHERExRelease;
          nextStatus = serverDefault.verification_status;
        }

        set({
          releaseRegistry: snapshot,
          isReleaseRegistryLoading: false,
          activeRelease: nextActive,
          activeReleaseVerificationStatus: nextStatus,
        });

        // If the active release just changed under us, re-fetch the unified
        // object so the context panel reflects the new release. This is the
        // ONLY way release changes propagate to the displayed SED.
        if (nextActive !== currentActive && get().unifiedObject) {
          await get().fetchAndSelectTarget(
            get().unifiedObject!.identity.canonical_name,
            nextActive,
          );
        }
      } catch (err) {
        // Failure to reach the registry endpoint must NOT crash the app — the
        // optimistic default ('qr3') remains in place. We log via the registry
        // snapshot staying null so consumers can show a "registry unavailable"
        // banner if they wish.
        set({ isReleaseRegistryLoading: false });
        // Keep releaseRegistry at its previous value (or null) so consumers
        // can detect the failure.
      }
    },

    /**
     * Switch the active release only if the registry confirms it is
     * safe to query. Returns true if the release was applied, false if
     * it was rejected because the registry marked it not_live.
     */
    setActiveReleaseSafe: (release: SPHERExRelease) => {
      const registry = get().releaseRegistry;
      if (!registry) {
        // No registry snapshot yet — optimistic accept. The next probe
        // may downgrade the status.
        set({ activeRelease: release });
        return true;
      }
      const entry = registry.releases.find((r) => r.release === release);
      if (!entry) {
        // Unknown release — refuse.
        return false;
      }
      if (entry.verification_status === 'not_live') {
        // Refuse: do not silently route queries to a retired collection.
        return false;
      }
      set({
        activeRelease: release,
        activeReleaseVerificationStatus: entry.verification_status,
      });
      return true;
    },
  }))
);
