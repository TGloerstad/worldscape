# Build SPAM-based production/mask/weights for a crop, allowing proxies

suppressPackageStartupMessages({
  library(terra)
})

# Locate this script and project root
caller_file <- tryCatch({
  if (exists(".__file__", inherits = TRUE)) get(".__file__", inherits = TRUE) else NULL
}, error = function(e) NULL)

# Try to resolve script path from Rscript --file argument, then caller_file, then fallback
args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({
  fa <- sub("^--file=", "", args_all[grep("^--file=", args_all)][1])
  if (!is.na(fa) && nzchar(fa)) fa else NULL
}, error = function(e) NULL)

this_file <- NULL
if (!is.null(file_arg)) this_file <- tryCatch(normalizePath(file_arg, winslash = "/", mustWork = FALSE), error = function(e) NULL)
if (is.null(this_file) && !is.null(caller_file)) this_file <- tryCatch(normalizePath(caller_file, winslash = "/", mustWork = FALSE), error = function(e) NULL)
if (is.null(this_file)) this_file <- "scripts/build_spam_inputs.R"

script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())

# utils
`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x
source(file.path(script_dir, "utils.R"))

# Parse args / env
args <- commandArgs(trailingOnly = TRUE)
get_flag <- function(name, default = NULL) {
  # supports --name VALUE and --name=VALUE styles
  m1 <- which(args == paste0("--", name))
  m2 <- grep(paste0("^--", name, "="), args)
  if (length(m1) == 1 && length(args) >= m1 + 1) return(args[m1 + 1])
  if (length(m2) == 1) return(sub(paste0("^--", name, "="), "", args[m2]))
  Sys.getenv(toupper(name), unset = default)
}

crop_code <- toupper(get_flag("crop", "ONIO"))
# Optional explicit proxy source code for crops lacking a dedicated SPAM layer
proxy_code <- toupper(get_flag("proxy", ""))

raw_spam_dir <- file.path(root, "data_raw", "spam2020")
ft_spam_dir  <- file.path(dirname(root), "FTMapping", "shapefilesEtc")
proc_dir     <- file.path(root, "data_proc")
dir.create(proc_dir, recursive = TRUE, showWarnings = FALSE)

find_spam_file <- function(code) {
  # Look for any file that matches P_<CODE>_A*.tif in preferred locations
  patt <- paste0("P_", toupper(code), "_A.*\\.tif$")
  cands <- character(0)
  if (dir.exists(raw_spam_dir)) cands <- c(cands, list.files(raw_spam_dir, pattern = patt, full.names = TRUE, ignore.case = TRUE))
  if (dir.exists(ft_spam_dir))  cands <- c(cands, list.files(ft_spam_dir,  pattern = patt, full.names = TRUE, ignore.case = TRUE))
  cands[1] %||% ""
}

choose_source_for_crop <- function(crop_code) {
  cc <- toupper(crop_code)
  # If user provided explicit proxy, prefer it
  if (nzchar(proxy_code)) {
    f <- find_spam_file(proxy_code)
    if (nzchar(f)) return(list(file = f, source_code = proxy_code, is_proxy = TRUE))
    stop("Proxy requested (", proxy_code, ") but no SPAM raster found for it")
  }
  # Try direct first
  f <- find_spam_file(cc)
  if (nzchar(f)) return(list(file = f, source_code = cc, is_proxy = FALSE))
  # Known proxies
  if (cc == "CHIL") {
    # Chillies/peppers often absent → prefer REST then VEGE
    for (alt in c("REST", "VEGE")) {
      f <- find_spam_file(alt)
      if (nzchar(f)) return(list(file = f, source_code = alt, is_proxy = TRUE))
    }
  }
  if (cc == "GARL") {
    # Garlic → treat as other vegetables; fallback to REST
    for (alt in c("VEGE", "REST")) {
      f <- find_spam_file(alt)
      if (nzchar(f)) return(list(file = f, source_code = alt, is_proxy = TRUE))
    }
  }
  stop("No SPAM raster found for crop ", cc, " (and no suitable proxy). Place the file under ", raw_spam_dir)
}

build_outputs <- function(src_path, out_prefix) {
  message("[build] reading ", basename(src_path))
  r <- rast(src_path)
  r <- align_to_target(r)
  out_prod <- file.path(proc_dir, paste0(tolower(out_prefix), "_production.tif"))
  out_mask <- file.path(proc_dir, paste0(tolower(out_prefix), "_mask.tif"))
  out_cal  <- file.path(proc_dir, paste0(tolower(out_prefix), "_calendar_monthly_weights.tif"))

  # Write production
  writeRaster(r, out_prod, overwrite = TRUE)

  # Binary mask > 0
  mask <- classify(r, rcl = matrix(c(-Inf, 0, 0, 0, Inf, 1), ncol = 3, byrow = TRUE))
  writeRaster(mask, out_mask, overwrite = TRUE)

  # Uniform monthly weights within mask (placeholder)
  w <- rep(list(mask), 12)
  weights <- rast(w)
  mvals <- values(mask)
  mvals <- ifelse(mvals > 0, 1/12, 0)
  # replicate across 12 layers
  wmat <- do.call(cbind, replicate(12, mvals, simplify = FALSE))
  values(weights) <- wmat
  writeRaster(weights, out_cal, overwrite = TRUE)

  list(production = out_prod, mask = out_mask, calendar = out_cal)
}

src <- choose_source_for_crop(crop_code)
is_proxy_note <- if (isTRUE(src$is_proxy)) " (proxy)" else ""
message("[build] crop=", crop_code, ", using source_code=", src$source_code, is_proxy_note)
out <- build_outputs(src$file, crop_code)
message("[build] wrote:\n  ", out$production, "\n  ", out$mask, "\n  ", out$calendar)


