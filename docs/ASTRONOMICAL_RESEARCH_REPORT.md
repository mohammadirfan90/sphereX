# SPHEREx Odyssey: Astronomical Research Report & Archive Interface Analysis

**Document Version:** 1.0.0  
**Classification:** Scientific Architecture & Reference Baseline  
**Governing Standard:** Zero Fabricated Data / Strict Epistemic Provenance  

---

## Executive Summary

SPHEREx Odyssey is an authoritative, real-data astronomical atlas and multi-survey measurement engine. This document establishes the empirical and theoretical foundations required to transform the system from a visualization layer into a rigorous observational instrument. 

Every claim, dataset specification, and mathematical transformation defined herein is derived directly from primary mission documentation, peer-reviewed instrumentation and pipeline literature, IVOA interoperability standards, and authoritative archive APIs.

---

## A. Current SPHEREx Data Availability

NASA's **Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx)** was launched in early 2025 into a 700 km Sun-synchronous low-Earth orbit. SPHEREx conducts an all-sky near-infrared spectrophotometric survey across 102 spectral channels spanning $0.75\text{--}5.00\,\mu\text{m}$.

* **Observational Mode:** SPHEREx operates in a continuous step-and-integrate survey mode. As the spacecraft orbits along the day-night terminator, its telescope points near 90° to the Sun and precesses by $\sim 1^\circ/\text{day}$, completing an entire all-sky survey every six months. Over its two-year baseline mission, SPHEREx executes four complete all-sky passes (Surveys 1–4).
* **Ingestion Cadence:** SPHEREx is not a real-time public spacecraft stream. Caltech/IPAC Infrared Science Archive (IRSA) ingests calibrated data batches weekly. SIAv2 catalog indexing lags raw ingestion by approximately 24 hours, whereas TAP and browsable archive paths expose data products earlier.
* **Processing Latency:** Level-2 calibrated spectral image cutouts are generated within days of downlink by the Science Data Center (SDC) at IPAC and made publicly available at IRSA within 60 days of acquisition per NASA mission policy.

---

## B. Current SPHEREx Release Status

* **Current Active Release:** **Quick Release 3 (QR3)**, designated with DOI `10.26131/IRSA662`. Public ingestion began September 2026.
* **Secondary Active Release:** **Quick Release 2 (QR2)**, designated with DOI `10.26131/IRSA652` (August 2025 baseline). Reprocessed to establish a multi-epoch temporal difference baseline.
* **Retired Release:** **Quick Release 1 (QR1)** was retired by IRSA in February 2026 due to updated non-linearity corrections and revised focal-plane array mask files.
* **Dynamic Release Rule:** The application must never hardcode a release indefinitely. At runtime, the provider queries the IRSA release registry and validates the active public collection.

---

## C. Current Archive Interfaces

IRSA provides standardized programmatic interfaces for SPHEREx discovery and retrieval:
1. **IVOA SIAv2 (Simple Image Access 2.0):**
   * Endpoint: `https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr3`
   * Parameters: `POS=CIRCLE <RA> <Dec> <Radius_deg>`, `FORMAT=ALL`
   * Response: IVOA VOTable XML containing product metadata, spatial coverage polygons, detector indices, observation timestamps (`time_bounds_lower`, `time_bounds_upper`), and direct download URLs.
2. **IVOA TAP (Table Access Protocol) & ADQL 2.1:**
   * Endpoint: `https://irsa.ipac.caltech.edu/TAP`
   * ADQL queries against `spherex_qr3.spectral_images` and `spherex_qr3.point_sources`.
3. **IRSA Spatial Cutout Service (IBAC):**
   * Allows sub-frame cutouts on demand around requested celestial coordinates to avoid full detector image downloads.
4. **Cloud / Python Ecosystem Access:**
   * Direct S3/HTTPS bucket streaming via AWS open data buckets and programmatic access via `pyvo` and `spexpi`.

---

## D. Actual SPHEREx FITS Data Products

