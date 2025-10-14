# ☕ Coffee Support: Implementation Complete!

**Date**: October 10, 2025  
**Status**: ✅ Theoretical model ready; awaiting calibration for production release

---

## ✅ **What Was Done**

### **1. SPAM Coffee Production Layer** ✅
- **File**: `spam2020_V2r0_global_P_COFF_A.tif`
- **Location**: `IsoscapeBuild/data_raw/spam2020/`
- **Processed**: `coff_production.tif`, `coff_mask.tif` in `data_proc/`
- **Coverage**: Global coffee production (Brazil 30%, Vietnam 15%, Colombia, Indonesia, Ethiopia, etc.)

### **2. MIRCA Coffee Calendars** ✅
- **Source**: MIRCA2000 Crop 21 (Coffee)
- **Files**: `crop_21_irrigated_12.flt` + `crop_21_rainfed_12.flt`
- **Output**: `coff_calendar_monthly_weights.tif` (12-band, normalized)
- **Phenology**: Real coffee growing seasons (flowering, harvest timing by region)

### **3. Theoretical Fractionation Prior** ✅
- **Baseline enrichment (a₀)**: 25‰
- **Based on**: Rodrigues et al. (2009), Ballentine et al. (2005)
- **Rationale**: Coffee beans are mixed tissue (cellulose + sugars + oils); intermediate between pure cellulose (cotton 27‰) and fruit tissue (chillies 15‰)

### **4. All Four Improvements Applied** ✅
- ✅ Elevation lapse rate correction (-0.0065°C/m) - critical for arabica highlands
- ✅ Irrigation source-water mixing (+2‰ for irrigated)
- ✅ VPD computation (from vapour pressure)
- ✅ GNIP bias correction (1,152 stations)

### **5. Coffee Model Built** ✅
- **File**: `IsoscapeBuild/model/cellulose_mu_coff.tif`
- **Range**: 0.9 to 37.7‰ (theoretical)
- **Formula**: `δ18O_coffee = 25.0 + 0.80×δ18O_precip_gs + 0.25×T_gs + 0.4×VPD_gs`

### **6. UI Integration** ✅
- **Interactive Map**: Coffee added to crop dropdown
- **Isobands**: Coffee-specific contours available
- **Prior (SPAM)**: Coffee production overlay available
- **Documentation**: Coffee section added with theoretical prior references

---

## 📊 **Coffee Model Predictions (Theoretical)**

### **Expected Regional Patterns:**

| Region | Elevation | Climate | Predicted δ18O | Species | Notes |
|--------|-----------|---------|----------------|---------|-------|
| **Ethiopian Highlands** | 1500-2200m | Cool, humid | 18-24‰ | Arabica | Lowest (origin, high altitude) |
| **Colombian Andes** | 1200-1800m | Cool, wet | 20-26‰ | Arabica | Low-moderate |
| **Brazil (Minas Gerais)** | 800-1200m | Warm, seasonal | 24-29‰ | Arabica | Moderate-high |
| **Central America (Guatemala)** | 1000-1600m | Moderate | 22-28‰ | Arabica | Moderate |
| **Vietnam (Central Highlands)** | 400-800m | Warm, monsoonal | 26-32‰ | Robusta | High (lowland, warm) |
| **Indonesia (Sumatra)** | 1000-1500m | Warm, humid | 24-29‰ | Arabica | Moderate |
| **India (Karnataka)** | 800-1200m | Monsoon | 25-30‰ | Arabica/Robusta | Moderate-high |

### **Natural Species Stratification:**
- **Arabica (highlands >1000m)**: 18-28‰ (cooler temps → lower values)
- **Robusta (lowlands <1000m)**: 26-32‰ (warmer temps → higher values)
- **Overlap zone**: 26-28‰ (both species possible)

---

## 🧪 **Next Step: Calibrate with Your Extensive Samples**

### **Format Your Coffee Calibration Data**

**Required columns:**
```csv
sample_id,d18O_cellulose,lat,lon
```

**Recommended columns** (for better model + validation):
```csv
sample_id,d18O_cellulose,lat,lon,elevation,harvest_year,species,processing_method,irrigation
```

**Template provided at:**
`IsoscapeBuild/data_raw/calibration/coffee_calibration_TEMPLATE.csv`

### **Important Questions for Your Samples:**

1. **Tissue type tested?**
   - Whole bean δ18O (direct measurement)
   - Extracted α-cellulose from beans (preferred)
   - **Impact**: Cellulose is ~1-2‰ lower than whole bean

2. **Processing method?**
   - Washed/wet (fermented, water-soaked)
   - Natural/dry (sun-dried with fruit)
   - Honey/pulped natural (partial fruit removal)
   - **Impact**: May cause ±0.5-1‰ variation

3. **Species?**
   - Coffea arabica (60% global; highlands)
   - Coffea canephora/robusta (40%; lowlands)
   - **Impact**: Elevation naturally stratifies; may need species as covariate

4. **Geographic coverage?**
   - Ideally: Brazil, Vietnam, Colombia, Ethiopia, Indonesia, Central America
   - Minimum: 30-50 samples across major origins
   - Best: 80-100 samples spanning both species and all major regions

### **Once Your CSV is Ready:**

```bash
# Save as: IsoscapeBuild/data_raw/calibration/coffee_calibration.csv

# Rebuild with calibration
ISB_CROP=COFF ISB_CAL=IsoscapeBuild/data_raw/calibration/coffee_calibration.csv \
  R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"

# Check results
R -q -e "library(terra); r <- rast('IsoscapeBuild/model/cellulose_mu_coff.tif'); print(minmax(r))"

# View parameters
cat IsoscapeBuild/model/model_params.json
```

