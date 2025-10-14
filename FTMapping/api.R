# api.R - Local plumber API for mapping
library(plumber)
library(jsonlite)

# helper to ensure an R package is available; tries auto-install if missing
ensure_pkg <- function(pkg) {
  ok <- suppressWarnings(requireNamespace(pkg, quietly = TRUE))
  if (ok) return(TRUE)
  tryCatch({
    install.packages(pkg, repos = 'https://cloud.r-project.org', quiet = TRUE)
  }, error = function(e) {})
  suppressWarnings(requireNamespace(pkg, quietly = TRUE))
}

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# Resolve base directory for FTMapping assets/code deterministically from CWD
cwd <- normalizePath(getwd(), winslash = "/", mustWork = TRUE)
REPO_ROOT <- if (basename(cwd) == "FTMapping") dirname(cwd) else cwd
if (basename(cwd) == "FTMapping") {
  BASE_DIR <- cwd
} else {
  BASE_DIR <- normalizePath(file.path(cwd, "FTMapping"), winslash = "/", mustWork = TRUE)
}
# Always resolve IsoscapeBuild base (may or may not exist). Prefer sibling of FTMapping
ISO_DIR <- normalizePath(file.path(REPO_ROOT, "IsoscapeBuild"), winslash = "/", mustWork = FALSE)
cat("[api] cwd:", cwd, " REPO_ROOT:", REPO_ROOT, " BASE_DIR:", BASE_DIR, " ISO_DIR:", ISO_DIR, "\n")

source(file.path(BASE_DIR, "2024ForLoop.R"), local = TRUE)

to_abs <- function(p, fallback) {
  if (is.null(p) || !nzchar(p)) return(fallback)
  if (grepl("^/", p)) return(p)
  normalizePath(file.path(BASE_DIR, p), winslash = "/", mustWork = FALSE)
}

iso_to_abs <- function(p, fallback) {
  base <- if (!is.null(ISO_DIR) && dir.exists(ISO_DIR)) ISO_DIR else REPO_ROOT
  if (is.null(p) || !nzchar(p)) {
    fb <- fallback
    # If base already points at IsoscapeBuild, strip any leading "IsoscapeBuild/" from fallback
    if (!is.null(ISO_DIR) && dir.exists(ISO_DIR)) {
      fb <- sub("^IsoscapeBuild/?", "", fb)
    }
    return(normalizePath(file.path(base, fb), winslash = "/", mustWork = FALSE))
  }
  # For provided paths, if base is IsoscapeBuild, strip leading prefix to avoid duplication
  if (!is.null(ISO_DIR) && dir.exists(ISO_DIR)) {
    p <- sub("^IsoscapeBuild/?", "", p)
  }
  if (grepl("^/", p)) return(p)
  normalizePath(file.path(base, p), winslash = "/", mustWork = FALSE)
}

# CORS filter
#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  if (req$REQUEST_METHOD == "OPTIONS") return(list())
  forward()
}

# Optional bearer token auth (set R_API_TOKEN to enable)
#* @filter auth
function(req, res) {
  token <- Sys.getenv("R_API_TOKEN", "")
  if (nzchar(token)) {
    hdr <- req$HTTP_AUTHORIZATION %||% ""
    ok <- identical(hdr, paste("Bearer", token))
    if (!ok) { res$status <- 401; return(list(error = "unauthorized")) }
  }
  forward()
}

#* Health
#* @get /health
function() list(ok = TRUE, time = as.character(Sys.time()))

#* Upload file to input directory (supports multipart and octet-stream)
#* @post /upload
#* @parser multi
#* @serializer unboxedJSON  
function(req, res, filename = "uploaded.xlsx") {
  input_dir <- file.path(BASE_DIR, "input")
  dir.create(input_dir, recursive = TRUE, showWarnings = FALSE)

  # Clear existing xlsx files
  old_x <- list.files(input_dir, pattern = "\\.xlsx$", full.names = TRUE)
  if (length(old_x)) file.remove(old_x)

  # If Content-Type is multipart/*, prefer req$FILES
  ct <- req$CONTENT_TYPE %||% ""
  files <- req$FILES
  if (grepl("^multipart/", tolower(ct)) && !is.null(files) && length(files)) {
    saved <- character(0)
    for (nm in names(files)) {
      f <- files[[nm]]
      cat("[upload] multipart file:", nm, "filename:", (f$filename %||% ""), "size:", (f$size %||% NA), "datapath:", (f$datapath %||% ""), "\n")
      dest_name <- if (!is.null(filename) && nzchar(filename)) filename else (f$filename %||% "uploaded.xlsx")
      dest <- file.path(input_dir, dest_name)
      if (!is.null(f$datapath) && nzchar(f$datapath)) {
        ok <- tryCatch(file.copy(f$datapath, dest, overwrite = TRUE), error = function(e) FALSE)
        cat("[upload] copied", f$datapath, "->", dest, "ok=", ok, "\n")
        if (isTRUE(ok)) saved <- c(saved, basename(dest))
      }
    }
    if (length(saved)) {
      sizes <- unname(file.info(file.path(input_dir, saved))$size)
      return(list(ok = TRUE, filenames = saved, sizes = as.numeric(sizes), via = "multipart"))
    }
    cat("[upload] multipart present but nothing saved; falling back to raw body\n")
  }

  # Fallback: raw octet-stream
  body <- req$postBody
  cat("[upload] raw body class:", class(body), "length:", length(body), "\n")
  if (is.null(body) || length(body) == 0) {
    res$status <- 400
    return(list(error = "No file data received"))
  }
  if (is.character(body)) {
    # Convert character vector to raw; plumber sometimes delivers as single string
    body_raw <- charToRaw(paste(body, collapse = ""))
  } else if (is.raw(body)) {
    body_raw <- body
  } else {
    body_raw <- as.raw(body)
  }
  dest <- file.path(input_dir, if (!is.null(filename) && nzchar(filename)) filename else "uploaded.xlsx")
  con <- file(dest, "wb")
  on.exit(try(close(con), silent = TRUE), add = TRUE)
  writeBin(body_raw, con)
  actual_size <- suppressWarnings(as.numeric(file.info(dest)$size))
  list(ok = TRUE, filename = basename(dest), size = actual_size, body_class = class(body), via = "raw")
}

#* Run mapping. If files are uploaded, they replace local input/; else uses existing files.
#* @post /run
function(req, res, clear_output = FALSE, clear_input = FALSE, input_dir = "", output_dir = "", shapes_dir = "", table_json = "") {
  input_dir <- to_abs(input_dir, file.path(BASE_DIR, "input"))
  output_dir <- to_abs(output_dir, file.path(BASE_DIR, "output"))
  shapes_dir <- to_abs(shapes_dir, file.path(BASE_DIR, "shapefilesEtc"))

  dir.create(input_dir, recursive = TRUE, showWarnings = FALSE)
  if (isTRUE(as.logical(clear_output)) && dir.exists(output_dir)) unlink(output_dir, recursive = TRUE)
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

  # Optionally clear existing input excel files to avoid stale runs
  if (isTRUE(as.logical(clear_input))) {
    old_x <- list.files(input_dir, pattern = "\\.xlsx$", full.names = TRUE)
    if (length(old_x)) file.remove(old_x)
  }

  # Save uploaded files (if any) into input_dir
  files <- req$FILES
  cat("[run] input_dir:", input_dir, "\n")
  cat("[run] output_dir:", output_dir, "\n")
  cat("[run] shapes_dir:", shapes_dir, "\n")
  cat("[run] req$REQUEST_METHOD:", req$REQUEST_METHOD, "\n")
  cat("[run] req$CONTENT_TYPE:", req$CONTENT_TYPE %||% "NULL", "\n")
  cat("[run] req$postBody length:", length(req$postBody %||% ""), "\n")
  if (!is.null(files)) {
    cat("[run] uploaded file entries:", paste(names(files), collapse=","), "\n")
    for (fname in names(files)) {
      f <- files[[fname]]
      cat("[run] file", fname, "datapath:", f$datapath %||% "NULL", "filename:", f$filename %||% "NULL", "size:", f$size %||% "NULL", "\n")
    }
  } else {
    cat("[run] no uploaded files in request\n")
  }
  if (!is.null(files) && length(files)) {
    old <- list.files(input_dir, full.names = TRUE)
    if (length(old)) file.remove(old)
    for (f in files) {
      if (!is.null(f$datapath) && nzchar(f$datapath)) {
        dest <- file.path(input_dir, f$filename)
        ok <- file.copy(f$datapath, dest, overwrite = TRUE)
        cat("[run] copied:", f$datapath, "->", dest, "ok=", ok, "\n")
      }
    }
  }

  # Optional inline table JSON → create an .xlsx file
  if (nzchar(table_json)) {
    cat("[run] table_json provided, writing inline_samples.xlsx\n")
    # Remove existing XLSX first to avoid ambiguity
    x_old <- list.files(input_dir, pattern = "\\.xlsx$", full.names = TRUE)
    if (length(x_old)) file.remove(x_old)
    # Parse JSON array of objects: [{sample/samples, d18O}]
    dat <- NULL
    try({ dat <- jsonlite::fromJSON(table_json) }, silent = TRUE)
    if (is.null(dat)) { res$status <- 400; return(list(error = "Invalid table_json JSON")) }
    # Normalize column names
    if (!is.null(dat$sample)) dat$samples <- dat$sample
    if (!is.null(dat$Samples)) dat$samples <- dat$Samples
    if (!is.null(dat$d18o) && is.null(dat$d18O)) dat$d18O <- dat$d18o
    df <- data.frame(
      samples = as.character(dat$samples %||% dat$Samples %||% dat$sample),
      d18O = suppressWarnings(as.numeric(dat$d18O %||% dat$d18o)),
      stringsAsFactors = FALSE
    )
    if (nrow(df) == 0 || any(is.na(df$samples)) || any(is.na(df$d18O))) {
      res$status <- 400; return(list(error = "table_json must include 'samples' and numeric 'd18O'"))
    }
    if (!ensure_pkg('writexl')) { res$status <- 500; return(list(error = "Failed to install R package 'writexl'")) }
    out_xlsx <- file.path(input_dir, "inline_samples.xlsx")
    writexl::write_xlsx(df, out_xlsx)
  }

  # Validate inputs present
  xls <- list.files(input_dir, pattern = "\\.xlsx$", full.names = TRUE)
  cat("[run] files in input_dir after upload:", paste(basename(xls), collapse=","), "\n")
  if (length(xls) == 0) {
    res$status <- 400
    return(list(error = sprintf("No .xlsx files found in '%s'", input_dir)))
  }

  # Run
  run_mapping_code(input_dir = input_dir, output_dir = output_dir, shapes_dir = shapes_dir)

  list(
    ok = TRUE,
    inputs = basename(xls),
    outputs = list.files(output_dir, recursive = TRUE)
  )
}

