# WorldMapping assignment core
suppressPackageStartupMessages({
  library(terra)
})

wm_log <- function(...) cat("[WorldMapping]", paste0(..., collapse = ""), "\n")

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

wm_read_raster <- function(path, name) {
  if (!file.exists(path)) stop("Missing ", name, ": ", path)
  rast(path)
}

# Build priors
# - weighted: proportional to production values (or mask if production missing)
# - unweighted: uniform over valid cells (mask > 0 and mu/sigma valid)
wm_build_prior <- function(mu, sigma, prod = NULL, mask = NULL, method = c("weighted", "unweighted")) {
  method <- match.arg(method)
  valid <- !is.na(mu) & !is.na(sigma)
  if (!is.null(mask)) valid <- valid & (mask > 0)
  if (method == "weighted" && !is.null(prod)) {
    p <- prod
    p[p < 0] <- 0
    p[!valid] <- NA
  } else {
    p <- valid
    p[valid] <- 1
    p[!valid] <- NA
  }
  s <- suppressWarnings(global(p, fun = "sum", na.rm = TRUE)[[1]])
  if (is.na(s) || s <= 0) stop("Prior normalization failed; empty support.")
  p / s
}

# Compute total log-likelihood surface for a vector of replicate measurements
wm_loglik <- function(mu, sigma, d_vec, sigma_meas = 0.3) {
  if (!is.numeric(d_vec) || length(d_vec) == 0) stop("d_vec must be non-empty numeric")
  # ll for one replicate d: -0.5*log(2*pi*var) - (d-mu)^2/(2*var)
  ll_total <- NULL
  for (d in d_vec) {
    ll_d <- app(c(mu, sigma), fun = function(x) {
      m <- x[1]; s <- x[2]
      if (is.na(m) || is.na(s)) return(NA_real_)
      v <- s * s + sigma_meas * sigma_meas
      -0.5 * log(2 * pi * v) - ((d - m)^2) / (2 * v)
    })
    if (is.null(ll_total)) ll_total <- ll_d else ll_total <- ll_total + ll_d
  }
  # Convert log-likelihood to likelihood for posterior calculation
  exp(ll_total)
}

# Posterior from prior and likelihood (not log-likelihood)
wm_posterior <- function(prior, likelihood) {
  z <- likelihood * prior
  denom <- suppressWarnings(global(z, fun = "sum", na.rm = TRUE)[[1]])
  if (is.na(denom) || denom <= 0) stop("Posterior normalization failed.")
  z / denom
}

# Summarize probabilities by country polygons
wm_country_table <- function(posterior, prior, shapes_dir, sample_name, top_n = 10) {
  shp_candidates <- c(
    file.path(shapes_dir %||% "", "worldXUAR.shp"),
    file.path(shapes_dir %||% "", "world.shp")
  )
  shp_path <- shp_candidates[which(file.exists(shp_candidates))][1]
  if (is.na(shp_path) || !file.exists(shp_path)) return(NULL)
  countries <- tryCatch(terra::vect(shp_path), error = function(e) NULL)
  if (is.null(countries)) return(NULL)
  # Align CRS
  try({ countries <- project(countries, crs(posterior)) }, silent = TRUE)
  # Sum posterior and prior by polygon
  s_post <- tryCatch(terra::extract(posterior, countries, fun = sum, na.rm = TRUE), error = function(e) NULL)
  s_prior <- tryCatch(terra::extract(prior,     countries, fun = sum, na.rm = TRUE), error = function(e) NULL)
  if (is.null(s_post)) return(NULL)
  df <- data.frame(id = seq_len(nrow(countries)), prob = s_post[[2]])
  if (!is.null(s_prior)) df$prior <- s_prior[[2]] else df$prior <- NA_real_
  # Normalize to percentages (posterior already sums to ~1)
  df$prob <- 100 * df$prob
  df$prior <- 100 * df$prior
  # Country name column heuristic
  cn <- names(countries)
  idx <- which(tolower(cn) %in% tolower(c("name","admin","name_en","country","adm0_en","adm0_zh","name_0","NAME","ADMIN","NAME_EN","ADM0_EN","NAME_0")))
  col <- if (length(idx) >= 1) cn[idx[1]] else NA_character_
  attrs <- tryCatch(terra::values(countries), error = function(e) NULL)
  cname <- if (!is.na(col) && !is.null(attrs) && !is.null(attrs[[col]])) as.character(attrs[[col]]) else as.character(df$id)
  out <- data.frame(
    sample = sample_name,
    country = as.character(cname),
    probability = round(df$prob, 1),
    prior_weight = round(df$prior, 2)
  )
  out <- out[order(-out$probability), , drop = FALSE]
  if (!is.null(top_n) && is.finite(top_n)) out <- utils::head(out, top_n)
  out
}

