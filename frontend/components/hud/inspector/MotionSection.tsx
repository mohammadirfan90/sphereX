'use client';

import React from 'react';
import { Compass, Orbit, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { UnifiedOdysseyObject } from '@/types';

interface MotionSectionProps {
  object: UnifiedOdysseyObject;
}

export default function MotionSection({ object }: MotionSectionProps) {
  const isSmallBody = !!object.solar_system;
  const kinematics = object.kinematics;
  const smallBody = object.solar_system?.physical_and_orbit;
  const closeApproach = object.solar_system?.close_approach;

  return (
    <div className="space-y-3 font-mono text-[11px]">
      {isSmallBody && smallBody ? (
        <>
          {/* JPL Horizons Keplerian Elements */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Orbit className="w-3.5 h-3.5 text-[#ff7563]" />
              <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider">
                Keplerian Orbit (JPL Horizons / SBDB)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">Orbit Class</span>
                <span className="font-bold text-[#f8f9fa]">{smallBody.orbit_class || 'Asteroid'}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">Semi-Major Axis (a)</span>
                <span className="font-bold text-[#8ab4f8]">{smallBody.semi_major_axis_au?.toFixed(3) ?? '—'} AU</span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">Eccentricity (e)</span>
                <span className="font-bold text-[#f8f9fa]">{smallBody.eccentricity?.toFixed(4) ?? '—'}</span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">Inclination (i)</span>
                <span className="font-bold text-[#f8f9fa]">{smallBody.inclination_deg?.toFixed(2) ?? '—'}°</span>
              </div>
              {smallBody.estimated_diameter_km != null && (
                <div className="bg-black/30 p-2 rounded-xl col-span-2 flex justify-between items-center">
                  <span className="text-[#9aa0a6]">Estimated Diameter</span>
                  <span className="font-bold text-[#ff7563]">{smallBody.estimated_diameter_km} km</span>
                </div>
              )}
            </div>
          </div>

          {/* Planetary Defense Close Approach */}
          {closeApproach && (
            <div className="p-3.5 rounded-2xl bg-[#ff7563]/10 border border-[#ff7563]/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#ff7563] font-bold text-xs font-sans">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>JPL Planetary Defense CAD</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#ff7563]/20 text-[#ff7563] text-[9px] font-bold">
                  CLOSE APPROACH
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-[#f8f9fa]">
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Encounter Date:</span>
                  <span className="font-bold">{closeApproach.encounter_date_utc}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Nominal Distance:</span>
                  <span className="font-bold text-[#8ab4f8]">
                    {closeApproach.nominal_distance_km.toLocaleString()} km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9aa0a6]">Relative Velocity:</span>
                  <span className="font-bold text-[#ff7563]">
                    {closeApproach.relative_velocity_kms != null ? `${closeApproach.relative_velocity_kms.toFixed(2)} km/s` : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Gaia DR3 Astrometry */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Compass className="w-3.5 h-3.5 text-[#8ab4f8]" />
              <span className="text-[10px] text-[#9aa0a6] uppercase font-sans font-bold tracking-wider">
                Astrometric Kinematics (Gaia DR3 / SIMBAD)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">μ_α* (pmra)</span>
                <span className="font-bold text-[#8ab4f8]">
                  {kinematics?.pmra_masyr != null ? `${kinematics.pmra_masyr.toFixed(1)} mas/yr` : '—'}
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">μ_δ (pmdec)</span>
                <span className="font-bold text-[#8ab4f8]">
                  {kinematics?.pmdec_masyr != null ? `${kinematics.pmdec_masyr.toFixed(1)} mas/yr` : '—'}
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">Total Proper Motion</span>
                <span className="font-bold text-[#f8f9fa]">
                  {kinematics?.total_proper_motion_masyr != null
                    ? `${kinematics.total_proper_motion_masyr.toFixed(1)} mas/yr`
                    : '—'}
                </span>
              </div>
              <div className="bg-black/30 p-2 rounded-xl">
                <span className="text-[#9aa0a6] block">Position Angle</span>
                <span className="font-bold text-[#f8f9fa]">
                  {kinematics?.position_angle_deg != null ? `${kinematics.position_angle_deg.toFixed(1)}°` : '—'}
                </span>
              </div>
              {kinematics?.parallax_mas != null && (
                <div className="bg-black/30 p-2 rounded-xl">
                  <span className="text-[#9aa0a6] block">Parallax (ϖ)</span>
                  <span className="font-bold text-[#81c995]">
                    {kinematics.parallax_mas.toFixed(2)} mas
                  </span>
                </div>
              )}
              {kinematics?.radial_velocity_kms != null && (
                <div className="bg-black/30 p-2 rounded-xl">
                  <span className="text-[#9aa0a6] block">Radial Velocity (vr)</span>
                  <span className="font-bold text-[#fbbc04]">
                    {kinematics.radial_velocity_kms.toFixed(1)} km/s
                  </span>
                </div>
              )}
            </div>

            {kinematics?.displacement_14yr_arcsec != null && (
              <div className="mt-2 p-2 rounded-xl bg-[#8ab4f8]/10 border border-[#8ab4f8]/20 flex justify-between items-center text-[10px]">
                <span className="text-[#8ab4f8] font-sans font-medium">14-Year WISE→SPHEREx Displacement:</span>
                <span className="font-bold font-mono text-[#f8f9fa]">
                  {kinematics.displacement_14yr_arcsec.toFixed(2)}″
                </span>
              </div>
            )}
          </div>

          {/* Astrometric Shift Radar */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <span className="text-[10px] text-[#9aa0a6] uppercase tracking-wider block font-sans font-bold">
              Multi-Epoch Motion Vector
            </span>
            <div className="relative w-full h-24 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-white/5">
              <div className="absolute w-36 h-0.5 bg-gradient-to-r from-[#8ab4f8] via-[#ff7563] to-emerald-400 rotate-[-20deg]" />
              <div className="absolute left-1/4 top-2/3 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-[#8ab4f8] shadow-[0_0_8px_#8ab4f8]" />
                <span className="text-[8px] text-[#8ab4f8] mt-1 font-mono">2010 WISE</span>
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-[#ff7563] ring-4 ring-[#ff7563]/30 animate-pulse shadow-[0_0_10px_#ff7563]" />
                <span className="text-[8px] text-[#ff7563] font-bold mt-1 font-mono">2026 SPX</span>
              </div>
              <div className="absolute right-1/4 top-1/3 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-emerald-400 opacity-60" />
                <span className="text-[8px] text-emerald-400 mt-1 font-mono">2050 Proj</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
