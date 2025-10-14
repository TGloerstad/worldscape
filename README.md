# WorldScape - Multi-Crop Isotope Provenance Platform

**Version 2.0** | **Production-Ready** | **Oct 2025**

A comprehensive system for agricultural product provenance analysis using stable isotope signatures, advanced climate corrections, and Bayesian assignment modeling.

**Supported Crops**: Cotton ✅ | Coffee ✅ | Onion ⚠️ | Garlic ⚠️ | Chillies ⚠️  
**Calibrated Models**: 2 (Cotton n=10, Coffee n=25)  
**Framework**: Extensible to any crop

## Project Structure

### FTMapping (Legacy)
- Original R-based cotton mapping system using pre-calibrated `Model1.tif`
- Uses SPAM 2020 v1.0 production data
- Shiny-based UI (converted to API for integration)

### IsoscapeBuild (New Multi-Crop Framework) ⭐
- Fetches and processes public datasets: OIPC, WorldClim, SPAM, MIRCA, GMTED, GNIP
- Builds crop-specific tissue isoscapes with 4 major improvements:
  1. Theoretical fractionation priors (literature-based)
  2. Elevation lapse rate correction (±2-5‰ in mountains)
  3. Irrigation source-water mixing (±1-2‰ in irrigated regions)
  4. GNIP station bias correction (1,258 global stations)
- Supports 5 crops: Cotton (calibrated), Coffee (calibrated), Onion, Garlic, Chillies (theoretical)
- Extensible framework for adding new crops

### WorldMapping (New Assignment Engine)
- Clean Bayesian assignment implementation
- Uses IsoscapeBuild outputs (calibrated isoscape + SPAM v2.0 priors)
- Produces same output structure as FTMapping for comparison

### worldscape-ui (Next.js Interface)
- Modern web interface for all three systems
- File upload, inline sample input, output visualization
- Side-by-side comparison of legacy vs new models
- Interactive map previews with zoom and styling controls

## Quick Start

### Prerequisites
- R with packages: `terra`, `assignR`, `plumber`, `jsonlite`, `readxl`, `writexl`
- Node.js 18+ for the UI
- GDAL tools for raster processing

### Setup
1. Clone repository
2. Install R dependencies: `cd FTMapping && R -e "renv::restore()"`
3. Install Node dependencies: `cd worldscape-ui && npm install`
4. Start R API: `R -e "plumber::pr_run(plumber::pr('FTMapping/api.R'), port=8000)"`
5. Start UI: `cd worldscape-ui && npm run dev`

### Usage
- **Legacy FTMapping**: Upload Excel with samples/d18O, run mapping
- **IsoscapeBuild**: Fetch data sources, build calibrated isoscape
- **WorldMapping**: Run assignment using new isoscape and SPAM v2.0
- **Compare**: Side-by-side legacy vs new model results

## Calibration

### Current Calibration Status:
- ✅ **Cotton**: 32 samples (10 used, RMSE=1.79‰) - `cotton_calibration_enhanced.csv`
- ✅ **Coffee**: 45 samples (25 used, RMSE=1.88‰) - `coffee_calibration.csv`
- ⏳ **Onion/Garlic/Chillies**: Awaiting samples (30-60 needed per crop)

### Format (CSV):
```csv
sample_id,d18O_cellulose,lat,lon,elevation,harvest_year,species,processing_method,irrigation
```

**Required**: `sample_id`, `d18O_cellulose`, `lat`, `lon`  
**Optional**: `elevation`, `harvest_year`, `species`, `processing_method`, `irrigation`

Place calibration files at: `IsoscapeBuild/data_raw/calibration/<crop>_calibration.csv`

Then rebuild:
```bash
ISB_CROP=<CROP> ISB_CAL=IsoscapeBuild/data_raw/calibration/<crop>_calibration.csv \
  R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"
```

## Data Sources

| Source | Purpose | Version | Resolution |
|--------|---------|---------|------------|
| **OIPC** | Precipitation δ18O | GlobalPrecip/GS | 10 arc-min |
| **WorldClim** | Temperature, VPD | v2.1 | 10 arc-min |
| **SPAM** | Crop production | v2r0 | 5-10 arc-min |
| **MIRCA** | Cropping calendars | 2000 | 5 arc-min |
| **GMTED** | Elevation | 2010 | 7.5 arc-min |
| **GNIP** | Station calibration | 2024 | 1,258 stations |
| **Calibration** | Reference samples | 2020-2024 | Region-specific |

**Total Data**: ~7 GB

## Documentation

### Quick Reference:
- `FINAL_STATUS.md` - Current system status and capabilities
- `SESSION_SUMMARY.md` - Implementation session overview
- `MODEL_IMPROVEMENTS.md` - Technical details of 4 improvements

### Detailed Guides:
- `IsoscapeBuild/README.md` - Multi-crop framework guide
- `IsoscapeBuild/COFFEE_READY.md` - Coffee model status
- `MODEL_COMPARISON_ANALYSIS.md` - Old vs new model comparison

### Scripts:
- `compare_models.R` - Validation and comparison
- `check_calibration_usage.R` - Calibration diagnostics

## License

Research use only. OIPC data has specific research-only terms.  
Commercial use: Contact FloraTrace, Inc.

