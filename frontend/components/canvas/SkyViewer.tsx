'use client';

import React from 'react';
import { Globe, Map } from 'lucide-react';
import AladinSkyCanvas from '@/components/canvas/AladinSkyCanvas';
import ThreeCelestialCanvas from '@/components/canvas/ThreeCelestialCanvas';
import { useUniverseStore } from '@/store/useUniverseStore';

import { SURVEY_REGISTRY } from '@/lib/astronomy/surveyRegistry';

export default function SkyViewer() {
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);
  const setCoords = useUniverseStore((state) => state.setCoords);
  const historicalSurveys = useUniverseStore((state) => state.historicalSurveys);
  const benchmarkTargets = useUniverseStore((state) => state.benchmarkTargets);

  // Authoritative survey resolution from SurveyRegistry
  let activeSurveyUrl = SURVEY_REGISTRY.allwise_color.hips?.serviceUrl || 'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1';
  if (historicalSurveys.two_mass) {
    activeSurveyUrl = SURVEY_REGISTRY.twomass_color.hips?.serviceUrl || 'https://alaskybis.cds.unistra.fr/2MASS/Color';
  } else if (historicalSurveys.dss2) {
    activeSurveyUrl = SURVEY_REGISTRY.dss2_color.hips?.serviceUrl || 'https://skies.esac.esa.int/DSSColor';
  } else if (historicalSurveys.wise || historicalSurveys.neowise) {
    activeSurveyUrl = SURVEY_REGISTRY.allwise_color.hips?.serviceUrl || 'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1';
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#06070a]">
      {/* Authentic Real Celestial HiPS Survey Engine (CDS Strasbourg / Aladin Lite v3 WebGL) */}
      <AladinSkyCanvas
        currentEpochId="spherex_qr3"
        activeBandIndex={activeBandIndex}
        selectedTarget={unifiedObject}
        onSelectTarget={(target) => fetchAndSelectTarget(target.target_name)}
        onCoordinatesChange={setCoords}
        targets={benchmarkTargets}
        activeSurveyUrl={activeSurveyUrl}
      />
    </div>
  );
}