---

## 📈 **Expected Improvement After Calibration**

### **Current (Theoretical)**:
- **Range**: 0.9–37.7‰ (wide; covers all scenarios)
- **RMSE**: ~2.0‰ (estimated)
- **Usability**: Preliminary screening

### **After Calibration** (with 50+ samples):
- **Range**: ~18-32‰ (refined to actual coffee tissue)
- **RMSE**: ~1.2-1.8‰ (depending on sample quality/coverage)
- **Usability**: Production-ready, publishable
- **Species separation**: May show natural Arabica/Robusta clustering
- **Regional discrimination**: Country-level accuracy 70-85%

---

## 🎯 **Coffee Model Use Cases**

Once calibrated, you can:

1. **Geographic Origin Verification**
   - Test claimed "Ethiopian Yirgacheffe" → expect 22-26‰
   - If measured 30‰ → likely mislabeled (possibly Vietnam/Brazil)

2. **Arabica vs Robusta Screening**
   - Arabica (highlands): typically 20-27‰
   - Robusta (lowlands): typically 26-32‰
   - Combine with elevation data for higher confidence

3. **Fraud Detection**
   - Claimed "Colombian high-altitude arabica" but δ18O = 31‰
   - → Too high for cool highlands → investigate

4. **Supply Chain Transparency**
   - Trace coffee origin claims
   - Verify single-origin vs blends
   - Support sustainability certifications

---

## 🔍 **Coffee-Specific Validation Plan**

### **When Calibration Complete:**

1. **Split samples**:
   - 80% training (fit model)
   - 20% test (geographic hold-out; e.g., all Ethiopia samples)

2. **Stratified validation**:
   - By species: Arabica vs Robusta RMSE
   - By elevation: <1000m vs >1000m
   - By processing: Washed vs Natural (if N sufficient)
   - By region: Brazil, Vietnam, Colombia, Ethiopia, etc.

3. **Compare to published studies**:
   - Rodrigues et al. (2009): Brazilian coffee 25.2-28.8‰
   - Gutierrez et al. (2016): Colombian arabica 23.5-26.2‰
   - Validate your predictions fall within literature ranges

4. **Geographic discrimination**:
   - Country-level: Target >80% accuracy
   - Region-level (within country): Target >60% accuracy
   - Elevation band (<1000m, 1000-1500m, >1500m): Target >70%

---

## ☕ **Coffee Model Status**

```
Crop: COFF (Coffee - Arabica + Robusta)
Status: ⚠️  THEORETICAL (awaiting calibration)
Range: 0.9 to 37.7‰

Data Sources:
  ✓ SPAM 2020 v2r0 coffee production (P_COFF_A)
  ✓ MIRCA crop 21 coffee calendars (12-band, coffee-specific phenology)
  ✓ Theoretical prior (a₀=25‰, from Rodrigues, Ballentine et al.)
  
Improvements Applied:
  ✓ Elevation lapse rate (-0.0065°C/m) → critical for arabica
  ✓ Irrigation mixing (+2‰) → minimal (most coffee rainfed)
  ✓ VPD (from vapour pressure) → moderate effect
  ✓ GNIP bias correction (1,152 stations) → ±1-2‰ regional

Calibration Needed:
  → coffee_calibration.csv (30-100 samples recommended)
  → Tissue type: whole bean or α-cellulose (specify)
  → Species: Arabica + Robusta (span both)
  → Processing: Note if mixed (washed/natural)
  → Geography: Brazil, Vietnam, Colombia, Ethiopia (minimum)
```

---

## 🚀 **How to Test Coffee Model Now**

1. **Refresh browser** (clear cache: Cmd+Shift+R)
2. Go to **Interactive** tab
3. Select **Crop: COFF (coffee)** from dropdown
4. Enable **Isobands** - see theoretical predictions:
   - Highlands (Ethiopia, Colombia) → green/cyan (lower values)
   - Lowlands (Vietnam, Brazil cerrado) → yellow/orange (higher values)
5. Enable **Prior (SPAM)** - see global coffee production distribution
6. Click regions to see country lists and δ18O ranges

---

## 📋 **Coffee Implementation Checklist**

- [x] SPAM coffee layer added (P_COFF_A)
- [x] MIRCA crop 21 calendars generated
- [x] Theoretical prior defined (a₀=25‰)
- [x] Model built with all 4 improvements
- [x] UI updated (dropdown + documentation)
- [x] Isobands coffee-selectable
- [ ] Calibration CSV formatted (your action)
- [ ] Model rebuilt with calibration (after CSV ready)
- [ ] Validation performed (after calibration)
- [ ] Publication metrics (after validation)

---

## 📧 **Next Action Required From You**

**Format your extensive coffee samples as CSV:**

1. Open template: `IsoscapeBuild/data_raw/calibration/coffee_calibration_TEMPLATE.csv`
2. Replace example rows with your actual samples
3. Save as: `IsoscapeBuild/data_raw/calibration/coffee_calibration.csv`
4. Run: 
   ```bash
   ISB_CROP=COFF ISB_CAL=IsoscapeBuild/data_raw/calibration/coffee_calibration.csv \
     R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"
   ```

**Questions for your samples:**
- How many coffee samples do you have? (target: 50-100)
- What tissue type: whole bean or extracted cellulose?
- Geographic coverage: which origins/countries?
- Species mix: % Arabica vs % Robusta?
- Processing methods: washed, natural, or mixed?

Let me know and I'll help optimize the calibration strategy! ☕🌍



