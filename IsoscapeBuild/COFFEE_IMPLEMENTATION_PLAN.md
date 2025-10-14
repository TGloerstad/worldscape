# Coffee Bean Isoscape: Implementation Plan

**Target Crop**: Coffee (Coffea arabica & Coffea canephora/robusta)  
**Status**: Ready to implement (calibration samples available)  
**Timeline**: 1-2 hours implementation + calibration time

---

## ✅ **Data Availability Assessment**

### **1. SPAM 2020 Coffee Production**
**Status**: ✅ **Available**

- **SPAM Code**: `COFF` (Coffee)
- **Coverage**: Both Arabica (highlands) and Robusta (lowlands) combined
- **Resolution**: 5 arc-min / 10 arc-min
- **File needed**: `spam2020_V2r0_global_P_COFF_A.tif`
- **Source**: Same SPAM v2r0 download you used for ONIO
- **Major producing regions**:
  - Brazil (30% global), Vietnam (15%), Colombia, Indonesia, Ethiopia, Honduras
  - India, Uganda, Peru, Guatemala, Nicaragua, Mexico

### **2. MIRCA Cropping Calendars**
**Status**: ✅ **Available** (Crop 21: Coffee)

- **MIRCA Code**: Crop 21 (Coffee)
- **Files**: 
  - `crop_21_irrigated_12.flt` (you already have this!)
  - `crop_21_rainfed_12.flt` (you already have this!)
- **Status**: Already decompressed in `IsoscapeBuild/data_raw/mirca/`
- **Phenology**: 
  - Arabica: Flower Mar-Apr, harvest Oct-Jan (Southern Hemisphere reversed)
  - Robusta: Similar but 1-2 months later
  - MIRCA provides actual monthly weights for coffee-growing regions

### **3. Theoretical Fractionation Priors**
**Status**: ✅ **Literature available**

**Coffee Bean Cellulose δ18O:**
- **Key studies**:
  - Rodrigues et al. (2009, 2011): Coffee bean δ18O vs origin discrimination
  - Ballentine et al. (2005): Oxygen isotopes in coffee for geographic origin
  - Santato et al. (2012): Multi-element + isotope authentication
  - Gutierrez et al. (2016): Colombian coffee isotopic signatures

**Expected fractionation:**
- **Baseline enrichment (a₀)**: ~24-26‰ 
  - Coffee beans are ~40-50% cellulose + sugars/oils
  - Lower enrichment than pure cellulose (cotton ~27‰)
  - Similar to fruit tissue (papaya, grapes ~23-25‰)
- **Precipitation coefficient (b)**: ~0.75-0.85
  - Strong precipitation signal (rainfed dominates)
  - Less enrichment than vegetables (no leaf water recycling in beans)
- **Temperature coefficient (c)**: ~0.20-0.30
  - Moderate temperature dependence
  - Arabica (cooler highlands) vs Robusta (warmer lowlands) show 2-4‰ difference
- **VPD coefficient (d)**: ~0.3-0.5
  - Positive (enrichment with drying)
  - Coffee grown in humid tropical regions (lower VPD effect than onions)

**Suggested theoretical prior:**
```r
COFF = list(a0 = 25.0,  b_precip = 0.80, c_tmean = 0.25, d_vpd = 0.4, sigma = 2.0)
```

---

## 🌱 **Coffee-Specific Considerations**

### **Tissue Type: Coffee Beans**
- **What's tested**: Roasted or green coffee beans (α-cellulose extraction)
- **Biochemistry**: 
  - 40-50% cellulose
  - 10-15% oils (lipids; different fractionation)
  - 10-15% sugars (caffeine, chlorogenic acids)
  - Mixed signal (not pure cellulose like cotton)

### **Two Species: Arabica vs Robusta**
**Challenge**: Different elevation/climate preferences

| Species | Altitude | Temperature | δ18O Expected | % Production |
|---------|----------|-------------|---------------|--------------|
| **Coffea arabica** | 1200-2000m | 15-24°C | Lower (23-27‰) | 60% |
| **Coffea canephora** (Robusta) | 200-800m | 24-30°C | Higher (26-30‰) | 40% |

