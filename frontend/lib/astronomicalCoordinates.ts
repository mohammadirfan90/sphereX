/**
 * astronomicalCoordinates.ts — Canonical Celestial Coordinate Transformation Engine
 * 
 * Standard: Double-precision spherical transformations across ICRS, Galactic, and Ecliptic frames.
 * Reference: IAU 1958 Galactic Standard, IAU 2000/2006 Precession-Nutation & Ecliptic Obliquity.
 * 
 * Zero fabricated coordinates. Preserves frame, epoch, uncertainty, and epistemic status.
 */

export type CelestialFrame = 'ICRS' | 'Galactic' | 'Ecliptic';
export type EpistemicStatus = 'OBSERVED' | 'CATALOGUED' | 'DERIVED' | 'INFERRED' | 'MODELLED';

export interface AstronomicalCoordinate {
  ra_deg: number;
  dec_deg: number;
  frame: CelestialFrame;
  epoch: string; // e.g. "J2000.0", "J2016.0", "ObsEpoch(2026-09-15T00:00:00Z)"
  time_scale: 'UTC' | 'TDB' | 'TT' | 'TAI';
  uncertainty_arcsec?: number;
  status: EpistemicStatus;
  provenance?: string;
}

export interface MultiFrameCoordinates {
  icrs: { ra_deg: number; dec_deg: number; ra_hms: string; dec_dms: string };
  galactic: { l_deg: number; b_deg: number; formatted: string };
  ecliptic: { lambda_deg: number; beta_deg: number; formatted: string };
}

// ── Math Constants & Utilities ───────────────────────────────────────────────
const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

/** Normalize an angle in degrees into [0, 360). */
export function normalize360(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** Clamp latitude/declination into [-90, +90]. */
export function clampLatitude(deg: number): number {
  return Math.max(-90, Math.min(90, deg));
}

/**
 * Convert spherical angles (longitude, latitude in degrees) to a 3D Cartesian unit vector.
 */
export function sphericalToVector(lonDeg: number, latDeg: number): [number, number, number] {
  const lonRad = lonDeg * DEG2RAD;
  const latRad = latDeg * DEG2RAD;
  const cosLat = Math.cos(latRad);
  return [
    cosLat * Math.cos(lonRad),
    cosLat * Math.sin(lonRad),
    Math.sin(latRad),
  ];
}

/**
 * Convert a 3D Cartesian unit vector back to spherical coordinates [lonDeg, latDeg].
 */
export function vectorToSpherical(v: [number, number, number]): [number, number] {
  const [x, y, z] = v;
  const hyp = Math.sqrt(x * x + y * y);
  const lonDeg = normalize360(Math.atan2(y, x) * RAD2DEG);
  const latDeg = clampLatitude(Math.atan2(z, hyp) * RAD2DEG);
  return [lonDeg, latDeg];
}

// ── IAU 1958 / Hipparcos ICRS to Galactic Transformation Matrix ─────────────
// Source: ESA Hipparcos and Tycho Catalogues (1997), Vol 1, Section 1.5.3
// Matrix rows represent the unit vectors of the Galactic frame in ICRS (J2000.0):
const M_ICRS_TO_GAL = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [+0.4941094278755837, -0.4448296299600112, +0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, +0.4559837761750669],
];

// Inverse matrix is the transpose since M is an orthogonal matrix in SO(3):
const M_GAL_TO_ICRS = [
  [M_ICRS_TO_GAL[0][0], M_ICRS_TO_GAL[1][0], M_ICRS_TO_GAL[2][0]],
  [M_ICRS_TO_GAL[0][1], M_ICRS_TO_GAL[1][1], M_ICRS_TO_GAL[2][1]],
  [M_ICRS_TO_GAL[0][2], M_ICRS_TO_GAL[1][2], M_ICRS_TO_GAL[2][2]],
];