#* List output files
#* @get /outputs
function(res, output_dir = "") {
  output_dir <- to_abs(output_dir, file.path(BASE_DIR, "output"))
  if (!dir.exists(output_dir)) {
    return(list(ok = TRUE, output_dir = output_dir, files = list()))
  }
  paths <- list.files(output_dir, recursive = TRUE, full.names = TRUE)
  if (length(paths) == 0) {
    return(list(ok = TRUE, output_dir = output_dir, files = list()))
  }
  info <- file.info(paths)
  rel <- sub(paste0("^", gsub("[\\^$.|?*+(){}]","\\\\$0", output_dir), "/?"), "", paths)
  files <- lapply(seq_along(paths), function(i) list(
    path = rel[[i]],
    isdir = isTRUE(info$isdir[[i]]),
    size = if (isTRUE(info$isdir[[i]])) NA_real_ else unname(info$size[[i]]),
    mtime = as.character(info$mtime[[i]])
  ))
  list(ok = TRUE, output_dir = output_dir, files = files)
}

#* Clear output directory
#* @delete /outputs
function(res, output_dir = "") {
  output_dir <- to_abs(output_dir, file.path(BASE_DIR, "output"))
  if (dir.exists(output_dir)) unlink(output_dir, recursive = TRUE)
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  list(ok = TRUE, cleared = TRUE, output_dir = output_dir)
}

# -------- IsoscapeBuild endpoints --------

#* Describe available data sources and local metadata
#* @get /isoscape/metadata
function(res, crop = "COTT") {
  base <- if (!dir.exists(ISO_DIR)) REPO_ROOT else ISO_DIR
  raw_dir  <- iso_to_abs("IsoscapeBuild/data_raw",  "IsoscapeBuild/data_raw")
  proc_dir <- iso_to_abs("IsoscapeBuild/data_proc", "IsoscapeBuild/data_proc")
  status_dir <- iso_to_abs("IsoscapeBuild/status", "IsoscapeBuild/status")
  summary_path <- iso_to_abs("IsoscapeBuild/status/sources.json", "IsoscapeBuild/status/sources.json")

  # helpers
  safe_dir_info <- function(path) {
    present <- dir.exists(path)
    if (!present) return(list(present = FALSE, file_count = 0, size_bytes = 0, last_updated = NA_character_))
    files <- list.files(path, recursive = TRUE, full.names = TRUE)
    files <- files[file.exists(files)]
    if (length(files) == 0) return(list(present = TRUE, file_count = 0, size_bytes = 0, last_updated = NA_character_))
    info <- file.info(files)
    list(
      present = TRUE,
      file_count = length(files),
      size_bytes = as.numeric(sum(info$size, na.rm = TRUE)),
      last_updated = as.character(max(info$mtime, na.rm = TRUE))
    )
  }
  safe_file_info <- function(path) {
    if (!file.exists(path)) return(list(present = FALSE, size_bytes = 0, last_updated = NA_character_))
    info <- file.info(path)
    list(present = TRUE, size_bytes = as.numeric(info$size[[1]]), last_updated = as.character(info$mtime[[1]]))
  }

  crop_code <- crop
  spam_file <- file.path(BASE_DIR, "shapefilesEtc", paste0("spam2020_v1r0_global_P_", crop_code, "_A.tif"))

  catalog <- list(
    list(
      id = "oipc",
      name = "OIPC precipitation δ18O",
      description = "Global precipitation δ18O climatologies used to estimate source water isotopes. Contains monthly (GlobalPrecip) and growing-season (GlobalPrecipGS) rasters.",
      parts = list(
        list(id = "GlobalPrecip",  name = "OIPC GlobalPrecip (monthly)",    purpose = "Monthly precipitation δ18O; base signal for tissue models"),
        list(id = "GlobalPrecipGS", name = "OIPC GlobalPrecipGS (G.S.)",     purpose = "Growing-season precipitation δ18O; used where seasonality matters")
      )
    ),
    list(
      id = "worldclim",
      name = "WorldClim 2.1 climate",
      description = "Monthly climate normals at 10 arc‑min. Temperature (tavg) and vapour pressure (vapr) used as covariates (fractionation/enrichment).",
      parts = list(
        list(id = "tavg", name = "Temperature (tavg)", purpose = "Monthly mean temperature; affects cellulose δ18O via fractionation"),
        list(id = "vapr", name = "Vapour pressure (vapr)", purpose = "Humidity/VPD proxy; affects leaf water enrichment")
      )
    ),
    list(
      id = "spam",
      name = "SPAM 2020 production (crop mask/prior)",
      description = "Spatial allocation of agricultural production by crop; provides masks/weights for crop presence.",
      parts = list()
    ),
    list(
      id = "mirca",
      name = "MIRCA cropping calendars",
      description = "Monthly cropping calendars (sowing/harvest/weights) to aggregate climate/δ18O over the growing season. MIRCA2000 crop 26 (vegetables) proxy used for ONIO/GARL/CHIL with 12-band normalized weights.",
      parts = list()
    ),
    list(
      id = "elevation",
      name = "Elevation (topography)",
      description = "GMTED2010 mean elevation at 10 arc-min. Used for temperature lapse rate correction (-0.0065°C/m). Improves predictions in mountainous regions by 2-5‰.",
      parts = list()
    ),
    list(
      id = "irrigation",
      name = "Irrigation fraction",
      description = "Fraction of irrigated area per pixel (0-1), derived from MIRCA crop 26 irrigated/rainfed split. Used for source-water mixing: δ18O_source = δ18O_precip + f_irrig × 2‰ enrichment.",
      parts = list()
    ),
    list(
      id = "gnip",
      name = "GNIP bias correction",
      description = "Optional OIPC bias correction from 1,258 GNIP precipitation stations (IAEA/WMO WISER). Reduces regional OIPC systematic errors by 1-3‰. Mean bias: 0.25‰, RMSE: 1.59‰.",
      parts = list()
    )
  )

  # enrich with local filesystem metadata
  add_meta <- function(cat_entry) {
    id <- cat_entry$id
    if (identical(id, "oipc")) {
      p1 <- safe_dir_info(file.path(raw_dir, "oipc", "GlobalPrecip"))
      p2 <- safe_dir_info(file.path(raw_dir, "oipc", "GlobalPrecipGS"))
      cat_entry$parts[[1]]$meta <- p1
      cat_entry$parts[[2]]$meta <- p2
      cat_entry$present <- isTRUE(p1$present) || isTRUE(p2$present)
    } else if (identical(id, "worldclim")) {
      p1 <- safe_dir_info(file.path(raw_dir, "worldclim", "tavg"))
      p2 <- safe_dir_info(file.path(raw_dir, "worldclim", "vapr"))
      cat_entry$parts[[1]]$meta <- p1
      cat_entry$parts[[2]]$meta <- p2
      cat_entry$present <- isTRUE(p1$present) || isTRUE(p2$present)
    } else if (identical(id, "spam")) {
      fi <- safe_file_info(spam_file)
      cat_entry$meta <- fi
      cat_entry$present <- isTRUE(fi$present)
    } else if (identical(id, "mirca")) {
      out <- file.path(proc_dir, paste0(tolower(crop_code), "_calendar_monthly_weights.tif"))
      fi <- safe_file_info(out)
      cat_entry$meta <- fi
      cat_entry$present <- isTRUE(fi$present)
    } else if (identical(id, "elevation")) {
      elev_file <- file.path(proc_dir, "elevation_m.tif")
      fi <- safe_file_info(elev_file)
      cat_entry$meta <- fi
      cat_entry$present <- isTRUE(fi$present)
    } else if (identical(id, "irrigation")) {
      irrig_file <- file.path(proc_dir, "irrigation_fraction.tif")
      fi <- safe_file_info(irrig_file)
      cat_entry$meta <- fi
      cat_entry$present <- isTRUE(fi$present)
    } else if (identical(id, "gnip")) {
      gnip_file <- file.path(proc_dir, "oipc_bias_correction.tif")
      fi <- safe_file_info(gnip_file)
      cat_entry$meta <- fi
      cat_entry$present <- isTRUE(fi$present)
    }
    cat_entry
  }

  enriched <- lapply(catalog, add_meta)

  # include latest status snapshot and last-fetched summary if present
  status_path <- iso_to_abs("IsoscapeBuild/status/progress.json", "IsoscapeBuild/status/progress.json")
  progress <- NULL
  if (file.exists(status_path)) {
    progress <- tryCatch(jsonlite::fromJSON(status_path), error = function(e) NULL)
  }
  summary <- NULL
  if (file.exists(summary_path)) {
    summary <- tryCatch(jsonlite::fromJSON(summary_path), error = function(e) NULL)
  }
  list(ok = TRUE, crop = crop_code, sources = enriched, status = progress, summary = summary)
}