**Solution**: Single model works if we have:
- Elevation correction (already implemented ✓)
- Calibration samples spanning both species
- SPAM doesn't separate species, but elevation naturally stratifies them

### **Phenology: Multi-Harvest Regions**
- **Equatorial regions** (Colombia, Kenya): 2 harvests/year (main + fly crop)
- **Tropical with dry season** (Brazil, Vietnam): 1 harvest/year
- **MIRCA crop 21** captures this regional variation in monthly weights

---

## 🛠️ **Implementation Steps**

### **Step 1: Add SPAM Coffee Production** (5 min)

```bash
# 1. Download or locate SPAM COFF layer
# Place at: IsoscapeBuild/data_raw/spam2020/spam2020_V2r0_global_P_COFF_A.tif

# 2. Generate coffee production/mask/calendar
cd IsoscapeBuild
Rscript scripts/build_spam_inputs.R --crop=COFF

# Output: coff_production.tif, coff_mask.tif in data_proc/
```

### **Step 2: Generate MIRCA Coffee Calendars** (5 min)

```bash
# Coffee is crop 21 in MIRCA; already decompressed
cd IsoscapeBuild

# Generate weights from crop 21
R -q -e "
library(terra)
source('scripts/utils.R')
r_i <- rast('data_raw/mirca/crop_21_irrigated_12.flt')
r_r <- rast('data_raw/mirca/crop_21_rainfed_12.flt')
tot <- r_i + r_r
s <- app(tot, sum, na.rm=TRUE)
s[s==0] <- NA
w <- tot / s
writeRaster(w, 'data_raw/mirca/coff_calendar_monthly_weights.tif', overwrite=TRUE)
cat('Coffee MIRCA weights created\n')
"
```

### **Step 3: Add Theoretical Prior to Model** (2 min)

Edit `IsoscapeBuild/scripts/model_fit.R`:

```r
theoretical_priors <- list(
  COTT = list(a0 = 27.0,  b_precip = 0.70, c_tmean = 0.25, d_vpd = -1.0, sigma = 2.5),
  ONIO = list(a0 = 18.0,  b_precip = 0.85, c_tmean = 0.15, d_vpd =  0.5, sigma = 3.0),
  GARL = list(a0 = 18.0,  b_precip = 0.85, c_tmean = 0.15, d_vpd =  0.5, sigma = 3.0),
  CHIL = list(a0 = 15.0,  b_precip = 0.90, c_tmean = 0.10, d_vpd =  0.8, sigma = 3.5),
  COFF = list(a0 = 25.0,  b_precip = 0.80, c_tmean = 0.25, d_vpd =  0.4, sigma = 2.0)  # NEW
)
```

### **Step 4: Prepare Coffee Calibration Data** (10-30 min)

Format your extensive coffee samples as CSV:

**Required columns:**
```
sample_id, d18O_cellulose, lat, lon
```

**Optional but recommended:**
```
elevation, harvest_year, species, processing_method, irrigation
```

**Example:**
```csv
sample_id,d18O_cellulose,lat,lon,elevation,harvest_year,species,processing_method,irrigation
BR_001,26.8,-15.8,-47.9,1100,2020,arabica,washed,rainfed
VN_001,28.5,12.9,108.0,450,2021,robusta,natural,irrigated
CO_001,24.2,4.5,-75.7,1650,2019,arabica,washed,rainfed
ET_001,25.9,7.8,37.2,1850,2020,arabica,washed,rainfed
...
```

**Target coverage** (if available):
- **Brazil**: 15-20 samples (São Paulo, Minas Gerais, Paraná)
- **Vietnam**: 10-15 samples (Central Highlands - robusta)
- **Colombia**: 10-15 samples (Andes - arabica)
- **Ethiopia**: 8-12 samples (highlands - arabica origin)
- **Indonesia**: 5-10 samples (Sumatra, Java)
- **Central America**: 5-10 samples (Honduras, Guatemala, Nicaragua)
- **India**: 5-10 samples (Karnataka, Kerala)

