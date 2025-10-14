suppressPackageStartupMessages({
  library(terra)
  library(utils)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# Resolve paths
args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% "scripts/fetch_irrigation.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())

source(file.path(script_dir, "utils.R"))

raw_dir <- file.path(root, "data_raw", "irrigation")
proc_dir <- file.path(root, "data_proc")
dir.create(raw_dir, recursive = TRUE, showWarnings = FALSE)

message("[irrigation] Fetching GMIA v5 irrigated area fraction …")

# GMIA v5: Global Map of Irrigation Areas v5
# Source: https://www.fao.org/aquastat/en/geospatial-information/global-maps-irrigated-areas/
# Direct link to GeoTIFF (5 arc-min resolution, ~9km)
url <- "https://storage.googleapis.com/fao-maps-catalog-data/geonetwork/aquastat/gmia_v5_aei_pct.tif"
tif_path <- file.path(raw_dir, "gmia_v5_aei_pct.tif")

if (!file.exists(tif_path)) {
  message("[irrigation] Downloading from FAO/AQUASTAT …")
  tryCatch({
    download.file(url, destfile = tif_path, mode = "wb", quiet = FALSE)
  }, error = function(e) {
    message("[irrigation] Primary URL failed; trying alternative …")
    # Fallback: use local geodata package or manual download
    stop("Could not download GMIA. Please download manually from:\n  https://www.fao.org/aquastat/en/geospatial-information/global-maps-irrigated-areas/\n  and place at: ", tif_path)
  })
}

if (!file.exists(tif_path)) {
  stop("Irrigation fraction file not found. Download GMIA v5 AEI% and place at: ", tif_path)
}

message("[irrigation] Reading and aligning irrigation fraction (0-100%) …")
irrig_raw <- rast(tif_path)

# Align to target grid
irrig_aligned <- align_to_target(irrig_raw)

# Convert from % to fraction (0-1)
irrig_frac <- irrig_aligned / 100
irrig_frac[irrig_frac < 0] <- 0
irrig_frac[irrig_frac > 1] <- 1
irrig_frac[is.na(irrig_frac)] <- 0  # Assume rainfed where NA

writeRaster(irrig_frac, file.path(proc_dir, "irrigation_fraction.tif"), overwrite = TRUE)
message("[irrigation] Done. Irrigation fraction written to data_proc/irrigation_fraction.tif")