# Create highest-probability-density (HPD) mass mask (e.g., 0.10, 0.95)
wm_hpd_mask <- function(posterior, mass = 0.1) {
  stopifnot(mass > 0, mass < 1)
  v <- values(posterior, mat = FALSE)
  idx <- which(!is.na(v) & v > 0)
  probs <- v[idx]
  if (length(probs) == 0) {
    out <- posterior; values(out) <- 0L; return(out)
  }
  ord <- order(probs, decreasing = TRUE)
  cs <- cumsum(probs[ord])
  k <- which(cs >= mass)[1]
  if (is.na(k)) k <- length(cs)
  pick <- rep(0L, length(v))
  sel <- rep(0L, length(probs))
  if (k >= 1) sel[seq_len(k)] <- 1L
  pick[idx[ord]] <- sel
  out <- posterior
  values(out) <- pick
  out
}

# High-level: compute weighted/unweighted posteriors and HPD masks
wm_assign_sample <- function(isb_root, sample_name, d_vec, output_dir,
                             sigma_meas = 0.3, write_continents = FALSE,
                             shapes_dir = NULL) {
  stopifnot(dir.exists(isb_root))
  mu_path1 <- file.path(isb_root, "model", "cellulose_mu.tif")
  sg_path1 <- file.path(isb_root, "model", "cellulose_sigma.tif")
  mu_path2 <- file.path(isb_root, "data_proc", "cellulose_mu.tif")
  sg_path2 <- file.path(isb_root, "data_proc", "cellulose_sigma.tif")
  mu_path <- if (file.exists(mu_path1)) mu_path1 else mu_path2
  sg_path <- if (file.exists(sg_path1)) sg_path1 else sg_path2
  if (!file.exists(mu_path) || !file.exists(sg_path)) {
    stop("cellulose_mu/sigma not found under ", isb_root, "; build the model first (IsoscapeBuild → Build model)")
  }
  mu <- wm_read_raster(mu_path, basename(mu_path))
  sg <- wm_read_raster(sg_path, basename(sg_path))

  # Priors
  prod_path <- file.path(isb_root, "data_proc", "cott_production.tif")
  mask_path <- file.path(isb_root, "data_proc", "cott_mask.tif")
  prod <- if (file.exists(prod_path)) rast(prod_path) else NULL
  msk  <- if (file.exists(mask_path)) rast(mask_path) else NULL

  # Align priors to mu grid if needed
  if (!is.null(prod) && !compareGeom(prod, mu, stopOnError = FALSE)) prod <- resample(prod, mu, method = "bilinear")
  if (!is.null(msk)  && !compareGeom(msk,  mu, stopOnError = FALSE)) msk  <- resample(msk,  mu, method = "near")

  wm_log("Computing likelihood for ", sample_name, " with d18O: ", paste(d_vec, collapse=", "))
  # Log-likelihood from replicates
  ll <- wm_loglik(mu, sg, d_vec, sigma_meas = sigma_meas)
  ll_stats <- suppressWarnings(global(ll, fun = c("min","max","mean"), na.rm = TRUE))
  wm_log("Log-likelihood range: ", paste(round(as.numeric(ll_stats), 2), collapse=" to "))

  pri_w <- wm_build_prior(mu, sg, prod = prod, mask = msk, method = "weighted")
  pri_u <- wm_build_prior(mu, sg, prod = prod, mask = msk, method = "unweighted")
  pri_w_stats <- suppressWarnings(global(pri_w, fun = c("min","max","sum"), na.rm = TRUE))
  pri_u_stats <- suppressWarnings(global(pri_u, fun = c("min","max","sum"), na.rm = TRUE))
  wm_log("Prior weighted sum: ", round(as.numeric(pri_w_stats[3]), 6), " range: ", paste(round(as.numeric(pri_w_stats[1:2]), 6), collapse=" to "))
  wm_log("Prior unweighted sum: ", round(as.numeric(pri_u_stats[3]), 6), " range: ", paste(round(as.numeric(pri_u_stats[1:2]), 6), collapse=" to "))
  post_w <- wm_posterior(pri_w, ll)
  post_u <- wm_posterior(pri_u, ll)
  post_w_stats <- suppressWarnings(global(post_w, fun = c("min","max","sum"), na.rm = TRUE))
  post_u_stats <- suppressWarnings(global(post_u, fun = c("min","max","sum"), na.rm = TRUE))
  wm_log("Posterior weighted sum: ", round(as.numeric(post_w_stats[3]), 6), " max: ", round(as.numeric(post_w_stats[2]), 8))
  wm_log("Posterior unweighted sum: ", round(as.numeric(post_u_stats[3]), 6), " max: ", round(as.numeric(post_u_stats[2]), 8))

  # HPD masks
  w10 <- wm_hpd_mask(post_w, mass = 0.10)
  w95 <- wm_hpd_mask(post_w, mass = 0.95)
  u10 <- wm_hpd_mask(post_u, mass = 0.10)
  u95 <- wm_hpd_mask(post_u, mass = 0.95)
  wm_log("HPD mask pixel counts: w10=", global(w10, fun="sum", na.rm=TRUE)[[1]], " w95=", global(w95, fun="sum", na.rm=TRUE)[[1]])

  # Output structure mirroring FTMapping
  base <- file.path(output_dir, sample_name)
  dir.create(base, recursive = TRUE, showWarnings = FALSE)
  dir_w <- file.path(base, paste0(sample_name, ", Weighted"))
  dir_u <- file.path(base, paste0(sample_name, ", Unweighted"))
  dir_t <- file.path(base, paste0(sample_name, ", Tables"))
  dir.create(dir_w, showWarnings = FALSE)
  dir.create(dir_u, showWarnings = FALSE)
  dir.create(dir_t, showWarnings = FALSE)

  # Write probability surfaces (scaled to 0-255 for visibility)
  post_w_scaled <- (post_w / max(values(post_w), na.rm = TRUE)) * 255
  post_u_scaled <- (post_u / max(values(post_u), na.rm = TRUE)) * 255
  terra::writeRaster(post_w_scaled, file.path(dir_w, paste0(sample_name, " posterior.tiff")), overwrite = TRUE, datatype = "INT1U", NAflag = 0)
  terra::writeRaster(post_u_scaled, file.path(dir_u, paste0(sample_name, " posterior.tiff")), overwrite = TRUE, datatype = "INT1U", NAflag = 0)
  
  # Write masks as 8-bit Byte (0/255) for better preview visibility
  w10b <- w10 * 255
  w95b <- w95 * 255
  u10b <- u10 * 255
  u95b <- u95 * 255
  terra::writeRaster(w10b, file.path(dir_w, paste0(sample_name, " world10.tiff")), overwrite = TRUE, datatype = "INT1U", NAflag = 0)
  terra::writeRaster(w95b, file.path(dir_w, paste0(sample_name, " world95.tiff")), overwrite = TRUE, datatype = "INT1U", NAflag = 0)
  terra::writeRaster(u10b, file.path(dir_u, paste0(sample_name, " world10.tiff")), overwrite = TRUE, datatype = "INT1U", NAflag = 0)
  terra::writeRaster(u95b, file.path(dir_u, paste0(sample_name, " world95.tiff")), overwrite = TRUE, datatype = "INT1U", NAflag = 0)

  # Tables: country probabilities (top 10) + replicate summary as first row header
  tbl_w <- wm_country_table(post_w, pri_w, shapes_dir, sample_name, top_n = 10)
  tbl_u <- wm_country_table(post_u, pri_u, shapes_dir, sample_name, top_n = 10)
  if (!is.null(tbl_w)) utils::write.csv(tbl_w, file.path(dir_t, paste0(sample_name, "Weighted.csv")), row.names = FALSE)
  if (!is.null(tbl_u)) utils::write.csv(tbl_u, file.path(dir_t, paste0(sample_name, "Unweighted.csv")), row.names = FALSE)
  # Also write a small replicate summary table
  dfrep <- data.frame(sample = sample_name, n = length(d_vec), mean_d18O = mean(d_vec), sd_d18O = ifelse(length(d_vec) >= 2, stats::sd(d_vec), NA_real_), sigma_meas = sigma_meas)
  utils::write.csv(dfrep, file.path(dir_t, paste0(sample_name, "_replicates.csv")), row.names = FALSE)

  invisible(list(
    weighted = list(world10 = file.path(dir_w, paste0(sample_name, " world10.tiff")),
                    world95 = file.path(dir_w, paste0(sample_name, " world95.tiff"))),
    unweighted = list(world10 = file.path(dir_u, paste0(sample_name, " world10.tiff")),
                      world95 = file.path(dir_u, paste0(sample_name, " world95.tiff")))
  ))
}


