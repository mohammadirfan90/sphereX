'use client';

import React from 'react';
import { Globe, Map } from 'lucide-react';
import AladinSkyCanvas from '@/components/canvas/AladinSkyCanvas';
import ThreeCelestialCanvas from '@/components/canvas/ThreeCelestialCanvas';
import { useUniverseStore } from '@/store/useUniverseStore';

export default function SkyViewer() {
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);
  const setCoords = useUniverseStore((state) => state.setCoords);
  const historicalSurveys = useUniverseStore((state) => state.historicalSurveys);
  const benchmarkTargets = useUniverseStore((state) => state.benchmarkTargets);

  // Determine active survey URL from selected historical layer or SPHEREx default
  let activeSurveyUrl = 'https://skies.esac.esa.int/AllWISEColor';
  if (historicalSurveys.two_mass) {
    activeSurveyUrl = 'https://skies.esac.esa.int/2MASS/Color';
  } else if (historicalSurveys.dss2) {
    activeSurveyUrl = 'https://skies.esac.esa.int/DSSColor';
  } else if (historicalSurveys.wise || historicalSurveys.neowise) {
    activeSurveyUrl = 'https://skies.esac.esa.int/AllWISEColor';
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
