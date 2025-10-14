# Cotton δ18O Model Comparison: FTMapping vs IsoscapeBuild

## Executive Summary

You are seeing differences between the old FTMapping model (Model1.tif) and the new IsoscapeBuild model (cellulose_mu.tif) because they use **fundamentally different approaches** to predict cotton cellulose δ18O values. Here are the key differences causing output discrepancies:

---

## 🔬 Key Differences

### 1. **Model Type & Theoretical Basis**

| Aspect | Old Model (Model1.tif) | New Model (IsoscapeBuild) |
|--------|------------------------|---------------------------|
| **Approach** | Theoretical/mechanistic model | Empirical/calibration-based model |
| **Basis** | West's cotton cellulose model + modifications | Linear regression from reference samples |
| **Calibration** | Chris Stantis's modifications based on theory | 10 cotton reference samples (n=10) |
| **Formula** | Complex theoretical factors (climate, cellulose metabolism) | **δ18O = 28.35 + 0.738×precip_δ18O + 0.243×temp** |

### 2. **Reference/Calibration Data**

#### Old Model (FTMapping):
- Based on **theoretical factors** from West's model
- Modified with "updated understanding of climate factors"
- Tested on Brett's known-origin samples
- **No explicit calibration dataset in the code**

#### New Model (IsoscapeBuild):
- Uses **10 known-origin cotton samples** (`model_params.json` shows `n=10`)
- Available calibration files:
  - `cotton_calibration_basic.csv`: 32 samples (global)
  - `cotton_calibration_enhanced.csv`: 32 samples with metadata
- **Currently calibrated on only 10 samples** (likely a subset)
- Geographic coverage: USA, India, Pakistan, China, Australia, Brazil, Egypt, Turkey, Uzbekistan, Greece, Israel, Syria, Tunisia, Morocco, Peru

### 3. **Climate Inputs**

#### Old Model:
- Uses **unknown precipitation δ18O source** (embedded in Model1.tif)
- Unknown temperature/climate adjustments
- Modifications for "recent cotton production zones"

#### New Model:
- **OIPC precipitation δ18O** (GlobalPrecip or GlobalPrecipGS)
- **WorldClim 2.1** monthly temperature
- **MIRCA 2000** cropping calendars (growing season weighting)
- Growing-season weighted precipitation and temperature

### 4. **Model Coefficients**

From `IsoscapeBuild/model/model_params.json`:
```json
{
  "a0": 28.3459,        // Intercept
  "b_precip": 0.738,    // Precipitation δ18O coefficient
  "c_tmean": 0.2432,    // Temperature coefficient
  "sigma": 1.843,       // Model uncertainty (SD)
  "used_calibration": true,
  "n": 10               // Only 10 calibration samples used!
}
```

**Key observation**: The temperature coefficient (0.243‰/°C) is quite substantial and will cause significant regional differences.

### 5. **SPAM 2020 Production**

**Your assumption is CORRECT**: SPAM 2020 should NOT affect **unweighted** results comparison.

- Old model: Uses SPAM 2020 only for weighted probability calculations
- New model: Uses SPAM 2020 only for weighted probability calculations
- Both use the same SPAM 2020 data source
- **Unweighted comparisons eliminate this variable**

---

## 🎯 Primary Causes of Differences

### **1. Small Calibration Dataset (n=10)**
- Only 10 samples used to fit the new model
- This is **very small** for a global model
- Likely causing overfitting to specific regions
- Chris Stantis noted: "If we had more known origin cotton samples we could do more calibrated modelling"

### **2. Different Precipitation δ18O Sources**
- Old model: Unknown source (embedded in Model1.tif)
- New model: OIPC (Utah/Bowen database)
- OIPC may have different spatial patterns or biases

### **3. Temperature Effect**
- Old model: Incorporates temperature through theoretical fractionation factors
- New model: Linear temperature coefficient (0.243‰/°C)
- **Example**: 10°C difference → 2.4‰ difference in predicted δ18O
- This alone can explain large regional differences

### **4. Growing Season Weighting**
- New model uses MIRCA cropping calendars to weight climate by growing season
- Old model: Unknown temporal weighting
- Cotton grown in winter vs summer will have different precipitation δ18O

