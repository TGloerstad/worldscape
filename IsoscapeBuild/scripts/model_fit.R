suppressPackageStartupMessages({
  library(terra)
  library(dplyr)
  library(stats)
  library(jsonlite)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# paths
caller_file <- tryCatch({
  if (exists(".__file__", inherits = TRUE)) get(".__file__", inherits = TRUE) else NULL
}, error = function(e) NULL)
this_file <- caller_file %||% sys.frame(1)$ofile %||% "scripts/model_fit.R"
script_dir <- normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE)
# script_dir is IsoscapeBuild/scripts → root is its parent
root <- normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE)
proc_dir <- file.path(root, "data_proc")
model_dir <- file.path(root, "model")
if (!dir.exists(model_dir)) dir.create(model_dir, recursive = TRUE)

# crop code used during fetch_inputs (affects calendar filename)
crop_code <- Sys.getenv("ISB_CROP", "COTT")

# input rasters
r_precip_gs <- file.path(proc_dir, "precip_d18O_growing_season.tif")
r_precip_m  <- file.path(proc_dir, "precip_d18O_monthly.tif")
r_tmean_m   <- file.path(proc_dir, "tmean_monthly.tif")
r_weights   <- file.path(proc_dir, paste0(tolower(crop_code), "_calendar_monthly_weights.tif"))

stopifnot(file.exists(r_tmean_m))
if (!file.exists(r_precip_gs) && !file.exists(r_precip_m)) {
  stop("Need precip δ18O raster: not found in data_proc/")
}

precip_gs <- if (file.exists(r_precip_gs)) rast(r_precip_gs) else NULL
precip_m  <- if (file.exists(r_precip_m))  rast(r_precip_m)  else NULL
tmean_m   <- rast(r_tmean_m)
weights_m <- if (file.exists(r_weights))   rast(r_weights)   else NULL

# harmonize layer counts
if (!is.null(weights_m) && nlyr(weights_m) != 12) weights_m <- NULL
if (nlyr(tmean_m) != 12) stop("Expected 12 monthly layers in tmean_monthly.tif")

# compute weighted tmean raster (grow-season weights if provided; else monthly mean)
message("Preparing climate predictors …")
if (!is.null(weights_m)) {
  wsum <- app(weights_m, fun = sum, na.rm = TRUE)
  wsum[wsum == 0] <- NA
  tmean_w <- sum(tmean_m * weights_m, na.rm = TRUE) / wsum
} else {
  tmean_w <- app(tmean_m, fun = mean, na.rm = TRUE)
}

# choose precip predictor
if (is.null(precip_gs)) {
  # monthly precip_d18O; weight like tmean
  if (!is.null(weights_m) && nlyr(precip_m) == 12) {
    wsum <- app(weights_m, fun = sum, na.rm = TRUE)
    wsum[wsum == 0] <- NA
    precip_w <- sum(precip_m * weights_m, na.rm = TRUE) / wsum
  } else if (nlyr(precip_m) >= 1) {
    precip_w <- app(precip_m, fun = mean, na.rm = TRUE)
  } else {
    stop("No usable precip δ18O raster")
  }
} else {
  precip_w <- precip_gs
}

# align
if (!compareGeom(precip_w, tmean_w, stopOnError = FALSE)) {
  tmean_w <- project(tmean_w, precip_w)
}

# try to fit with calibration if present
calib_csv <- Sys.getenv("ISB_CAL", file.path(root, "data_raw", "calibration", "calibration.csv"))
use_calib <- file.exists(calib_csv)

coef_list <- list(a0 = 0.0, b_precip = 1.0, c_tmean = 0.0, sigma = 0.8, used_calibration = FALSE)

if (use_calib) {
  message("Fitting simple empirical model with calibration: ", calib_csv)
  df <- read.csv(calib_csv, stringsAsFactors = FALSE)
  stopifnot(all(c("sample_id", "d18O_cellulose", "lat", "lon") %in% names(df)))
  pts <- vect(df[, c("lon", "lat")], geom = c("lon", "lat"), crs = crs(precip_w))
  # extract predictors at sites
  p_site <- terra::extract(precip_w, pts)[, 2]
  t_site <- terra::extract(tmean_w, pts)[, 2]
  dat <- tibble(y = df$d18O_cellulose, p = p_site, t = t_site) %>% na.omit()
  if (nrow(dat) >= 5) {
    fit <- lm(y ~ p + t, data = dat)
    coefs <- coef(fit)
    a0 <- unname(coefs[1] %||% 0)
    b  <- unname(coefs[2] %||% 1)
    c  <- unname(coefs[3] %||% 0)
    s  <- sqrt(mean(residuals(fit)^2, na.rm = TRUE)) %||% 2
    coef_list <- list(a0 = a0, b_precip = b, c_tmean = c, sigma = s, used_calibration = TRUE,
                      n = nrow(dat))
  } else {
    message("Not enough calibration rows after NA removal; using placeholder coefficients")
  }
} else {
  message("No calibration provided; using placeholder coefficients (a0=0, b=1, c=0, sigma=2)")
}

# build cellulose μ raster
message("Building cellulose μ raster …")
cell_mu <- coef_list$a0 + coef_list$b_precip * precip_w + coef_list$c_tmean * tmean_w

# constant sigma raster (placeholder)
cell_sigma <- cell_mu; values(cell_sigma) <- coef_list$sigma

writeRaster(cell_mu,    file.path(proc_dir, "cellulose_mu.tif"), overwrite = TRUE)
writeRaster(cell_sigma, file.path(proc_dir, "cellulose_sigma.tif"), overwrite = TRUE)
writeLines(toJSON(coef_list, auto_unbox = TRUE, pretty = TRUE), file.path(model_dir, "model_params.json"))

message("Model built. Params written to ", file.path(model_dir, "model_params.json"))
