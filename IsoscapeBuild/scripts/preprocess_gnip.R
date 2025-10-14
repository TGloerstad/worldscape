suppressPackageStartupMessages({
  library(readxl)
  library(dplyr)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% "scripts/preprocess_gnip.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())

gnip_dir <- file.path(root, "data_raw", "gnip")

message("[gnip-prep] Looking for GNIP raw file in ", gnip_dir)

# Find Excel or CSV file
files <- list.files(gnip_dir, pattern = "\\.(xlsx|xls|csv)$", full.names = TRUE, ignore.case = TRUE)
if (length(files) == 0) stop("No Excel/CSV file found in ", gnip_dir)

gnip_raw_file <- files[1]
message("[gnip-prep] Processing ", basename(gnip_raw_file))

# Read file (Excel or CSV)
if (grepl("\\.csv$", gnip_raw_file, ignore.case = TRUE)) {
  df <- read.csv(gnip_raw_file, stringsAsFactors = FALSE)
} else {
  df <- as.data.frame(read_excel(gnip_raw_file))
}

message("[gnip-prep] Loaded ", nrow(df), " rows, ", ncol(df), " columns")
message("[gnip-prep] Columns: ", paste(names(df), collapse = ", "))

# GNIP WISER format uses long format with Measurand Symbol column
# Check if this is WISER format
names_original <- names(df)
if ("Measurand Symbol" %in% names_original && "Measurand Amount" %in% names_original) {
  message("[gnip-prep] Detected WISER long format")
  
  # Filter to δ18O measurements only (WISER uses "O18" symbol)
  df_d18o <- df[df$`Measurand Symbol` == "O18" | df$`Measurand Symbol` == "δ18O" | 
                df$`Measurand Symbol` == "d18O", ]
  
  message("[gnip-prep] Filtered to ", nrow(df_d18o), " δ18O measurements")
  
  # Filter to precipitation samples only (rain, mixed precip)
  if ("Sample Media Type Name" %in% names(df_d18o)) {
    df_d18o <- df_d18o[grepl("rain|precip|mixed", df_d18o$`Sample Media Type Name`, ignore.case = TRUE), ]
    message("[gnip-prep] Filtered to precipitation samples: ", nrow(df_d18o))
  }
  
  gnip <- data.frame(
    station_id = as.character(df_d18o$`Sample Site Name` %||% df_d18o$`Sample Site UID`),
    lat = as.numeric(df_d18o$Latitude),
    lon = as.numeric(df_d18o$Longitude),
    d18O = as.numeric(df_d18o$`Measurand Amount`),
    date = if ("Sample Date" %in% names(df_d18o)) as.character(df_d18o$`Sample Date`) else NA_character_,
    precip_mm = NA_real_,  # May need separate query for precipitation amount
    stringsAsFactors = FALSE
  )
  
} else {
  # Standard CSV format
  message("[gnip-prep] Detected standard CSV format")
  names(df) <- tolower(trimws(names(df)))
  names(df) <- gsub("[^a-z0-9_]", "_", names(df))
  
  find_col <- function(patterns) {
    for (p in patterns) {
      matches <- grep(p, names(df), ignore.case = TRUE, value = TRUE)
      if (length(matches) > 0) return(matches[1])
    }
    NULL
  }
  
  col_station <- find_col(c("station", "site", "name", "id"))
  col_lat <- find_col(c("^lat", "latitude"))
  col_lon <- find_col(c("^lon", "longitude", "long"))
  col_d18o <- find_col(c("d18o", "o18", "oxygen_18"))
  col_precip <- find_col(c("precip", "amount"))
  
  if (is.null(col_station)) col_station <- names(df)[1]
  if (is.null(col_lat)) stop("Latitude column not found")
  if (is.null(col_lon)) stop("Longitude column not found")
  if (is.null(col_d18o)) stop("δ18O column not found")
  
  gnip <- data.frame(
    station_id = as.character(df[[col_station]]),
    lat = as.numeric(df[[col_lat]]),
    lon = as.numeric(df[[col_lon]]),
    d18O = as.numeric(df[[col_d18o]]),
    precip_mm = if (!is.null(col_precip)) as.numeric(df[[col_precip]]) else NA_real_,
    stringsAsFactors = FALSE
  )
}

# Remove NA coordinates or δ18O
gnip <- gnip[!is.na(gnip$lat) & !is.na(gnip$lon) & !is.na(gnip$d18O), ]
message("[gnip-prep] Valid records after filtering: ", nrow(gnip))

# Filter outliers (δ18O outside reasonable precipitation range)
gnip <- gnip[gnip$d18O > -50 & gnip$d18O < 10, ]
message("[gnip-prep] After removing outliers: ", nrow(gnip))

# Compute annual mean per station (weighted by precipitation if available)
has_precip <- any(!is.na(gnip$precip_mm))
if (has_precip) {
  message("[gnip-prep] Computing precipitation-weighted annual means …")
  gnip_summary <- gnip %>%
    group_by(station_id, lat, lon) %>%
    summarise(
      d18O_precip = weighted.mean(d18O, precip_mm, na.rm = TRUE),
      n_months = n(),
      precip_mm_annual = sum(precip_mm, na.rm = TRUE),
      .groups = 'drop'
    )
} else {
  message("[gnip-prep] Computing simple annual means (no precipitation weighting) …")
  gnip_summary <- gnip %>%
    group_by(station_id, lat, lon) %>%
    summarise(
      d18O_precip = mean(d18O, na.rm = TRUE),
      n_months = n(),
      precip_mm_annual = NA_real_,
      .groups = 'drop'
    )
}

# Filter to stations with >=6 months of data
gnip_summary <- gnip_summary[gnip_summary$n_months >= 6, ]
message("[gnip-prep] Stations with >=6 months: ", nrow(gnip_summary))

if (nrow(gnip_summary) < 10) {
  warning("Very few stations (", nrow(gnip_summary), "). Bias correction may be unreliable.")
}

# Remove any remaining outliers in annual means
q <- quantile(gnip_summary$d18O_precip, c(0.001, 0.999), na.rm = TRUE)
gnip_summary <- gnip_summary[gnip_summary$d18O_precip >= q[1] & gnip_summary$d18O_precip <= q[2], ]

# Write output
out_path <- file.path(gnip_dir, "gnip_annual_means.csv")
write.csv(gnip_summary, out_path, row.names = FALSE)

message("[gnip-prep] ✓ Wrote ", nrow(gnip_summary), " stations to ", basename(out_path))
message("[gnip-prep] Coverage:")
message("  Lat range: ", round(min(gnip_summary$lat), 1), " to ", round(max(gnip_summary$lat), 1))
message("  Lon range: ", round(min(gnip_summary$lon), 1), " to ", round(max(gnip_summary$lon), 1))
message("  δ18O range: ", round(min(gnip_summary$d18O_precip), 1), " to ", round(max(gnip_summary$d18O_precip), 1), " ‰")

head(gnip_summary, 10)

