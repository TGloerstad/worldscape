suppressPackageStartupMessages({
  library(terra)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# Resolve paths
caller_file <- tryCatch({ if (exists(".__file__", inherits = TRUE)) get(".__file__", inherits = TRUE) else NULL }, error = function(e) NULL)
args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% caller_file %||% "scripts/prepare_mirca_veg26.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())
raw_mirca <- file.path(root, "data_raw", "mirca")
dir.create(raw_mirca, recursive = TRUE, showWarnings = FALSE)

# Locate MGAG irrigated/rainfed crop 26 binaries (and translate to GTiff if needed)
find_file <- function(pattern) {
  cands <- list.files(raw_mirca, pattern = pattern, full.names = TRUE, recursive = TRUE)
  cands[1] %||% ""
}

gt_path_i <- file.path(raw_mirca, "mgag_i_26.tif")
gt_path_r <- file.path(raw_mirca, "mgag_r_26.tif")

ensure_gtiff <- function(bin_pat, out_tif) {
  if (file.exists(out_tif)) return(out_tif)
  bin_path <- find_file(bin_pat)
  if (!nzchar(bin_path)) stop("MIRCA file not found for pattern ", bin_pat, ". Place MGAG archives under ", raw_mirca)
  gdal <- Sys.which("gdal_translate")
  if (!nzchar(gdal)) stop("gdal_translate not found on PATH. Please install GDAL or provide pre-converted GeoTIFFs.")
  message("[mirca] Converting ", basename(bin_path), " → ", basename(out_tif))
  cmd <- sprintf('%s -of GTiff -co "INTERLEAVE=BAND" "%s" "%s"', gdal, bin_path, out_tif)
  system(cmd, ignore.stdout = TRUE, ignore.stderr = FALSE)
  if (!file.exists(out_tif)) stop("Failed to create ", out_tif)
  out_tif
}

gt_i <- ensure_gtiff("mgag_i_26\\.bin$", gt_path_i)
gt_r <- ensure_gtiff("mgag_r_26\\.bin$", gt_path_r)

# Build normalized monthly weights (irrigated + rainfed → total) and write veg26 weights
r_i <- rast(gt_i)
r_r <- rast(gt_r)
stopifnot(nlyr(r_i) == 12, nlyr(r_r) == 12)
tot <- r_i + r_r
s <- app(tot, fun = sum, na.rm = TRUE)
s[s == 0] <- NA
weights <- tot / s

out_veg <- file.path(raw_mirca, "veg26_calendar_monthly_weights.tif")
writeRaster(weights, out_veg, overwrite = TRUE)
message("[mirca] Wrote veg26 weights: ", out_veg)




