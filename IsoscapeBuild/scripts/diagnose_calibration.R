#!/usr/bin/env Rscript
# Diagnostic script to investigate why only 10 of 32 calibration samples are used
# Run from repo root: Rscript IsoscapeBuild/scripts/diagnose_calibration.R

library(terra)

cat("==================================================================\n")
cat("COTTON CALIBRATION DATA DIAGNOSTIC\n")
cat("==================================================================\n\n")

# File paths
calib_file <- "IsoscapeBuild/data_raw/calibration/cotton_calibration_enhanced.csv"
precip_file <- "IsoscapeBuild/data_proc/precip_d18O_growing_season.tif"
temp_file <- "IsoscapeBuild/data_proc/tmean_monthly.tif"
params_file <- "IsoscapeBuild/model/model_params.json"

# Check files exist
cat("1. CHECKING FILES\n")
cat("   Calibration CSV: ", ifelse(file.exists(calib_file), "✓ Found", "✗ MISSING"), "\n")
cat("   Precipitation:   ", ifelse(file.exists(precip_file), "✓ Found", "✗ MISSING"), "\n")
cat("   Temperature:     ", ifelse(file.exists(temp_file), "✓ Found", "✗ MISSING"), "\n")
cat("   Model params:    ", ifelse(file.exists(params_file), "✓ Found", "✗ MISSING"), "\n\n")

if (!file.exists(calib_file)) {
  stop("ERROR: Calibration file not found!")
}

# Load calibration data
cat("2. LOADING CALIBRATION DATA\n")
calib <- read.csv(calib_file, stringsAsFactors = FALSE)
cat("   Total rows in CSV: ", nrow(calib), "\n")

# Check for empty rows
empty_rows <- apply(calib, 1, function(x) all(is.na(x) | x == ""))
n_empty <- sum(empty_rows)
if (n_empty > 0) {
  cat("   ⚠ Empty rows found: ", n_empty, "\n")
  calib <- calib[!empty_rows, ]
  cat("   Rows after removing empty: ", nrow(calib), "\n")
}

# Check for required columns
required_cols <- c("sample_id", "d18O_cellulose", "lat", "lon")
missing_cols <- setdiff(required_cols, names(calib))
if (length(missing_cols) > 0) {
  stop("ERROR: Missing required columns: ", paste(missing_cols, collapse = ", "))
}
cat("   ✓ All required columns present\n\n")

# Check data validity
cat("3. VALIDATING SAMPLE DATA\n")

# Check for NA in critical columns
na_d18O <- sum(is.na(calib$d18O_cellulose))
na_lat <- sum(is.na(calib$lat))
na_lon <- sum(is.na(calib$lon))

cat("   Samples with NA δ18O:      ", na_d18O, "\n")
cat("   Samples with NA latitude:  ", na_lat, "\n")
cat("   Samples with NA longitude: ", na_lon, "\n")

# Check coordinate validity
valid_coords <- !is.na(calib$lat) & !is.na(calib$lon) &
                 calib$lat >= -90 & calib$lat <= 90 &
                 calib$lon >= -180 & calib$lon <= 180

n_invalid_coords <- sum(!valid_coords)
cat("   Samples with invalid coords: ", n_invalid_coords, "\n")

if (n_invalid_coords > 0) {
  cat("\n   Invalid coordinate samples:\n")
  print(calib[!valid_coords, c("sample_id", "lat", "lon")])
}

# Valid samples before climate extraction
valid_samples <- !is.na(calib$d18O_cellulose) & valid_coords
n_valid <- sum(valid_samples)
cat("\n   Valid samples (before climate check): ", n_valid, "\n\n")