#* Get current fetch status and recent log
#* @get /isoscape/status
function(res, n = 120) {
  status_path <- iso_to_abs("IsoscapeBuild/status/progress.json", "IsoscapeBuild/status/progress.json")
  log_path <- iso_to_abs("IsoscapeBuild/status/fetch.log", "IsoscapeBuild/status/fetch.log")
  progress <- NULL
  if (file.exists(status_path)) progress <- tryCatch(jsonlite::fromJSON(status_path), error = function(e) NULL)
  log_tail <- character(0)
  if (file.exists(log_path)) {
    lines <- tryCatch(readLines(log_path, warn = FALSE), error = function(e) character(0))
    if (length(lines)) log_tail <- tail(lines, as.integer(n))
  }
  list(ok = TRUE, status = progress, log_tail = log_tail)
}

#* Run WorldMapping assignment using IsoscapeBuild outputs
#* @post /worldmapping/run
function(req, res, crop = "COTT", sigma_meas = 0.3, prior = "both", table_json = "", output_dir = "") {
  if (!dir.exists(ISO_DIR)) { res$status <- 400; return(list(error = "IsoscapeBuild folder not found")) }
  isb_root <- ISO_DIR
  out_dir <- to_abs(output_dir, file.path(BASE_DIR, "output"))
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

  # Parse table_json (array of {samples, d18O}) and group case-insensitively by samples
  if (!nzchar(table_json)) {
    # Allow fallback to existing inline_samples.xlsx used by /run
    xls <- list.files(file.path(BASE_DIR, "input"), pattern = "\\.xlsx$", full.names = TRUE)
    if (length(xls)) {
      if (!ensure_pkg('readxl')) { res$status <- 400; return(list(error = "Missing readxl and no JSON table provided")) }
      df <- as.data.frame(readxl::read_excel(xls[[1]]))
      names(df) <- tolower(names(df))
      if (!("samples" %in% names(df) && ("d18o" %in% names(df)))) { res$status <- 400; return(list(error = "xlsx must have columns 'samples' and 'd18O'")) }
      items <- lapply(seq_len(nrow(df)), function(i) list(samples = as.character(df$samples[i]), d18O = as.numeric(df$d18o[i])))
    } else { res$status <- 400; return(list(error = "Provide table_json or an input xlsx")) }
  } else {
    dat <- NULL
    try({ dat <- jsonlite::fromJSON(table_json) }, silent = TRUE)
    if (is.null(dat) || length(dat) == 0) { res$status <- 400; return(list(error = "Invalid table_json")) }
    items <- lapply(seq_len(nrow(dat)), function(i) list(samples = as.character(dat$samples[i]), d18O = as.numeric(dat$d18O[i])))
  }

  # Group by case-insensitive sample name
  grp <- list()
  for (it in items) {
    nm <- trimws(tolower(it$samples))
    if (!nzchar(nm)) next
    if (is.null(grp[[nm]])) grp[[nm]] <- list(name = it$samples, d = numeric(0))
    grp[[nm]]$d <- c(grp[[nm]]$d, as.numeric(it$d18O))
  }
  if (length(grp) == 0) { res$status <- 400; return(list(error = "No valid samples")) }

  # Source core
  core_path <- iso_to_abs("WorldMapping/assign_core.R", "WorldMapping/assign_core.R")
  if (!file.exists(core_path)) core_path <- file.path(REPO_ROOT, "WorldMapping", "assign_core.R")
  if (!file.exists(core_path)) { res$status <- 500; return(list(error = "WorldMapping core not found")) }
  source(core_path)

  results <- list()
  for (k in names(grp)) {
    s <- grp[[k]]
    try({
      wm_assign_sample(
        isb_root = ISO_DIR,
        sample_name = s$name,
        d_vec = s$d,
        output_dir = out_dir,
        sigma_meas = as.numeric(sigma_meas),
        shapes_dir = file.path(BASE_DIR, "shapefilesEtc")
      )
      results[[s$name]] <- list(ok = TRUE)
    }, silent = TRUE)
    if (is.null(results[[s$name]])) results[[s$name]] <- list(ok = FALSE)
  }

  list(ok = TRUE, output_dir = out_dir, samples = names(results))
}

#* HPD mask as GeoJSON (Mapbox-friendly) - uses pre-computed posterior
#* @get /worldmapping/hpd_geojson
function(res, sample = "", prior = "weighted", mass = 0.95, fact = 2, buffer_deg = 0) {
  if (!nzchar(sample)) { res$status <- 400; return(list(error = "missing sample")) }
  mass <- as.numeric(mass); if (!is.finite(mass) || mass <= 0 || mass >= 1) mass <- 0.95
  fact <- suppressWarnings(as.integer(fact)); if (!is.finite(fact) || fact < 1) fact <- 2
  buffer_deg <- suppressWarnings(as.numeric(buffer_deg)); if (!is.finite(buffer_deg) || buffer_deg < 0) buffer_deg <- 0
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = "sf required")) }
  if (!ensure_pkg('geojsonsf')) { res$status <- 500; return(list(error = "geojsonsf required")) }
  library(terra); library(sf)

  # Use the existing HPD mask TIFF that was used to generate the PNG
  out_dir <- to_abs("", file.path(BASE_DIR, "output"))
  prior_dir <- ifelse(tolower(prior) == "unweighted", "Unweighted", "Weighted")
  
  # Use the pre-computed HPD mask file (same as PNG generation)
  mask_file <- if (mass >= 0.5) {
    file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " world95.tiff"))
  } else {
    file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " world10.tiff"))
  }
  
  if (!file.exists(mask_file)) { 
    res$status <- 400; 
    return(list(error = paste("HPD mask not found:", mask_file, "; run WorldMapping first"))) 
  }

  # Load posterior and use exact HPD calculation (same as PNG)
  post_file <- file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " posterior.tiff"))
  if (!file.exists(post_file)) { 
    res$status <- 400; 
    return(list(error = paste("posterior not found:", post_file, "; run WorldMapping first"))) 
  }
  
  post <- rast(post_file)
  # Scale back from 0-255 to 0-1 probability  
  post <- post / 255
  
  # Implement the exact HPD calculation used in WorldMapping
  hpd_mask <- function(posterior, mass = 0.95) {
    stopifnot(mass > 0, mass < 1)
    v <- values(posterior, mat = FALSE)
    idx <- which(!is.na(v) & v > 0)
    probs <- v[idx]
    if (length(probs) == 0) {
      out <- posterior; values(out) <- 0L; return(out)
    }
    ord <- order(probs, decreasing = TRUE)
    total <- sum(probs, na.rm = TRUE)
    if (!is.finite(total) || total <= 0) total <- 1
    cs <- cumsum(probs[ord]) / total
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
  
  # Use exact HPD calculation
  mask <- hpd_mask(post, mass = mass)

  # Downsample mask to reduce polygon count (performance-friendly default)
  mask_agg <- tryCatch({
    terra::aggregate(mask, fact = fact, fun = "max", na.rm = TRUE)
  }, error = function(e) mask)
  
  # Convert to polygons (EPSG:4326) preserving separate regions
  polys <- tryCatch({
    p <- terra::as.polygons(mask_agg, dissolve = FALSE)  # keep separate contiguous regions
    # Keep only mask == 1
    nm <- names(p)[1]
    p <- subset(p, p[[nm]] == 1)
    p_wgs84 <- terra::project(p, 'EPSG:4326')
    # Convert to sf
    s_temp <- sf::st_as_sf(p_wgs84)
    # Optional small buffer to avoid sliver gaps at low zooms
    if (is.finite(buffer_deg) && buffer_deg > 0) {
      tryCatch({ s_temp <- sf::st_buffer(s_temp, dist = buffer_deg) }, error = function(e) {})
    }
    s_temp
  }, error = function(e) {
    cat("Polygon conversion error:", e$message, "\n")
    NULL
  })
  
  if (is.null(polys) || nrow(polys) == 0) return(list(type = "FeatureCollection", features = list()))
  
  # Create sf object with attributes for each separate polygon
  s <- polys
  s$sample <- sample
  s$prior <- prior  
  s$mass <- mass
  # Return raw GeoJSON string for Mapbox
  gj <- geojsonsf::sf_geojson(s)
  # Use plumber's raw response to avoid R's JSON formatting
  res$setHeader("Content-Type", "application/json")
  res$body <- gj
  return(res)
}

