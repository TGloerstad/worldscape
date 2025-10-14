# Cotton Calibration Data: Action Plan

## Current Situation

**Problem**: The existing calibration dataset lacks:
- Academic citations/provenance
- Sufficient sample size (only 10 of 32 samples used)
- Documentation of collection and analysis methods
- Validation/test data

**Impact**: Cannot publish model, uncertain extrapolation, no reproducibility

---

## Three Pathways Forward

### 🚀 Path A: Acquire Existing Published Data (FASTEST)

**Timeline**: 2-4 weeks  
**Cost**: Low  
**Scientific Rigor**: High (peer-reviewed)

#### Action Steps:

1. **Week 1: Literature & Data Requests**
   ```
   [ ] Download Meier-Augenstein et al. (2014) full paper
   [ ] Email authors requesting supplementary data/raw measurements
   [ ] Search IAEA isotope databases for cotton samples
   [ ] Check if any thesis/dissertation data is available
   ```

2. **Week 2: Compile Available Data**
   ```
   [ ] Extract any published cotton δ18O values from papers
   [ ] Document sample locations and metadata
   [ ] Convert to standardized format matching current CSV
   [ ] Verify coordinates and sample information
   ```

3. **Week 3: Integrate & Validate**
   ```
   [ ] Merge published data with existing samples
   [ ] Check for climate data coverage (no NA values)
   [ ] Run model_fit.R with expanded dataset
   [ ] Compare RMSE to previous n=10 model
   ```

4. **Week 4: Documentation**
   ```
   [ ] Create proper citations file
   [ ] Document data sources in README
   [ ] Add references to model_fit.R comments
   [ ] Update model_params.json with sample count
   ```

**Email Template for Authors:**

```
Subject: Request for Cotton Isotope Reference Data

Dear Dr. [Author],

I am working on a cotton provenance model using stable oxygen isotopes 
at [FloraTrace/Institution]. I read your excellent paper "[Title]" and 
was impressed by the isotope reference database you developed.

Would you be willing to share the raw isotope measurements and sample 
metadata (coordinates, collection dates) from your study? This would 
help expand our calibration dataset for a mechanistic model predicting 
cotton cellulose δ18O from precipitation and climate data.

We would properly cite your work in any resulting publications and are 
happy to acknowledge your contribution. If you prefer, we could discuss 
potential collaboration.

Thank you for considering this request.

Best regards,
[Your Name]
[Institution/Company]
[Contact Info]
```

---

### 🔬 Path B: Collect New Reference Samples (BEST LONG-TERM)

**Timeline**: 6-12 months  
**Cost**: Moderate-High  
**Scientific Rigor**: Highest (designed for your needs)

#### Sampling Design

**Target Sample Size**: 75-100 samples

**Geographic Stratification**:
```
Region                 Target N    Priority
--------------------------------
USA (TX, CA, AZ, NC)      15       High
India                     12       High
China (Xinjiang)          10       High
Pakistan                   8       High
Brazil                     8       Medium
Egypt                      6       Medium
Turkey                     5       Medium
Uzbekistan                 5       Medium
Australia                  5       Medium
Other (Greece, etc.)       8       Low
--------------------------------
TOTAL:                   ~80-100
```

**Sampling Criteria**:
- Known harvest location (GPS coordinates within 10 km)
- Harvest year documented
- Variety/cultivar recorded
- Irrigation status known
- Multiple years from same location (if possible)

**Sample Collection Protocol**:
```
1. Collect 50-100g of lint/fiber from ginned cotton
2. Record GPS coordinates (decimal degrees, WGS84)
3. Note harvest month and year
4. Document variety (Upland, Pima, other)
5. Record irrigation: rainfed, irrigated, or mixed
6. Store in paper bags (not plastic) at room temp
7. Label with unique ID: [COUNTRY]_[STATE]_[SITE]_[YEAR]
```

**Laboratory Analysis**:
- Extract α-cellulose using standard protocol (Loader/Brendel method)
- Analyze δ18O by pyrolysis-IRMS or high-temperature conversion
- Run duplicates for 10% of samples
- Include standards (IAEA-C3, IAEA-C5)
- Target precision: ±0.3‰ or better

**Budget Estimate**:
```
Item                          Cost (USD)
------------------------------------------
Sample collection/shipping    $2,000-5,000
Cellulose extraction          $3,000-6,000
  (~100 samples @ $30-60/ea)
δ18O analysis                 $8,000-15,000
  (~110 samples @ $80-150/ea including QC)
Data management/QC            $1,000-2,000
------------------------------------------
TOTAL:                        $14,000-28,000
```

#### Potential Sample Sources

