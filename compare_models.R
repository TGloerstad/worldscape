# Model Comparison Script: FTMapping (Model1) vs IsoscapeBuild (cellulose_mu)
# This script quantifies differences between the two cotton δ18O prediction models

library(terra)
library(ggplot2)
library(dplyr)

# Paths
old_model_path <- "FTMapping/shapefilesEtc/Model1.tif"
new_model_path <- "IsoscapeBuild/data_proc/cellulose_mu.tif"
calib_path <- "IsoscapeBuild/data_raw/calibration/cotton_calibration_enhanced.csv"

# Check files exist
if (!file.exists(old_model_path)) stop("Old model not found: ", old_model_path)
if (!file.exists(new_model_path)) stop("New model not found: ", new_model_path)

cat("==================================================================\n")
cat("COTTON δ18O MODEL COMPARISON\n")
cat("==================================================================\n\n")

# Load models
cat("Loading models...\n")
old_model <- rast(old_model_path)
new_model <- rast(new_model_path)

cat("Old model (Model1.tif):\n")
print(old_model)
cat("\n")

cat("New model (cellulose_mu.tif):\n")
print(new_model)
cat("\n")

# 1. GLOBAL STATISTICS COMPARISON
cat("------------------------------------------------------------------\n")
cat("1. GLOBAL STATISTICS\n")
cat("------------------------------------------------------------------\n\n")

old_vals <- values(old_model, mat=FALSE)
new_vals <- values(new_model, mat=FALSE)

# Remove NA
old_vals <- old_vals[!is.na(old_vals)]
new_vals <- new_vals[!is.na(new_vals)]

global_stats <- data.frame(
  Statistic = c("Mean", "Median", "SD", "Min", "Max", "Range", "N_pixels"),
  Old_Model = c(
    mean(old_vals), 
    median(old_vals),
    sd(old_vals),
    min(old_vals),
    max(old_vals),
    max(old_vals) - min(old_vals),
    length(old_vals)
  ),
  New_Model = c(
    mean(new_vals),
    median(new_vals),
    sd(new_vals),
    min(new_vals),
    max(new_vals),
    max(new_vals) - min(new_vals),
    length(new_vals)
  )
)
global_stats$Difference <- global_stats$New_Model - global_stats$Old_Model

print(global_stats)
cat("\n")

# 2. CALIBRATION SAMPLE COMPARISON
if (file.exists(calib_path)) {
  cat("------------------------------------------------------------------\n")
  cat("2. PERFORMANCE ON CALIBRATION SAMPLES\n")
  cat("------------------------------------------------------------------\n\n")
  
  calib <- read.csv(calib_path)
  cat("Calibration dataset:", nrow(calib), "samples\n\n")
  
  # Extract predictions
  coords <- calib[, c("lon", "lat")]
  old_pred <- terra::extract(old_model, coords)
  new_pred <- terra::extract(new_model, coords)
  
  # Combine
  comparison <- data.frame(
    sample_id = calib$sample_id,
    observed = calib$d18O_cellulose,
    old_pred = old_pred[,2],
    new_pred = new_pred[,2],
    lat = calib$lat,
    lon = calib$lon
  )
  
  # Remove NA predictions
  comparison <- comparison[!is.na(comparison$old_pred) & !is.na(comparison$new_pred), ]
  
  # Calculate errors
  comparison$old_error <- comparison$old_pred - comparison$observed
  comparison$new_error <- comparison$new_pred - comparison$observed
  comparison$difference <- comparison$new_pred - comparison$old_pred
  
  cat("Sample predictions:\n")
  print(comparison)
  cat("\n")
  
  # Calculate RMSE and MAE
  old_rmse <- sqrt(mean(comparison$old_error^2, na.rm=TRUE))
  new_rmse <- sqrt(mean(comparison$new_error^2, na.rm=TRUE))
  old_mae <- mean(abs(comparison$old_error), na.rm=TRUE)
  new_mae <- mean(abs(comparison$new_error), na.rm=TRUE)
  old_bias <- mean(comparison$old_error, na.rm=TRUE)
  new_bias <- mean(comparison$new_error, na.rm=TRUE)
  
  cat("Model Performance Metrics:\n")
  cat("---------------------------\n")
  perf <- data.frame(
    Metric = c("RMSE", "MAE", "Bias (mean error)", "R² vs observed"),
    Old_Model = c(
      old_rmse,
      old_mae,
      old_bias,
      cor(comparison$observed, comparison$old_pred, use="complete.obs")^2
    ),
    New_Model = c(
      new_rmse,
      new_mae,
      new_bias,
      cor(comparison$observed, comparison$new_pred, use="complete.obs")^2
    )
  )
  print(perf)
  cat("\n")
  
  # Model difference statistics
  cat("Model difference at calibration sites:\n")
  cat("  Mean difference (new - old):", round(mean(comparison$difference, na.rm=TRUE), 2), "‰\n")
  cat("  SD of differences:", round(sd(comparison$difference, na.rm=TRUE), 2), "‰\n")
  cat("  Max difference:", round(max(abs(comparison$difference), na.rm=TRUE), 2), "‰\n")
  cat("\n")
  
  # Regional patterns
  cat("Difference by region (approximation):\n")
  comparison$region <- ifelse(comparison$lat > 40, "High latitude",
                       ifelse(comparison$lat > 25, "Mid latitude",
                       ifelse(comparison$lat > 0, "Tropical", "Southern Hemisphere")))
  
  regional_summary <- comparison %>%
    group_by(region) %>%
    summarise(
      n = n(),
      mean_old = mean(old_pred, na.rm=TRUE),
      mean_new = mean(new_pred, na.rm=TRUE),
      mean_diff = mean(difference, na.rm=TRUE),
      old_rmse = sqrt(mean(old_error^2, na.rm=TRUE)),
      new_rmse = sqrt(mean(new_error^2, na.rm=TRUE))
    )
  print(as.data.frame(regional_summary))
  cat("\n")
  
} else {
  cat("Calibration file not found - skipping validation\n\n")
}