#* Regions (ADM0/ADM1) choropleth as GeoJSON with % share
#* @get /worldmapping/regions_geojson
function(res, sample = "", prior = "weighted", mass = 0.95, level = "adm0", mode = "global", norm = "") {
  if (!nzchar(sample)) { res$status <- 400; return(list(error = "missing sample")) }
  mass <- as.numeric(mass); if (!is.finite(mass) || mass <= 0 || mass >= 1) mass <- 0.95
  level <- tolower(level); if (!(level %in% c("adm0","adm1"))) level <- "adm0"
  mode <- tolower(mode); if (!(mode %in% c("global","hpd"))) mode <- "global"
  norm <- tolower(norm)
  if (!nzchar(norm)) norm <- if (identical(level, "adm1")) "country" else "global"
  if (!(norm %in% c("global","country"))) norm <- if (identical(level, "adm1")) "country" else "global"
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = "sf required")) }
  if (!ensure_pkg('geojsonsf')) { res$status <- 500; return(list(error = "geojsonsf required")) }
  library(terra); library(sf)

  out_dir <- to_abs("", file.path(BASE_DIR, "output"))
  prior_dir <- ifelse(tolower(prior) == "unweighted", "Unweighted", "Weighted")
  post_file <- file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " posterior.tiff"))
  if (!file.exists(post_file)) { res$status <- 400; return(list(error = paste("posterior not found:", post_file))) }

  post <- rast(post_file)
  post <- post / 255

  # HPD mask helper
  hpd_mask <- function(posterior, mass = 0.95) {
    v <- values(posterior, mat = FALSE)
    idx <- which(!is.na(v) & v > 0)
    probs <- v[idx]
    if (length(probs) == 0) { out <- posterior; values(out) <- 0L; return(out) }
    ord <- order(probs, decreasing = TRUE)
    total <- sum(probs, na.rm = TRUE); if (!is.finite(total) || total <= 0) total <- 1
    cs <- cumsum(probs[ord]) / total
    k <- which(cs >= mass)[1]; if (is.na(k)) k <- length(cs)
    pick <- rep(0L, length(v)); sel <- rep(0L, length(probs)); if (k >= 1) sel[seq_len(k)] <- 1L
    pick[idx[ord]] <- sel
    out <- posterior; values(out) <- pick; out
  }

  # Choose raster to aggregate
  Ragg <- if (identical(mode, "hpd")) {
    mask <- hpd_mask(post, mass)
    post * mask
  } else post

  # Load polygons for region level (auto-generate ADM1 if missing via rnaturalearth)
  shp_candidates <- if (identical(level, "adm0")) {
    c(file.path(BASE_DIR, "shapefilesEtc", "worldXUAR.shp"),
      file.path(BASE_DIR, "shapefilesEtc", "world.shp"))
  } else {
    c(file.path(BASE_DIR, "shapefilesEtc", "world_adm1.gpkg"),
      file.path(BASE_DIR, "shapefilesEtc", "world_adm1.shp"))
  }
  shp_path <- shp_candidates[file.exists(shp_candidates)][1]
  if ((is.na(shp_path) || !file.exists(shp_path)) && identical(level, "adm1")) {
    # try to build from rnaturalearth (prefer built-in medium/small scales to avoid rnaturalearthhires)
    if (!ensure_pkg('rnaturalearth')) { res$status <- 500; return(list(error = "rnaturalearth required for ADM1 auto-setup")) }
    if (!ensure_pkg('rnaturalearthdata')) { res$status <- 500; return(list(error = "rnaturalearthdata required for ADM1 auto-setup")) }
    if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = "sf required for ADM1 auto-setup")) }
    dir.create(file.path(BASE_DIR, "shapefilesEtc"), recursive = TRUE, showWarnings = FALSE)
    gpkg <- file.path(BASE_DIR, "shapefilesEtc", "world_adm1.gpkg")
    states <- NULL
    # Try medium (1:50m) then small (1:110m) to avoid hires dependency
    try({ states <- rnaturalearth::ne_states(scale = 'medium', returnclass = 'sf') }, silent = TRUE)
    if (is.null(states)) try({ states <- rnaturalearth::ne_states(scale = 'small', returnclass = 'sf') }, silent = TRUE)
    if (is.null(states)) try({ states <- rnaturalearth::ne_download(scale = 'small', type = 'states', category = 'cultural', returnclass = 'sf') }, silent = TRUE)
    if (is.null(states)) { res$status <- 500; return(list(error = "Failed to download ADM1 states from rnaturalearth")) }
    # Write GeoPackage
    ok <- FALSE
    try({ sf::st_write(states, gpkg, layer = "adm1", delete_dsn = TRUE, quiet = TRUE); ok <- TRUE }, silent = TRUE)
    if (ok && file.exists(gpkg)) shp_path <- gpkg
  }
  if (is.na(shp_path) || !file.exists(shp_path)) {
    res$status <- 500
    return(list(error = if (identical(level, "adm1"))
                 "ADM1 dataset not found and auto-setup failed. Please provide 'world_adm1.gpkg' or 'world_adm1.shp' under shapefilesEtc/."
               else "ADM0 world shapefile not found (expected worldXUAR.shp/world.shp)."))
  }
  vec <- tryCatch(terra::vect(shp_path), error = function(e) NULL)
  if (is.null(vec)) { res$status <- 500; return(list(error = "failed to read region shapefile")) }

  # Align CRS
  try({ if (!identical(terra::crs(vec), terra::crs(Ragg))) vec <- terra::project(vec, terra::crs(Ragg)) }, silent = TRUE)

  # Extract sums
  ex <- tryCatch(terra::extract(Ragg, vec, fun = sum, na.rm = TRUE), error = function(e) NULL)
  if (is.null(ex) || nrow(ex) == 0) return(list(type = "FeatureCollection", features = list()))
  sums <- ex[[2]]; if (is.null(sums)) sums <- ex[[ncol(ex)]]
  sums[!is.finite(sums)] <- 0

  # Labels
  nms <- names(vec)
  pick_field <- function(cands) {
    i <- which(tolower(nms) %in% tolower(cands))
    if (length(i) >= 1) nms[i[1]] else NA_character_
  }
  f0 <- pick_field(c("NAME_0","ADM0_EN","ADMIN","COUNTRY","NAME","geonunit","GEONUNIT","adm0_name","ADM0_NAME"))
  f1 <- pick_field(c("NAME_1","ADM1_EN","NAME_1_EN","PROVNAME","STATE_NAME","REGION","NAME","NAME_EN","name","name_en"))

  attrs <- tryCatch(terra::values(vec), error = function(e) NULL)
  adm0 <- if (!is.na(f0) && !is.null(attrs[[f0]])) as.character(attrs[[f0]]) else rep(NA_character_, length(sums))
  adm1 <- if (!is.na(f1) && !is.null(attrs[[f1]])) as.character(attrs[[f1]]) else rep(NA_character_, length(sums))
  label <- if (identical(level, "adm1")) {
    if (!all(is.na(adm1))) adm1 else if (!all(is.na(adm0))) adm0 else as.character(seq_along(sums))
  } else {
    if (!all(is.na(adm0))) adm0 else as.character(seq_along(sums))
  }

  # Normalize to percent
  sums_num <- as.numeric(sums)
  sums_num[!is.finite(sums_num)] <- 0
  if (identical(norm, "country") && identical(level, "adm1")) {
    # normalize within each parent ADM0 so subnational patterns are visible everywhere
    key <- ifelse(!is.na(adm0) & nzchar(adm0), adm0, "(unknown)")
    totals <- tapply(sums_num, key, sum, na.rm = TRUE)
    denom <- totals[key]
    denom[!is.finite(denom) | denom <= 0] <- 1
    p <- (sums_num / denom) * 100
  } else {
    total <- sum(sums_num, na.rm = TRUE)
    if (!is.finite(total) || total <= 0) total <- 1
    p <- (sums_num / total) * 100
  }

  # Keep only regions with >0 mass to reduce payload
  keep <- which(p > 0)
  if (length(keep) == 0) return(list(type = "FeatureCollection", features = list()))
  vec_sub <- tryCatch(vec[keep,], error = function(e) vec[keep])
  # Attach attributes
  vec_sub$p <- p[keep]
  vec_sub$label <- label[keep]
  if (identical(level, "adm1")) vec_sub$adm0 <- adm0[keep]

  # Convert to WGS84 and GeoJSON
  vec_wgs <- tryCatch(terra::project(vec_sub, 'EPSG:4326'), error = function(e) vec_sub)
  s <- sf::st_as_sf(vec_wgs)
  gj <- geojsonsf::sf_geojson(s)
  res$setHeader("Content-Type", "application/json")
  res$body <- gj
  return(res)
}

