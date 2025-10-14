# Check which calibration data is actually being used by IsoscapeBuild
# This helps diagnose why only n=10 samples were used instead of all 32

library(terra)
library(dplyr)

cat("==================================================================\n")
cat("CALIBRATION DATA USAGE DIAGNOSTIC\n")
cat("==================================================================\n\n")

# Paths
calib_basic <- "IsoscapeBuild/data_raw/calibration/cotton_calibration_basic.csv"
calib_enhanced <- "IsoscapeBuild/data_raw/calibration/cotton_calibration_enhanced.csv"
precip_path <- "IsoscapeBuild/data_proc/precip_d18O_growing_season.tif"
tmean_path <- "IsoscapeBuild/data_proc/tmean_monthly.tif"

# Check which files exist
cat("Checking files...\n")
cat("  Basic calibration:", ifelse(file.exists(calib_basic), "✓ Found", "✗ Missing"), "\n")
cat("  Enhanced calibration:", ifelse(file.exists(calib_enhanced), "✓ Found", "✗ Missing"), "\n")
cat("  Precipitation δ18O:", ifelse(file.exists(precip_path), "✓ Found", "✗ Missing"), "\n")
cat("  Temperature data:", ifelse(file.exists(tmean_path), "✓ Found", "✗ Missing"), "\n\n")

if (!file.exists(calib_enhanced)) {
  stop("Calibration file not found!")
}

# Load calibration data
cat("Loading calibration data...\n")
df <- read.csv(calib_enhanced)
cat("  Total samples in file:", nrow(df), "\n")
cat("  Columns:", paste(names(df), collapse=", "), "\n\n")

# Show sample distribution
cat("Sample geographic distribution:\n")
print(table(substr(df$sample_id, 1, 2)))
cat("\n")

# Load climate data if available
if (file.exists(precip_path) && file.exists(tmean_path)) {
  cat("Extracting climate data at sample locations...\n")
  
  precip <- rast(precip_path)
  tmean <- rast(tmean_path)
  
  # Create spatial points
  coords <- df[, c("lon", "lat")]
  pts <- vect(coords, geom=c("lon", "lat"), crs="EPSG:4326")
  
  # Extract
  precip_vals <- terra::extract(precip, pts)
  tmean_vals <- terra::extract(tmean, pts)
  
  # Combine
  df$precip_d18O <- precip_vals[,2]
  
  # Average monthly temperature
  if (nlyr(tmean) == 12) {
    tmean_mean <- app(tmean, mean, na.rm=TRUE)
    tmean_extract <- terra::extract(tmean_mean, pts)
    df$tmean <- tmean_extract[,2]
  } else {
    df$tmean <- NA
  }
  
  # Check for NA values
  df$has_precip <- !is.na(df$precip_d18O)
  df$has_tmean <- !is.na(df$tmean)
  df$usable <- df$has_precip & df$has_tmean
  
  cat("\nData availability:\n")
  cat("  Samples with precipitation δ18O:", sum(df$has_precip), "/", nrow(df), "\n")
  cat("  Samples with temperature:", sum(df$has_tmean), "/", nrow(df), "\n")
  cat("  Samples with BOTH (usable):", sum(df$usable), "/", nrow(df), "\n\n")
  
  if (sum(df$usable) < nrow(df)) {
    cat("⚠️  WARNING: Only", sum(df$usable), "samples have complete climate data!\n")
    cat("     This is likely why only n=10 was used in the model.\n\n")
    
    cat("Samples missing climate data:\n")
    missing <- df[!df$usable, c("sample_id", "lat", "lon", "has_precip", "has_tmean")]
    print(missing)
    cat("\n")
  }
  
  # Show usable samples
  cat("Usable samples for calibration:\n")
  usable <- df[df$usable, c("sample_id", "d18O_cellulose", "lat", "lon", "precip_d18O", "tmean")]
  print(usable)
  cat("\n")
  
  # If exactly 10 usable, this explains the model
  if (sum(df$usable) == 10) {
    cat("✓ DIAGNOSIS: Exactly 10 samples have complete climate data.\n")
    cat("  This explains why model_params.json shows n=10.\n\n")
  }
  
  # Simulate the model fit
  if (sum(df$usable) >= 5) {
    cat("------------------------------------------------------------------\n")
    cat("SIMULATING MODEL FIT (same as IsoscapeBuild)\n")
    cat("------------------------------------------------------------------\n\n")
    
    fit_data <- df[df$usable, ]
    
    # Fit linear model
    fit <- lm(d18O_cellulose ~ precip_d18O + tmean, data=fit_data)
    
    cat("Linear model: d18O_cellulose ~ precip_d18O + tmean\n\n")
    print(summary(fit))
    cat("\n")
    
    coefs <- coef(fit)
    sigma <- sqrt(mean(residuals(fit)^2))
    
    cat("Model coefficients:\n")
    cat("  a0 (intercept):", round(coefs[1], 4), "\n")
    cat("  b_precip:", round(coefs[2], 4), "\n")
    cat("  c_tmean:", round(coefs[3], 4), "\n")
    cat("  sigma (RMSE):", round(sigma, 3), "\n\n")
    
    # Compare to model_params.json
    model_params_path <- "IsoscapeBuild/model/model_params.json"
    if (file.exists(model_params_path)) {
      cat("Comparing to stored model_params.json:\n")
      params <- jsonlite::read_json(model_params_path)
      
      comparison <- data.frame(
        Parameter = c("a0", "b_precip", "c_tmean", "sigma", "n"),
        Stored = c(params$a0, params$b_precip, params$c_tmean, params$sigma, params$n),
        Calculated = c(coefs[1], coefs[2], coefs[3], sigma, nrow(fit_data))
      )
      comparison$Match <- abs(comparison$Stored - comparison$Calculated) < 0.01
      
      print(comparison)
      cat("\n")
      
      if (all(comparison$Match)) {
        cat("✓ Calculated coefficients MATCH stored model_params.json\n")
      } else {
        cat("⚠️  Calculated coefficients DIFFER from stored model_params.json\n")
        cat("    Model may need to be re-fit.\n")
      }
    }
  }
  
} else {
  cat("Climate data not available - cannot check sample usability\n")
  cat("Run IsoscapeBuild/scripts/fetch_inputs.R first to generate climate rasters\n")
}

cat("\n==================================================================\n")
cat("RECOMMENDATIONS\n")
cat("==================================================================\n\n")

cat("1. If only 10 samples usable:\n")
cat("   → Problem: Climate data missing at 22 sample locations\n")
cat("   → Solution: Check precipitation/temperature raster coverage\n")
cat("   → Or: Add more samples in covered regions\n\n")

cat("2. To improve model with all 32 samples:\n")
cat("   → Ensure precipitation δ18O covers all sample locations\n")
cat("   → Check temperature data completeness\n")
cat("   → Re-run: source('IsoscapeBuild/scripts/model_fit.R')\n\n")

cat("3. To use a different calibration file:\n")
cat("   → Set environment variable before running model_fit.R:\n")
cat("   → Sys.setenv(ISB_CAL='path/to/your_calibration.csv')\n\n")

cat("==================================================================\n")

