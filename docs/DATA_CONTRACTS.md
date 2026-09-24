# Data Contracts

This document specifies the typed contract between the SPHEREx Odyssey
backend and its clients (the Next.js frontend, external scripts,
capture pipelines). All contracts are enforced by Pydantic models in
`routers/`.

## Conventions

- **No fabricated values.** Every field is `Optional` or carries a
  documented provenance.
- **Units are always explicit.** `_mas`, `_kms`, `_mpc`, `_um`,
  `_arcsec` suffixes are required on physical quantities.
- **Frames are explicit.** Redshift, distance, and velocity fields
  carry a `frame` companion unless the frame is canonical for the
  survey (e.g. Gaia parallax is always ICRS).
- **Coordinate convention is J2000.** `ra_deg` ∈ [0, 360),
  `dec_deg` ∈ [-90, 90].
- **WCS keyword names follow the FITS standard.** `CTYPE1`, `CTYPE2`,
  `CRPIX1`, `CRPIX2`, `CRVAL1`, `CRVAL2`, `CD1_1`, `CD1_2`, `CD2_1`,
  `CD2_2` (or `PC + CDELT`).

## Scientific models (selected)

### `GaiaCrossMatch` (`adapters.cross_match`)

| Field | Type | Notes |
|------|------|-------|
| `source_id` | `str \| None` | Gaia DR3 source_id (long int as string) |
| `ra_deg` | `float \| None` | J2000 RA in degrees |
| `dec_deg` | `float \| None` | J2000 Dec in degrees |
| `parallax_mas` | `float \| None` | Parallax in milliarcseconds |
| `parallax_error_mas` | `float \| None` | Parallax 1-sigma uncertainty |
| `pmra_masyr` | `float \| None` | Proper motion in RA (cos δ factored) |
| `pmdec_masyr` | `float \| None` | Proper motion in Dec |
| `radial_velocity_kms` | `float \| None` | Heliocentric radial velocity |
| `ruwe` | `float \| None` | Renormalised Unit Weight Error |
| `phot_g_mean_mag` | `float \| None` | Gaia G-band mean magnitude |
| `separation_arcsec` | `float \| None` | Separation from query center |

### `NEDObject` (`adapters.ned_adapter`)

| Field | Type | Notes |
|------|------|-------|
| `canonical_name` | `str` | NED's canonical identifier |
| `ra_deg` | `float` | J2000 RA |
| `dec_deg` | `float` | J2000 Dec |
| `object_type` | `str` | e.g. "Elliptical Galaxy" |
| `redshift.value` | `float \| None` | Dimensionless z |
| `redshift.frame` | `"heliocentric" \| "cmb" \| "galactocentric" \| "3k"` | Frame tag |
| `redshift.uncertainty` | `float \| None` | Published uncertainty |
| `redshift.reference` | `str \| None` | Bibcode |
| `velocity_kms` | `float \| None` | Heliocentric radial velocity |
| `distance_mpc` | `float \| None` | NED published co-moving distance |
| `distance_method` | `str \| None` | e.g. "Surface Brightness Fluctuations" |
| `morphological_type` | `str \| None` | Hubble classification |
| `html_summary_url` | `str` | Link to NED summary page |
| `photometry` | `list[NEDPhotometryPoint]` | Cross-matched photometry |

### `NEDRedshift` frame field

Valid values: `heliocentric`, `cmb`, `galactocentric`, `3k`.

NED stores every redshift against one of these four frames. Mixing
frames yields up to ~700 km/s of bias (Fixsen et al. 1996); we
therefore require the frame to be carried alongside the value.

### `PixelSource` (`adapters.measurement`)

| Field | Type | Notes |
|------|------|-------|
| `centroid_x_px` | `float` | Iterative center-of-mass centroid |
| `centroid_y_px` | `float` | Iterative center-of-mass centroid |
| `peak_value` | `float` | Peak normalised pixel value in aperture |
| `aperture_flux` | `float` | Sum minus background |
| `aperture_flux_uncertainty` | `float` | sqrt(bkg + source shot noise) |
| `snr` | `float` | flux / uncertainty |
| `magnitude` | `float \| None` | zp - 2.5 log10(flux); requires zeropoint |
| `magnitude_uncertainty` | `float \| None` | 1.0857 / SNR |
| `background_per_pixel` | `float` | Sigma-clipped background |
| `n_pixels_in_aperture` | `int` | Pixel count |
| `is_centroid_converged` | `bool` | Convergence flag |

### `BandCutout` (`adapters.hips_compose`)

| Field | Type | Notes |
|------|------|-------|
| `hips_id` | `str` | IVOA CreatorDID |
| `hips_release` | `str \| None` | "qr2" / "qr3" / None (context) |
| `category` | `"spherex" \| "context"` | |
| `band_label` | `str` | e.g. "SPHEREx_B1 (0.875um)" |
| `central_wavelength_um` | `float \| None` | Published LVF band centre |
| `cutout_url` | `str` | HiPS2FITS URL (does not fetch pixels) |
| `fov_deg` | `float` | Field of view in degrees |
| `width_px` | `int` | Pixel dimension |
| `height_px` | `int` | Pixel dimension |
| `pixel_scale_arcsec` | `float` | fov * 3600 / width_px |

## Error envelopes

All errors raised by the backend follow the FastAPI convention:

```json
{
  "detail": "Human-readable description (no stack trace)"
}
```

For multi-survey queries (e.g. cross-match), per-survey failures are
recorded in the response's `notes` field rather than as an HTTP error —
a partial match is a 200 with notes, not a 502.

## Provenance

Every successful response includes a `provenance` dict. The structure
follows W3C PROV-DM §5:

```json
{
  "prov:Entity": "result envelope id",
  "prov:Activity": {
    "id": "uuid",
    "type": "derivation",
    "started_at_time": "ISO-8601",
    "ended_at_time": "ISO-8601",
    "used": ["upstream endpoint URL"]
  },
  "prov:Agent": [
    {"id": "...", "type": "service", "name": "NASA/IPAC NED"}
  ]
}
```
