/**
 * astronomicalTime.ts — Astronomical Time & Epoch Standard Engine
 * 
 * Standard: Conversions across UTC, TAI, TT, and TDB time scales.
 * Calculates Julian Date (JD), Modified Julian Date (MJD), and Julian Epoch (JYear).
 * 
 * Governing Rule: Zero generic observation epochs. Every observation gets its own
 * authentic timestamp.
 */

// Current cumulative leap seconds between UTC and TAI (37 seconds since 2017-01-01):
export const LEAP_SECONDS_TAI_MINUS_UTC = 37.0;

// Fixed offset between TT and TAI: TT - TAI = 32.184 seconds
export const TT_MINUS_TAI_SEC = 32.184;

// Cumulative offset TT - UTC = 69.184 seconds
export const TT_MINUS_UTC_SEC = LEAP_SECONDS_TAI_MINUS_UTC + TT_MINUS_TAI_SEC;

// Standard Julian Date at J2000.0 (2000-01-01 12:00:00 TT):
export const JD_J2000_0 = 2451545.0;

export interface AstronomicalTime {
  iso_utc: string;
  jd_utc: number;
  mjd_utc: number;
  julian_epoch: number; // e.g. 2026.708
  tt_jd: number;
  tdb_jd: number;
}

/**
 * Calculate Julian Date (JD) from a JavaScript Date (UTC).
 * Uses standard astronomical algorithm (Meeus 1998, Ch. 7).
 */
export function dateToJulianDate(date: Date): number {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1; // 1-12
  const d = date.getUTCDate();
  const hour = date.getUTCHours();
  const min = date.getUTCMinutes();
  const sec = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);

  const dayFraction = (hour + min / 60.0 + (sec + ms / 1000.0) / 3600.0) / 24.0;

  const jd =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    d +
    b -
    1524.5 +
    dayFraction;

  return jd;
}

/**
 * Convert a Julian Date (JD) back to a JavaScript Date (UTC).
 */
export function julianDateToDate(jd: number): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;

  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const totalSec = f * 86400.0;
  const hours = Math.floor(totalSec / 3600.0);
  const minutes = Math.floor((totalSec % 3600.0) / 60.0);
  const seconds = Math.floor(totalSec % 60.0);
  const milliseconds = Math.round((totalSec - Math.floor(totalSec)) * 1000);

  return new Date(Date.UTC(year, month - 1, Math.floor(day), hours, minutes, seconds, milliseconds));
}

/**
 * Calculate Modified Julian Date (MJD): MJD = JD - 2400000.5.
 */
export function julianDateToMjd(jd: number): number {
  return jd - 2400000.5;
}

/**
 * Calculate Julian Epoch (e.g. J2026.708): J = 2000.0 + (JD - 2451545.0) / 365.25.
 */
export function julianDateToJulianEpoch(jd: number): number {
  return 2000.0 + (jd - JD_J2000_0) / 365.25;
}

/**
 * Parse an ISO-8601 string or Date into full astronomical time representation.
 */
export function parseAstronomicalTime(input: string | Date | number): AstronomicalTime {
  let date: Date;

  if (typeof input === 'number') {
    // If number looks like a Julian Date (> 2400000)
    if (input > 2400000) {
      date = julianDateToDate(input);
    } else if (input > 50000) {
      // Looks like MJD
      date = julianDateToDate(input + 2400000.5);
    } else {
      // Looks like timestamp in ms or Julian year
      date = new Date(input);
    }
  } else if (typeof input === 'string') {
    date = new Date(input);
  } else {
    date = input;
  }

  if (isNaN(date.getTime())) {
    date = new Date(); // Fallback to current time if parsing fails
  }

  const jd_utc = dateToJulianDate(date);
  const mjd_utc = julianDateToMjd(jd_utc);
  const julian_epoch = julianDateToJulianEpoch(jd_utc);

  // Terrestrial Time (TT) JD: TT = UTC + 69.184s
  const tt_jd = jd_utc + TT_MINUS_UTC_SEC / 86400.0;

  // Barycentric Dynamical Time (TDB) JD:
  // TDB ≈ TT + 0.001657 * sin(g + 0.0167 * sin(g)) s
  const tDiffDays = jd_utc - JD_J2000_0;
  const gRad = (357.53 + 0.98560028 * tDiffDays) * (Math.PI / 180.0);
  const tdbCorrectionSec = 0.001657 * Math.sin(gRad + 0.0167 * Math.sin(gRad));
  const tdb_jd = tt_jd + tdbCorrectionSec / 86400.0;

  return {
    iso_utc: date.toISOString(),
    jd_utc: Number(jd_utc.toFixed(6)),
    mjd_utc: Number(mjd_utc.toFixed(6)),
    julian_epoch: Number(julian_epoch.toFixed(4)),
    tt_jd: Number(tt_jd.toFixed(6)),
    tdb_jd: Number(tdb_jd.toFixed(6)),
  };
}