# Extract climate data if rasters exist
if (file.exists(precip_file) && file.exists(temp_file)) {
  
  cat("4. EXTRACTING CLIMATE DATA AT SAMPLE LOCATIONS\n")
  
  # Load rasters
  precip <- rast(precip_file)
  temp <- rast(temp_file)
  
  cat("   Precipitation raster: ", nrow(precip), " rows x ", ncol(precip), " cols\n")
  cat("   Temperature raster:   ", nrow(temp), " rows x ", ncol(temp), " cols\n")
  cat("   Resolution: ", res(precip)[1], "° x ", res(precip)[2], "°\n")
  
  # Extract at sample locations (only for valid samples)
  coords_matrix <- as.matrix(calib[valid_samples, c("lon", "lat")])
  
  # Precipitation δ18O
  precip_vals <- extract(precip, coords_matrix, method = "simple")
  calib$precip_d18O <- NA
  calib$precip_d18O[valid_samples] <- precip_vals[, 2]
  
  # Temperature (mean across months)
  if (nlyr(temp) > 1) {
    temp_mean <- mean(temp)
  } else {
    temp_mean <- temp
  }
  temp_vals <- extract(temp_mean, coords_matrix, method = "simple")
  calib$tmean <- NA
  calib$tmean[valid_samples] <- temp_vals[, 2]
  
  # Check for NA values after extraction
  has_precip <- !is.na(calib$precip_d18O)
  has_temp <- !is.na(calib$tmean)
  has_both <- has_precip & has_temp & valid_samples
  
  cat("\n   Samples with precipitation data: ", sum(has_precip), "\n")
  cat("   Samples with temperature data:   ", sum(has_temp), "\n")
  cat("   Samples with BOTH climate vars:  ", sum(has_both), "\n\n")
  
  # Identify samples with missing climate data
  missing_climate <- valid_samples & !has_both
  n_missing_climate <- sum(missing_climate)
  
  if (n_missing_climate > 0) {
    cat("5. SAMPLES WITH MISSING CLIMATE DATA (", n_missing_climate, " samples)\n\n")
    missing_df <- calib[missing_climate, c("sample_id", "lat", "lon", "elevation", "precip_d18O", "tmean")]
    print(missing_df)
    cat("\n   Possible reasons:\n")
    cat("   - Sample falls in ocean or outside raster extent\n")
    cat("   - Coordinates are incorrect (typo or wrong sign)\n")
    cat("   - Extreme elevation (Peru sample at 3400m?)\n")
    cat("   - Raster resolution too coarse (10 arc-min = ~18km at equator)\n\n")
  }
  
  # Final usable sample count
  usable <- sum(has_both)
  cat("6. FINAL SAMPLE COUNT\n")
  cat("   Started with:              ", nrow(calib) + n_empty, " rows (including empty)\n")
  cat("   After removing empty:      ", nrow(calib), "\n")
  cat("   With valid coordinates:    ", n_valid, "\n")
  cat("   With valid climate data:   ", usable, "\n\n")
  
  # Compare to model_params.json
  if (file.exists(params_file)) {
    params <- jsonlite::read_json(params_file)
    n_model <- params$n
    cat("   Model params says n =      ", n_model, "\n")
    cat("   ⚠ DISCREPANCY:            ", usable - n_model, " samples\n\n")
    
    if (usable != n_model) {
      cat("   INVESTIGATION NEEDED:\n")
      cat("   Why are only ", n_model, " samples used when ", usable, " have valid data?\n")
      cat("   Check model_fit.R for additional filtering logic.\n\n")
    }
  }
  
  # Summary table of all samples
  cat("7. COMPLETE SAMPLE SUMMARY\n\n")
  summary_df <- data.frame(
    sample_id = calib$sample_id,
    d18O = calib$d18O_cellulose,
    lat = calib$lat,
    lon = calib$lon,
    elev = ifelse("elevation" %in% names(calib), calib$elevation, NA),
    precip = round(calib$precip_d18O, 2),
    temp = round(calib$tmean, 1),
    usable = ifelse(has_both, "YES", "NO"),
    issue = ifelse(!valid_samples, "BAD_COORDS",
                  ifelse(!has_precip, "NO_PRECIP",
                        ifelse(!has_temp, "NO_TEMP", "OK")))
  )
  print(summary_df)
  
  # Save diagnostic output
  output_file <- "IsoscapeBuild/status/calibration_diagnostic.csv"
  write.csv(summary_df, output_file, row.names = FALSE)
  cat("\n✓ Diagnostic table saved to:", output_file, "\n")
  
} else {
  cat("\n⚠ Climate rasters not found. Skipping extraction.\n")
  cat("   Run fetch_inputs.R first to generate climate data.\n\n")
}

# Geographic distribution
cat("\n8. GEOGRAPHIC DISTRIBUTION\n\n")
country_counts <- table(substr(calib$sample_id, 1, 2))
print(country_counts)

cat("\n==================================================================\n")
cat("DIAGNOSTIC COMPLETE\n")
cat("==================================================================\n\n")

cat("NEXT STEPS:\n")
cat("1. Review samples marked as 'NO' in 'usable' column\n")
cat("2. Check coordinates for samples missing climate data\n")
cat("3. Verify elevation for high-altitude samples (Peru: 3400m)\n")
cat("4. Review model_fit.R for any additional sample filtering\n")
cat("5. Consider expanding to use all valid samples (not just 10)\n\n")