#* Country table restricted to HPD mass (probability tier)
#* @get /worldmapping/country_hpd
function(res, sample = "", prior = "weighted", mass = 0.95) {
  if (!nzchar(sample)) { res$status <- 400; return(list(error = "missing sample")) }
  mass <- as.numeric(mass); if (!is.finite(mass) || mass <= 0 || mass >= 1) mass <- 0.95
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  library(terra)

  out_dir <- to_abs("", file.path(BASE_DIR, "output"))
  prior_dir <- ifelse(tolower(prior) == "unweighted", "Unweighted", "Weighted")
  post_file <- file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " posterior.tiff"))
  if (!file.exists(post_file)) { res$status <- 400; return(list(error = paste("posterior not found:", post_file))) }

  post <- rast(post_file)
  post <- post / 255

  # HPD mask helper
  hpd_mask <- function(posterior, mass = 0.95) {
    v <- values(posterior, mat = FALSE)
    idx <- which(!is.na(v) & v > 0)
    probs <- v[idx]
    if (length(probs) == 0) { out <- posterior; values(out) <- 0L; return(out) }
    ord <- order(probs, decreasing = TRUE)
    total <- sum(probs, na.rm = TRUE); if (!is.finite(total) || total <= 0) total <- 1
    cs <- cumsum(probs[ord]) / total
    k <- which(cs >= mass)[1]; if (is.na(k)) k <- length(cs)
    pick <- rep(0L, length(v)); sel <- rep(0L, length(probs)); if (k >= 1) sel[seq_len(k)] <- 1L
    pick[idx[ord]] <- sel
    out <- posterior; values(out) <- pick; out
  }

  # Restrict to HPD mass
  mask <- hpd_mask(post, mass)
  post_restricted <- post * mask

  # Countries (worldXUAR shapefile) — separate XUAR vs Non‑XUAR China
  shp <- file.path(BASE_DIR, "shapefilesEtc", "worldXUAR.shp")
  if (!file.exists(shp)) { res$status <- 500; return(list(error = "worldXUAR.shp not found")) }
  vec <- tryCatch(terra::vect(shp), error = function(e) NULL)
  if (is.null(vec)) { res$status <- 500; return(list(error = "failed to read worldXUAR.shp")) }
  # Project to raster CRS if needed
  try({ if (!identical(terra::crs(vec), terra::crs(post_restricted))) vec <- terra::project(vec, terra::crs(post_restricted)) }, silent = TRUE)

  nms <- names(vec)
  has_n0 <- "NAME_0" %in% nms || "ADM0_EN" %in% nms
  has_n1 <- "NAME_1" %in% nms || "ADM1_EN" %in% nms
  get_n0 <- function(i) {
    if ("NAME_0" %in% nms) return(vec$NAME_0[i])
    if ("ADM0_EN" %in% nms) return(vec$ADM0_EN[i])
    return(NA_character_)
  }
  get_n1 <- function(i) {
    if ("NAME_1" %in% nms) return(vec$NAME_1[i])
    if ("ADM1_EN" %in% nms) return(vec$ADM1_EN[i])
    return(NA_character_)
  }

  ex <- tryCatch(terra::extract(post_restricted, vec, fun = sum, na.rm = TRUE), error = function(e) NULL)
  if (is.null(ex) || nrow(ex) == 0) return(list(rows = list()))

  sums <- ex[[2]]
  if (is.null(sums)) sums <- ex[[ncol(ex)]]
  sums[!is.finite(sums)] <- 0

  labels <- character(length(sums))
  for (i in seq_along(sums)) {
    c0 <- if (has_n0) as.character(get_n0(i)) else NA_character_
    c1 <- if (has_n1) as.character(get_n1(i)) else NA_character_
    if (!is.na(c0) && c0 == "China" && !is.na(c1) && grepl("Xinjiang", c1, ignore.case = TRUE)) {
      labels[i] <- "Xinjiang Uygur Autonomous Region"
    } else if (!is.na(c0) && c0 == "China") {
      labels[i] <- "Non-XUAR China"
    } else {
      labels[i] <- ifelse(!is.na(c0), c0, ifelse(!is.na(c1), c1, "Unknown"))
    }
  }

  df <- data.frame(label = labels, sumv = as.numeric(sums))
  agg <- stats::aggregate(sumv ~ label, data = df, sum)
  total <- sum(agg$sumv, na.rm = TRUE)
  if (!is.finite(total) || total <= 0) total <- 1
  agg$hpd_pct <- (agg$sumv / total) * 100
  agg <- agg[order(-agg$hpd_pct), c("label", "hpd_pct")]

  list(rows = lapply(seq_len(nrow(agg)), function(i) list(country = as.character(agg$label[i]), hpd_pct = as.numeric(agg$hpd_pct[i]))))
}

#* HPD mask as PNG data URL with bounds (on-the-fly)
#* @get /worldmapping/hpd_png
function(res, sample = "", prior = "weighted", mass = 0.95) {
  if (!nzchar(sample)) { res$status <- 400; return(list(error = "missing sample")) }
  mass <- as.numeric(mass); if (!is.finite(mass) || mass <= 0 || mass >= 1) mass <- 0.95
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  if (!ensure_pkg('png')) { res$status <- 500; return(list(error = "png package required")) }
  library(terra)

  out_dir <- to_abs("", file.path(BASE_DIR, "output"))
  prior_dir <- ifelse(tolower(prior) == "unweighted", "Unweighted", "Weighted")
  post_file <- file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " posterior.tiff"))
  if (!file.exists(post_file)) { res$status <- 400; return(list(error = paste("posterior not found:", post_file))) }

  post <- rast(post_file)
  post <- post / 255

  # HPD computation (normalized cumulative mass)
  hpd_mask <- function(posterior, mass = 0.95) {
    v <- values(posterior, mat = FALSE)
    idx <- which(!is.na(v) & v > 0)
    probs <- v[idx]
    if (length(probs) == 0) { out <- posterior; values(out) <- 0L; return(out) }
    ord <- order(probs, decreasing = TRUE)
    total <- sum(probs, na.rm = TRUE); if (!is.finite(total) || total <= 0) total <- 1
    cs <- cumsum(probs[ord]) / total
    k <- which(cs >= mass)[1]; if (is.na(k)) k <- length(cs)
    pick <- rep(0L, length(v)); sel <- rep(0L, length(probs)); if (k >= 1) sel[seq_len(k)] <- 1L
    pick[idx[ord]] <- sel
    out <- posterior; values(out) <- pick; out
  }

  mask <- hpd_mask(post, mass = mass)
  # Prepare RGBA image arrays
  w <- ncol(mask); h <- nrow(mask)
  m <- as.matrix(mask, wide = TRUE)
  # Ensure matrix is numeric 0/1
  mv <- suppressWarnings(as.numeric(m))
  mv[!is.finite(mv)] <- 0
  m <- matrix(mv, nrow = h, ncol = w, byrow = FALSE)
  img <- array(0, dim = c(h, w, 4))
  # Color #50b691 with alpha 200
  sel <- which(m == 1, arr.ind = TRUE)
  if (length(sel)) {
    img[,,1][m == 1] <- 80/255
    img[,,2][m == 1] <- 182/255
    img[,,3][m == 1] <- 145/255
    img[,,4][m == 1] <- 200/255
  }
  # Write to temp and base64 encode
  f <- tempfile(fileext = ".png")
  png::writePNG(img, f)
  raw <- readBin(f, what = "raw", n = file.info(f)$size)
  unlink(f)
  b64 <- jsonlite::base64_enc(raw)

  # Bounds (WGS84) with Mercator-safe clamps
  r2 <- post
  try({ if (!grepl("4326", terra::crs(post, describe = TRUE))) r2 <- terra::project(post, 'EPSG:4326') }, silent = TRUE)
  e <- terra::ext(r2)
  clamp <- function(x, lo, hi) pmax(lo, pmin(hi, x))
  e$xmin <- clamp(e$xmin, -179.999, 179.999)
  e$xmax <- clamp(e$xmax, -179.999, 179.999)
  e$ymin <- clamp(e$ymin,  -85.0,    85.0)
  e$ymax <- clamp(e$ymax,  -85.0,    85.0)
  corners <- list(c(e$xmin, e$ymax), c(e$xmax, e$ymax), c(e$xmax, e$ymin), c(e$xmin, e$ymin))

  gj <- jsonlite::toJSON(list(ok = TRUE, png = paste0("data:image/png;base64,", b64), corners = corners), auto_unbox = TRUE)
  res$setHeader("Content-Type", "application/json")
  res$body <- gj
  return(res)
}

#* Raster bounds for exact overlay (posterior/mask) in EPSG:4326
#* @get /worldmapping/posterior/bounds
function(res, sample = "", prior = "weighted", mass = 0.95) {
  if (!nzchar(sample)) { res$status <- 400; return(list(error = "missing sample")) }
  mass <- as.numeric(mass); if (!is.finite(mass) || mass <= 0 || mass >= 1) mass <- 0.95
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  library(terra)

  out_dir <- to_abs("", file.path(BASE_DIR, "output"))
  prior_dir <- ifelse(tolower(prior) == "unweighted", "Unweighted", "Weighted")
  # Always use posterior.tiff for georeferenced bounds
  post_file <- file.path(out_dir, sample, paste0(sample, ", ", prior_dir), paste0(sample, " posterior.tiff"))
  if (!file.exists(post_file)) { res$status <- 400; return(list(error = paste("raster not found:", post_file))) }

  r <- tryCatch(rast(post_file), error = function(e) NULL)
  if (is.null(r)) { res$status <- 500; return(list(error = "failed to read raster")) }

  # Ensure WGS84 extent; if ext looks like pixel space, fall back to world bounds
  r2 <- r
  try({ if (!grepl("4326", terra::crs(r, describe = TRUE))) r2 <- terra::project(r, 'EPSG:4326') }, silent = TRUE)
  e <- terra::ext(r2)
  # Heuristic: pixel extents are large positives (e.g., 0..2804); lon/lat extents are ~[-180,180] / [-90,90]
  is_pixelish <- is.finite(e$xmin) && is.finite(e$xmax) && (e$xmax - e$xmin > 500 || e$ymax - e$ymin > 500)
  if (is_pixelish) {
    e$xmin <- -180; e$xmax <- 180; e$ymin <- -90; e$ymax <- 90
  }
  # Clamp to Mercator-safe limits
  clamp <- function(x, lo, hi) pmax(lo, pmin(hi, x))
  e$xmin <- clamp(e$xmin, -179.999, 179.999)
  e$xmax <- clamp(e$xmax, -179.999, 179.999)
  e$ymin <- clamp(e$ymin,  -85.0,    85.0)
  e$ymax <- clamp(e$ymax,  -85.0,    85.0)
  # corners: top-left, top-right, bottom-right, bottom-left
  corners <- list(
    c(e$xmin, e$ymax),
    c(e$xmax, e$ymax),
    c(e$xmax, e$ymin),
    c(e$xmin, e$ymin)
  )
  list(ok = TRUE, corners = corners, bbox = c(e$xmin, e$ymin, e$xmax, e$ymax), size = c(ncol(r2), nrow(r2)))
}

