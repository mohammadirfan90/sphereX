/**
 * celestialAtlas.ts — Comprehensive Celestial Geography Catalog for Google Earth for the Universe.
 *
 * Contains:
 * - 88 IAU Constellations with bounds, centers, and asterism connecting lines
 * - Prominent Deep Sky Regions & Molecular Cloud Complexes
 * - Primary Landmark Navigation Stars & Scientific Benchmarks
 * - Great Celestial Reference Circles (Galactic Plane, Celestial Equator, Ecliptic)
 */

export interface ConstellationDef {
  id: string;
  name: string;
  latinName: string;
  englishName: string;
  centerRa: number;
  centerDec: number;
  asterism: Array<[number, number]>; // Pairs of RA/Dec points defining lines
}

export interface CelestialRegionDef {
  id: string;
  name: string;
  category: 'molecular_cloud' | 'galaxy' | 'cluster' | 'nebula' | 'deep_field';
  ra: number;
  dec: number;
  radiusDeg: number;
  description: string;
  keyFeatures: string[];
}

export interface LandmarkStarDef {
  name: string;
  bayer: string;
  constellation: string;
  ra: number;
  dec: number;
  vMag: number;
  spectralType: string;
  distanceLy: number;
  notes?: string;
}

// ── Prominent Astronomical Regions (Like Continents & Major Geographies in Google Earth) ──
export const CELESTIAL_REGIONS: CelestialRegionDef[] = [
  {
    id: 'orion_complex',
    name: 'Orion Molecular Cloud Complex',
    category: 'molecular_cloud',
    ra: 84.05,
    dec: -5.4,
    radiusDeg: 6.5,
    description: 'Vast stellar nursery containing the Great Orion Nebula (M42), Horsehead Nebula, and Flame Nebula.',
    keyFeatures: ['M42 Orion Nebula', 'Horsehead Nebula (B33)', 'Flame Nebula (NGC 2024)', 'Trapezium Cluster'],
  },
  {
    id: 'galactic_center',
    name: 'Galactic Center & Central Molecular Zone',
    category: 'molecular_cloud',
    ra: 266.42,
    dec: -29.01,
    radiusDeg: 4.5,
    description: 'Dynamical heart of the Milky Way galaxy, harboring Sagittarius A* supermassive black hole and dense infrared dust clouds.',
    keyFeatures: ['Sagittarius A*', 'Arches Cluster', 'Quintuplet Cluster', 'Brick Molecular Cloud'],
  },
  {
    id: 'taurus_pleiades',
    name: 'Taurus Dark Clouds & Pleiades (M45)',
    category: 'molecular_cloud',
    ra: 62.0,
    dec: 24.5,
    radiusDeg: 8.0,
    description: 'Nearby low-mass star-forming dark cloud complex and the brilliant Seven Sisters reflection nebula.',
    keyFeatures: ['Pleiades Cluster (M45)', 'Hyades Cluster', 'Barnard 7 Dark Cloud', 'T Tauri Prototype'],
  },
  {
    id: 'rho_ophiuchi',
    name: 'Rho Ophiuchi Cloud Complex',
    category: 'molecular_cloud',
    ra: 246.8,
    dec: -24.4,
    radiusDeg: 3.5,
    description: 'One of the closest active star-forming regions to Earth (460 light-years), exhibiting colorful reflection and dark absorption lanes.',
    keyFeatures: ['Antares Reflection Cloud', 'Rho Oph Core', 'V892 Tau', 'Dense Protostellar Cores'],
  },
  {
    id: 'cygnus_x',
    name: 'Cygnus-X Star-Forming Superbubble',
    category: 'molecular_cloud',
    ra: 308.2,
    dec: 41.2,
    radiusDeg: 5.5,
    description: 'Massive young stellar association and high-mass star nursery including the North America and Pelican Nebulae.',
    keyFeatures: ['North America Nebula (NGC 7000)', 'Pelican Nebula (IC 5070)', 'Cygnus OB2 Association', 'Gamma Cygni Nebula'],
  },
  {
    id: 'carina_complex',
    name: 'Carina Nebula Complex (NGC 3372)',
    category: 'nebula',
    ra: 161.26,
    dec: -59.87,
    radiusDeg: 4.0,
    description: 'Colossal southern H II region harboring the hypergiant star Eta Carinae and active pillar structures.',
    keyFeatures: ['Eta Carinae', 'Keyhole Nebula', 'Mystic Mountain', 'Trumpler 14 Cluster'],
  },
  {
    id: 'andromeda_m31',
    name: 'Andromeda Galaxy (M31)',
    category: 'galaxy',
    ra: 10.68,
    dec: 41.27,
    radiusDeg: 2.2,
    description: 'Nearest major spiral galaxy to the Milky Way, containing over one trillion stars across a 220,000 light-year span.',
    keyFeatures: ['M31 Central Bulge', 'Satellite M32', 'Satellite NGC 205 (M110)', 'Spiral Dust Lanes'],
  },
  {
    id: 'triangulum_m33',
    name: 'Triangulum Galaxy (M33)',
    category: 'galaxy',
    ra: 23.46,
    dec: 30.66,
    radiusDeg: 1.5,
    description: 'Third-largest member of the Local Group, renowned for giant starburst H II region NGC 604.',
    keyFeatures: ['NGC 604 Giant H II', 'Spiral Arms', 'Diffuse IR Disk'],
  },
  {
    id: 'lmc_cloud',
    name: 'Large Magellanic Cloud (LMC)',
    category: 'galaxy',
    ra: 80.89,
    dec: -69.76,
    radiusDeg: 5.5,
    description: 'Milky Way satellite dwarf galaxy featuring the immense Tarantula Nebula (30 Doradus) starburst nursery.',
    keyFeatures: ['Tarantula Nebula (30 Doradus)', 'Supernova 1987A Remnant', 'LMC Bar', 'Stellar Stream'],
  },
  {
    id: 'smc_cloud',
    name: 'Small Magellanic Cloud (SMC)',
    category: 'galaxy',
    ra: 13.19,
    dec: -72.83,
    radiusDeg: 3.0,
    description: 'Irregular dwarf companion galaxy exhibiting lower metallicity and active molecular cloud structures.',
    keyFeatures: ['NGC 346 Star Cluster', 'SMC Wing', 'Diffuse Neutral Hydrogen Stream'],
  },
  {
    id: 'spherex_deep_north',
    name: 'SPHEREx Deep Field North (NEP)',
    category: 'deep_field',
    ra: 270.0,
    dec: 66.56,
    radiusDeg: 6.0,
    description: 'Primary SPHEREx high-redundancy cosmological survey field at the North Ecliptic Pole with hundreds of passes.',
    keyFeatures: ['Ecliptic Pole Redundancy', 'Cosmic Infrared Background (CIB)', 'Deep Extragalactic Survey'],
  },
  {
    id: 'spherex_deep_south',
    name: 'SPHEREx Deep Field South (SEP)',
    category: 'deep_field',
    ra: 90.0,
    dec: -66.56,
    radiusDeg: 6.0,
    description: 'SPHEREx South Ecliptic Pole continuous-viewing zone overlapping the Large Magellanic Cloud cosmological boundary.',
    keyFeatures: ['South Ecliptic Pole Redundancy', 'Galaxy Clustering / BAO Baseline', 'Deep Infrared Tomography'],
  },
  {
    id: 'virgo_cluster',
    name: 'Virgo Galaxy Cluster',
    category: 'cluster',
    ra: 187.7,
    dec: 12.4,
    radiusDeg: 5.0,
    description: 'Core of the Virgo Supercluster containing over 1,300 confirmed member galaxies led by giant elliptical M87.',
    keyFeatures: ['Messier 87 (Supermassive Black Hole)', 'Markarian’s Chain', 'M84 / M86', 'M49'],
  },
  {
    id: 'eagle_omega',
    name: 'Eagle & Omega Star-Forming Nebulae (M16/M17)',
    category: 'nebula',
    ra: 274.7,
    dec: -13.8,
    radiusDeg: 2.5,
    description: 'Famous emission nebulae in Sagittarius-Carina arm harboring interstellar dust columns known as Pillars of Creation.',
    keyFeatures: ['Pillars of Creation', 'Swan Nebula (M17)', 'Spire of Gas', 'Young Stellar Objects'],
  },
  {
    id: 'crab_nebula',
    name: 'Crab Nebula Supernova Remnant (M1)',
    category: 'nebula',
    ra: 83.63,
    dec: 22.01,
    radiusDeg: 0.6,
    description: 'Expanding gaseous remnant of the historical SN 1054 supernova, energized by a rapidly spinning neutron star pulsar.',
    keyFeatures: ['Crab Pulsar (PSR B0531+21)', 'Synchrotron Filamentary Shell', 'Pulsar Wind Nebula'],
  },
  {
    id: 'helix_nebula',
    name: 'Helix Nebula (NGC 7293)',
    category: 'nebula',
    ra: 337.41,
    dec: -20.84,
    radiusDeg: 0.8,
    description: 'One of the closest planetary nebulae to Earth (650 light-years), exhibiting intricate cometary knots and molecular gas rings.',
    keyFeatures: ['Central Hot White Dwarf', 'Bipolar Gas Shells', 'Cometary Knots', 'Molecular H2 Rings'],
  },
];

