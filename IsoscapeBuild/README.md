# IsoscapeBuild (10 arc‑min, WorldClim + OIPC + SPAM + MIRCA)

Goal: reproducibly fetch and harmonize public inputs to build plant tissue isoscapes (starting with cotton; designed to extend to other crops).

Outputs (in `data_proc/`):
- precip_d18O_monthly.tif (OIPC; monthly or growing season as available)
- tmean_monthly.tif (WorldClim 2.1)
- vapour_pressure_monthly.tif and rh_or_vpd_monthly.tif (derived)
- cotton_production.tif and cotton_mask.tif (SPAM 2020)
- cotton_calendar_monthly_weights.tif (MIRCA2000; 0–1 per month)

Sources (research use for OIPC):
- OIPC/WaterIsotopes GlobalPrecip: https://wateriso.utah.edu/waterisotopes/media/ArcGrids/GlobalPrecip.zip
- OIPC GlobalPrecipGS: https://wateriso.utah.edu/waterisotopes/media/ArcGrids/GlobalPrecipGS.zip
- WorldClim 2.1 monthly: https://www.worldclim.org/data/worldclim21.html
- SPAM 2020: https://www.mapspam.info/
- MIRCA 2000: https://www.uni-frankfurt.de/45218031/data_download (cropping calendars)

Run (from repo root):
```
R -q -e "source('IsoscapeBuild/scripts/fetch_inputs.R')"
```

Calibration:
- Place reference samples in `data_raw/calibration/cotton_calibration_enhanced.csv`
- See `CALIBRATION_REFERENCES.md` for academic papers and data sources
- See `CALIBRATION_ACTION_PLAN.md` for improving the calibration dataset
- Run diagnostic: `Rscript scripts/diagnose_calibration.R`

Notes:
- Resolution: 10 arc‑min (WGS84). Change in `scripts/utils.R` if needed later.
- OIPC is included as research-only; see OIPC license/terms before redistribution.
- Extend to other crops by swapping SPAM crop layers and MIRCA calendars.
