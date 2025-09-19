# Utilities for IsoscapeBuild
suppressPackageStartupMessages({
  library(terra)
  library(utils)
})

# target grid (10 arc‑min)
get_target_grid <- function() {
  # global template at 10 arc‑min
  rast(xmin = -180, xmax = 180, ymin = -90, ymax = 90,
       resolution = 1/6, crs = "EPSG:4326")
}

align_to_target <- function(r) {
  target <- get_target_grid()
  if (!compareGeom(r, target, stopOnError = FALSE)) {
    r <- project(r, target)
    r <- resample(r, target, method = if (is.factor(r)) "near" else "bilinear")
  }
  r
}

ensure_dir <- function(path) {
  if (!dir.exists(path)) dir.create(path, recursive = TRUE, showWarnings = FALSE)
  path
}
