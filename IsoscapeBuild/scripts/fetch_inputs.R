suppressPackageStartupMessages({
  library(terra)
  library(utils)
  library(curl)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# load utils
caller_file <- tryCatch({
  if (exists(".__file__", inherits = TRUE)) get(".__file__", inherits = TRUE) else NULL
}, error = function(e) NULL)
u_path <- file.path(dirname(caller_file %||% sys.frame(1)$ofile %||% "scripts/fetch_inputs.R"), "utils.R")
source(u_path)

# paths
this_file <- caller_file %||% sys.frame(1)$ofile %||% "scripts/fetch_inputs.R"
script_dir <- normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE)
# script_dir is IsoscapeBuild/scripts → root is its parent
root <- normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE)
status_dir <- ensure_dir(file.path(root, "status"))
status_path <- file.path(status_dir, "progress.json")
log_path <- file.path(status_dir, "fetch.log")
summary_path <- file.path(status_dir, "sources.json")
if (file.exists(log_path)) try(file.remove(log_path), silent = TRUE)
log_line <- function(...) {
  msg <- paste0(format(Sys.time(), "%H:%M:%S"), " ", paste0(..., collapse=""))
  # Emit to stdout for plumber logs
  try(cat(msg, "\n"), silent = TRUE)
  # Append to log file without keeping a connection open
  try(cat(msg, "\n", file = log_path, append = TRUE), silent = TRUE)
}
write_status <- function(lst) { try(writeLines(jsonlite::toJSON(lst, auto_unbox = TRUE, pretty = FALSE), status_path), silent = TRUE) }
update_summary <- function(source_id, info) {
  sum_lst <- list()
  if (file.exists(summary_path)) {
    sum_lst <- tryCatch(jsonlite::fromJSON(summary_path), error = function(e) list())
  }
  if (is.null(sum_lst$sources)) sum_lst$sources <- list()
  sum_lst$sources[[source_id]] <- modifyList(sum_lst$sources[[source_id]] %||% list(), info)
  try(writeLines(jsonlite::toJSON(sum_lst, auto_unbox = TRUE, pretty = TRUE), summary_path), silent = TRUE)
}
# increase network timeout for large downloads
old_timeout <- getOption("timeout")
on.exit(options(timeout = old_timeout), add = TRUE)
# allow override via env; default 1800s (30 min)
dl_timeout <- as.numeric(Sys.getenv("ISB_TIMEOUT", "1800"))
options(timeout = max(dl_timeout, old_timeout))

download_with_progress <- function(url, dest, timeout = dl_timeout) {
  if (file.exists(dest) && file.info(dest)$size > 0) return(invisible(TRUE))
  h <- new_handle()
  handle_setopt(h, timeout = timeout, followlocation = TRUE)
  last_pct <- -1
  cb <- function(down_total, down_now, up_total, up_now) {
    dt <- if (length(down_total) >= 1) down_total[[1]] else NA_real_
    dn <- if (length(down_now)  >= 1) down_now[[1]]  else NA_real_
    if (is.finite(dt) && dt > 0 && is.finite(dn)) {
      pct <- floor(100 * dn / dt)
      if (!identical(pct, last_pct)) {
        last_pct <<- pct
        cat(sprintf("[dl] %s %d%%\n", url, pct))
        flush.console()
      }
    }
    TRUE
  }
  handle_setopt(h, progressfunction = cb, noprogress = FALSE)
  con <- file(dest, open = "wb")
  on.exit(try(close(con), silent = TRUE), add = TRUE)
  ok <- FALSE
  tryCatch({
    curl_fetch_multi(url, done = function(res) {
      if (res$status_code >= 400) stop(paste0("HTTP ", res$status_code, " for ", url))
      writeBin(res$content, con)
    }, fail = function(err) {
      stop(as.character(err))
    }, handle = h)
    multi_run()
    ok <- TRUE
  }, error = function(e) {
    message("[dl] curl failed for ", url, ": ", as.character(e), "; falling back to download.file")
  })
  if (!ok) {
    utils::download.file(url, dest, mode = "wb", quiet = FALSE)
    ok <- file.exists(dest) && file.info(dest)$size > 0
    if (!ok) stop("Failed to download ", url)
  }
  invisible(TRUE)
}