// ── Major Landmark Navigation Stars & Benchmark Science Targets (Google Earth "Cities & Landmarks") ──
export const LANDMARK_STARS: LandmarkStarDef[] = [
  { name: 'Sirius', bayer: 'α CMa', constellation: 'Canis Major', ra: 101.287, dec: -16.716, vMag: -1.46, spectralType: 'A1V', distanceLy: 8.6, notes: 'Brightest star in nighttime sky; binary system with Sirius B white dwarf.' },
  { name: 'Canopus', bayer: 'α Car', constellation: 'Carina', ra: 95.988, dec: -52.696, vMag: -0.74, spectralType: 'A9II', distanceLy: 310, notes: 'Second-brightest star; primary navigation guide star for interplanetary spacecraft.' },
  { name: 'Alpha Centauri', bayer: 'α Cen', constellation: 'Centaurus', ra: 219.902, dec: -60.834, vMag: -0.27, spectralType: 'G2V + K1V', distanceLy: 4.37, notes: 'Closest stellar system to Solar System; triple system including Proxima Centauri.' },
  { name: 'Arcturus', bayer: 'α Boo', constellation: 'Boötes', ra: 213.915, dec: 19.182, vMag: -0.05, spectralType: 'K1.5III', distanceLy: 36.7, notes: 'Brightest star in northern celestial hemisphere; prominent orange giant.' },
  { name: 'Vega', bayer: 'α Lyr', constellation: 'Lyra', ra: 279.235, dec: 38.784, vMag: 0.03, spectralType: 'A0V', distanceLy: 25.0, notes: 'Historical photometric zero-point standard; vertex of Summer Triangle.' },
  { name: 'Capella', bayer: 'α Aur', constellation: 'Auriga', ra: 79.172, dec: 45.998, vMag: 0.08, spectralType: 'G3III', distanceLy: 42.9, notes: 'Quadruple star system dominated by two yellow giant stars.' },
  { name: 'Rigel', bayer: 'β Ori', constellation: 'Orion', ra: 78.634, dec: -8.202, vMag: 0.13, spectralType: 'B8Ia', distanceLy: 860, notes: 'Luminous blue supergiant marking southwestern foot of Orion.' },
  { name: 'Procyon', bayer: 'α CMi', constellation: 'Canis Minor', ra: 114.825, dec: 5.225, vMag: 0.34, spectralType: 'F5IV-V', distanceLy: 11.5, notes: 'Nearby subgiant star with white dwarf companion.' },
  { name: 'Betelgeuse', bayer: 'α Ori', constellation: 'Orion', ra: 88.793, dec: 7.407, vMag: 0.50, spectralType: 'M1-M2Ia', distanceLy: 642, notes: 'Pulsating red supergiant candidate for future core-collapse supernova.' },
  { name: 'Achernar', bayer: 'α Eri', constellation: 'Eridanus', ra: 24.429, dec: -57.237, vMag: 0.46, spectralType: 'B6Vep', distanceLy: 139, notes: 'Most oblate star known due to extreme rotational velocity (250 km/s).' },
  { name: 'Hadar', bayer: 'β Cen', constellation: 'Centaurus', ra: 210.956, dec: -60.373, vMag: 0.61, spectralType: 'B1III', distanceLy: 390, notes: 'Triple star system marking pointer star to Crux.' },
  { name: 'Altair', bayer: 'α Aql', constellation: 'Aquila', ra: 297.696, dec: 8.868, vMag: 0.77, spectralType: 'A7V', distanceLy: 16.7, notes: 'Rapidly rotating star flattened at poles; vertex of Summer Triangle.' },
  { name: 'Acrux', bayer: 'α Cru', constellation: 'Crux', ra: 186.650, dec: -63.099, vMag: 0.76, spectralType: 'B0.5IV', distanceLy: 320, notes: 'Southern Cross brightest star, pointing directly to South Celestial Pole.' },
  { name: 'Aldebaran', bayer: 'α Tau', constellation: 'Taurus', ra: 68.980, dec: 16.509, vMag: 0.86, spectralType: 'K5III', distanceLy: 65.3, notes: 'Eye of the Bull; giant orange star foreground to the Hyades cluster.' },
  { name: 'Antares', bayer: 'α Sco', constellation: 'Scorpius', ra: 247.352, dec: -26.432, vMag: 0.96, spectralType: 'M1.5Iab', distanceLy: 550, notes: 'Heart of the Scorpion; immense red supergiant illuminating Rho Ophiuchi.' },
  { name: 'Spica', bayer: 'α Vir', constellation: 'Virgo', ra: 201.298, dec: -11.161, vMag: 0.97, spectralType: 'B1III-IV', distanceLy: 250, notes: 'Spectroscopic binary and pulsating variable star.' },
  { name: 'Pollux', bayer: 'β Gem', constellation: 'Gemini', ra: 116.329, dec: 28.026, vMag: 1.14, spectralType: 'K0III', distanceLy: 33.8, notes: 'Orange giant with confirmed orbiting gas giant exoplanet (Thestias).' },
  { name: 'Fomalhaut', bayer: 'α PsA', constellation: 'Piscis Austrinus', ra: 344.413, dec: -29.622, vMag: 1.16, spectralType: 'A3V', distanceLy: 25.1, notes: 'Nearby young star with prominent multi-ring circumstellar debris disk.' },
  { name: 'Deneb', bayer: 'α Cyg', constellation: 'Cygnus', ra: 310.358, dec: 45.280, vMag: 1.25, spectralType: 'A2Ia', distanceLy: 2600, notes: 'Intrinsically luminous white supergiant marking head of Northern Cross.' },
  { name: 'Regulus', bayer: 'α Leo', constellation: 'Leo', ra: 152.093, dec: 11.967, vMag: 1.35, spectralType: 'B8IVn', distanceLy: 79.3, notes: 'Heart of the Lion; rapidly spinning oblate multiple system.' },
  { name: 'Castor', bayer: 'α Gem', constellation: 'Gemini', ra: 113.650, dec: 31.888, vMag: 1.58, spectralType: 'A1V + A2Vm', distanceLy: 51.6, notes: 'Fascinating sextuple star system consisting of three pairs of binary stars.' },
  { name: 'Bellatrix', bayer: 'γ Ori', constellation: 'Orion', ra: 81.283, dec: 6.350, vMag: 1.64, spectralType: 'B2III', distanceLy: 250, notes: 'Left shoulder star of Orion, massive B-type giant.' },
  { name: 'Polaris', bayer: 'α UMi', constellation: 'Ursa Minor', ra: 37.954, dec: 89.264, vMag: 1.98, spectralType: 'F7Ib', distanceLy: 433, notes: 'Current North Star situated within 0.7 degrees of North Celestial Pole.' },
  { name: 'Barnard’s Star', bayer: 'V2500 Oph', constellation: 'Ophiuchus', ra: 269.452, dec: 4.693, vMag: 9.51, spectralType: 'M4.0V', distanceLy: 5.96, notes: 'Highest known proper motion star (10.3 arcsec/year) traversing the interstellar medium.' },
  { name: 'WISE J0855-0714', bayer: 'W0855', constellation: 'Hydra', ra: 133.795, dec: -7.245, vMag: 25.0, spectralType: 'Y2', distanceLy: 7.43, notes: 'Coldest known brown dwarf (250K / -23°C) with water-ice cloud diagnostics; SPHEREx prime science benchmark.' },
  { name: 'SIMP J0136+0933', bayer: 'SIMP0136', constellation: 'Pisces', ra: 24.235, dec: 9.563, vMag: 15.5, spectralType: 'T2.5', distanceLy: 20.0, notes: 'Free-floating planetary-mass brown dwarf possessing powerful auroral magnetic fields.' },
];