1. **Cotton breeding programs** - Universities have archived samples
2. **USDA cotton repositories** - ARS stations maintain collections
3. **Textile manufacturers** - May have origin-documented cotton bales
4. **International cotton trials** - ICAC coordinates multi-country trials
5. **Academic collaborators** - Plant scientists with field sites

**Contacts to Approach**:
- USDA Cotton Incorporated
- Texas A&M AgriLife Research
- UC Davis Cotton Breeding Program
- ICRISAT (India)
- CIRAD (France/International)

---

### 🧮 Path C: Hybrid Mechanistic-Empirical Model (INTERMEDIATE)

**Timeline**: 4-8 weeks  
**Cost**: Low  
**Scientific Rigor**: Moderate-High

#### Approach

Instead of pure empirical regression, use mechanistic model with limited calibration:

```
δ18O_cellulose = f_mechanistic(precip_δ18O, temp, RH, [theory params]) + ε_empirical
```

Where:
- `f_mechanistic` = Roden/Barbour cellulose fractionation model
- Theory params = Published fractionation factors
- `ε_empirical` = Region-specific correction from limited samples

**Advantages**:
- Requires fewer calibration samples
- Better extrapolation to data-sparse regions
- Scientifically defensible
- Can cite published fractionation factors

**Disadvantages**:
- More complex implementation
- Requires additional climate inputs (RH, VPD)
- May not capture cotton-specific effects

#### Implementation Steps

1. **Week 1-2: Literature Review**
   ```
   [ ] Read Roden et al. (2000) mechanistic model
   [ ] Review Barbour (2007) for cotton-relevant factors
   [ ] Identify required inputs: source water, temp, RH, leaf water model
   [ ] Extract published fractionation factors
   ```

2. **Week 3-4: Model Implementation**
   ```r
   # Pseudocode for mechanistic model
   
   # Step 1: Source water δ18O (precipitation)
   δ18O_source <- precip_d18O_growing_season
   
   # Step 2: Leaf water enrichment (Craig-Gordon model)
   ε_eq <- exp(1137 / (T_leaf + 273.15)^2 - 0.4156 / (T_leaf + 273.15) - 0.0020667)
   ε_k <- 32 * (1 - RH)  # Kinetic fractionation
   δ18O_leaf <- δ18O_source + ε_eq + ε_k
   
   # Step 3: Cellulose synthesis fractionation
   ε_cell <- 27  # ‰ (published value)
   δ18O_cellulose_predicted <- δ18O_leaf + ε_cell
   
   # Step 4: Empirical correction from calibration samples
   residuals <- observed - predicted
   regional_correction <- model_residuals_by_climate_zone(residuals)
   
   δ18O_cellulose_final <- δ18O_cellulose_predicted + regional_correction
   ```

3. **Week 5-6: Calibration**
   ```
   [ ] Extract climate data at calibration sites
   [ ] Run mechanistic model to get predictions
   [ ] Calculate residuals (observed - predicted)
   [ ] Model residuals as f(climate zone, irrigation, etc.)
   [ ] Fit correction function with limited parameters
   ```

4. **Week 7-8: Validation & Documentation**
   ```
   [ ] Cross-validate with leave-one-out or spatial blocking
   [ ] Compare RMSE to pure empirical model
   [ ] Document all fractionation factors and sources
   [ ] Write methods section with proper citations
   ```

**Key Papers to Implement**:

- **Roden et al. (2000)**: Equations 1-5 for cellulose fractionation
- **Craig & Gordon (1965)**: Leaf water enrichment model
- **Barbour & Farquhar (2000)**: Cotton-specific leaf water factors
- **Bögelein et al. (2012)**: Updated cellulose fractionation factors

---

## 🎯 Recommended Path: Hybrid Approach

**Combine A + C with eventual B**

### Phase 1 (Immediate - 1 month): Path A + C
1. Request published data from Meier-Augenstein and others
2. Implement mechanistic model framework
3. Use existing 32 samples (if all valid) + any acquired data
4. Publish preliminary model with clear uncertainty estimates

### Phase 2 (3-6 months): Path B - Sample Collection
1. Design sampling campaign for 75-100 samples
2. Secure funding and partnerships
3. Collect and analyze reference samples
4. Validate against Phase 1 model

### Phase 3 (6-12 months): Model Refinement
1. Refit mechanistic-empirical model with full dataset
2. Implement cross-validation and uncertainty quantification
3. Publish peer-reviewed paper with full methods
4. Release calibration data as supplementary material

---

## Debug Current Dataset First

Before collecting new data, understand why only 10/32 samples were used:

