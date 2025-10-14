suppressPackageStartupMessages({
  library(terra)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% "scripts/fetch_gnip_correction.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())

source(file.path(script_dir, "utils.R"))

raw_dir <- file.path(root, "data_raw", "gnip")
proc_dir <- file.path(root, "data_proc")
dir.create(raw_dir, recursive = TRUE, showWarnings = FALSE)

message("[gnip] Generating OIPC bias correction from GNIP stations …")
message("[gnip] Note: GNIP data requires manual download from IAEA/WMO")
message("[gnip]   https://nucleus.iaea.org/wiser/index.aspx")
message("[gnip]   Place gnip_annual_means.csv in data_raw/gnip/ with columns: station_id, lat, lon, d18O_precip")

gnip_csv <- file.path(raw_dir, "gnip_annual_means.csv")

if (!file.exists(gnip_csv)) {
  message("[gnip] GNIP data not found. Skipping bias correction.")
  message("[gnip] To enable: download GNIP data and place CSV at: ", gnip_csv)
  quit(status = 0)
}

# Load GNIP stations
gnip <- read.csv(gnip_csv, stringsAsFactors = FALSE)
stopifnot(all(c("lat", "lon", "d18O_precip") %in% names(gnip)))
message("[gnip] Loaded ", nrow(gnip), " GNIP stations")

# Load OIPC precipitation
oipc_path <- file.path(proc_dir, "precip_d18O_growing_season.tif")
if (!file.exists(oipc_path)) oipc_path <- file.path(proc_dir, "precip_d18O_monthly.tif")
if (!file.exists(oipc_path)) stop("OIPC precipitation not found")

oipc <- rast(oipc_path)
if (nlyr(oipc) == 12) oipc <- app(oipc, mean, na.rm = TRUE)  # Annual mean

# Extract OIPC at GNIP stations
pts <- vect(gnip[, c("lon", "lat")], geom = c("lon", "lat"), crs = "EPSG:4326")
oipc_at_stations <- terra::extract(oipc, pts)[, 2]

# Compute bias (GNIP - OIPC)
gnip$oipc_pred <- oipc_at_stations
gnip$bias <- gnip$d18O_precip - gnip$oipc_pred

# Remove NA
gnip_valid <- gnip[!is.na(gnip$bias), ]
message("[gnip] Valid stations with OIPC overlap: ", nrow(gnip_valid))

if (nrow(gnip_valid) < 10) {
  message("[gnip] Too few stations for interpolation. Skipping.")
  quit(status = 0)
}

# Simple inverse distance weighting to create bias correction surface
# For production, use kriging or thin-plate spline
message("[gnip] Interpolating bias correction surface (IDW) …")

# Create grid of points for interpolation
grid_template <- rast(oipc)
coords <- crds(grid_template, na.rm = FALSE)

# IDW: weight = 1 / distance^2, using nearest 5-10 stations
station_coords <- as.matrix(gnip_valid[, c("lon", "lat")])
bias_values <- gnip_valid$bias

# Simplified IDW for speed
bias_grid <- rep(NA_real_, nrow(coords))
for (i in seq_len(nrow(coords))) {
  if (i %% 10000 == 0) cat(sprintf("\r  Progress: %d/%d", i, nrow(coords)))
  pt <- coords[i, ]
  dists <- sqrt((station_coords[, 1] - pt[1])^2 + (station_coords[, 2] - pt[2])^2)
  # Use 5 nearest stations
  nearest <- order(dists)[1:min(5, length(dists))]
  weights <- 1 / (dists[nearest]^2 + 0.01)  # Add small constant to avoid division by zero
  bias_grid[i] <- sum(bias_values[nearest] * weights) / sum(weights)
}
cat("\n")

# Convert to raster
bias_raster <- grid_template
values(bias_raster) <- bias_grid

writeRaster(bias_raster, file.path(proc_dir, "oipc_bias_correction.tif"), overwrite = TRUE)
message("[gnip] Bias correction surface written to data_proc/oipc_bias_correction.tif")

# Summary stats
cat(sprintf("  Bias range: %.2f to %.2f ‰\n", min(gnip_valid$bias), max(gnip_valid$bias)))
cat(sprintf("  Mean bias: %.2f ‰ (RMSE: %.2f ‰)\n", mean(gnip_valid$bias), sqrt(mean(gnip_valid$bias^2))))



