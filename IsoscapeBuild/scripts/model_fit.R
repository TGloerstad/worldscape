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
r_vpd_m     <- if (file.exists(file.path(proc_dir, "vpd_monthly.tif"))) file.path(proc_dir, "vpd_monthly.tif") else file.path(proc_dir, "rh_or_vpd_monthly.tif")
r_elev      <- file.path(proc_dir, "elevation_m.tif")
r_irrig     <- file.path(proc_dir, "irrigation_fraction.tif")
r_gnip_bias <- file.path(proc_dir, "oipc_bias_correction.tif")
r_weights   <- file.path(proc_dir, paste0(tolower(crop_code), "_calendar_monthly_weights.tif"))

stopifnot(file.exists(r_tmean_m))
if (!file.exists(r_precip_gs) && !file.exists(r_precip_m)) {
  stop("Need precip δ18O raster: not found in data_proc/")
}

precip_gs <- if (file.exists(r_precip_gs)) rast(r_precip_gs) else NULL
precip_m  <- if (file.exists(r_precip_m))  rast(r_precip_m)  else NULL
tmean_m   <- rast(r_tmean_m)
vpd_m     <- if (file.exists(r_vpd_m))      rast(r_vpd_m)    else NULL
elev_m    <- if (file.exists(r_elev))       rast(r_elev)     else NULL
f_irrig_m <- if (file.exists(r_irrig))      rast(r_irrig)    else NULL
weights_m <- if (file.exists(r_weights))   rast(r_weights)   else NULL

# harmonize layer counts
if (!is.null(weights_m) && nlyr(weights_m) != 12) weights_m <- NULL
if (nlyr(tmean_m) != 12) stop("Expected 12 monthly layers in tmean_monthly.tif")
if (!is.null(vpd_m) && nlyr(vpd_m) != 12) vpd_m <- NULL

# Apply elevation lapse rate correction to temperature (-0.0065°C/m)
message("Preparing climate predictors …")
if (!is.null(elev_m)) {
  message("Applying elevation lapse rate correction (-0.0065°C/m) …")
  # Align elevation to temperature grid
  if (!compareGeom(elev_m, tmean_m, stopOnError = FALSE)) {
    elev_m <- project(elev_m, tmean_m)
  }
  # Apply lapse rate to all 12 monthly layers
  lapse_rate <- -0.0065  # °C per meter
  for (i in 1:12) {
    tmean_m[[i]] <- tmean_m[[i]] + lapse_rate * elev_m
  }
  message("Temperature corrected for elevation")
}

# Apply irrigation source-water mixing to precipitation δ18O
# Assumption: irrigation water (rivers/groundwater) is ~2‰ enriched vs direct precipitation
if (!is.null(f_irrig_m)) {
  message("Applying irrigation source-water mixing …")
  irrigation_shift <- 2.0  # ‰ enrichment for irrigation water (empirical estimate)
  
  # Align irrigation fraction to precipitation
  if (!is.null(precip_gs) && !compareGeom(f_irrig_m, precip_gs, stopOnError = FALSE)) {
    f_irrig_aligned <- project(f_irrig_m, precip_gs)
  } else if (!is.null(precip_m) && !compareGeom(f_irrig_m, precip_m, stopOnError = FALSE)) {
    f_irrig_aligned <- project(f_irrig_m, precip_m)
  } else {
    f_irrig_aligned <- f_irrig_m
  }
  
  # Mix: δ18O_source = (1-f)×precip + f×(precip + shift)
  # Simplifies to: δ18O_source = precip + f×shift
  if (!is.null(precip_gs)) {
    precip_gs <- precip_gs + f_irrig_aligned * irrigation_shift
  }
  if (!is.null(precip_m)) {
    precip_m <- precip_m + f_irrig_aligned * irrigation_shift
  }
  message("Precipitation δ18O adjusted for irrigation (", round(mean(values(f_irrig_aligned, mat=FALSE), na.rm=TRUE), 2), " mean fraction)")
}

# Apply GNIP bias correction if available (optional enhancement)
if (file.exists(r_gnip_bias)) {
  message("Applying GNIP station bias correction …")
  gnip_bias <- rast(r_gnip_bias)
  if (!is.null(precip_gs)) {
    if (!compareGeom(gnip_bias, precip_gs, stopOnError = FALSE)) gnip_bias <- project(gnip_bias, precip_gs)
    precip_gs <- precip_gs + gnip_bias
  }
  if (!is.null(precip_m)) {
    if (!compareGeom(gnip_bias, precip_m, stopOnError = FALSE)) gnip_bias <- project(gnip_bias, precip_m)
    precip_m <- precip_m + gnip_bias
  }
  message("OIPC bias correction applied")
} else {
  message("GNIP bias correction not available (optional)")
}

if (!is.null(weights_m)) {
  wsum <- app(weights_m, fun = sum, na.rm = TRUE)
  wsum[wsum == 0] <- NA
  tmean_w <- sum(tmean_m * weights_m, na.rm = TRUE) / wsum
  if (!is.null(vpd_m)) {
    vpd_w <- sum(vpd_m * weights_m, na.rm = TRUE) / wsum
  } else {
    vpd_w <- app(tmean_m, fun = function(...) 0, na.rm = TRUE) # zero fallback
  }
} else {
  tmean_w <- app(tmean_m, fun = mean, na.rm = TRUE)
  vpd_w   <- if (!is.null(vpd_m)) app(vpd_m, fun = mean, na.rm = TRUE) else app(tmean_m, fun = function(...) 0, na.rm = TRUE)
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
  vpd_w   <- project(vpd_w,   precip_w)
}