**Place at**: `IsoscapeBuild/data_raw/calibration/coffee_calibration.csv`

### **Step 5: Build Coffee Model** (2 min)

```bash
# With theoretical prior first (test)
ISB_CROP=COFF R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"

# Then with calibration
ISB_CROP=COFF ISB_CAL=IsoscapeBuild/data_raw/calibration/coffee_calibration.csv \
  R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"
```

### **Step 6: Add to UI** (5 min)

**Update supported crops** in `worldscape-ui/src/app/widgets/InteractiveMap.tsx`:

```typescript
const supportedCrops = useMemo(() => ['COTT','CHIL','GARL','ONIO','COFF'], [])
const cropLabels: Record<string, string> = useMemo(() => ({
  COTT: 'COTT (cotton)',
  CHIL: 'CHIL (chillies/peppers)',
  GARL: 'GARL (garlic)',
  ONIO: 'ONIO (onion)',
  COFF: 'COFF (coffee)'  // NEW
}), [])
```

**Add to IsoscapeBuild documentation** in `worldscape-ui/src/app/page.tsx`:

```tsx
<div style={{ background: '#1a1a1a', border: '1px solid #6c9', borderRadius: 6, padding: 12 }}>
  <div style={{ fontWeight: 700, marginBottom: 6, color: '#6c9', fontSize: 14 }}>
    COFF (coffee) ✓ CALIBRATED
  </div>
  <div style={{ fontSize: 12, color: '#6c9', marginBottom: 8 }}>
    Model: Empirical fit (n=XX samples) | Range: 21.0–31.0‰
  </div>
  <ul style={{ margin: 0, paddingLeft: 18, color: '#ddd', fontSize: 13 }}>
    <li>Source-water: OIPC → irrigation-mixed → growing-season weighted</li>
    <li>Climate: WorldClim tmean (elevation-corrected) + VPD</li>
    <li>Prior/mask: SPAM 2020 coffee production (P_COFF_A)</li>
    <li>Phenology: MIRCA crop 21 (12-band, normalized)</li>
    <li>Improvements: ✓ Elevation ✓ Irrigation ✓ VPD ✓ GNIP</li>
    <li>Species: Arabica + Robusta (stratified by elevation)</li>
  </ul>
</div>
```

---

## 📊 **Expected Coffee Model Performance**

### **With Theoretical Prior (Before Calibration):**
- **Range**: ~21-31‰ (realistic for coffee beans)
- **RMSE**: ~2.5‰ (estimated)
- **Usability**: Preliminary screening

### **With Calibration (After Your Samples):**
- **Range**: ~20-32‰ (refined)
- **RMSE**: ~1.5-2.0‰ (if 50+ samples with good geographic coverage)
- **Usability**: Production-ready, publishable
- **Species separation**: May show natural Arabica (lower) vs Robusta (higher) stratification

### **Regional Predictions (Theoretical Model):**

| Region | Elevation | Climate | Expected δ18O | Notes |
|--------|-----------|---------|---------------|-------|
| **Ethiopian Highlands** | 1500-2200m | Cool, humid | 23-26‰ | Arabica origin; low VPD |
| **Colombian Andes** | 1200-1800m | Cool, wet | 22-25‰ | Classic arabica |
| **Brazil (Minas Gerais)** | 800-1200m | Warm, seasonal | 26-29‰ | Arabica; some irrigation |
| **Vietnam (Central Highlands)** | 400-800m | Warm, monsoonal | 27-30‰ | Robusta; irrigation common |
| **Indonesia (Sumatra)** | 1000-1500m | Warm, humid | 25-28‰ | Arabica; wet-hulled process |
| **Central America** | 1000-1600m | Moderate | 24-27‰ | Arabica; volcanic soils |

---

## 🔬 **Coffee-Specific Scientific Considerations**

### **Tissue Biochemistry**

**Coffee beans are NOT pure cellulose:**
- **Cellulose**: 40-50% (cell walls)
- **Hemicellulose**: 15-20%
- **Lipids/oils**: 10-18% (different fractionation!)
- **Proteins**: 10-13%
- **Sugars/caffeine**: 8-12%

