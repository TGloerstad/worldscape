suppressPackageStartupMessages({
  library(dplyr)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# Known coffee region coordinates (major origins)
coffee_regions <- list(
  # Brazil
  list(country = "Brazil", region = "Carmo de Minas", lat = -22.12, lon = -45.13),
  list(country = "Brazil", region = "Cerrado, Minas Gerais", lat = -17.8, lon = -46.5),
  list(country = "Brazil", region = "Espirito Santo", lat = -19.5, lon = -40.6),
  list(country = "Brazil", region = "Mogiana", lat = -21.5, lon = -47.0),
  list(country = "Brazil", region = "N/A", lat = -15.8, lon = -47.9),  # Minas Gerais general
  
  # Burundi
  list(country = "Burundi", region = "Gakenke", lat = -1.68, lon = 29.8),  # Note: Gakenke is Rwanda, using Burundi approx
  
  # Colombia
  list(country = "Colombia", region = "Tolima", lat = 4.09, lon = -75.15),
  list(country = "Colombia", region = "Palestina, Huila", lat = 2.34, lon = -76.0),
  list(country = "Colombia", region = "Vereda Montalvo", lat = 4.5, lon = -75.7),
  
  # Costa Rica
  list(country = "Costa Rica", region = "N/A", lat = 9.93, lon = -84.08),
  list(country = "Costa Rica", region = "Tarrazu", lat = 9.58, lon = -84.02),
  
  # El Salvador
  list(country = "El Salvador", region = "Apaneca", lat = 13.85, lon = -89.8),
  
  # Ethiopia
  list(country = "Ethiopia", region = "Gedeb Distric", lat = 5.95, lon = 38.3),  # Gedeo/Gedeb
  list(country = "Ethiopia", region = "Guji", lat = 5.8, lon = 38.8),
  list(country = "Ethiopia", region = "Yirgacheffe", lat = 6.16, lon = 38.2),
  
  # Guatemala
  list(country = "Guatemala", region = "Antigua", lat = 14.56, lon = -90.73),
  list(country = "Guatemala", region = "Huehuetenango", lat = 15.32, lon = -91.47),
  list(country = "Guatemala", region = "N/A", lat = 14.64, lon = -90.51),
  
  # Honduras
  list(country = "Honduras", region = "Marcala", lat = 14.15, lon = -88.03),
  list(country = "Honduras", region = "N/A", lat = 14.4, lon = -87.8),
  list(country = "Honduras", region = "Santa Barbara", lat = 14.92, lon = -88.24),
  
  # India
  list(country = "India", region = "Chikmagalur", lat = 13.32, lon = 75.77),
  
  # Indonesia
  list(country = "Indonesia", region = "Kokowagayo", lat = -8.7, lon = 120.5),  # Flores approx
  list(country = "Indonesia", region = "Sumatra", lat = 2.5, lon = 98.5),  # North Sumatra
  list(country = "Indonesia", region = "Toraja, Sulawesi", lat = -3.08, lon = 119.83),
  
  # Kenya
  list(country = "Kenya", region = "Nyeri", lat = -0.42, lon = 36.95),
  
  # Mexico
  list(country = "Mexico", region = "Chiapas", lat = 15.5, lon = -92.5),
  
  # Nicaragua
  list(country = "Nicaragua", region = "Jinotega", lat = 13.09, lon = -85.99),
  
  # Panama
  list(country = "Panama", region = "N/A", lat = 8.54, lon = -80.78),
  list(country = "Panama", region = "Volcan", lat = 8.77, lon = -82.64),
  
  # Papua New Guinea
  list(country = "Papua New Guinea", region = "Kainantu", lat = -6.37, lon = 145.86),
  list(country = "Papua New Guinea", region = "Kimel Estate", lat = -6.1, lon = 145.4),  # Eastern Highlands
  
  # Peru
  list(country = "Peru", region = "Centrocafe", lat = -5.5, lon = -78.5),  # Cajamarca region
  list(country = "Peru", region = "N/A", lat = -12.0, lon = -77.0),
  
  # Rwanda
  list(country = "Rwanda", region = "Nyakibanda", lat = -2.6, lon = 29.74),
  
  # Tanzania
  list(country = "Tanzania", region = "Mbeya", lat = -8.9, lon = 33.45),
  
  # USA (Hawaii)
  list(country = "USA", region = "Hilo", lat = 19.7, lon = -155.09),
  list(country = "USA", region = "Ka'anapali, Maui", lat = 20.93, lon = -156.69),
  list(country = "USA", region = "Ka'u", lat = 19.08, lon = -155.58),
  list(country = "USA", region = "Kona", lat = 19.64, lon = -155.99),
  list(country = "USA", region = "Moloka'i", lat = 21.15, lon = -157.02),
  list(country = "USA", region = "Waialua, Oahu", lat = 21.58, lon = -158.13),
  
  # Vietnam
  list(country = "Vietnam", region = "Central Highlands", lat = 12.5, lon = 108.0),
  
  # Yemen
  list(country = "Yemen", region = "Bura'a, Western Highlands", lat = 15.4, lon = 44.0),
  list(country = "Yemen", region = "N/A", lat = 15.35, lon = 44.2)
)

# Convert to dataframe
lookup <- do.call(rbind, lapply(coffee_regions, as.data.frame))

# Read your coffee data
coffee_raw <- read.csv("/Users/navseeker/Desktop/Projects/worldscape/IsoscapeBuild/data_raw/calibration/251010_Coffee Range Samples_O-Sr - Sheet1.csv",
                       stringsAsFactors = FALSE)

message("Loaded ", nrow(coffee_raw), " coffee samples")

# Match regions to coordinates
coffee_with_coords <- coffee_raw %>%
  left_join(lookup, by = c("Country" = "country", "Region" = "region"))

# Check for unmatched
unmatched <- coffee_with_coords[is.na(coffee_with_coords$lat), ]
if (nrow(unmatched) > 0) {
  message("WARNING: ", nrow(unmatched), " samples without coordinates:")
  print(unmatched[, c("Country", "Region")])
}

# Create final calibration CSV with required + optional columns
coffee_calib <- data.frame(
  sample_id = paste0(coffee_with_coords$Country, "_", seq_len(nrow(coffee_with_coords))),
  d18O_cellulose = coffee_with_coords$δ18O,
  lat = coffee_with_coords$lat,
  lon = coffee_with_coords$lon,
  country = coffee_with_coords$Country,
  region = coffee_with_coords$Region,
  d18O_sd = coffee_with_coords$`δ18O.σ`,
  farms = coffee_with_coords$Farms,
  replicates = coffee_with_coords$Replicates,
  sr87_86 = coffee_with_coords$Sr8786,
  sr87_86_sd = coffee_with_coords$`Sr8786.σ`,
  stringsAsFactors = FALSE
)

# Remove rows with NA coordinates
coffee_calib <- coffee_calib[!is.na(coffee_calib$lat) & !is.na(coffee_calib$lon), ]

message("Final calibration dataset: ", nrow(coffee_calib), " samples with coordinates")
message("δ18O range: ", round(min(coffee_calib$d18O_cellulose, na.rm=TRUE), 1), " to ", 
        round(max(coffee_calib$d18O_cellulose, na.rm=TRUE), 1), " ‰")

# Write output
out_path <- "/Users/navseeker/Desktop/Projects/worldscape/IsoscapeBuild/data_raw/calibration/coffee_calibration.csv"
write.csv(coffee_calib, out_path, row.names = FALSE)

message("✓ Wrote calibration file: ", basename(out_path))
message("\nFirst 5 samples:")
print(head(coffee_calib[, c("sample_id", "d18O_cellulose", "lat", "lon", "country", "region")], 5))