SPHEREx distributes authentic FITS products structured by processing level:
* **Level 0 (L0):** Raw telemetry packets and uncalibrated detector frames downlinked from the spacecraft.
* **Level 1 (L1):** Reconstructed, slope-fit images from non-destructive sample-up-the-ramp reads, corrected for cosmic ray hits and reset transients.
* **Level 2 (L2):** Calibrated, astrometrically aligned spectral images (the core public archival product). Each L2 FITS product contains multiple Header Data Units (HDUs):
  1. `PRIMARY`: Global observation metadata, telescope pointing, timestamp (MJD UTC), orbit number, detector ID (1–6).
  2. `IMAGE`: Calibrated intensity array in surface brightness units ($I_\nu$ in $\text{MJy/sr}$) or flux units.
  3. `VARIANCE`: Per-pixel statistical error variance ($\sigma^2$), incorporating detector read noise and photon Poisson noise.
  4. `FLAGS`: 32-bit bitmask indicating bad pixels, saturation, radiation hits, stray light contamination, and persistence.
  5. `ZODI`: Modelled and measured zodiacal light background emission estimate.
  6. `PSF`: Spatially variable optical point-spread function kernel for the exposure.
* **Level 3 (L3):** Wavelength-tagged photometric catalogues and extracted spectrophotometric source points.
* **Level 4 (L4):** High-level legacy products (all-sky 3D diffuse emission cubes, cosmological fluctuation maps, ices absorption column density maps).

---

## E. SPHEREx WCS Architecture: Visualization vs Science

A critical finding from the SPHEREx pipeline specifications (arXiv:2511.15823) is the dual-nature of SPHEREx WCS:
* **Detector Architecture:** SPHEREx employs 6 detector arrays (H2RG $2048 \times 2048$ HgCdTe), each equipped with a Linear Variable Filter (LVF). In an LVF, the bandpass transmitted to a given pixel varies continuously along one spatial dimension of the focal plane.
* **Spatial WCS:** Follows FITS WCS standard representations (typically `RA---TAN` / `DEC--TAN` with SIP polynomial distortion coefficients $A, B$ or `PV` keywords). Converts detector pixel coordinates $(x, y)$ to celestial sky direction $(\alpha, \delta)_{\text{ICRS}}$.
* **Spectral WCS:**
  * **Visualization Approximation (`WCS-WAVE`):** A compact, one-dimensional standard FITS polynomial approximation stored in header keywords `CTYPE3 = 'WAVE'`, `CRVAL3`, `CDELT3`. *Intended solely for quick-look visualizations.*
  * **Science Analysis Standard (`CWAVE` & `CBAND`):** The authentic spectrophotometric extraction pipeline MUST NOT rely on linear `WCS-WAVE`. It requires the calibrated `CWAVE` (central wavelength map) and `CBAND` (effective transmission profile) calibration matrices, mapping each physical pixel $(x, y)$ to its precise laboratory-calibrated wavelength $\lambda_{\text{eff}}(x, y)$ and bandwidth $\Delta\lambda(x, y)$.

---

## F. SPHEREx Astrometric Accuracy

* **Astrometric Solution:** SPHEREx L2 processing aligns each raw image to the **Gaia DR3** reference catalog using bright, unsaturated stars detected within the wide $3.5^\circ \times 7^\circ$ field of view.
* **Alignment Precision:** Per the official pipeline paper (arXiv:2511.15823v2), good Level-2 images achieve a median astrometric alignment precision of **$0.1\text{--}0.4$ arcseconds RMS** relative to Gaia ICRS.
* **Pixel Scale:** SPHEREx native pixel scale is **$6.2$ arcseconds per pixel**. The $0.1\text{--}0.4$ arcsecond astrometric solution corresponds to approximately $0.02\text{--}0.06$ of a pixel.
* **Epistemic Invariant:** Numerical coordinate transformations between spherical frames (e.g. via Astropy or double-precision spherical vectors) can be evaluated to $10^{-6}$ arcseconds. However, the system must never claim that the astronomical position of a SPHEREx-observed source is physically measured to micro-arcsecond accuracy. Astrometric quality flags (e.g. `FINAST = 0`, RMS residual) must be exposed directly.

