"""
spexpi_worker.py — Blocking SPExPI extraction worker (corrected against real API).

Called inside asyncio.get_event_loop().run_in_executor(thread_pool, ...) so it
never blocks the FastAPI event loop.

Key API facts (verified from spexpi 0.1.0 inspection):
- PipelineConfig.photometry_method: "aperture" | "psf"  (not "both")
- open_cutouts_parallel(prepared_rows, ra, dec, cfg) → list[dict]
- measure_cutout_photometry(row, sapm_cache, cfg) → list[dict]
- build_spectrum_table(measurements, aperture_radius_pix, photometry_method)
- process_spectrum_table(spec, cfg)
- make_object_name(ra, dec, object_name=None)

For "both": share cutout discovery/download, run measure twice with
  different configs (aperture + psf).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Callable

import numpy as np

log = logging.getLogger("spexpi_worker")

SPHEREX_CACHE_DIR = Path(
    os.environ.get("SPHEREX_CACHE_DIR", Path(__file__).parent.parent / ".cache" / "spherex")
)
SPHEREX_CACHE_DIR.mkdir(parents=True, exist_ok=True)

VALID_RELEASES = {"qr2", "qr3"}

DEFAULT_SAPM_COLLECTION              = "cal-sapm-v2-2025-164"
DEFAULT_SPECTRAL_CHANNELS_COLLECTION = "cal-sch-v1-2026-106"


def _resolve_data_release(requested: str) -> list[str]:
    req = requested.strip().lower()
    if req == "latest":
        return ["qr3", "qr2"]
    if req in VALID_RELEASES:
        return [req]
    raise ValueError(f"Invalid data_release={requested!r}. Use 'qr3', 'qr2', or 'latest'.")


def _make_config(
    photometry_method: str,
    pmra_masyr: float | None,
    pmdec_masyr: float | None,
    reference_epoch_yr: float | None,
    download_dir: str,
    output_dir: str,
) -> Any:
    """Build a PipelineConfig with correct field names."""
    from spexpi.spherex_pipeline import PipelineConfig
    return PipelineConfig(
        photometry_method=photometry_method,
        reduce_oversampling=True,
        use_spectral_channels_for_binning=True,
        spectral_channels_bin_by="integrate",
        subtract_zodi=True,
        sanitize_flux=True,
        remove_outliers=True,
        save_raw_measurements=True,
        save_manifest=True,
        max_workers=4,
        retries=3,
        show_download_progress=False,
        pmra_masyr=pmra_masyr,
        pmdec_masyr=pmdec_masyr,
        reference_epoch_yr=reference_epoch_yr,
        sapm_collection=DEFAULT_SAPM_COLLECTION,
        spectral_channels_collection=DEFAULT_SPECTRAL_CHANNELS_COLLECTION,
        download_dir=str(download_dir),
        output_dir=str(output_dir),
    )


def _points_from_binned(binned_table: Any, method: str) -> list[dict]:
    """Convert a binned Table to serializable list[dict]."""
    points = []
    for row in binned_table:
        flux = float(row["FLUX"])
        err  = float(row["ERR"])
        wl   = float(row["WAVELENGTH"])
        det  = int(row["DETECTOR"])
        points.append({
            "wavelength_um":     wl,
            "flux_uJy":          round(flux * 1e6, 6)  if np.isfinite(flux) else None,
            "flux_err_uJy":      round(err  * 1e6, 6)  if np.isfinite(err)  else None,
            "snr":               round(abs(flux) / err, 3) if (err > 0 and np.isfinite(err) and np.isfinite(flux)) else None,
            "detector":          det,
            "photometry_method": method,
        })
    return points


def run_extraction(
    job_id: str,
    ra: float,
    dec: float,
    target_name: str | None,
    data_release: str,
    photometry_method: str,
    pmra_masyr: float | None,
    pmdec_masyr: float | None,
    reference_epoch_yr: float | None,
    phase_callback: Callable[[str, str, int, dict], None],
    artifact_dir: Path,
) -> dict[str, Any]:
    """
    Blocking extraction. Returns result dict or raises RuntimeError.

    RuntimeError message format: "REASON_CODE:human message"
    Recognized codes: IRSA_TIMEOUT, NO_COVERAGE, DOWNLOAD_FAILED,
                      OPEN_FAILED, PHOTOMETRY_FAILED, BINNING_FAILED
    """
    from spexpi.spherex_pipeline import (
        PipelineConfig,
        query_spherex_cutouts,
        download_cutout_files_parallel,
        open_cutouts_parallel,
        measure_cutout_photometry,
        build_spectrum_table,
        process_spectrum_table,
        make_object_name,
        normalize_data_release,
        infer_unique_data_release,
    )
    from services.provenance import build_provenance, save_provenance

    artifact_dir.mkdir(parents=True, exist_ok=True)
    download_dir = SPHEREX_CACHE_DIR / "downloads"
    download_dir.mkdir(parents=True, exist_ok=True)

    releases_to_try = _resolve_data_release(data_release)
    object_name = make_object_name(ra, dec, target_name)

    # Determine which methods to run
    methods = ["aperture", "psf"] if photometry_method == "both" else [photometry_method]

    for release in releases_to_try:
        log.info("[%s] Trying release=%s", job_id, release)

        # Use aperture config for discovery (method doesn't affect TAP query)
        cfg_discovery = _make_config(
            photometry_method="aperture",
            pmra_masyr=pmra_masyr,
            pmdec_masyr=pmdec_masyr,
            reference_epoch_yr=reference_epoch_yr,
            download_dir=str(download_dir),
            output_dir=str(artifact_dir),
        )

        # ── DISCOVERING ────────────────────────────────────────────────────
        phase_callback(job_id, "discovering", 5, {})
        try:
            cutout_table = query_spherex_cutouts(ra, dec, cfg_discovery)
        except Exception as e:
            log.warning("[%s] IRSA TAP failed: %s", job_id, e)
            raise RuntimeError(f"IRSA_TIMEOUT:{e}") from e

        n_found = len(cutout_table)
        if n_found == 0:
            if release != releases_to_try[-1]:
                log.info("[%s] No coverage in %s, trying next release", job_id, release)
                continue
            raise RuntimeError("NO_COVERAGE:No SPHEREx observations found at this coordinate.")

        phase_callback(job_id, "discovering", 15, {"n_cutouts": n_found})
        log.info("[%s] Found %d cutouts (release=%s)", job_id, n_found, release)

        # ── DOWNLOADING ────────────────────────────────────────────────────
        phase_callback(job_id, "downloading", 20, {"n_cutouts": n_found})
        try:
            prepared = download_cutout_files_parallel(
                cutout_table, object_name, cfg_discovery, ra=ra, dec=dec
            )
        except Exception as e:
            raise RuntimeError(f"DOWNLOAD_FAILED:{e}") from e

        # Infer actual release from downloaded files
        try:
            actual_release = infer_unique_data_release(prepared)
        except Exception:
            actual_release = release

        phase_callback(job_id, "downloading", 35, {"n_cutouts": n_found, "data_release": actual_release})

        # ── CALIBRATING / POSITIONING ─────────────────────────────────────
        phase_callback(job_id, "calibrating", 40, {})
        try:
            opened = open_cutouts_parallel(prepared, ra, dec, cfg_discovery)
        except Exception as e:
            raise RuntimeError(f"OPEN_FAILED:{e}") from e

        n_open = sum(1 for r in opened if r.get("image_hdu") is not None)
        if n_open == 0:
            raise RuntimeError("NO_COVERAGE:All cutouts failed to open at this coordinate.")

        phase_callback(job_id, "positioning", 50, {"n_cutouts": n_open})

        # ── PHOTOMETRY: run each method ────────────────────────────────────
        all_meas_by_method: dict[str, list[dict]] = {}

        for m_idx, method in enumerate(methods):
            cfg_m = _make_config(
                photometry_method=method,
                pmra_masyr=pmra_masyr,
                pmdec_masyr=pmdec_masyr,
                reference_epoch_yr=reference_epoch_yr,
                download_dir=str(download_dir),
                output_dir=str(artifact_dir),
            )

            phase_callback(job_id, "photometry", 55 + m_idx * 5, {})
            meas_list: list[dict] = []
            sapm_cache: dict = {}

            try:
                for i, row in enumerate(opened):
                    if row.get("image_hdu") is None:
                        continue
                    meas = measure_cutout_photometry(row, sapm_cache, cfg_m)
                    meas_list.extend(meas)
                    # incremental 55→80
                    base = 55 + m_idx * 5
                    pct = base + int(10 * (i + 1) / max(n_open, 1))
                    if pct % 3 == 0:
                        phase_callback(job_id, "photometry", pct, {"n_measurements": len(meas_list)})
            except Exception as e:
                raise RuntimeError(f"PHOTOMETRY_FAILED:{e}") from e

            all_meas_by_method[method] = meas_list

        n_ap  = sum(1 for m in all_meas_by_method.get("aperture", []) if m.get("status") == "ok")
        n_psf = sum(1 for m in all_meas_by_method.get("psf",      []) if m.get("status") == "ok")
        phase_callback(job_id, "photometry", 80, {
            "n_measurements": n_ap if "aperture" in all_meas_by_method else n_psf
        })

        # ── BINNING ────────────────────────────────────────────────────────
        phase_callback(job_id, "binning", 82, {})
        spectra: dict[str, list[dict]] = {}

        try:
            for method, meas_list in all_meas_by_method.items():
                cfg_m = _make_config(
                    photometry_method=method,
                    pmra_masyr=pmra_masyr,
                    pmdec_masyr=pmdec_masyr,
                    reference_epoch_yr=reference_epoch_yr,
                    download_dir=str(download_dir),
                    output_dir=str(artifact_dir),
                )
                raw    = build_spectrum_table(meas_list, cfg_m.selected_aperture_radius_pix, method)
                if len(raw) == 0:
                    spectra[method] = []
                    continue
                binned = process_spectrum_table(raw, cfg_m)
                spectra[method] = _points_from_binned(binned, method)
        except Exception as e:
            raise RuntimeError(f"BINNING_FAILED:{e}") from e

        phase_callback(job_id, "binning", 90, {})

        # ── QA ─────────────────────────────────────────────────────────────
        phase_callback(job_id, "qa", 93, {})

        # Aperture/PSF agreement diagnostic
        ap_psf_rms = None
        if "aperture" in spectra and "psf" in spectra:
            ap_pts  = {p["wavelength_um"]: p["flux_uJy"] for p in spectra["aperture"] if p["flux_uJy"] is not None}
            psf_pts = {p["wavelength_um"]: p["flux_uJy"] for p in spectra["psf"]      if p["flux_uJy"] is not None}
            shared  = set(ap_pts) & set(psf_pts)
            if shared:
                diffs = [ap_pts[w] - psf_pts[w] for w in shared]
                ap_psf_rms = float(np.sqrt(np.mean(np.array(diffs) ** 2)))

        n_valid = n_ap if "aperture" in all_meas_by_method else n_psf

        diagnostics = {
            "n_cutouts_found":              n_found,
            "n_cutouts_opened":             n_open,
            "n_aperture_measurements_ok":   n_ap,
            "n_psf_measurements_ok":        n_psf,
            "n_valid_measurements":         n_valid,
            "aperture_psf_rms_diff_uJy":    round(ap_psf_rms, 3) if ap_psf_rms is not None else None,
            "contamination_flag":           False,
        }

        # ── Build result ────────────────────────────────────────────────────
        primary_method = "aperture" if "aperture" in spectra else (methods[0] if methods else "aperture")
        primary_spectrum = spectra.get(primary_method, [])

        cfg_final = _make_config(
            photometry_method=primary_method,
            pmra_masyr=pmra_masyr, pmdec_masyr=pmdec_masyr,
            reference_epoch_yr=reference_epoch_yr,
            download_dir=str(download_dir), output_dir=str(artifact_dir),
        )

        provenance = build_provenance(
            request_dict={"ra": ra, "dec": dec, "target_name": target_name,
                          "data_release": data_release, "photometry_method": photometry_method},
            data_release=actual_release,
            sapm_collection=DEFAULT_SAPM_COLLECTION,
            spectral_channels_collection=DEFAULT_SPECTRAL_CHANNELS_COLLECTION,
            photometry_method=photometry_method,
            aperture_radius_pix=cfg_final.selected_aperture_radius_pix,
            n_cutouts=n_open,
            n_measurements=n_valid,
        )

        pm_dict = None
        if pmra_masyr is not None:
            pm_dict = {"pmra_masyr": pmra_masyr, "pmdec_masyr": pmdec_masyr,
                       "reference_epoch_yr": reference_epoch_yr}

        result: dict[str, Any] = {
            "source":             "spherex_real",
            "data_release":       actual_release,
            "photometry_method":  photometry_method,
            "target": {
                "name":    target_name or object_name,
                "ra_deg":  ra,
                "dec_deg": dec,
                **({"proper_motion": pm_dict} if pm_dict else {}),
            },
            "spectrum":    primary_spectrum,
            "spectra":     spectra,
            "diagnostics": diagnostics,
            "provenance":  provenance,
        }

        result_path = artifact_dir / "spectrum.json"
        result_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
        save_provenance(provenance, artifact_dir)
        (artifact_dir / "diagnostics.json").write_text(
            json.dumps(diagnostics, indent=2, default=str), encoding="utf-8"
        )

        # Build and save authentic pipeline manifest
        cutout_manifest = []
        for r in opened:
            cutout_manifest.append({
                "fits_filename": str(Path(r.get("path", "")).name) if r.get("path") else None,
                "detector": r.get("detector"),
                "band": r.get("band"),
                "obs_time_utc": r.get("obs_time"),
                "has_image": r.get("image_hdu") is not None,
            })
        manifest = {
            "job_id": job_id,
            "target": target_name or object_name,
            "ra": ra,
            "dec": dec,
            "data_release": actual_release,
            "n_cutouts": len(cutout_manifest),
            "cutouts": cutout_manifest,
            "artifacts": [
                "spectrum.json",
                "diagnostics.json",
                "provenance.json",
                "manifest.json",
            ],
        }
        (artifact_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2, default=str), encoding="utf-8"
        )

        phase_callback(job_id, "complete", 100, {
            "n_measurements": n_valid, "data_release": actual_release,
        })
        return result

    raise RuntimeError("NO_COVERAGE:Exhausted all data releases without finding coverage.")
