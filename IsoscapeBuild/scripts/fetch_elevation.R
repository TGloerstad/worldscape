suppressPackageStartupMessages({
  library(terra)
  library(utils)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# Resolve paths
args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% "scripts/fetch_elevation.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())

source(file.path(script_dir, "utils.R"))

raw_dir <- file.path(root, "data_raw", "elevation")
proc_dir <- file.path(root, "data_proc")
dir.create(raw_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(proc_dir, recursive = TRUE, showWarnings = FALSE)

message("[elevation] Fetching GMTED2010 mean elevation (10 arc-min) …")

# GMTED2010 mean elevation at 30 arc-sec; we'll use geodata package for convenience
if (!requireNamespace("geodata", quietly = TRUE)) {
  message("Installing geodata package …")
  install.packages("geodata", repos = "https://cloud.r-project.org", quiet = FALSE)
}

library(geodata)

# Download GMTED2010 via geodata (cached in raw_dir)
elev_path <- file.path(raw_dir, "gmted_10m.tif")

if (!file.exists(elev_path)) {
  message("[elevation] Downloading elevation data via geodata …")
  # geodata::elevation_global downloads GMTED tiles; we'll use a simpler approach
  # Use SRTM via elevation_3s (3 arc-sec) and aggregate, or get GMTED directly
  # For 10' target, download via direct URL (GMTED2010 mean 7.5')
  
  url <- "https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/topo/downloads/GMTED/Grid_ZipFiles/mn75_grd.zip"
  zip_path <- file.path(raw_dir, "gmted_mn75.zip")
  
  if (!file.exists(zip_path)) {
    download.file(url, destfile = zip_path, mode = "wb", quiet = FALSE)
  }
  
  unzip_dir <- file.path(raw_dir, "gmted_unzip")
  dir.create(unzip_dir, showWarnings = FALSE)
  unzip(zip_path, exdir = unzip_dir)
  
  # Find the grid/raster in unzipped files
  files <- list.files(unzip_dir, pattern = "\\.(tif|adf|bil)$", full.names = TRUE, recursive = TRUE)
  if (length(files) == 0) stop("No raster found in GMTED zip")
  
  elev_raw <- rast(files[1])
  elev_aligned <- align_to_target(elev_raw)
  writeRaster(elev_aligned, elev_path, overwrite = TRUE)
  message("[elevation] Wrote aligned elevation: ", elev_path)
} else {
  message("[elevation] Using existing: ", elev_path)
}

# Copy to proc_dir for model access
elev <- rast(elev_path)
writeRaster(elev, file.path(proc_dir, "elevation_m.tif"), overwrite = TRUE)
message("[elevation] Done. Elevation available in data_proc/elevation_m.tif")