---

## G. Gaia Astrometric Model (Gaia DR3)

* **Reference System:** ICRS (International Celestial Reference System).
* **Reference Epoch:** **J2016.0** (TDB).
* **Astrometric Parameters (5-parameter / 6-parameter solutions):**
  1. Position: $\alpha$, $\delta$ at epoch J2016.0.
  2. Parallax: $\varpi$ in milliarcseconds (mas).
  3. Proper Motion: $\mu_{\alpha*} \equiv \mu_\alpha \cos\delta$, $\mu_\delta$ in $\text{mas/yr}$.
  4. Radial Velocity: $v_r$ in $\text{km/s}$ (where spectroscopic coverage exists).
* **Covariance Matrix:** Gaia DR3 provides the complete symmetric $5 \times 5$ covariance matrix for every source via correlation coefficients:
  $$\rho(\alpha, \delta), \rho(\alpha, \varpi), \rho(\alpha, \mu_{\alpha*}), \rho(\alpha, \mu_\delta), \rho(\delta, \varpi), \dots$$
  Propagating positions to any target observation epoch (e.g. SPHEREx observation time $t$) requires full linear/rigorous epoch propagation preserving the astrometric covariance.
* **Systematic Floors:** Beyond formal statistical uncertainties, Gaia DR3 astrometry carries systematic floors ($\sim 0.02\text{--}0.03\,\text{mas}$ regional correlations, zero-point parallax offset $\approx -0.017\,\text{mas}$ depending on magnitude, colour, and ecliptic latitude).

---

## H. Gaia Distance Inference: Rejection of $1/\varpi$

A fundamental tenet of modern astrometry (Luri et al. 2018, Bailer-Jones et al. 2018, 2021) is:
$$\text{Distance} \neq \frac{1}{\varpi}$$
* **Mathematical Divergence:** Inverting parallax is a non-linear operation. As $\sigma_\varpi / \varpi > 0.10$, naive inversion introduces massive positive bias. For negative parallaxes (common in noisy measurements of distant stars), $1/\varpi$ produces unphysical negative distances.
* **Authoritative Solution (Bailer-Jones et al. 2021):** Distances must be derived via Bayesian posterior estimation using appropriate spatial and stellar priors:
  1. **Geometric Distance (`r_geo`):** Uses Gaia DR3 parallax and directional prior based on an authentic 3D model of the Milky Way.
  2. **Photogeometric Distance (`r_med_photogeo`):** Combines parallax with Gaia $G$, $G_{\text{BP}}$, $G_{\text{RP}}$ colours and 2MASS $J, H, K_s$ photometry to break degeneracies.
* **Implementation Standard:** If catalogue-inferred posterior distances are unavailable, the application displays `"DISTANCE UNCERTAIN (PARALLAX ONLY)"` with $\varpi \pm \sigma_\varpi$ rather than calculating an erroneous $1/\varpi$.

---

## I. NED Data Capabilities (NASA/IPAC Extragalactic Database)

* **Scope:** Authoritative multiwavelength database for extragalactic sources (galaxies, quasars, gravitational lenses, galaxy clusters).
* **Modern Interface:** IVOA TAP endpoint (`https://ned.ipac.caltech.edu/tap`) querying normalized tables:
  * `ned_objdir`: Core object registry, canonical names, ICRS coordinates, morphological classifications.
  * `ned_redshift`: Spectroscopic and photometric redshifts with published uncertainties and velocity reference frames (Heliocentric, LSR, CMB).
  * `ned_distances`: Redshift-independent distances (Cepheids, TRGB, Type Ia SNe, Tully-Fisher, Fundamental Plane).
  * `ned_crossid`: Unambiguous cross-identifications across 2MASS, SDSS, WISE, GALEX, Chandra, HST, and JWST.