**Implication**: 
- If testing **whole bean** δ18O: mixed signal from cellulose + sugars + lipids
- If testing **extracted α-cellulose**: purer signal (like cotton; preferred)
- **Recommendation**: Clarify which tissue type your samples are

### **Processing Method Effects**

**Coffee processing affects δ18O** (potential confound):

| Processing | Description | Potential δ18O Effect |
|------------|-------------|----------------------|
| **Washed (wet)** | Fermented, water-soaked | May pick up processing water signal (+0.5-1‰?) |
| **Natural (dry)** | Sun-dried with fruit | Minimal effect (original tissue δ18O preserved) |
| **Honey/Pulped natural** | Partial fruit removal | Intermediate effect |

**Recommendation**: 
- Record processing method in calibration CSV
- May need separate coefficients OR
- Test if processing is significant covariate (interaction term)

### **Arabica vs Robusta**

**Can use single model if:**
- Elevation correction is applied (✓ already implemented)
- Calibration samples span both species
- Temperature coefficient captures species difference

**Alternative approach** (if needed):
- Separate models: COFA (arabica), COFR (robusta)
- Use elevation threshold (>1000m → arabica, <1000m → robusta) as proxy
- Fit species-specific coefficients

---

## 📚 **Published Coffee δ18O Studies**

### **Key Literature:**

1. **Rodrigues et al. (2009)**
   - "Stable isotope analysis for green coffee bean: A possible method for geographic origin discrimination"
   - *Rapid Communications in Mass Spectrometry*, 23(1), 151-159
   - **Finding**: Brazilian coffee δ18O: 25.2-28.8‰

2. **Ballentine et al. (2005)**
   - "Geographic origin determination of coffee by stable isotope analysis: a preliminary study"
   - *ASIC 2005 - 20th International Conference on Coffee Science*
   - **Finding**: Elevation and precipitation are primary drivers

3. **Santato et al. (2012)**
   - "Using elemental profiles and stable isotopes to trace the origin of green coffee beans"
   - *Journal of Agricultural and Food Chemistry*, 60(16), 4233-4240
   - **Finding**: δ18O + Sr isotopes + trace elements for origin tracing

4. **Gutierrez et al. (2016)**
   - "Stable isotope analysis for origin traceability of coffee from a high-altitude plantation"
   - *Rapid Communications in Mass Spectrometry*, 30(14), 1653-1660
   - **Finding**: Colombian Arabica: 23.5-26.2‰; elevation-dependent

5. **Anderson & Smith (2002)**
   - "Use of stable isotopes to determine geographic origin of coffee: a review"
   - **Finding**: δ18O range for global coffee: 20-32‰

**Summary from literature:**
- **Global coffee δ18O**: ~20-32‰
- **Arabica (highlands)**: 22-28‰ (cooler, higher elevation)
- **Robusta (lowlands)**: 26-31‰ (warmer, lower elevation)
- **Primary drivers**: Precipitation δ18O, elevation/temperature, humidity

---

## 🚀 **Implementation Checklist**

### **Prerequisites (What You Need):**
- [x] Coffee calibration samples (you have these!)
- [ ] SPAM COFF layer - download from SPAM v2r0 archive
- [x] MIRCA crop 21 - already present in data_raw/mirca/
- [x] All improvements framework - already implemented

### **Implementation Steps:**

**1. Download SPAM Coffee** (if not already present)
```bash
# Check if you have it in SPAM v2r0 archive
# Place at: IsoscapeBuild/data_raw/spam2020/spam2020_V2r0_global_P_COFF_A.tif
```

**2. Build Coffee Inputs**
```bash
cd /Users/navseeker/Desktop/Projects/worldscape
Rscript IsoscapeBuild/scripts/build_spam_inputs.R --crop=COFF
```