download_with_fallback <- function(urls, dest, timeout = dl_timeout) {
  # remove invalid partials first
  if (file.exists(dest) && !is_valid_zip(dest)) try(unlink(dest), silent = TRUE)
  for (u in urls) {
    message("[dl] trying ", u)
    ok <- TRUE
    try(download_with_progress(u, dest, timeout = timeout), silent = TRUE)
    if (!is_valid_zip(dest)) ok <- FALSE
    if (ok) return(invisible(TRUE))
  }
  stop("All mirrors failed for ", dest)
}
# Crop selection (SPAM/MIRCA); default cotton. Accept env var ISB_CROP (SPAM code like COTT, MAIZ, RICE)
crop_code <- Sys.getenv("ISB_CROP", "COTT")
message("[IsoscapeBuild] Using crop code: ", crop_code)
start_time <- Sys.time()
state <- list(running = TRUE, started_at = as.character(start_time), current = list(source = NA_character_, step = NA_character_), sources = list())
write_status(state)
sources_env <- tolower(Sys.getenv("ISB_SOURCES", ""))
sources <- if (nzchar(sources_env)) strsplit(sources_env, ",")[[1]] else c("oipc","worldclim","spam","mirca")
message("[IsoscapeBuild] Sources: ", paste(sources, collapse = ","))
raw_dir <- ensure_dir(file.path(root, "data_raw"))
proc_dir <- ensure_dir(file.path(root, "data_proc"))
raw_oipc <- ensure_dir(file.path(raw_dir, "oipc"))
raw_wc   <- ensure_dir(file.path(raw_dir, "worldclim"))
raw_spam <- ensure_dir(file.path(raw_dir, "spam2020"))
raw_mirca<- ensure_dir(file.path(raw_dir, "mirca"))

read_any_raster <- function(path) tryCatch({ rast(path) }, error = function(e) NULL)
find_first_grid <- function(d) {
  cands <- list.files(d, recursive = TRUE, full.names = TRUE)
  for (p in cands) {
    r <- suppressWarnings(read_any_raster(p))
    if (!is.null(r)) return(r)
  }
  stop("Could not find a readable raster in ", d)
}

is_valid_zip <- function(path) {
  if (!file.exists(path)) return(FALSE)
  if (isTRUE(unname(file.info(path)$size)) && file.info(path)$size < 1024) return(FALSE)
  ok <- FALSE
  try({
    lst <- utils::unzip(path, list = TRUE)
    ok <- is.data.frame(lst) && nrow(lst) > 0
  }, silent = TRUE)
  ok
}

safe_unzip <- function(zip_path, exdir) {
  if (!is_valid_zip(zip_path)) stop("Zip invalid: ", zip_path)
  dir.create(exdir, recursive = TRUE, showWarnings = FALSE)
  utils::unzip(zip_path, exdir = exdir, overwrite = TRUE)
}

# 1) OIPC precipitation d18O (research-only)
if ("oipc" %in% sources) {
  message("Downloading OIPC precipitation δ18O (research-only)…"); log_line("[oipc] start")
  state$current <- list(source = "oipc", step = "download"); write_status(state)
  oipc_zip <- file.path(raw_oipc, "GlobalPrecip.zip")
  oipc_gs  <- file.path(raw_oipc, "GlobalPrecipGS.zip")
  if (!file.exists(oipc_zip)) download_with_progress("https://wateriso.utah.edu/waterisotopes/media/ArcGrids/GlobalPrecip.zip", oipc_zip, timeout = dl_timeout)
  if (!file.exists(oipc_gs))  download_with_progress("https://wateriso.utah.edu/waterisotopes/media/ArcGrids/GlobalPrecipGS.zip", oipc_gs, timeout = dl_timeout)

  unz_dir1 <- ensure_dir(file.path(raw_oipc, "GlobalPrecip"))
  unz_dir2 <- ensure_dir(file.path(raw_oipc, "GlobalPrecipGS"))
  state$current <- list(source = "oipc", step = "unzip"); write_status(state)
  if (length(list.files(unz_dir1)) == 0) unzip(oipc_zip, exdir = unz_dir1)
  if (length(list.files(unz_dir2)) == 0) unzip(oipc_gs,  exdir = unz_dir2)

  state$current <- list(source = "oipc", step = "align"); write_status(state)
  oipc_r <- align_to_target(find_first_grid(unz_dir1))
  oipc_gs_r <- align_to_target(find_first_grid(unz_dir2))
  state$current <- list(source = "oipc", step = "write"); write_status(state)
  writeRaster(oipc_r, file.path(proc_dir, "precip_d18O_monthly.tif"), overwrite = TRUE)
  writeRaster(oipc_gs_r, file.path(proc_dir, "precip_d18O_growing_season.tif"), overwrite = TRUE)
  ft <- as.character(Sys.time())
  state$sources$oipc <- list(success = TRUE, finished_at = ft)
  update_summary("oipc", list(last_fetched = ft, version = "OIPC GlobalPrecip/GlobalPrecipGS"))
  log_line("[oipc] done")
} else {
  message("Skipping OIPC step")
}

