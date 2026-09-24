# SPHEREx Odyssey 🌌

> **"Google Earth for the Universe"** — Powered by NASA's SPHEREx Mission (102 near-infrared bands), 14 Years of Historical WISE/NEOWISE Baseline, JPL Horizons Ephemerides, and Hardware-Accelerated Three.js WebGL2.

[![Next.js](https://img.shields.io/badge/Next.js-16.3.5%20Turbopack-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-61DAFB?style=flat&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4.3.3%20(CSS--First)-38BDF8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL2-black?style=flat&logo=three.js)](https://threejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v2.0%20WebSockets-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Modern Technology Stack

- **Frontend Core**: **Next.js 16.3.5** with **Turbopack** and **React 19**.
- **Styling Architecture**: **Tailwind CSS v4.3.3** CSS-first `@theme` design tokens (zero legacy config files).
- **Celestial Engine**: **Three.js WebGL2** hardware-accelerated 3D celestial sphere, procedural hyperspectral starfield (5,000+ stars), J2000 celestial coordinate circles, and interactive raycasting.
- **State Store**: **Zustand 5** (`useUniverseStore`) with atomic selectors and `subscribeWithSelector`.
- **Motion & Micro-Interactions**: **Framer Motion 13** spring physics (`stiffness: 300, damping: 30`) and `AnimatePresence`.
- **Backend Architecture**: **FastAPI 0.115+** with Python 3.14 async runtime, **Real-Time WebSockets** (`/ws/telemetry`, `/ws/transients`), Astropy, PyVO, and JPL Horizons/SBDB proxies.

---

## Live Services

- **Web Client**: `http://localhost:3000` (Next.js 16.3.5 Turbopack)
- **API Backend**: `http://127.0.0.1:8000` (FastAPI Real-Time WebSockets)
- **Swagger Documentation**: `http://127.0.0.1:8000/docs`

---

## Features

1. **Google Earth-Style Celestial Navigation**:
   - WebGL2 all-sky navigation with smooth inertial damping and zoom.
   - Interactive reticles and markers for benchmark targets (WISE 0855 brown dwarf, (99942) Apophis, TRAPPIST-1).
2. **Floating Pill Search**:
   - J2000 coordinate resolver and SIMBAD name autocomplete with Framer Motion transitions.
3. **14-Year Historical Imagery Timeline**:
   - Scrub between **WISE (2010)**, **NEOWISE (2014–2024)**, and **SPHEREx (2025–2026)**.
   - Auto-blink playback at $0.5\,\text{s}$, $1.0\,\text{s}$, or $2.0\,\text{s}$.
4. **102-Band Near-Infrared Dispersion Slider**:
   - Continuous spectrum exploration from $0.75\,\mu\text{m}$ to $5.00\,\mu\text{m}$.
   - Quick jump chips for molecular ice absorption features: $H_2O$ Ice ($3.05\,\mu\text{m}$), $CO_2$ Ice ($4.27\,\mu\text{m}$), and $CO$ Gas ($4.67\,\mu\text{m}$).
5. **Right Slide-Over Knowledge Card**:
   - Real-time 102-point Spectral Energy Distribution (SED) curve visualization.
   - Proper motion comparison thumbnails and FITS cutout exporter.
6. **Temporal Blink & Difference Studio**:
   - Subtracted difference frame ($B - A$) and synchronized side-by-side view.
7. **Citizen Science Asteroid Hunter**:
   - Gamified community classification queue with 3-frame blink viewer.