/** Multiply a 3x3 matrix by a 3D vector. */
function multiplyMatrixVector(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Transform ICRS (RA, Dec in degrees) to Galactic coordinates (l, b in degrees).
 */
export function icrsToGalactic(raDeg: number, decDeg: number): [number, number] {
  const vIcrs = sphericalToVector(raDeg, decDeg);
  const vGal = multiplyMatrixVector(M_ICRS_TO_GAL, vIcrs);
  return vectorToSpherical(vGal);
}

/**
 * Transform Galactic coordinates (l, b in degrees) to ICRS (RA, Dec in degrees).
 */
export function galacticToIcrs(lDeg: number, bDeg: number): [number, number] {
  const vGal = sphericalToVector(lDeg, bDeg);
  const vIcrs = multiplyMatrixVector(M_GAL_TO_ICRS, vGal);
  return vectorToSpherical(vIcrs);
}

// ── ICRS to Ecliptic Transformation (J2000.0 Obliquity) ──────────────────────
// Obliquity of the ecliptic at J2000.0: eps0 = 23°26'21.406" = 23.439279444444445°
const EPS_J2000_RAD = 23.439279444444445 * DEG2RAD;
const COS_EPS = Math.cos(EPS_J2000_RAD);
const SIN_EPS = Math.sin(EPS_J2000_RAD);

/**
 * Transform ICRS (RA, Dec in degrees) to J2000.0 Mean Ecliptic coordinates (lambda, beta in degrees).
 */
export function icrsToEcliptic(raDeg: number, decDeg: number): [number, number] {
  const [x, y, z] = sphericalToVector(raDeg, decDeg);
  const xEcl = x;
  const yEcl = y * COS_EPS + z * SIN_EPS;
  const zEcl = -y * SIN_EPS + z * COS_EPS;
  return vectorToSpherical([xEcl, yEcl, zEcl]);
}

/**
 * Transform J2000.0 Mean Ecliptic coordinates (lambda, beta in degrees) to ICRS (RA, Dec in degrees).
 */
export function eclipticToIcrs(lambdaDeg: number, betaDeg: number): [number, number] {
  const [x, y, z] = sphericalToVector(lambdaDeg, betaDeg);
  const xIcrs = x;
  const yIcrs = y * COS_EPS - z * SIN_EPS;
  const zIcrs = y * SIN_EPS + z * COS_EPS;
  return vectorToSpherical([xIcrs, yIcrs, zIcrs]);
}

// ── Numerically Stable Angular Separation ────────────────────────────────────
/**
 * Calculate angular separation between two sky vectors using the robust vector cross/dot formulation:
 * theta = atan2(||u1 x u2||, u1 . u2)
 * 
 * Numerically stable across all angles, including very small separations (< 1 mas)
 * and near-antipodal angles (~ 180 deg).
 * 
 * @returns Angular separation in degrees.
 */
export function angularSeparationDeg(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number
): number {
  const [x1, y1, z1] = sphericalToVector(ra1Deg, dec1Deg);
  const [x2, y2, z2] = sphericalToVector(ra2Deg, dec2Deg);

  // Cross product u1 x u2
  const cx = y1 * z2 - z1 * y2;
  const cy = z1 * x2 - x1 * z2;
  const cz = x1 * y2 - y1 * x2;
  const crossNorm = Math.sqrt(cx * cx + cy * cy + cz * cz);

  // Dot product u1 . u2
  const dot = x1 * x2 + y1 * y2 + z1 * z2;

  const thetaRad = Math.atan2(crossNorm, dot);
  return thetaRad * RAD2DEG;
}

// ── Coordinate Formatting ───────────────────────────────────────────────────
/** Format degrees into sexagesimal Right Ascension: HH:MM:SS.ss */
export function formatRaHms(raDeg: number): string {
  const normRa = normalize360(raDeg);
  const totalHours = normRa / 15.0;
  const h = Math.floor(totalHours);
  const totalMinutes = (totalHours - h) * 60.0;
  const m = Math.floor(totalMinutes);
  const s = (totalMinutes - m) * 60.0;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${s.toFixed(2).padStart(5, '0')}s`;
}

/** Format degrees into sexagesimal Declination: ±DD:MM:SS.s */
export function formatDecDms(decDeg: number): string {
  const clamped = clampLatitude(decDeg);
  const sign = clamped < 0 ? '-' : '+';
  const absDec = Math.abs(clamped);
  const d = Math.floor(absDec);
  const totalMinutes = (absDec - d) * 60.0;
  const m = Math.floor(totalMinutes);
  const s = (totalMinutes - m) * 60.0;
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}"`;
}

/**
 * Format coordinates across ICRS, Galactic, and Ecliptic frames simultaneously.
 */
export function formatMultiFrameCoordinates(raDeg: number, decDeg: number): MultiFrameCoordinates {
  const normRa = normalize360(raDeg);
  const normDec = clampLatitude(decDeg);

  const [lDeg, bDeg] = icrsToGalactic(normRa, normDec);
  const [lambdaDeg, betaDeg] = icrsToEcliptic(normRa, normDec);

  const bSign = bDeg < 0 ? '-' : '+';
  const betaSign = betaDeg < 0 ? '-' : '+';

  return {
    icrs: {
      ra_deg: Number(normRa.toFixed(6)),
      dec_deg: Number(normDec.toFixed(6)),
      ra_hms: formatRaHms(normRa),
      dec_dms: formatDecDms(normDec),
    },
    galactic: {
      l_deg: Number(lDeg.toFixed(6)),
      b_deg: Number(bDeg.toFixed(6)),
      formatted: `l = ${lDeg.toFixed(4)}°, b = ${bSign}${Math.abs(bDeg).toFixed(4)}°`,
    },
    ecliptic: {
      lambda_deg: Number(lambdaDeg.toFixed(6)),
      beta_deg: Number(betaDeg.toFixed(6)),
      formatted: `λ = ${lambdaDeg.toFixed(4)}°, β = ${betaSign}${Math.abs(betaDeg).toFixed(4)}°`,
    },
  };
}