# 2) WorldClim 2.1 monthly temperature and vapour pressure (10 arc‑min)
if ("worldclim" %in% sources) {
  message("Downloading WorldClim 2.1 monthly temperature & vapour pressure…"); log_line("[worldclim] start")
  state$current <- list(source = "worldclim", step = "download"); write_status(state)
  wc_official <- "https://download.worldclim.org/worldclim/v2.1/base/"
  # Additional known mirrors/paths
  wc_candidates <- c(
    "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/",  # corrected UC Davis path
    "https://biogeo.ucdavis.edu/climate/worldclim/2_1/base/",   # alternate UC Davis host
    wc_official,
    "https://biogeo.ucdavis.edu/data/worldclim/v2.1/base/",
    "https://geodata.ucdavis.edu/worldclim/v2.1/base/"
  )
  wc_tavg <- file.path(raw_wc, "wc2.1_10m_tavg.zip")
  wc_vap  <- file.path(raw_wc, "wc2.1_10m_vapr.zip")
  urls_tavg <- paste0(wc_candidates, "wc2.1_10m_tavg.zip")
  urls_vapr <- paste0(wc_candidates, "wc2.1_10m_vapr.zip")
  if (!is_valid_zip(wc_tavg)) download_with_fallback(urls_tavg, wc_tavg, timeout = dl_timeout)
  if (!is_valid_zip(wc_vap))  download_with_fallback(urls_vapr, wc_vap,  timeout = dl_timeout)

  unz_tavg <- ensure_dir(file.path(raw_wc, "tavg"))
  unz_vap  <- ensure_dir(file.path(raw_wc, "vapr"))
  state$current <- list(source = "worldclim", step = "unzip"); write_status(state)
  if (length(list.files(unz_tavg)) == 0 && file.exists(wc_tavg)) safe_unzip(wc_tavg, exdir = unz_tavg)
  if (length(list.files(unz_vap)) == 0  && file.exists(wc_vap))  safe_unzip(wc_vap,  exdir = unz_vap)

  stack_monthly <- function(dir, pattern) {
    files <- list.files(dir, pattern = pattern, full.names = TRUE)
    r <- rast(files)
    if (nlyr(r) %% 12 == 0 && nlyr(r) != 12) {
      r <- tapp(r, rep(1:12, length.out = nlyr(r)), fun = mean)
    }
    r
  }

  state$current <- list(source = "worldclim", step = "align"); write_status(state)
  tavg_r <- align_to_target(stack_monthly(unz_tavg, "tavg_.*.tif$|tavg.*.tif$"))
  vap_r  <- align_to_target(stack_monthly(unz_vap,  "vapr_.*.tif$|vapr.*.tif$"))
  state$current <- list(source = "worldclim", step = "compute_vpd"); write_status(state)
  # Compute saturation vapour pressure (kPa) via Tetens formula using monthly mean temperature (°C)
  # es(T) = 0.6108 * exp(17.27*T / (T + 237.3))  (kPa)
  # WorldClim vapr is actual vapour pressure (kPa). VPD = es - vapr, clamped to [0, inf).
  es <- 0.6108 * exp(17.27 * tavg_r / (tavg_r + 237.3))
  vpd <- es - vap_r
  vpd[vpd < 0] <- 0
  # Relative humidity approximation (0-1) if needed: rh = vapr / es, clamped
  rh <- vap_r / es
  rh[rh < 0] <- 0; rh[rh > 1] <- 1
  state$current <- list(source = "worldclim", step = "write"); write_status(state)
  writeRaster(tavg_r, file.path(proc_dir, "tmean_monthly.tif"), overwrite = TRUE)
  writeRaster(vap_r,  file.path(proc_dir, "vapour_pressure_monthly.tif"), overwrite = TRUE)
  writeRaster(vpd,    file.path(proc_dir, "vpd_monthly.tif"), overwrite = TRUE)
  # Backward-compatible alias used elsewhere in the codebase
  writeRaster(vpd,    file.path(proc_dir, "rh_or_vpd_monthly.tif"), overwrite = TRUE)
  ft <- as.character(Sys.time())
  state$sources$worldclim <- list(success = TRUE, finished_at = ft)
  update_summary("worldclim", list(last_fetched = ft, version = "WorldClim 2.1 (10 arc-min)"))
  log_line("[worldclim] done")
} else {
  message("Skipping WorldClim step")
}