* **API Policy:** Deprecated legacy XML/HTML screen-scraping endpoints are prohibited; all extragalactic queries use NED TAP ADQL.

---

## J. JPL Horizons Solar System Dynamics

* **Scope:** High-precision dynamical ephemerides and orbital state vectors for the Sun, major planets, planetary satellites, asteroids, comets, and interplanetary spacecraft.
* **API Architecture:** REST endpoint at `https://ssd.jpl.nasa.gov/api/horizons.api`.
* **Parameter Standardization:**
  * `EPHEM_TYPE`: `OBSERVER` (apparent/topocentric coordinates) or `VECTORS` (Cartesian state vectors $X, Y, Z, \dot{X}, \dot{Y}, \dot{Z}$).
  * `CENTER`: `@sun` (Heliocentric), `500@0` (Geocentric), or spacecraft observer code.
  * `REF_PLANE`: `FRAME` (ICRS) or `ECLIPTIC` (J2000 / mean ecliptic of date).
  * `TIME_DIGITS`: High precision.
  * `QUANTITIES`: `'1,9,20'` ($\alpha, \delta$, range $\Delta$, range-rate $\dot{\Delta}$, solar elongation, visual magnitude).
* **Time Scale:** JPL Horizons operates strictly in **Barycentric Dynamical Time (TDB)** or **Universal Time (UTC)**. Ephemeris calculations must never treat Solar System bodies as static catalog points.

---

## K. IVOA Standards Relevant to SPHEREx Odyssey

The system implements the following International Virtual Observatory Alliance (IVOA) standards:
1. **IVOA SIA 2.0 (Simple Image Access):** Image and cube discovery protocol over ObsCore data model.
2. **IVOA TAP (Table Access Protocol) 1.1:** Interoperable database query protocol executing ADQL.
3. **IVOA ADQL 2.1 (Astronomical Data Query Language):** SQL-92 dialect with geometric functions (`CONTAINS`, `POINT`, `CIRCLE`, `POLYGON`, `DISTANCE`).
4. **IVOA HiPS 1.0 (Hierarchical Progressive Surveys):** Multi-resolution all-sky image and catalogue tiling based on HEALPix tessellation.
5. **IVOA MOC 2.0 (Multi-Order Coverage):** HEALPix-based spatial footprint format enabling boolean spatial operations (intersection, union, difference) in milliseconds.
6. **IVOA VOTable 1.4:** XML-based tabular data format preserving field units, UCDs (Unified Content Descriptors), and array-valued data.

---

## L. Celestial Coordinate Reference-Frame Architecture

Astronomical positions require explicit reference frames:
1. **ICRS (International Celestial Reference System):** The canonical reference frame. Kinematically non-rotating with respect to distant quasars, origin at the Solar System Barycentre.
2. **Galactic Coordinates $(l, b)$:** IAU 1958 standard defined relative to North Galactic Pole ($\alpha_{\text{GP}} = 192.85948^\circ, \delta_{\text{GP}} = 27.12825^\circ$) and Galactic Centre ($l_0 = 122.93192^\circ$).
3. **Ecliptic Coordinates $(\lambda, \beta)$:** Defined by Earth's orbital plane. SPHEREx scan strategy is naturally organized around Ecliptic coordinates (poles at $\delta \approx \pm 66.56^\circ$). Requires specification of epoch:
   * **J2000.0 Mean Ecliptic:** Fixed inertial frame.
   * **True Ecliptic of Date:** Incorporates planetary precession and nutation.
4. **GCRS (Geocentric Celestial Reference System):** Spatial coordinates with origin at Earth's center of mass, accounting for diurnal aberration.

---

## M. Astronomical Time and Epoch Architecture