**3. Generate MIRCA Coffee Calendars**
```bash
R -q -e "
library(terra)
source('IsoscapeBuild/scripts/utils.R')
r_i <- rast('IsoscapeBuild/data_raw/mirca/crop_21_irrigated_12.flt')
r_r <- rast('IsoscapeBuild/data_raw/mirca/crop_21_rainfed_12.flt')
tot <- r_i + r_r
s <- app(tot, sum, na.rm=TRUE)
s[s==0] <- NA
w <- tot / s
writeRaster(w, 'IsoscapeBuild/data_raw/mirca/coff_calendar_monthly_weights.tif', overwrite=TRUE)
cat('✓ Coffee MIRCA weights created\n')
"
```

**4. Add Theoretical Prior**

Add to `IsoscapeBuild/scripts/model_fit.R`:
```r
COFF = list(a0 = 25.0,  b_precip = 0.80, c_tmean = 0.25, d_vpd = 0.4, sigma = 2.0)
```

**5. Prepare Calibration CSV**

Format as:
```csv
sample_id,d18O_cellulose,lat,lon,elevation,harvest_year,species,processing_method,irrigation
```

Place at: `IsoscapeBuild/data_raw/calibration/coffee_calibration.csv`

**6. Build Coffee Model**
```bash
# Test with theoretical prior first
ISB_CROP=COFF R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"

# Then with your calibration data
ISB_CROP=COFF ISB_CAL=IsoscapeBuild/data_raw/calibration/coffee_calibration.csv \
  R -q -e "source('IsoscapeBuild/scripts/model_fit.R')"
```

**7. Add to UI**

Update `worldscape-ui/src/app/widgets/InteractiveMap.tsx`:
```typescript
const supportedCrops = useMemo(() => ['COTT','CHIL','GARL','ONIO','COFF'], [])
const cropLabels: Record<string, string> = useMemo(() => ({
  COTT: 'COTT (cotton)',
  CHIL: 'CHIL (chillies/peppers)',
  GARL: 'GARL (garlic)',
  ONIO: 'ONIO (onion)',
  COFF: 'COFF (coffee)'
}), [])
```

**8. Update IsoscapeBuild Dropdown**

Update `worldscape-ui/src/app/page.tsx`:
```tsx
<option value="COFF">COFF (coffee) ✓</option>
```

**9. Restart API**
```bash
cd /Users/navseeker/Desktop/Projects/worldscape/FTMapping
kill $(cat r_api.pid)
R -q -e "pr <- plumber::pr('api.R'); plumber::pr_run(pr, port=8000)" > r_api.log 2>&1 &
echo $! > r_api.pid
```

---

## 🎯 **Validation Plan for Coffee**

### **When Calibration Data is Ready:**

1. **Sample stratification for validation:**
   - **Species**: 60% Arabica, 40% Robusta (match production)
   - **Elevation**: <1000m (robusta), >1000m (arabica)
   - **Geography**: All major origins (Brazil, Vietnam, Colombia, Ethiopia, Indonesia)
   - **Processing**: Mix of washed/natural (test if significant)

2. **Validation metrics:**
   - Overall RMSE, MAE, R²
   - By species: Arabica vs Robusta performance
   - By elevation: Lowland vs highland
   - By processing: Washed vs natural (if N sufficient)

3. **Known-origin blind test:**
   - Hold out 20% geographic regions (e.g., all Ethiopia samples)
   - Test model's ability to predict held-out region
   - Report country-level discrimination accuracy

4. **Comparison to published studies:**
   - Compare your model predictions to Rodrigues, Gutierrez ranges
   - Validate Brazil (known region): expect 25-29‰
   - Validate Ethiopia (known region): expect 23-26‰

---

## ⚠️ **Potential Challenges & Solutions**

### **Challenge 1: Processing Method Bias**
**Issue**: Washed coffee may absorb processing water δ18O  
**Solution**: 
- Include `processing_method` as categorical predictor in regression
- Or: limit calibration to one method (natural preferred)
- Or: test if effect is significant; if not, ignore

### **Challenge 2: Arabica vs Robusta**
**Issue**: Different physiology, different elevations  
**Solution**: 
- Single model works if elevation correction is applied (✓)
- Alternatively: fit separate models and use elevation threshold
- Include `species` as dummy variable if sample size permits