#* Iso-bands GeoJSON for cellulose_mu (optionally select crop)
#* @get /isoscape/isobands
function(res, breaks = "20,22,24,26,28,30,32,34,36", crop = "") {
  if (!dir.exists(ISO_DIR)) { res$status <- 400; return(list(error = "IsoscapeBuild folder not found")) }
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = "sf required")) }
  if (!ensure_pkg('geojsonsf')) { res$status <- 500; return(list(error = "geojsonsf required")) }
  library(terra)
  library(sf)
  br <- as.numeric(strsplit(breaks, ",")[[1]])
  br <- br[is.finite(br)]
  br <- sort(unique(br))
  if (length(br) < 3) { res$status <- 400; return(list(error = "need at least 3 breaks")) }
  # If crop specified, prefer crop-specific isoscape under model/
  crop_raw <- crop
  crop <- toupper(trimws(crop))
  try(cat("[isobands] crop param received:", crop_raw, "→ cleaned:", crop, "\n"), silent = TRUE)
  mu_candidates <- c()
  if (nzchar(crop)) {
    mu_candidates <- c(mu_candidates, file.path(ISO_DIR, "model", paste0("cellulose_mu_", tolower(crop), ".tif")))
  }
  mu_candidates <- c(mu_candidates, file.path(ISO_DIR, "data_proc", "cellulose_mu.tif"), file.path(ISO_DIR, "model", "cellulose_mu.tif"))
  mu_path <- mu_candidates[file.exists(mu_candidates)][1]
  try(cat("[isobands] resolved path:", mu_path, "\n"), silent = TRUE)
  if (is.na(mu_path) || !file.exists(mu_path)) { res$status <- 500; return(list(error = paste("cellulose_mu.tif not found for crop", crop))) }
  mu <- rast(mu_path)
  # classify into bands
  rcl <- cbind(br[-length(br)], br[-1], seq_len(length(br)-1))
  cls <- classify(mu, rcl = rcl, include.lowest = TRUE, right = FALSE)
  poly <- terra::as.polygons(cls, dissolve = TRUE)
  try({ poly <- terra::project(poly, 'EPSG:4326') }, silent = TRUE)
  if (is.null(poly) || nrow(poly) == 0) {
    return(list(type = "FeatureCollection", features = list()))
  }
  s <- sf::st_as_sf(poly)
  # label bands (robustly pick attribute field)
  labs <- paste0(rcl[,1], "–", rcl[,2])
  nm <- tryCatch(names(poly)[1], error = function(e) NULL)
  if (is.null(nm) || !(nm %in% names(s))) nm <- setdiff(names(s), attr(s, "sf_column"))[[1]]
  if (length(nm) == 0 || is.null(nm)) nm <- names(s)[1]
  bid <- tryCatch(as.integer(s[[nm]]), error = function(e) NULL)
  if (is.null(bid) || length(bid) == 0) bid <- rep(NA_integer_, nrow(s))
  s$band_id <- bid
  s$label <- labs[pmax(1, pmin(nrow(rcl), ifelse(is.finite(bid), bid, 1)))]
  gj <- geojsonsf::sf_geojson(s)
  # Return raw GeoJSON string for Mapbox
  res$setHeader("Content-Type", "application/json")
  res$body <- gj
  return(res)
}

#* Countries intersecting a specific iso-band (ADM0) (optionally select crop)
#* @get /isoscape/isoband_countries
function(res, breaks = "14,16,18,20,22,24,26,28,30,32,34,36,38,40", band_id = 1, level = "adm0", crop = "") {
  if (!dir.exists(ISO_DIR)) { res$status <- 400; return(list(error = "IsoscapeBuild folder not found")) }
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = "sf required")) }
  library(terra); library(sf)

  # Build isobands same as /isoscape/isobands
  br <- as.numeric(strsplit(breaks, ",")[[1]]); br <- br[is.finite(br)]; br <- sort(unique(br))
  if (length(br) < 3) { res$status <- 400; return(list(error = "need at least 3 breaks")) }
  crop <- toupper(trimws(crop))
  mu_candidates <- c()
  if (nzchar(crop)) {
    mu_candidates <- c(mu_candidates, file.path(ISO_DIR, "model", paste0("cellulose_mu_", tolower(crop), ".tif")))
  }
  mu_candidates <- c(mu_candidates, file.path(ISO_DIR, "data_proc", "cellulose_mu.tif"), file.path(ISO_DIR, "model", "cellulose_mu.tif"))
  mu_path <- mu_candidates[file.exists(mu_candidates)][1]
  if (is.na(mu_path) || !file.exists(mu_path)) { res$status <- 500; return(list(error = paste("cellulose_mu.tif not found for crop", crop))) }
  mu <- rast(mu_path)
  rcl <- cbind(br[-length(br)], br[-1], seq_len(length(br)-1))
  cls <- classify(mu, rcl = rcl, include.lowest = TRUE, right = FALSE)
  poly <- tryCatch(terra::as.polygons(cls, dissolve = TRUE), error = function(e) NULL)
  if (is.null(poly)) { return(list(label = NA_character_, countries = list())) }
  try({ poly <- terra::project(poly, 'EPSG:4326') }, silent = TRUE)
  s <- sf::st_as_sf(poly)
  nm <- tryCatch(names(poly)[1], error = function(e) NULL)
  if (is.null(nm) || !(nm %in% names(s))) nm <- setdiff(names(s), attr(s, "sf_column"))[[1]]
  if (length(nm) == 0 || is.null(nm)) nm <- names(s)[1]
  bid <- tryCatch(as.integer(s[[nm]]), error = function(e) NULL)
  if (is.null(bid) || length(bid) == 0) bid <- rep(NA_integer_, nrow(s))
  s$band_id <- bid
  labs <- paste0(rcl[,1], "–", rcl[,2])
  s$label <- labs[pmax(1, pmin(nrow(rcl), ifelse(is.finite(bid), bid, 1)))]

  band_id <- as.integer(band_id); if (!is.finite(band_id)) band_id <- 1L
  s_band <- tryCatch(s[s$band_id == band_id, , drop = FALSE], error = function(e) NULL)
  if (is.null(s_band) || nrow(s_band) == 0) { return(list(label = labs[band_id], countries = list())) }

  # Read countries (ADM0). Prefer simple world shapefile in FTMapping/shapefilesEtc
  shp_dir <- BASE_DIR
  cand <- c(
    file.path(shp_dir, 'shapefilesEtc', 'world.shp'),
    file.path(shp_dir, 'shapefilesEtc', 'worldXUAR.shp'),
    file.path(shp_dir, 'shapefilesEtc', 'world_adm1.gpkg')
  )
  src <- cand[which(file.exists(cand))]
  if (length(src) == 0) { res$status <- 500; return(list(error = 'country boundaries not found')) }
  # If gpkg is used (adm1), we will dissolve by country name
  w <- tryCatch(suppressWarnings(sf::st_read(src[1], quiet = TRUE)), error = function(e) NULL)
  if (is.null(w)) { res$status <- 500; return(list(error = 'failed to read country boundaries')) }
  # Harmonize geometry and CRS
  try({ w <- sf::st_make_valid(w) }, silent = TRUE)
  try({ w <- sf::st_transform(w, 4326) }, silent = TRUE)
  try({ s_band <- sf::st_make_valid(s_band) }, silent = TRUE)

  # Pick a reasonable name column (prefer full country names)
  ln <- tolower(names(w))
  nm_opts <- c('name_0','adm0_en','admin','name','name_en','name_long','adm0_name','adm0name','geounit','sovereignt','sovereign','country','country_na','admin0name')
  k <- which(ln %in% nm_opts)
  name_col <- if (length(k) > 0) names(w)[k[1]] else names(w)[1]

  # If using adm1, group by country-like field if present
  if (grepl('world_adm1', src[1], fixed = TRUE)) {
    ln2 <- tolower(names(w))
    # For Natural Earth ADM1, prefer 'admin' (country name)
    ctry_col <- if ('admin' %in% ln2) names(w)[which(ln2 == 'admin')[1]] else name_col
    w <- sf::st_cast(w, 'MULTIPOLYGON')
    w <- suppressWarnings(w[, c(ctry_col)])
    names(w)[1] <- 'country'
    # dissolve by country
    w <- suppressWarnings(w %>% dplyr::group_by(country) %>% dplyr::summarise(geometry = sf::st_union(geometry), .groups = 'drop'))
    name_col <- 'country'
  }

  # Intersections
  idx <- tryCatch(sf::st_intersects(w, sf::st_union(s_band), sparse = TRUE), error = function(e) NULL)
  if (is.null(idx)) { return(list(label = labs[band_id], countries = list())) }
  hit <- lengths(idx) > 0
  countries <- sort(unique(as.character(w[[name_col]][hit])))
  # If names look like ISO3 codes, try a more descriptive column; else map via countrycode
  if (length(countries) > 0 && all(nchar(countries) == 3 & grepl('^[A-Z]{3}$', countries))) {
    alt_opts <- c('name_0','admin','name','name_en','name_long','adm0_name','adm0name','geounit','sovereignt','sovereign','country','admin0name')
    kk <- which(ln %in% alt_opts)
    if (length(kk) > 0) {
      alt_col <- names(w)[kk[1]]
      countries <- sort(unique(as.character(w[[alt_col]][hit])))
    } else if (ensure_pkg('countrycode')) {
      nm <- tryCatch(countrycode::countrycode(countries, origin = 'iso3c', destination = 'country.name.en'), error = function(e) rep(NA_character_, length(countries)))
      nm <- nm[!is.na(nm)]
      if (length(nm) > 0) countries <- sort(unique(nm))
    }
  }
  return(list(label = labs[band_id], countries = countries))
}