Time in astronomy is multi-dimensional. A date string alone is scientifically ambiguous:
* **Time Scales:**
  * `UTC`: Universal Coordinated Time (subject to leap seconds; discontinuous).
  * `TAI`: International Atomic Time (uniform atomic timescale, $\text{TAI} - \text{UTC} = 37\,\text{s}$).
  * `TT`: Terrestrial Time (continuous timescale for geocentric ephemerides, $\text{TT} = \text{TAI} + 32.184\,\text{s}$).
  * `TDB`: Barycentric Dynamical Time (relativistic timescale at Solar System Barycentre, periodic variations $< 2\,\text{ms}$ relative to TT).
* **Time Representations:**
  * Julian Date (JD), Modified Julian Date ($\text{MJD} = \text{JD} - 2400000.5$).
  * Julian Epoch ($J = 2000.0 + (\text{JD} - 2451545.0) / 365.25$).
* **Observation Timestamps:**
  * Every SPHEREx observation FITS header records exact timestamps: `DATE-OBS` (UTC start), `MJD-OBS`, and exposure midpoint.
  * Every observation MUST be evaluated at its own recorded time, never a generic mission epoch.

---

## N. Astronomical Distance Taxonomy

A single scalar named "Distance" is scientifically invalid. The system implements distinct, rigorously defined distance quantities:
1. **Angular Separation ($\theta$):** Direct spherical distance between two sky vectors, calculated via numerically stable haversine / vector dot-cross formulations in ICRS.
2. **Stellar Parallactic Distance ($d_{\text{geo}}, d_{\text{photogeo}}$):** Inferred stellar distance with asymmetric 16th and 84th percentile confidence intervals derived from Gaia Bayesian models.
3. **Solar System Topocentric Range ($\Delta$):** Physical light-travel Euclidean distance from observer to target body, calculated from JPL Horizons ephemerides at observation epoch.
4. **Cosmological Redshift-Derived Distances (for extragalactic $z$):**
   * **Comoving Distance ($D_C$):** $D_C = \frac{c}{H_0} \int_0^z \frac{dz'}{E(z')}$ where $E(z) = \sqrt{\Omega_m(1+z)^3 + \Omega_k(1+z)^2 + \Omega_\Lambda}$.
   * **Proper Distance ($D_P$):** Physical distance at current epoch ($D_P = a(t) D_C$).
   * **Luminosity Distance ($D_L$):** $D_L = (1 + z) D_M$, governing observed bolometric flux.
   * **Angular Diameter Distance ($D_A$):** $D_A = \frac{D_M}{1 + z}$, converting angular size to transverse physical diameter.
   * **Lookback Time ($t_L$):** $t_L = \frac{1}{H_0} \int_0^z \frac{dz'}{(1+z')E(z')}$, duration light travelled from emission.

---

## O. Multi-Survey Cross-Matching Architecture

Associating astronomical sources across surveys (SPHEREx, Gaia, 2MASS, WISE, NED) requires formal astrometric cross-matching rather than naive nearest-neighbor search:
* **Epoch Propagation:** Before cross-matching Gaia stars to SPHEREx or WISE observations, the Gaia position must be propagated from $J2016.0$ to the target observation epoch using proper motion $(\mu_{\alpha*}, \mu_\delta)$ and radial velocity.
* **Positional Covariance Match Radius:** The positional error ellipse $\Sigma = \Sigma_1 + \Sigma_2$ defines the Mahalanobis distance metric:
  $$\Delta \chi^2 = (\mathbf{x}_1 - \mathbf{x}_2)^T \Sigma^{-1} (\mathbf{x}_1 - \mathbf{x}_2)$$
* **Morphology & Confusion:** SPHEREx's $6.2''$ pixel scale creates confusion in crowded fields. High-resolution Gaia sources ($0.1''$ resolution) that fall within a single SPHEREx beam must be tagged as blended components.

---

## P. Uncertainty Architecture

Uncertainty is treated as fundamental data:
* **Astrometric Uncertainty:** Stored as covariance matrices $(\sigma_\alpha, \sigma_\delta, \rho_{\alpha\delta})$ and astrometric quality indicators (`astrometric_excess_noise`, `ruwe` in Gaia; `FINAST` alignment RMS in SPHEREx).
* **Photometric & Spectral Uncertainty:** Each flux measurement $F_\nu(\lambda)$ carries explicit $1\sigma$ measurement error $\sigma_{F_\nu}(\lambda)$ derived from the FITS `VARIANCE` HDU, propagating sky background subtraction, flat-field variance, and aperture correction uncertainty.
* **Derived Uncertainty Propagation:** Linear Taylor propagation is utilized only where valid ($\sigma_y^2 = J \Sigma_x J^T$). For non-linear transformations (e.g. parallax to distance, redshift to cosmology), Bayesian posterior distributions or Monte Carlo interval estimations are preserved.

---

## Q. Provenance Architecture (W3C PROV-DM Compliance)

Every scientific value displayed in the UI or emitted by the API is connected to an auditable provenance chain:
```
[Object Entity] 
      ↑ generatedBy
[Cross-Match Activity] ← used [Gaia DR3 Record / NED Record]
      ↑ derivedFrom
[SPHEREx Observation L2 Product]
      ↑ generatedBy
[SPHEREx SDC Pipeline Run]
      ↑ inputFrom
[Raw Telemetry L0 / Calibrations CWAVE, CBAND, SAPM]
      ↑ observedBy
[NASA SPHEREx Spacecraft (ObsID, MJD UTC)]
```
Fields stored: `archive`, `dataset`, `release`, `product_id`, `obs_id`, `detector`, `retrieval_timestamp`, `sha256_checksum`, `pipeline_version`, `citation_doi`.

---

## R. Known Scientific Limitations

1. **SPHEREx Spatial Resolution:** At $6.2''/\text{pixel}$, SPHEREx is a survey spectrograph, not a high-resolution diffraction-limited imager like JWST or HST. In dense Galactic plane regions, multiple stellar sources blend into single pixels.
2. **Spectral WCS Interpolation:** Linear interpolation across spectral channels introduces systematic errors near LVF filter segment joints. The authentic pipeline must use tabulated filter transmission curves.
3. **Zodiacal Light Dominance:** At $1\text{--}5\,\mu\text{m}$, zodiacal dust emission dominates the celestial background by factors of $10\text{--}100\times$ over extragalactic background light. Absolute spectrophotometry depends directly on the accuracy of the zodiacal subtraction model.
4. **Survey Depth Variations:** The ecliptic poles (NEP and SEP) receive $>200$ visits per survey pass, while the ecliptic plane receives $\sim 20\text{--}30$ visits. Sensitivity is strongly non-uniform across the sky.

---

## S. Current Implementation Risks & Technical Mitigations

| Risk Identified | Root Cause in Legacy/Current System | Mitigation Architecture |
| :--- | :--- | :--- |
| **Parallax Inversion Bias** | Legacy code in `normalization.py` used `1000.0 / plx` | Replace with Bailer-Jones posterior lookup or display `"DISTANCE UNCERTAIN"` |
| **Misattributed All-Sky Image** | Legacy `surveyEpochs.ts` called AllWISE "SPHEREx QR3 All-Sky" | Correct label to "WISE AllWISE 3.4/4.6 µm"; integrate authentic SPHEREx L2 cutout overlays |
| **Generic Observation Epoch** | Legacy store used constant `2026.708` | Extract individual `MJD-OBS` / `DATE-OBS` per observation product |
| **Synthetic Stars in Three.js** | `ThreeCelestialCanvas.tsx` generated 8,000 random stars | Deprecate synthetic star generator; link 3D view exclusively to authentic Gaia/JPL sources |
| **Drag & Drop FITS Crash** | Aladin Lite v3 parser crashed when users dropped images lacking WCS | Intercept dragover/drop events and enforce schema validation before passing to Aladin |
| **Numerical vs Physical Confusion**| Transform precision tested to $10^{-6}$ arcsec | Explicitly separate mathematical transform tests from observational error budgets |

---

## Authoritative Astronomical Data Source Registry

| SOURCE | OWNER | DATASET | CURRENT RELEASE | DATA TYPE | SKY COVERAGE | WAVELENGTH | TIME RESOLUTION | POSITION ACCURACY | DISTANCE AVAILABILITY | API FORMAT | PROVENANCE / DOI | LIMITATIONS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SPHEREx** | NASA / JPL / IPAC | Calibrated Spectral Images & Spectra | **QR3** (Weekly) | Level-2 FITS, L3 Catalogs | All-Sky (incremental weekly) | 0.75–5.00 µm (102 bands) | Per exposure (MJD UTC recorded) | 0.1–0.4″ RMS alignment (6.2″ pixel) | Inferred via cross-match | IVOA SIAv2, TAP, Cutouts | DOI: 10.26131/IRSA662 | 6.2″ pixel scale; confusion in Galactic plane |
| **SPHEREx Baseline** | NASA / JPL / IPAC | Reprocessed Baseline | **QR2** | Level-2 FITS | All-Sky baseline | 0.75–5.00 µm | 2025-08-16 baseline | 0.1–0.4″ RMS | Inferred via cross-match | IVOA SIAv2, TAP | DOI: 10.26131/IRSA652 | Reprocessed early mission baseline |
| **Gaia** | ESA / DPAC | Gaia Astrometric Catalogue | **DR3** (v1.3) | Astrometric & Photometric Source Records | All-Sky ($>1.8\times 10^9$ sources) | Optical ($G, G_{\text{BP}}, G_{\text{RP}}$, 330–1050 nm) | Reference Epoch J2016.0 (TDB) | $0.02\text{--}0.5$ mas (magnitude dependent) | Posterior geometric & photogeometric (Bailer-Jones) | IVOA TAP, ADQL 2.1 | DOI: 10.5270/esa-y53vf3n | Degraded parallax for binary/crowded systems |
| **NED** | NASA / IPAC | Extragalactic Database | Rolling monthly update | Cross-identifications, Redshifts, SEDs | All-Sky (Extragalactic) | Multiwavelength (Radio to Gamma-ray) | Literature publication date | Sub-arcsecond to arcsecond | Redshift-independent distances & $z$ cosmology | IVOA TAP, ADQL 2.1 | Caltech/IPAC NED | Redshift space distortions; model dependent |
| **JPL Horizons** | NASA / JPL SSD | Solar System Ephemerides | DE440 / DE441 | State vectors, apparent ephemerides | Solar System Bodies ($>1.3\times 10^6$ objects) | Dynamical positions | High-precision continuous (TDB / UTC) | Sub-milliarcsecond dynamical ephemeris | Exact light-travel Euclidean range ($\Delta$ in AU) | REST JSON API | NASA JPL Solar System Dynamics | Ephemeris validity spans vary by body orbit |
| **WISE / NEOWISE** | NASA / IPAC | AllWISE & CatWISE | Final AllWISE | HiPS tiles, FITS cutouts, Catalogs | All-Sky | Mid-IR: 3.4 µm (W1), 4.6 µm (W2), 12 µm (W3), 22 µm (W4) | Mission baseline 2010–2024 | $\sim 0.2''$ astrometric accuracy | Photometric / cross-match | IVOA HiPS, HiPS2FITS, TAP | DOI: 10.26131/IRSA1 | Cryogenic coolant exhausted after 2010 |
| **2MASS** | NASA / IPAC / UMass | Two Micron All Sky Survey | Final Data Release | HiPS tiles, Point Source Catalog | All-Sky | Near-IR: $J$ (1.25 µm), $H$ (1.65 µm), $K_s$ (2.17 µm) | Epochs 1997–2001 | $\sim 0.1''$ astrometry to Tycho-2 | Inferred via cross-match | IVOA HiPS, TAP | DOI: 10.26131/IRSA2 | Single historical epoch |