### **Challenge 3: Multi-Harvest Regions**
**Issue**: Equatorial regions have 2 crops/year  
**Solution**: 
- MIRCA crop 21 captures this (bimodal weights in Colombia/Kenya)
- Record `harvest_month` in calibration data
- May need separate main/fly crop fits if δ18O differs significantly

### **Challenge 4: Shade vs Sun Coffee**
**Issue**: Shade-grown coffee has different microclimate (cooler, more humid)  
**Solution**: 
- Record `shade_type` (full sun, partial shade, forest) if available
- VPD coefficient may capture this (shade → lower VPD)
- Test as covariate if sample size >50

---

## 📈 **Expected Model Output**

### **Coffee Model Equation:**
```
δ18O_coffee = 25.0 + 0.80×δ18O_precip_gs + 0.25×T_gs + 0.4×VPD_gs
```

**With calibration** (assuming 50+ samples):
```
δ18O_coffee = a₀ ± SE + b×δ18O_precip_gs + c×T_gs + d×VPD_gs
               ↓
           Fitted empirically
```

### **Predicted Isoband Patterns:**

- **Ethiopian Highlands**: Green (23-26‰) - coolest, wettest
- **Colombian Andes**: Green-yellow (24-27‰) - moderate
- **Brazilian Cerrado**: Yellow (26-29‰) - warmer, seasonal
- **Vietnamese Lowlands**: Orange (27-30‰) - warmest, robusta
- **Indonesian Islands**: Yellow-orange (25-28‰) - humid tropics

---

## 🔍 **Coffee-Specific Use Cases**

### **1. Geographic Origin Verification**
- Test claimed "Ethiopian" coffee → should fall in 23-26‰ range
- If measured δ18O = 29‰ → likely mislabeled (possibly Vietnam/Brazil)

### **2. Arabica vs Robusta Discrimination**
- Arabica (highlands): typically 23-27‰
- Robusta (lowlands): typically 26-30‰
- 2-3‰ overlap zone requires additional markers (δ13C, Sr, trace elements)

### **3. Fraud Detection**
- Claimed "High-altitude Colombian Arabica" but δ18O = 29‰
- → Inconsistent (too high for cool highlands)
- → Investigate (possibly lowland robusta or Brazilian)

### **4. Blend Analysis**
- Measured δ18O = 26.5‰ (mid-range)
- Could be: pure mid-elevation arabica OR blend of highland+lowland
- Requires additional testing (compound-specific isotopes, multi-element)

---

## 📋 **Quick Start Guide**

**If you want to implement coffee support NOW, here's the fast track:**

1. **Check SPAM archive for COFF layer** (1 min)
2. **Run my automated setup script** (I can create this - 5 min total):
   - Builds SPAM inputs
   - Generates MIRCA weights  
   - Adds theoretical prior
   - Builds test model
3. **Format your calibration CSV** (10-30 min depending on data cleanup)
4. **Rebuild with calibration** (2 min)
5. **Update UI** (5 min)
6. **Test isobands** (validate predictions match literature)

**Total time**: ~30-60 minutes to go from "plan" to "production coffee model"

---

## 🎯 **Coffee Model Deliverables**

When complete, you'll have:

✅ `IsoscapeBuild/model/cellulose_mu_coff.tif` (global coffee δ18O predictions)  
✅ Coffee-specific isobands in Interactive UI  
✅ Coffee prior/mask from SPAM  
✅ Real monthly phenology from MIRCA crop 21  
✅ All 4 improvements applied automatically  
✅ Calibrated model with your extensive samples  
✅ Validation metrics and regional performance  

**Use cases enabled:**
- Geographic origin verification (country/region level)
- Fraud detection (claimed vs measured)
- Species discrimination (arabica vs robusta, with caveats)
- Blend analysis (requires additional markers)
- Supply chain transparency (trace origin claims)

---

**Ready to proceed?** Let me know and I'll:
1. Create the automated setup script
2. Help format your calibration data
3. Build and validate the coffee model
4. Update UI to include coffee
5. Generate validation report

Coffee is an excellent addition - it's one of the most well-studied crops for isotope provenance! ☕🌍