#* Prior bands (SPAM crop) as GeoJSON polygons
#* @get /worldmapping/prior_bands
function(res, crop = "COTT", mode = "quantile", breaks = "") {
  if (!dir.exists(ISO_DIR)) { res$status <- 400; return(list(error = "IsoscapeBuild folder not found")) }
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = "terra required")) }
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = "sf required")) }
  if (!ensure_pkg('geojsonsf')) { res$status <- 500; return(list(error = "geojsonsf required")) }
  library(terra); library(sf)

  # Load SPAM production raster for crop
  spam1 <- file.path(BASE_DIR, 'shapefilesEtc', paste0('spam2020_v1r0_global_P_', crop, '_A.tif'))
  spam2 <- file.path(ISO_DIR, 'data_proc', paste0(tolower(crop), '_production.tif'))
  src <- if (file.exists(spam1)) spam1 else spam2
  if (!file.exists(src)) { res$status <- 400; return(list(error = paste('SPAM raster not found for crop', crop))) }
  r <- rast(src)

  # Align to model grid if available
  mu_path1 <- file.path(ISO_DIR, 'model', 'cellulose_mu.tif')
  mu_path2 <- file.path(ISO_DIR, 'data_proc', 'cellulose_mu.tif')
  mu_path <- if (file.exists(mu_path1)) mu_path1 else mu_path2
  if (file.exists(mu_path)) {
    mu <- rast(mu_path)
    if (!compareGeom(r, mu, stopOnError = FALSE)) r <- tryCatch(resample(r, mu, method = 'bilinear'), error = function(e) r)
  }

  v <- values(r, mat = FALSE)
  v[v < 0] <- 0
  v_pos <- v[v > 0]
  if (length(v_pos) == 0) return(list(type = 'FeatureCollection', features = list(), error = 'No positive production values'))
  
  # Compute breaks based on mode
  if (mode == 'quantile') {
    # Top production quantiles: 0, 50th, 75th, 90th, 95th, 99th percentile
    quants <- quantile(v_pos, probs = c(0, 0.50, 0.75, 0.90, 0.95, 0.99, 1.0), na.rm = TRUE)
    br <- as.numeric(quants)
    br <- unique(br[is.finite(br)])
    if (length(br) < 2) br <- c(0, max(v_pos, na.rm=TRUE))
    # Labels must match number of intervals
    n_intervals <- length(br) - 1
    labs <- c('Bottom 50%', 'Top 50%', 'Top 25%', 'Top 10%', 'Top 5%', 'Top 1%')[1:n_intervals]
  } else if (mode == 'absolute' || mode == 'auto') {
    # Auto breaks tuned per crop based on data distribution
    q90 <- quantile(v_pos, 0.90, na.rm = TRUE)
    max_val <- max(v_pos, na.rm = TRUE)
    # Generate breaks with more detail in high-production areas
    br <- c(0, 10, 50, 100, 500, 1000, q90/2, q90, max_val)
    br <- unique(br[is.finite(br)])
    br <- sort(br)
    labs <- paste0(round(br[-length(br)], 1), '–', round(br[-1], 1), ' t/ha')
  } else {
    # Custom breaks from query param
    br <- as.numeric(strsplit(breaks, ',')[[1]])
    br <- br[is.finite(br)]
    br <- sort(unique(br))
    if (length(br) < 3) { res$status <- 400; return(list(error = 'need at least 3 breaks')) }
    labs <- paste0(round(br[-length(br)], 1), '–', round(br[-1], 1))
  }

  # Classify to bands
  rcl <- cbind(br[-length(br)], br[-1], seq_len(length(br)-1))
  cls <- classify(r, rcl = rcl, include.lowest = TRUE, right = FALSE)
  poly <- terra::as.polygons(cls, dissolve = TRUE)
  try({ poly <- terra::project(poly, 'EPSG:4326') }, silent = TRUE)
  if (is.null(poly) || nrow(poly) == 0) return(list(type = 'FeatureCollection', features = list()))
  s <- sf::st_as_sf(poly)
  
  nm <- tryCatch(names(poly)[1], error = function(e) NULL)
  if (is.null(nm) || !(nm %in% names(s))) nm <- setdiff(names(s), attr(s, 'sf_column'))[[1]]
  if (length(nm) == 0 || is.null(nm)) nm <- names(s)[1]
  bid <- tryCatch(as.integer(s[[nm]]), error = function(e) NULL)
  if (is.null(bid) || length(bid) == 0) bid <- rep(NA_integer_, nrow(s))
  # Ensure band_id starts at 1 (not 0) for consistent Mapbox matching
  s$band_id <- bid
  s$label <- labs[pmax(1, pmin(length(labs), ifelse(is.finite(bid), bid, 1)))]
  s$crop <- crop
  s$mode <- mode
  
  gj <- geojsonsf::sf_geojson(s)
  res$setHeader('Content-Type', 'application/json')
  res$body <- gj
  return(res)
}

#* List available SPAM crops (dynamic: scans local SPAM and IsoscapeBuild data_proc)
#* @get /worldmapping/spam_crops
function(res) {
  # Discover crops from legacy SPAM geotiffs
  shp_dir <- file.path(BASE_DIR, 'shapefilesEtc')
  shp_files <- character(0)
  if (dir.exists(shp_dir)) shp_files <- list.files(shp_dir, pattern = '^spam2020_.*_global_P_([A-Z]{4})_A\\.tif$', full.names = TRUE)
  shp_codes <- character(0)
  if (length(shp_files) > 0) {
    shp_codes <- toupper(sub('^.*_P_([A-Za-z]{4})_A\\.tif$', '\\1', basename(shp_files)))
  }
  # Discover crops from processed priors in IsoscapeBuild/data_proc
  proc_dir <- file.path(ISO_DIR, 'data_proc')
  proc_files <- character(0)
  if (dir.exists(proc_dir)) proc_files <- list.files(proc_dir, pattern = '^[a-z]{4}_production\\.tif$', full.names = TRUE)
  proc_codes <- character(0)
  if (length(proc_files) > 0) proc_codes <- toupper(sub('_production\\.tif$', '', basename(proc_files)))
  codes <- sort(unique(c(shp_codes, proc_codes)))
  list(crops = codes)
}

#* List all countries from world shapefile
#* @get /worldmapping/list_countries
function(res) {
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = 'sf required')) }
  library(sf)
  shp_candidates <- c(
    file.path(BASE_DIR, 'shapefilesEtc', 'worldXUAR.shp'),
    file.path(BASE_DIR, 'shapefilesEtc', 'world.shp')
  )
  shp_path <- shp_candidates[file.exists(shp_candidates)][1]
  if (is.na(shp_path)) { res$status <- 500; return(list(error = 'world shapefile not found')) }
  w <- tryCatch(suppressWarnings(st_read(shp_path, quiet = TRUE)), error = function(e) NULL)
  if (is.null(w)) { res$status <- 500; return(list(error = 'failed to read shapefile')) }
  nms <- names(w)
  col <- if ('NAME_0' %in% nms) 'NAME_0' else if ('NAME' %in% nms) 'NAME' else nms[1]
  countries <- sort(unique(as.character(w[[col]])))
  list(countries = countries)
}

#* List ADM1 regions (optionally filtered by country)
#* @get /worldmapping/list_regions
function(res, country = "") {
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = 'sf required')) }
  library(sf)
  adm1_path <- file.path(BASE_DIR, 'shapefilesEtc', 'world_adm1.gpkg')
  if (!file.exists(adm1_path)) { res$status <- 400; return(list(error = 'ADM1 data not found. Run choropleth with ADM1 once to auto-download.')) }
  w <- tryCatch(suppressWarnings(st_read(adm1_path, quiet = TRUE)), error = function(e) NULL)
  if (is.null(w)) { res$status <- 500; return(list(error = 'failed to read ADM1 data')) }
  
  nms <- names(w)
  # ADM1 uses 'admin' for country and 'name' for state/province
  col_adm0 <- 'admin'
  col_adm1 <- 'name'
  
  # Filter by country if provided (flexible matching)
  if (nzchar(country)) {
    # Try exact match first, then partial match
    matches <- tolower(w[[col_adm0]]) == tolower(country) | 
               grepl(tolower(country), tolower(w[[col_adm0]]), fixed = TRUE) |
               w[[col_adm0]] == country
    w <- w[matches, ]
  }
  
  regions <- sort(unique(as.character(w[[col_adm1]])))
  regions <- regions[nzchar(regions) & !is.na(regions)]
  
  list(regions = regions, country = if (nzchar(country)) country else NULL)
}