# 3) SPAM 2020 cotton production (use existing local if present)
if ("spam" %in% sources) {
  message("Processing SPAM 2020 production for crop ", crop_code, " …"); log_line("[spam] start")
  state$current <- list(source = "spam", step = "process"); write_status(state)
  spam_tif <- file.path(dirname(root), "FTMapping", "shapefilesEtc", paste0("spam2020_v1r0_global_P_", crop_code, "_A.tif"))
  if (!file.exists(spam_tif)) {
    message("SPAM 2020 GeoTIFF not found locally for crop ", crop_code, ". Place it at FTMapping/shapefilesEtc/", basename(spam_tif), " and re-run.")
  } else {
    prod <- align_to_target(rast(spam_tif))
    writeRaster(prod, file.path(proc_dir, paste0(tolower(crop_code), "_production.tif")), overwrite = TRUE)
    mask <- classify(prod, rcl = matrix(c(-Inf, 0, 0, 0, Inf, 1), ncol = 3, byrow = TRUE))
    writeRaster(mask, file.path(proc_dir, paste0(tolower(crop_code), "_mask.tif")), overwrite = TRUE)
    ft <- as.character(Sys.time())
    state$sources$spam <- list(success = TRUE, finished_at = ft)
    update_summary("spam", list(last_fetched = ft, version = "SPAM 2020 v1r0"))
    log_line("[spam] done")
  }
} else {
  message("Skipping SPAM step")
}

if ("mirca" %in% sources) {
  # 4) MIRCA calendars: prefer provided monthly weights; else uniform placeholder
  message("MIRCA calendars: generating monthly weights …"); log_line("[mirca] start")
  state$current <- list(source = "mirca", step = "detect"); write_status(state)
  mask_path <- file.path(proc_dir, paste0(tolower(crop_code), "_mask.tif"))
  out_weights <- file.path(proc_dir, paste0(tolower(crop_code), "_calendar_monthly_weights.tif"))
  cand_weights <- file.path(raw_mirca, paste0(tolower(crop_code), "_calendar_monthly_weights.tif"))
  if (file.exists(mask_path)) {
    mask <- rast(mask_path)
    weights <- NULL
    if (file.exists(cand_weights)) {
      # Use provided multi-layer weights, aligned to model grid
      state$current <- list(source = "mirca", step = "align"); write_status(state)
      weights_raw <- suppressWarnings(try(rast(cand_weights), silent = TRUE))
      if (!inherits(weights_raw, "SpatRaster")) weights_raw <- NULL
      if (!is.null(weights_raw) && nlyr(weights_raw) == 12) {
        weights <- align_to_target(weights_raw)
        # Normalize to sum=1 where mask>0
        s <- app(weights, fun = sum, na.rm = TRUE)
        s[s == 0] <- NA
        weights <- weights / s
        # Zero outside mask
        weights <- mask(weights, mask > 0, maskvalues = 0, updatevalue = 0)
        version_note <- "MIRCA calendars (provided)"
      }
    }
    if (is.null(weights)) {
      # Uniform fallback
      state$current <- list(source = "mirca", step = "fallback_uniform"); write_status(state)
      w <- rep(list(mask), 12)
      weights <- rast(w)
      mvals <- values(mask)
      mvals <- ifelse(mvals > 0, 1/12, 0)
      # replicate across 12 layers
      wmat <- do.call(cbind, replicate(12, mvals, simplify = FALSE))
      values(weights) <- wmat
      version_note <- "MIRCA calendars (uniform placeholder)"
    }
    state$current <- list(source = "mirca", step = "write"); write_status(state)
    writeRaster(weights, out_weights, overwrite = TRUE)
    ft <- as.character(Sys.time())
    state$sources$mirca <- list(success = TRUE, finished_at = ft)
    update_summary("mirca", list(last_fetched = ft, version = version_note))
    log_line("[mirca] done")
  }
} else {
  message("Skipping MIRCA step")
}

message("Done. Processed rasters: ", proc_dir)
state$running <- FALSE
state$finished_at <- as.character(Sys.time())
write_status(state)