```r
# Run this diagnostic script
library(terra)

# Load calibration data
calib <- read.csv("data_raw/calibration/cotton_calibration_enhanced.csv")
cat("Total samples in CSV:", nrow(calib), "\n")

# Load climate rasters
precip <- rast("data_proc/precip_d18O_growing_season.tif")
temp <- rast("data_proc/tmean_monthly.tif")

# Extract climate at sample locations
coords <- calib[, c("lon", "lat")]
calib$precip_d18O <- extract(precip, coords)[,2]
calib$tmean <- extract(mean(temp), coords)[,2]

# Check for NA values
calib$has_climate_data <- !is.na(calib$precip_d18O) & !is.na(calib$tmean)
cat("\nSamples with valid climate data:", sum(calib$has_climate_data), "\n")
cat("Samples with NA climate data:", sum(!calib$has_climate_data), "\n")

# Show which samples are excluded
if (sum(!calib$has_climate_data) > 0) {
  cat("\nExcluded samples:\n")
  print(calib[!calib$has_climate_data, c("sample_id", "lat", "lon", "precip_d18O", "tmean")])
}

# Check if coordinates are valid
calib$valid_coords <- !is.na(calib$lat) & !is.na(calib$lon) & 
                       calib$lat >= -90 & calib$lat <= 90 &
                       calib$lon >= -180 & calib$lon <= 180
cat("\nSamples with invalid coordinates:", sum(!calib$valid_coords), "\n")

# Summary
cat("\n=== SUMMARY ===\n")
cat("Available for model:", sum(calib$has_climate_data & calib$valid_coords), "\n")
cat("Should be using:", nrow(calib) - 1, "(assuming last row is empty)\n")
cat("Currently using:", 10, "(per model_params.json)\n")
cat("DISCREPANCY:", (nrow(calib) - 1) - 10, "samples\n")
```

**Expected Issues**:
1. Last row of CSV is empty (row 33)
2. Some samples fall in ocean/NA regions in coarse resolution rasters
3. High-elevation samples (PE_001 at 3400m) may be outside climate data bounds
4. Coordinate typos or sign errors

**Fixes**:
```r
# In model_fit.R, add:
calib <- calib[!is.na(calib$d18O_cellulose), ]  # Remove empty rows
calib <- calib[complete.cases(calib[, c("lat", "lon", "d18O_cellulose")]), ]  # Only valid data

# After climate extraction:
calib_valid <- calib[complete.cases(calib[, c("precip_d18O", "tmean")]), ]
cat("Using", nrow(calib_valid), "of", nrow(calib), "samples\n")
```

---

## Success Metrics

### Minimum Acceptable (3 months)
- [ ] 30+ samples with documented sources
- [ ] All samples have valid climate data extraction
- [ ] Proper citations for data sources
- [ ] Cross-validation RMSE < 2.0‰

### Target (6 months)
- [ ] 50+ samples spanning major production regions
- [ ] Mechanistic-empirical hybrid model implemented
- [ ] Published methods with peer-reviewed references
- [ ] Independent validation set shows RMSE < 1.5‰

### Ideal (12 months)
- [ ] 75-100 samples collected and analyzed
- [ ] Multi-year samples from key locations
- [ ] Regional submodels for major producers
- [ ] Peer-reviewed publication submitted
- [ ] Open-access calibration database released

---

## Risk Mitigation

### Risk: Cannot acquire published data
**Mitigation**: Implement Path C mechanistic model that requires fewer samples

### Risk: Sample collection too expensive
**Mitigation**: Partner with research institutions; use archived samples; phased approach

### Risk: Model performs poorly even with more data
**Mitigation**: Investigate additional predictors (irrigation, soil type, growth form)

### Risk: Legal/IP issues with FloraTrace proprietary data
**Mitigation**: Separate public calibration from proprietary methods; publish only methodology

---

## Next Immediate Actions (This Week)

1. [ ] Run diagnostic script above to understand n=10 issue
2. [ ] Download and read Meier-Augenstein (2014) paper
3. [ ] Draft email to request data from authors
4. [ ] Document source of existing 32 samples (ask Chris Stantis?)
5. [ ] Check if existing samples have analytical replicates
6. [ ] Review model_fit.R code for sample filtering logic

---

## Questions to Answer

1. Who collected the existing 32 samples and when?
2. What lab analyzed them and what was the reported precision?
3. Why does model_params.json show n=10 instead of n=32?
4. Are there any unpublished FloraTrace datasets that could be added?
5. What is the acceptable uncertainty for cotton provenance applications?
6. Is there budget for collecting new reference samples?
7. Are there legal restrictions on publishing the calibration data?

---

**Document prepared**: October 2025  
**Next review**: After diagnostic script results  
**Owner**: IsoscapeBuild team




