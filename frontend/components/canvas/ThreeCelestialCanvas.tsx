'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useUniverseStore } from '@/store/useUniverseStore';
import { BENCHMARK_TARGETS, BenchmarkTarget } from '@/lib/benchmarkTargets';

export default function ThreeCelestialCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const unifiedObject = useUniverseStore((state) => state.unifiedObject);
  const fetchAndSelectTarget = useUniverseStore((state) => state.fetchAndSelectTarget);
  const setCoords = useUniverseStore((state) => state.setCoords);
  const activeBandIndex = useUniverseStore((state) => state.activeBandIndex);
  const observationYear = useUniverseStore((state) => state.observationYear);
  const catalogLayers = useUniverseStore((state) => state.catalogLayers);
  const solarSystemLayers = useUniverseStore((state) => state.solarSystemLayers);

  // References for Three.js scene graph
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const nebulaeGroupRef = useRef<THREE.Points | null>(null);
  const starfieldRef = useRef<THREE.Points | null>(null);

  // Hover state
  const [hoveredTarget, setHoveredTarget] = useState<BenchmarkTarget | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Camera target animation
  const targetLookAt = useRef(new THREE.Vector3(0, 0, -100));
  const currentLookAt = useRef(new THREE.Vector3(0, 0, -100));

  // Mouse interaction state
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const spherical = useRef(new THREE.Spherical(100, Math.PI / 2, 0));

  // Convert RA (deg) and Dec (deg) to 3D Cartesian coordinates on a sphere of radius R
  const celestialToCartesian = (raDeg: number, decDeg: number, radius: number = 100) => {
    const raRad = THREE.MathUtils.degToRad(raDeg);
    const decRad = THREE.MathUtils.degToRad(decDeg);
    const x = -radius * Math.cos(decRad) * Math.cos(raRad);
    const y = radius * Math.sin(decRad);
    const z = radius * Math.cos(decRad) * Math.sin(raRad);
    return new THREE.Vector3(x, y, z);
  };

  // Convert Galactic coordinates (l, b) to RA/Dec (J2000)
  const galacticToEquatorial = (lDeg: number, bDeg: number): [number, number] => {
    const l = THREE.MathUtils.degToRad(lDeg);
    const b = THREE.MathUtils.degToRad(bDeg);
    // North Galactic Pole J2000: RA = 192.85948°, Dec = 27.12825°, theta_0 = 122.93192°
    const alphaGP = THREE.MathUtils.degToRad(192.85948);
    const deltaGP = THREE.MathUtils.degToRad(27.12825);
    const l0 = THREE.MathUtils.degToRad(122.93192);

    const sinDec = Math.sin(deltaGP) * Math.sin(b) + Math.cos(deltaGP) * Math.cos(b) * Math.cos(l0 - l);
    const dec = Math.asin(sinDec);

    const y = Math.cos(b) * Math.sin(l0 - l);
    const x = Math.cos(deltaGP) * Math.sin(b) - Math.sin(deltaGP) * Math.cos(b) * Math.cos(l0 - l);
    const ra = alphaGP + Math.atan2(y, x);

    return [
      ((THREE.MathUtils.radToDeg(ra) % 360) + 360) % 360,
      THREE.MathUtils.radToDeg(dec),
    ];
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06070a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    // 2. High-Performance WebGL2 Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3. Real All-Sky Celestial Panorama (Authentic NASA / ESO Survey)
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      '/milkyway_allsky.jpg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const sphereGeo = new THREE.SphereGeometry(260, 64, 64);
        sphereGeo.scale(-1, 1, 1); // Invert normals to view from center
        const sphereMat = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0.70,
          depthWrite: false,
        });
        const skySphere = new THREE.Mesh(sphereGeo, sphereMat);
        scene.add(skySphere);
      },
      undefined,
      (err) => console.warn('All-sky texture notice:', err)
    );

    // 4. High-Density Hyperspectral Starfield (8,000 Near-IR Stars)
    const starCount = 8000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 240 + Math.random() * 20;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      starPositions[i * 3] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;

      // Realistic infrared stellar temperatures
      const tempType = Math.random();
      if (tempType > 0.9) {
        // SPHEREx Coral / Hot Infrared Emission
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.46;
        starColors[i * 3 + 2] = 0.39;
      } else if (tempType > 0.75) {
        // Cold Ice Diagnostic Blue
        starColors[i * 3] = 0.54;
        starColors[i * 3 + 1] = 0.71;
        starColors[i * 3 + 2] = 0.97;
      } else if (tempType > 0.4) {
        // Warm Infrared K/M Giant
        starColors[i * 3] = 0.98;
        starColors[i * 3 + 1] = 0.85;
        starColors[i * 3 + 2] = 0.65;
      } else {
        // Deep Obsidian Near-IR Star
        starColors[i * 3] = 0.85;
        starColors[i * 3 + 1] = 0.90;
        starColors[i * 3 + 2] = 1.0;
      }
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });

    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
    starfieldRef.current = starField;

    // 4. Infrared Milky Way Galactic Plane & Diffuse Nebulosity (4,500 particles)
    const mwCount = 4500;
    const mwGeo = new THREE.BufferGeometry();
    const mwPositions = new Float32Array(mwCount * 3);
    const mwColors = new Float32Array(mwCount * 3);

    for (let i = 0; i < mwCount; i++) {
      // Longitude along galactic equator (-180 to 180)
      const l = (Math.random() - 0.5) * 360;
      // Latitude concentrated within +/- 15 deg of galactic plane with Gaussian falloff
      const b = (Math.random() - 0.5) * (Math.random() - 0.5) * 35.0;
      const [ra, dec] = galacticToEquatorial(l, b);
      const pos = celestialToCartesian(ra, dec, 235 + Math.random() * 10);

      mwPositions[i * 3] = pos.x;
      mwPositions[i * 3 + 1] = pos.y;
      mwPositions[i * 3 + 2] = pos.z;

      // Infrared dust emission colors (warm amber, coral, PAH cyan)
      const c = Math.random();
      if (c > 0.7) {
        // Warm dust filament (4.4 - 5.0 um)
        mwColors[i * 3] = 0.95;
        mwColors[i * 3 + 1] = 0.42;
        mwColors[i * 3 + 2] = 0.32;
      } else if (c > 0.4) {
        // Cold ice mantle (3.05 um)
        mwColors[i * 3] = 0.38;
        mwColors[i * 3 + 1] = 0.65;
        mwColors[i * 3 + 2] = 0.88;
      } else {
        // Diffuse interstellar infrared background
        mwColors[i * 3] = 0.75;
        mwColors[i * 3 + 1] = 0.60;
        mwColors[i * 3 + 2] = 0.45;
      }
    }

    mwGeo.setAttribute('position', new THREE.BufferAttribute(mwPositions, 3));
    mwGeo.setAttribute('color', new THREE.BufferAttribute(mwColors, 3));

    const mwMaterial = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });

    const mwMesh = new THREE.Points(mwGeo, mwMaterial);
    scene.add(mwMesh);
    nebulaeGroupRef.current = mwMesh;

    // 5. Celestial Coordinate Grid Lines
    const gridRadius = 230;

    // A. Celestial Equator (Cyan)
    const equatorGeo = new THREE.BufferGeometry();
    const equatorPts: number[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      equatorPts.push(gridRadius * Math.cos(angle), 0, gridRadius * Math.sin(angle));
    }
    equatorGeo.setAttribute('position', new THREE.Float32BufferAttribute(equatorPts, 3));
    const equatorMat = new THREE.LineBasicMaterial({
      color: 0x4dd0e1,
      transparent: true,
      opacity: 0.3,
    });
    scene.add(new THREE.Line(equatorGeo, equatorMat));

    // B. Galactic Equator (Golden amber)
    const galacticGeo = new THREE.BufferGeometry();
    const galacticPts: number[] = [];
    for (let i = 0; i <= 128; i++) {
      const l = (i / 128) * 360;
      const [ra, dec] = galacticToEquatorial(l, 0);
      const pt = celestialToCartesian(ra, dec, gridRadius);
      galacticPts.push(pt.x, pt.y, pt.z);
    }
    galacticGeo.setAttribute('position', new THREE.Float32BufferAttribute(galacticPts, 3));
    const galacticMat = new THREE.LineBasicMaterial({
      color: 0xfbbc04,
      transparent: true,
      opacity: 0.25,
    });
    scene.add(new THREE.Line(galacticGeo, galacticMat));

    // C. Hour Circles (Meridians every 30 deg)
    for (let h = 0; h < 12; h++) {
      const raDeg = h * 30;
      const meridianPts: number[] = [];
      for (let d = -80; d <= 80; d += 4) {
        const pt = celestialToCartesian(raDeg, d, gridRadius);
        meridianPts.push(pt.x, pt.y, pt.z);
      }
      const meridianGeo = new THREE.BufferGeometry();
      meridianGeo.setAttribute('position', new THREE.Float32BufferAttribute(meridianPts, 3));
      const meridianMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
      });
      scene.add(new THREE.Line(meridianGeo, meridianMat));
    }

    // 6. Interactive Benchmark Target Markers & Proper Motion Trails
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    markersGroupRef.current = markersGroup;

    BENCHMARK_TARGETS.forEach((target) => {
      const pos = celestialToCartesian(target.ra_deg, target.dec_deg, 180);

      // A. Center Point Mesh
      const pointGeo = new THREE.SphereGeometry(1.6, 16, 16);
      const categoryColor =
        target.category === 'deep_field'
          ? 0x8ab4f8
          : target.category === 'calibration_standard'
          ? 0xfbbc04
          : target.category === 'cosmology_field'
          ? 0xc58af9
          : 0x81c995;
      const pointMat = new THREE.MeshBasicMaterial({
        color: categoryColor,
      });
      const pointMesh = new THREE.Mesh(pointGeo, pointMat);
      pointMesh.position.copy(pos);
      pointMesh.userData = { target, baseRa: target.ra_deg, baseDec: target.dec_deg };
      markersGroup.add(pointMesh);

      // B. Glowing Targeting Reticle Ring
      const ringGeo = new THREE.RingGeometry(3.0, 4.0, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: categoryColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(0, 0, 0);
      ringMesh.userData = { target, isRing: true };
      markersGroup.add(ringMesh);
    });

    // 7. User Orbit & Inertial Drag Controls
    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });

      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / width) * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );

      // Raycasting for target hover
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(markersGroup.children);
      const targetIntersect = intersects.find((i) => i.object.userData?.target);

      if (targetIntersect) {
        setHoveredTarget(targetIntersect.object.userData.target as BenchmarkTarget);
        container.style.cursor = 'pointer';
      } else {
        setHoveredTarget(null);
        container.style.cursor = isDragging.current ? 'grabbing' : 'grab';
      }

      if (!isDragging.current) return;
      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      spherical.current.theta -= deltaX * 0.0035;
      spherical.current.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, spherical.current.phi - deltaY * 0.0035)
      );

      previousMousePosition.current = { x: e.clientX, y: e.clientY };

      const raDeg = ((THREE.MathUtils.radToDeg(spherical.current.theta) % 360) + 360) % 360;
      const decDeg = 90 - THREE.MathUtils.radToDeg(spherical.current.phi);
      setCoords({ ra: Number(raDeg.toFixed(2)), dec: Number(decDeg.toFixed(2)), fov: 2.5 });
    };

    const onMouseUp = () => {
      isDragging.current = false;
      container.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = Math.max(10, Math.min(80, camera.fov + e.deltaY * 0.04));
      camera.updateProjectionMatrix();
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / width) * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(markersGroup.children);
      const targetIntersect = intersects.find((i) => i.object.userData?.target);

      if (targetIntersect) {
        const target = targetIntersect.object.userData.target as BenchmarkTarget;
        fetchAndSelectTarget(target.target_name);
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);

    // 8. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Pulsing reticle animation
      if (markersGroupRef.current) {
        markersGroupRef.current.children.forEach((child) => {
          if (child.userData.isRing) {
            const scale = 1.0 + 0.18 * Math.sin(elapsedTime * 3.2);
            child.scale.set(scale, scale, 1);
          }
        });
      }

      // Smooth camera orientation
      const targetPos = new THREE.Vector3().setFromSpherical(spherical.current);
      targetLookAt.current.copy(targetPos);
      currentLookAt.current.lerp(targetLookAt.current, 0.12);
      camera.lookAt(currentLookAt.current);

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handler
    const onResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('click', onClick);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [fetchAndSelectTarget, setCoords]);

  // Smooth flight to newly selected target
  useEffect(() => {
    if (unifiedObject) {
      const pos = celestialToCartesian(unifiedObject.position.ra_deg, unifiedObject.position.dec_deg, 100);
      spherical.current.setFromVector3(pos);
    }
  }, [unifiedObject]);

  // Update proper motion astrometric displacement as timeline scrubs
  useEffect(() => {
    if (!markersGroupRef.current) return;
    const deltaYears = observationYear - 2026.708;

    markersGroupRef.current.children.forEach((child) => {
      const target = child.userData?.target as BenchmarkTarget | undefined;
      if (!target) return;

      let pmRa = target.target_name.includes("Barnard") ? -802.4 : target.target_name.includes("0855") ? -8100.2 : 0;
      let pmDec = target.target_name.includes("Barnard") ? 10362.1 : target.target_name.includes("0855") ? 680.5 : 0;

      if (pmRa !== 0 || pmDec !== 0) {
        const dRa = (pmRa * deltaYears) / (3600 * 1000);
        const dDec = (pmDec * deltaYears) / (3600 * 1000);
        const curPos = celestialToCartesian(target.ra_deg + dRa, target.dec_deg + dDec, child.userData.isLabel ? 187.2 : 180);
        child.position.copy(curPos);
      }
    });
  }, [observationYear]);

  // Dynamic Wavelength Color Modulation
  const wavelengthUm = Number((0.75 + (5.00 - 0.75) * ((activeBandIndex - 1) / 101)).toFixed(2));
  const isIceBand = Math.abs(wavelengthUm - 3.05) < 0.25;
  const isCo2Band = Math.abs(wavelengthUm - 4.27) < 0.20;

  return (
    <div className="relative w-full h-full bg-[#06070a] overflow-hidden select-none">
      {/* 3D WebGL2 Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Real-Time Wavelength Diagnostic HUD Badge */}
      <div className="absolute top-20 right-6 z-20 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1E1F20]/80 backdrop-blur-xl border border-white/10 text-xs font-mono shadow-lg">
        <span
          className="w-2.5 h-2.5 rounded-full animate-pulse"
          style={{
            backgroundColor: isIceBand ? '#8ab4f8' : isCo2Band ? '#ff7563' : '#fbbf24',
          }}
        />
        <span className="text-[#9aa0a6]">λ:</span>
        <span className="text-[#e3e3e3] font-bold">{wavelengthUm} μm</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#8ab4f8]">
          Band {activeBandIndex}/102
        </span>
      </div>

      {/* Target Hover Pill Tooltip */}
      {hoveredTarget && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-16 px-4 py-2 rounded-2xl bg-[#1E1F20]/95 backdrop-blur-xl border border-[#8AB4F8]/40 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          style={{ left: mousePos.x, top: mousePos.y }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8AB4F8] animate-ping" />
            <span className="font-bold text-xs text-[#E3E3E3]">{hoveredTarget.target_name}</span>
          </div>
          <div className="text-[10px] text-[#9AA0A6] font-mono mt-0.5">
            {hoveredTarget.category.toUpperCase().replace('_', ' ')} · Click to open Deep Analysis Studio
          </div>
        </div>
      )}
    </div>
  );
}