#* Get isotope profile for a region (expected δ18O values)
#* @get /risk/region_profile
function(res, country = "", region = "") {
  if (!nzchar(country)) { res$status <- 400; return(list(error = 'country required')) }
  if (!ensure_pkg('terra')) { res$status <- 500; return(list(error = 'terra required')) }
  if (!ensure_pkg('sf')) { res$status <- 500; return(list(error = 'sf required')) }
  library(terra); library(sf)
  
  # Load cellulose_mu isoscape
  mu_path1 <- file.path(ISO_DIR, 'model', 'cellulose_mu.tif')
  mu_path2 <- file.path(ISO_DIR, 'data_proc', 'cellulose_mu.tif')
  mu_path <- if (file.exists(mu_path1)) mu_path1 else mu_path2
  if (!file.exists(mu_path)) { res$status <- 500; return(list(error = 'cellulose_mu.tif not found')) }
  mu <- rast(mu_path)
  
  # Load SPAM cotton production (optional weighting)
  spam1 <- file.path(BASE_DIR, 'shapefilesEtc', 'spam2020_v1r0_global_P_COTT_A.tif')
  spam2 <- file.path(ISO_DIR, 'data_proc', 'cott_production.tif')
  spam_path <- if (file.exists(spam1)) spam1 else if (file.exists(spam2)) spam2 else NULL
  spam <- if (!is.null(spam_path)) rast(spam_path) else NULL
  
  # Load region polygon
  if (nzchar(region)) {
    # ADM1
    adm1_path <- file.path(BASE_DIR, 'shapefilesEtc', 'world_adm1.gpkg')
    if (!file.exists(adm1_path)) { res$status <- 400; return(list(error = 'ADM1 data not found')) }
    shp <- st_read(adm1_path, quiet = TRUE)
    matches <- tolower(shp$admin) == tolower(country) & tolower(shp$name) == tolower(region)
    if (!any(matches)) {
      matches <- grepl(tolower(country), tolower(shp$admin), fixed=TRUE) & grepl(tolower(region), tolower(shp$name), fixed=TRUE)
    }
    if (!any(matches)) { res$status <- 404; return(list(error = paste('Region not found:', country, region))) }
    poly <- vect(shp[matches, ])
  } else {
    # ADM0
    shp_cands <- c(file.path(BASE_DIR, 'shapefilesEtc', 'worldXUAR.shp'), file.path(BASE_DIR, 'shapefilesEtc', 'world.shp'))
    shp_path <- shp_cands[file.exists(shp_cands)][1]
    if (is.na(shp_path)) { res$status <- 500; return(list(error = 'world shapefile not found')) }
    shp <- st_read(shp_path, quiet = TRUE)
    col <- if ('NAME_0' %in% names(shp)) 'NAME_0' else 'NAME'
    matches <- tolower(shp[[col]]) == tolower(country) | grepl(tolower(country), tolower(shp[[col]]), fixed=TRUE)
    if (!any(matches)) { res$status <- 404; return(list(error = paste('Country not found:', country))) }
    poly <- vect(shp[matches, ])
  }
  
  # Crop and mask to region
  tryCatch({ poly <- project(poly, crs(mu)) }, silent = TRUE)
  mu_crop <- tryCatch(crop(mu, poly), error = function(e) mu)
  mu_mask <- tryCatch(mask(mu_crop, poly), error = function(e) mu_crop)
  
  # Extract values
  mu_vals <- values(mu_mask, mat = FALSE)
  
  # If SPAM available, try to filter to production areas
  spam_filtered <- FALSE
  if (!is.null(spam)) {
    tryCatch({
      if (!compareGeom(spam, mu, stopOnError = FALSE)) spam <- resample(spam, mu, method = 'bilinear')
      spam_crop <- crop(spam, poly)
      spam_mask <- mask(spam_crop, poly)
      spam_vals <- values(spam_mask, mat = FALSE)
      spam_vals[is.na(spam_vals)] <- 0
      spam_vals[spam_vals < 0] <- 0
      # Filter mu to where SPAM > 0 AND mu is valid
      valid <- !is.na(mu_vals) & spam_vals > 0 & is.finite(mu_vals)
      if (sum(valid) > 10) {  # Need at least 10 pixels with production
        mu_vals <- mu_vals[valid]
        spam_filtered <- TRUE
      }
    }, error = function(e) {})
  }
  
  # Final cleanup: remove NA and non-finite
  mu_vals <- mu_vals[!is.na(mu_vals) & is.finite(mu_vals)]
  
  if (length(mu_vals) < 5) {
    msg <- if (spam_filtered) 'No significant cotton production in this region (SPAM filtered)' else 'Insufficient isoscape data in this region'
    return(list(error = msg, country = country, region = region, n_pixels = length(mu_vals)))
  }
  
  list(
    country = country,
    region = if (nzchar(region)) region else NULL,
    mean = round(mean(mu_vals, na.rm = TRUE), 2),
    median = round(median(mu_vals, na.rm = TRUE), 2),
    min = round(min(mu_vals, na.rm = TRUE), 2),
    max = round(max(mu_vals, na.rm = TRUE), 2),
    sd = round(sd(mu_vals, na.rm = TRUE), 2),
    q25 = round(as.numeric(quantile(mu_vals, 0.25, na.rm = TRUE)), 2),
    q75 = round(as.numeric(quantile(mu_vals, 0.75, na.rm = TRUE)), 2),
    n_pixels = length(mu_vals),
    spam_filtered = spam_filtered
  )
}

#* List IsoscapeBuild processed files
#* @get /isoscape/files
function(res, proc_dir = "IsoscapeBuild/data_proc") {
  dirp <- iso_to_abs(proc_dir, "IsoscapeBuild/data_proc")
  if (!dir.exists(dirp)) return(list(ok = TRUE, files = list()))
  paths <- list.files(dirp, recursive = TRUE, full.names = TRUE)
  info <- file.info(paths)
  rel <- sub(paste0("^", gsub("[\\^$.|?*+(){}]","\\\\$0", dirp), "/?"), "", paths)
  files <- lapply(seq_along(paths), function(i) list(
    path = rel[[i]],
    isdir = isTRUE(info$isdir[[i]]),
    size = if (isTRUE(info$isdir[[i]])) NA_real_ else unname(info$size[[i]]),
    mtime = as.character(info$mtime[[i]])
  ))
  params <- NULL
  param_path <- iso_to_abs("IsoscapeBuild/model/model_params.json", "IsoscapeBuild/model/model_params.json")
  if (file.exists(param_path)) params <- jsonlite::fromJSON(param_path)
  list(ok = TRUE, proc_dir = dirp, files = files, model_params = params)
}

#* Trigger IsoscapeBuild fetch pipeline
#* @post /isoscape/fetch
function(req, res, crop = "COTT", sources = "", timeout = "") {
  if (!dir.exists(ISO_DIR)) return(list(error = "IsoscapeBuild folder not found"))
  old <- Sys.getenv("ISB_CROP")
  old_src <- Sys.getenv("ISB_SOURCES")
  old_to  <- Sys.getenv("ISB_TIMEOUT")
  on.exit(Sys.setenv(ISB_CROP = old), add = TRUE)
  on.exit(Sys.setenv(ISB_SOURCES = old_src), add = TRUE)
  on.exit(Sys.setenv(ISB_TIMEOUT = old_to), add = TRUE)
  Sys.setenv(ISB_CROP = crop)
  if (nzchar(sources)) Sys.setenv(ISB_SOURCES = sources)
  if (nzchar(timeout)) Sys.setenv(ISB_TIMEOUT = timeout)
  script <- iso_to_abs("IsoscapeBuild/scripts/fetch_inputs.R", "IsoscapeBuild/scripts/fetch_inputs.R")
  tryCatch({
    env <- new.env(parent = globalenv())
    env$.__file__ <- script
    source(script, local = env)
    list(ok = TRUE, crop = crop, sources = sources, timeout = timeout)
  }, error = function(e) {
    res$status <- 500
    list(error = as.character(e))
  })
}

#* Trigger IsoscapeBuild model build (uses calibration if available)
#* @post /isoscape/model
function(req, res, crop = "COTT") {
  if (!dir.exists(ISO_DIR)) return(list(error = "IsoscapeBuild folder not found"))
  old <- Sys.getenv("ISB_CROP")
  on.exit(Sys.setenv(ISB_CROP = old), add = TRUE)
  Sys.setenv(ISB_CROP = crop)
  script <- iso_to_abs("IsoscapeBuild/scripts/model_fit.R", "IsoscapeBuild/scripts/model_fit.R")
  tryCatch({
    env <- new.env(parent = globalenv())
    env$.__file__ <- script
    source(script, local = env)
    params_path <- iso_to_abs("IsoscapeBuild/model/model_params.json", "IsoscapeBuild/model/model_params.json")
    params <- if (file.exists(params_path)) jsonlite::fromJSON(params_path) else NULL
    list(ok = TRUE, crop = crop, model_params = params)
  }, error = function(e) {
    res$status <- 500
    list(error = as.character(e))
  })
}