// ── Major Constellations with Asterism Lines (Like Country Borders & Capitals in Google Earth) ──
export const MAJOR_CONSTELLATIONS: ConstellationDef[] = [
  {
    id: 'ORI',
    name: 'ORION',
    latinName: 'Orion',
    englishName: 'The Hunter',
    centerRa: 84.0,
    centerDec: 0.0,
    asterism: [
      // Belt: Alnitak -> Alnilam -> Mintaka
      [84.4, -1.9], [84.1, -1.2],
      [84.1, -1.2], [83.0, -0.3],
      // Betelgeuse -> Bellatrix
      [88.8, 7.4], [81.3, 6.4],
      // Bellatrix -> Mintaka
      [81.3, 6.4], [83.0, -0.3],
      // Mintaka -> Rigel
      [83.0, -0.3], [78.6, -8.2],
      // Alnitak -> Saiph
      [84.4, -1.9], [86.9, -9.7],
      // Saiph -> Rigel
      [86.9, -9.7], [78.6, -8.2],
      // Betelgeuse -> Alnitak
      [88.8, 7.4], [84.4, -1.9],
    ],
  },
  {
    id: 'UMA',
    name: 'URSA MAJOR',
    latinName: 'Ursa Major',
    englishName: 'The Great Bear',
    centerRa: 160.0,
    centerDec: 55.0,
    asterism: [
      // Big Dipper bowl: Dubhe -> Merak -> Phecda -> Megrez -> Dubhe
      [165.9, 61.8], [165.5, 56.4],
      [165.5, 56.4], [178.5, 53.7],
      [178.5, 53.7], [183.9, 57.0],
      [183.9, 57.0], [165.9, 61.8],
      // Handle: Megrez -> Alioth -> Mizar -> Alkaid
      [183.9, 57.0], [193.5, 56.0],
      [193.5, 56.0], [200.9, 54.9],
      [200.9, 54.9], [206.9, 49.3],
    ],
  },
  {
    id: 'CAS',
    name: 'CASSIOPEIA',
    latinName: 'Cassiopeia',
    englishName: 'The Queen',
    centerRa: 15.0,
    centerDec: 60.0,
    asterism: [
      // Distinctive 'W': Caph -> Schedar -> Gamma Cas -> Ruchbah -> Segin
      [0.2, 59.2], [9.3, 56.5],
      [9.3, 56.5], [14.2, 60.7],
      [14.2, 60.7], [21.5, 60.2],
      [21.5, 60.2], [26.3, 63.7],
    ],
  },
  {
    id: 'CYG',
    name: 'CYGNUS',
    latinName: 'Cygnus',
    englishName: 'The Swan (Northern Cross)',
    centerRa: 308.0,
    centerDec: 42.0,
    asterism: [
      // Spine: Deneb -> Sadr -> Albireo
      [310.4, 45.3], [305.6, 40.3],
      [305.6, 40.3], [292.7, 28.0],
      // Wings: Gienah -> Sadr -> Delta Cygni
      [311.4, 33.9], [305.6, 40.3],
      [305.6, 40.3], [296.3, 45.1],
    ],
  },
  {
    id: 'SCO',
    name: 'SCORPIUS',
    latinName: 'Scorpius',
    englishName: 'The Scorpion',
    centerRa: 250.0,
    centerDec: -30.0,
    asterism: [
      // Claws -> Antares
      [241.4, -26.1], [247.4, -26.4],
      // Antares -> Wei -> Shaula
      [247.4, -26.4], [253.2, -34.3],
      [253.2, -34.3], [263.4, -37.1],
    ],
  },
  {
    id: 'SGR',
    name: 'SAGITTARIUS',
    latinName: 'Sagittarius',
    englishName: 'The Archer (Teapot)',
    centerRa: 285.0,
    centerDec: -25.0,
    asterism: [
      // Teapot Asterism
      [271.1, -29.8], [275.4, -25.4],
      [275.4, -25.4], [280.9, -29.9],
      [280.9, -29.9], [271.1, -29.8],
      [280.9, -29.9], [286.4, -21.1],
    ],
  },
  {
    id: 'TAU',
    name: 'TAURUS',
    latinName: 'Taurus',
    englishName: 'The Bull',
    centerRa: 65.0,
    centerDec: 18.0,
    asterism: [
      // Aldebaran -> Hyades 'V' -> Horns
      [68.98, 16.5], [64.2, 15.6],
      [64.2, 15.6], [84.4, 28.6],
      [68.98, 16.5], [84.9, 21.1],
    ],
  },
  {
    id: 'CMA',
    name: 'CANIS MAJOR',
    latinName: 'Canis Major',
    englishName: 'The Greater Dog',
    centerRa: 104.0,
    centerDec: -22.0,
    asterism: [
      // Sirius -> Murzim -> Wezen -> Adhara
      [101.3, -16.7], [95.7, -17.9],
      [101.3, -16.7], [107.1, -26.4],
      [107.1, -26.4], [104.7, -28.9],
    ],
  },
  {
    id: 'LEO',
    name: 'LEO',
    latinName: 'Leo',
    englishName: 'The Lion',
    centerRa: 160.0,
    centerDec: 15.0,
    asterism: [
      // Sickle: Regulus -> Algieba -> Adhafera
      [152.1, 12.0], [155.0, 19.8],
      [155.0, 19.8], [154.2, 23.4],
      // Body: Algieba -> Zosma -> Denebola
      [155.0, 19.8], [168.5, 20.5],
      [168.5, 20.5], [177.3, 14.6],
      [152.1, 12.0], [170.2, 15.4],
      [170.2, 15.4], [177.3, 14.6],
    ],
  },
  {
    id: 'CRX',
    name: 'CRUX',
    latinName: 'Crux',
    englishName: 'The Southern Cross',
    centerRa: 187.0,
    centerDec: -60.0,
    asterism: [
      // Acrux -> Gacrux
      [186.6, -63.1], [187.8, -57.1],
      // Mimosa -> Delta Crucis
      [191.9, -59.7], [183.8, -58.7],
    ],
  },
  {
    id: 'PEG',
    name: 'PEGASUS',
    latinName: 'Pegasus',
    englishName: 'The Winged Horse',
    centerRa: 340.0,
    centerDec: 20.0,
    asterism: [
      // Great Square of Pegasus: Markab -> Scheat -> Alpheratz -> Algenib -> Markab
      [346.2, 15.2], [346.0, 28.1],
      [346.0, 28.1], [2.1, 29.1],
      [2.1, 29.1], [3.3, 15.2],
      [3.3, 15.2], [346.2, 15.2],
    ],
  },
  {
    id: 'AND',
    name: 'ANDROMEDA',
    latinName: 'Andromeda',
    englishName: 'The Chained Maiden',
    centerRa: 15.0,
    centerDec: 38.0,
    asterism: [
      // Alpheratz -> Mirach -> Almach
      [2.1, 29.1], [17.4, 35.6],
      [17.4, 35.6], [30.9, 42.3],
    ],
  },
];