# 3. SPATIAL DIFFERENCE MAP
cat("------------------------------------------------------------------\n")
cat("3. COMPUTING SPATIAL DIFFERENCE RASTER\n")
cat("------------------------------------------------------------------\n\n")

# Align models if needed
if (!compareGeom(old_model, new_model, stopOnError=FALSE)) {
  cat("Models have different geometries - resampling old model to new model grid\n")
  old_model <- project(old_model, new_model)
}

# Calculate difference
diff_raster <- new_model - old_model
cat("Difference raster created: new_model - old_model\n\n")

diff_vals <- values(diff_raster, mat=FALSE)
diff_vals <- diff_vals[!is.na(diff_vals)]

cat("Difference statistics:\n")
cat("  Mean:", round(mean(diff_vals), 2), "‰\n")
cat("  Median:", round(median(diff_vals), 2), "‰\n")
cat("  SD:", round(sd(diff_vals), 2), "‰\n")
cat("  Range:", round(min(diff_vals), 2), "to", round(max(diff_vals), 2), "‰\n")
cat("  5th-95th percentile:", round(quantile(diff_vals, 0.05), 2), "to", 
    round(quantile(diff_vals, 0.95), 2), "‰\n\n")

# Save difference raster
out_path <- "model_difference_new_minus_old.tif"
writeRaster(diff_raster, out_path, overwrite=TRUE)
cat("Saved difference raster to:", out_path, "\n\n")

# 4. TEST SPECIFIC LOCATIONS
cat("------------------------------------------------------------------\n")
cat("4. MAJOR COTTON PRODUCTION REGIONS COMPARISON\n")
cat("------------------------------------------------------------------\n\n")

test_locations <- data.frame(
  location = c(
    "Texas (USA)", 
    "California (USA)",
    "Punjab (Pakistan)",
    "Gujarat (India)",
    "Xinjiang (China)",
    "Uzbekistan",
    "Egypt (Nile Delta)",
    "Australia (NSW)",
    "Brazil (Mato Grosso)",
    "Turkey (Aegean)"
  ),
  lon = c(-96.8, -119.7, 73.1, 72.9, 87.6, 68.8, 30.8, 150.2, -55.0, 27.0),
  lat = c(32.7, 36.2, 30.4, 23.1, 43.8, 40.1, 30.0, -27.5, -15.0, 38.5)
)

old_at_loc <- terra::extract(old_model, test_locations[, c("lon", "lat")])
new_at_loc <- terra::extract(new_model, test_locations[, c("lon", "lat")])

location_comparison <- data.frame(
  Location = test_locations$location,
  Old_Model = round(old_at_loc[,2], 1),
  New_Model = round(new_at_loc[,2], 1),
  Difference = round(new_at_loc[,2] - old_at_loc[,2], 1)
)

print(location_comparison)
cat("\n")

# Summary
cat("==================================================================\n")
cat("SUMMARY\n")
cat("==================================================================\n\n")

cat("Key Findings:\n")
cat("1. Global mean difference:", round(mean(new_vals) - mean(old_vals), 2), "‰\n")
cat("2. Spatial variability of differences:", round(sd(diff_vals), 2), "‰\n")

if (exists("old_rmse") && exists("new_rmse")) {
  cat("3. RMSE on calibration samples:\n")
  cat("   Old model:", round(old_rmse, 2), "‰\n")
  cat("   New model:", round(new_rmse, 2), "‰\n")
  if (new_rmse < old_rmse) {
    cat("   → New model performs", round(((old_rmse - new_rmse)/old_rmse)*100, 1), "% better\n")
  } else {
    cat("   → Old model performs", round(((new_rmse - old_rmse)/new_rmse)*100, 1), "% better\n")
  }
}

cat("\n")
cat("Output files created:\n")
cat("  - model_difference_new_minus_old.tif (spatial difference raster)\n")
cat("\n")

cat("==================================================================\n")
cat("ANALYSIS COMPLETE\n")
cat("==================================================================\n")

