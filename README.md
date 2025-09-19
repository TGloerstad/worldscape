# WorldScape - Cotton Provenance Mapping System

A comprehensive system for cotton provenance analysis using stable isotope signatures and Bayesian assignment modeling.

## Project Structure

### FTMapping (Legacy)
- Original R-based cotton mapping system using pre-calibrated `Model1.tif`
- Uses SPAM 2020 v1.0 production data
- Shiny-based UI (converted to API for integration)

### IsoscapeBuild (New Data Pipeline)
- Fetches and processes public datasets: OIPC, WorldClim, SPAM 2020 v2.0, MIRCA
- Builds cotton cellulose isoscape from climate/precipitation data
- Supports custom calibration datasets for model fitting

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

Place cotton calibration data in `IsoscapeBuild/data_raw/calibration/cotton_calibration_enhanced.csv`:

```csv
sample_id,d18O_cellulose,lat,lon,elevation,harvest_year,variety,irrigation
TX_001,28.5,32.7,-96.8,180,2020,Upland,rainfed
```

Required columns: `sample_id`, `d18O_cellulose`, `lat`, `lon`

## Data Sources

- **OIPC**: Global precipitation δ18O climatologies
- **WorldClim 2.1**: Monthly temperature and vapor pressure
- **SPAM 2020**: Spatial allocation of cotton production (v1.0 legacy, v2.0 new)
- **MIRCA**: Cropping calendars for seasonal weighting

## License

Proprietary - FloraTrace, Inc.