// Convert Galactic coordinates (l, b in degrees) to Equatorial J2000 (ra, dec in degrees)
export function galacticToEquatorial(lDeg: number, bDeg: number): [number, number] {
  const l = (lDeg * Math.PI) / 180.0;
  const b = (bDeg * Math.PI) / 180.0;
  // North Galactic Pole J2000: RA = 192.85948°, Dec = 27.12825°, theta_0 = 122.93192°
  const alphaGP = (192.85948 * Math.PI) / 180.0;
  const deltaGP = (27.12825 * Math.PI) / 180.0;
  const l0 = (122.93192 * Math.PI) / 180.0;

  const sinDec = Math.sin(deltaGP) * Math.sin(b) + Math.cos(deltaGP) * Math.cos(b) * Math.cos(l0 - l);
  const dec = Math.asin(sinDec);

  const y = Math.cos(b) * Math.sin(l0 - l);
  const x = Math.cos(deltaGP) * Math.sin(b) - Math.sin(deltaGP) * Math.cos(b) * Math.cos(l0 - l);
  const ra = alphaGP + Math.atan2(y, x);

  const raDeg = (((ra * 180.0) / Math.PI) % 360.0 + 360.0) % 360.0;
  const decDeg = (dec * 180.0) / Math.PI;

  return [raDeg, decDeg];
}

// Generate points along the Galactic Plane (Milky Way Disk, b = 0)
export function getGalacticPlanePoints(stepDeg = 4): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let l = 0; l <= 360; l += stepDeg) {
    points.push(galacticToEquatorial(l, 0.0));
  }
  return points;
}

// Generate points along the Ecliptic Plane (Earth orbit, obliquity = 23.44°)
export function getEclipticPlanePoints(stepDeg = 4): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const epsRad = (23.43928 * Math.PI) / 180.0;
  for (let lambda = 0; lambda <= 360; lambda += stepDeg) {
    const lamRad = (lambda * Math.PI) / 180.0;
    const sinDec = Math.sin(epsRad) * Math.sin(lamRad);
    const dec = Math.asin(sinDec);
    const y = Math.cos(epsRad) * Math.sin(lamRad);
    const x = Math.cos(lamRad);
    const ra = Math.atan2(y, x);
    const raDeg = (((ra * 180.0) / Math.PI) % 360.0 + 360.0) % 360.0;
    const decDeg = (dec * 180.0) / Math.PI;
    points.push([raDeg, decDeg]);
  }
  return points;
}