### **5. Theoretical vs Empirical**
- Old model: Based on plant physiology theory (West's model)
- New model: Purely empirical fit to limited data
- Theoretical models may capture mechanistic relationships better
- Empirical models may fit reference data better but extrapolate poorly

---

## 📊 Expected Magnitude of Differences

Based on the coefficients, here are realistic difference scenarios:

### Scenario 1: Temperature Difference
- Region A: 15°C growing season
- Region B: 25°C growing season
- **Difference**: 10°C × 0.243 = **2.4‰**

### Scenario 2: Precipitation δ18O Difference
- Region A: precip_δ18O = -10‰
- Region B: precip_δ18O = -5‰
- **Difference**: 5‰ × 0.738 = **3.7‰**

### Combined Effects:
Regions with both temperature and precipitation differences could show **4-6‰ differences** in predicted cellulose δ18O.

---

## 🔍 How to Diagnose the Differences

### Step 1: Extract Values from Both Models
```r
library(terra)

# Old model
old_model <- rast("FTMapping/shapefilesEtc/Model1.tif")

# New model  
new_model <- rast("IsoscapeBuild/data_proc/cellulose_mu.tif")

# Compare at specific locations
test_coords <- data.frame(
  location = c("Texas", "India", "Xinjiang", "Egypt"),
  lon = c(-96.8, 77.6, 87.6, 30.8),
  lat = c(32.7, 23.1, 43.8, 26.8)
)

old_vals <- extract(old_model, test_coords[, c("lon", "lat")])
new_vals <- extract(new_model, test_coords[, c("lon", "lat")])

comparison <- data.frame(
  location = test_coords$location,
  old_model = old_vals[,2],
  new_model = new_vals[,2],
  difference = new_vals[,2] - old_vals[,2]
)
print(comparison)
```

### Step 2: Check Input Climate Data
```r
# Compare precipitation inputs
precip_new <- rast("IsoscapeBuild/data_proc/precip_d18O_growing_season.tif")
extract(precip_new, test_coords[, c("lon", "lat")])

# Check temperature
tmean_new <- rast("IsoscapeBuild/data_proc/tmean_monthly.tif")
tmean_gs <- mean(tmean_new)  # Approximate growing season temp
extract(tmean_gs, test_coords[, c("lon", "lat")])
```

### Step 3: Validate Against Reference Samples
```r
# Load calibration data
calib <- read.csv("IsoscapeBuild/data_raw/calibration/cotton_calibration_enhanced.csv")

# Extract predictions at calibration sites
old_pred <- extract(old_model, calib[, c("lon", "lat")])
new_pred <- extract(new_model, calib[, c("lon", "lat")])

# Compare RMSE
rmse_old <- sqrt(mean((old_pred[,2] - calib$d18O_cellulose)^2, na.rm=TRUE))
rmse_new <- sqrt(mean((new_pred[,2] - calib$d18O_cellulose)^2, na.rm=TRUE))

cat("Old model RMSE:", rmse_old, "\n")
cat("New model RMSE:", rmse_new, "\n")
```

---

## ⚠️ Critical Issues

### 1. **Insufficient Calibration Data**
- Only **10 samples used** (model_params.json shows n=10)
- But 32 samples exist in calibration files
- **Action needed**: Verify why only 10 samples were used
  - Check for NA values in climate data at sample locations
  - Ensure all 32 samples have valid precipitation/temperature extractions

### 2. **Model Uncertainty**
- New model σ = 1.84‰ (from 10 samples)
- This is reasonable but based on very limited data
- True uncertainty likely higher when extrapolating globally

### 3. **Validation Needed**
- Neither model has been validated on independent test set
- Chris Stantis tested old model on "Brett's samples"
- New model needs testing on held-out samples

---

## 🎬 Recommendations

### Immediate Actions:

1. **Debug calibration sample count**
   ```r
   # Run this in IsoscapeBuild
   source("scripts/model_fit.R")
   # Check why only n=10 instead of n=32
   ```

2. **Extract both models at same test locations**
   - Use the calibration sample locations
   - Calculate RMSE for both models
   - Identify which model performs better

3. **Visualize differences spatially**
   ```r
   diff_raster <- new_model - old_model
   plot(diff_raster, main="New Model - Old Model (‰)")
   ```

4. **Check for systematic biases**
   - Plot old vs new predictions
   - Look for regional patterns (hot vs cold, dry vs wet)

### Long-term Improvements:

1. **Increase calibration dataset**
   - Target 50-100 global cotton samples
   - Cover major production regions
   - Include irrigation/rainfed varieties

2. **Hybrid approach**
   - Use theoretical model as prior
   - Calibrate offsets empirically
   - Example: `δ18O = theoretical_model + empirical_correction(region, climate)`

3. **Cross-validation**
   - Split samples into train/test
   - Evaluate both models fairly
   - Report confidence intervals

4. **Document Model1.tif provenance**
   - How was it created?
   - What data went into it?
   - Can it be reproduced?

---

## 📝 Conclusion

The differences between your two models stem from:

1. **Different modeling approaches** (theoretical vs empirical)
2. **Very small calibration dataset** (n=10 for new model)
3. **Different climate inputs** (unknown vs OIPC/WorldClim)
4. **Temperature effects** (implicit vs explicit 0.243‰/°C)
5. **Growing season weighting** (unknown vs MIRCA)

**SPAM 2020 is NOT causing unweighted differences** - your assumption is correct.

**Next steps**: Run the diagnostic code above to quantify where and how much the models differ, then validate both against independent samples to determine which is more accurate.

---

**Document prepared**: October 2025  
**Contact**: Chris Stantis, PhD (original model)  
**New model**: IsoscapeBuild team

