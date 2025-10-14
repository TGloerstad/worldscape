suppressPackageStartupMessages({
  library(terra)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% "scripts/derive_irrigation_fraction.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())

source(file.path(script_dir, "utils.R"))

raw_mirca <- file.path(root, "data_raw", "mirca")
proc_dir <- file.path(root, "data_proc")

message("[irrigation] Deriving irrigation fraction from MIRCA crop 26 (vegetables) …")

# Use MIRCA crop 26 irrigated/rainfed as proxy for irrigation intensity
irrig_flt <- file.path(raw_mirca, "crop_26_irrigated_12.flt")
rainfed_flt <- file.path(raw_mirca, "crop_26_rainfed_12.flt")

if (!file.exists(irrig_flt) || !file.exists(rainfed_flt)) {
  stop("MIRCA crop 26 files not found. Run preparation scripts first.")
}

r_i <- rast(irrig_flt)
r_r <- rast(rainfed_flt)

# Sum across 12 months to get annual irrigated/rainfed area
irrig_annual <- app(r_i, sum, na.rm = TRUE)
rainfed_annual <- app(r_r, sum, na.rm = TRUE)

# Fraction irrigated = irrigated / (irrigated + rainfed)
total <- irrig_annual + rainfed_annual
total[total == 0] <- NA
f_irrig <- irrig_annual / total
f_irrig[is.na(f_irrig)] <- 0  # Assume rainfed where no data
f_irrig[f_irrig < 0] <- 0
f_irrig[f_irrig > 1] <- 1

# Align to target grid
f_irrig_aligned <- align_to_target(f_irrig)

writeRaster(f_irrig_aligned, file.path(proc_dir, "irrigation_fraction.tif"), overwrite = TRUE)
message("[irrigation] Done. Irrigation fraction (0-1) written to data_proc/irrigation_fraction.tif")

# Quick stats
vals <- values(f_irrig_aligned, mat = FALSE)
vals <- vals[!is.na(vals) & vals > 0]
if (length(vals) > 0) {
  cat(sprintf("  Irrigation stats: mean=%.2f, median=%.2f, >50%%=%d pixels\n", 
              mean(vals), median(vals), sum(vals > 0.5)))
}