# try to fit with calibration if present
calib_csv <- Sys.getenv("ISB_CAL", file.path(root, "data_raw", "calibration", "calibration.csv"))
use_calib <- file.exists(calib_csv)

# Crop-specific theoretical priors based on published fractionation factors
# Cotton: Sternberg et al. (1986), West et al. (2006) - cellulose enrichment ~27‰
# Onion/Garlic: Barbour et al. (2004) - bulb tissue enrichment ~18‰, lower cellulose
# Chillies: Cernusak et al. (2016) - fruit tissue enrichment ~15‰, high transpiration
theoretical_priors <- list(
  COTT = list(a0 = 27.0,  b_precip = 0.70, c_tmean = 0.25, d_vpd = -1.0, sigma = 2.5),
  ONIO = list(a0 = 18.0,  b_precip = 0.85, c_tmean = 0.15, d_vpd =  0.5, sigma = 3.0),
  GARL = list(a0 = 18.0,  b_precip = 0.85, c_tmean = 0.15, d_vpd =  0.5, sigma = 3.0),
  CHIL = list(a0 = 15.0,  b_precip = 0.90, c_tmean = 0.10, d_vpd =  0.8, sigma = 3.5),
  COFF = list(a0 = 25.0,  b_precip = 0.80, c_tmean = 0.25, d_vpd =  0.4, sigma = 2.0)
)

if (use_calib) {
  message("Fitting empirical model with calibration: ", calib_csv)
  df <- read.csv(calib_csv, stringsAsFactors = FALSE)
  stopifnot(all(c("sample_id", "d18O_cellulose", "lat", "lon") %in% names(df)))
  pts <- vect(df[, c("lon", "lat")], geom = c("lon", "lat"), crs = crs(precip_w))
  # extract predictors at sites
  p_site <- terra::extract(precip_w, pts)[, 2]
  t_site <- terra::extract(tmean_w,  pts)[, 2]
  v_site <- tryCatch(terra::extract(vpd_w,    pts)[, 2], error = function(e) rep(NA_real_, nrow(df)))
  dat <- tibble(y = df$d18O_cellulose, p = p_site, t = t_site, v = v_site) %>% na.omit()
  if (nrow(dat) >= 5) {
    # Include VPD term if it varies (not all zeros)
    has_v <- any(is.finite(dat$v)) && diff(range(dat$v, na.rm = TRUE)) > 1e-6
    fit <- if (has_v) lm(y ~ p + t + v, data = dat) else lm(y ~ p + t, data = dat)
    coefs <- coef(fit)
    a0 <- unname(coefs[1] %||% 0)
    b  <- unname(coefs[2] %||% 1)
    c  <- unname(coefs[3] %||% 0)
    d  <- if (has_v) unname(coefs[4] %||% 0) else 0
    s  <- sqrt(mean(residuals(fit)^2, na.rm = TRUE)) %||% 2
    coef_list <- list(a0 = a0, b_precip = b, c_tmean = c, d_vpd = d, sigma = s, used_calibration = TRUE,
                      n = nrow(dat), method = "empirical_fit")
  } else {
    message("Not enough calibration rows; using theoretical prior for ", crop_code)
    prior <- theoretical_priors[[crop_code]] %||% list(a0 = 0.0, b_precip = 1.0, c_tmean = 0.0, d_vpd = 0.0, sigma = 2.0)
    coef_list <- c(prior, list(used_calibration = FALSE, method = "theoretical_prior"))
  }
} else {
  message("No calibration file; using theoretical prior for ", crop_code)
  prior <- theoretical_priors[[crop_code]] %||% list(a0 = 0.0, b_precip = 1.0, c_tmean = 0.0, d_vpd = 0.0, sigma = 2.0)
  coef_list <- c(prior, list(used_calibration = FALSE, method = "theoretical_prior"))
}

# build cellulose μ raster
message("Building cellulose μ raster …")
cell_mu <- coef_list$a0 + coef_list$b_precip * precip_w + coef_list$c_tmean * tmean_w + coef_list$d_vpd * vpd_w

# constant sigma raster (placeholder)
cell_sigma <- cell_mu; values(cell_sigma) <- coef_list$sigma

# Write crop-specific outputs under model/, and keep generic copies under data_proc/ for backward-compat
crop_low <- tolower(crop_code)
mu_model_path   <- file.path(model_dir, paste0("cellulose_mu_", crop_low, ".tif"))
sig_model_path  <- file.path(model_dir, paste0("cellulose_sigma_", crop_low, ".tif"))
writeRaster(cell_mu,    mu_model_path,  overwrite = TRUE)
writeRaster(cell_sigma, sig_model_path, overwrite = TRUE)

# Maintain legacy filenames as the latest built
writeRaster(cell_mu,    file.path(proc_dir, "cellulose_mu.tif"),    overwrite = TRUE)
writeRaster(cell_sigma, file.path(proc_dir, "cellulose_sigma.tif"), overwrite = TRUE)
writeLines(toJSON(coef_list, auto_unbox = TRUE, pretty = TRUE), file.path(model_dir, "model_params.json"))

message("Model built. Params written to ", file.path(model_dir, "model_params.json"))
