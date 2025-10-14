# Multi-Crop Isoscape Implementation Plan
**Target Crops**: Cotton, Paprika, Garlic, Onion

---

## 📊 Current Data Sources Assessment

### ✅ **Available Data (Already Implemented)**

| Data Source | Current Status | Coverage | Quality |
|-------------|----------------|----------|---------|
| **OIPC precipitation δ18O** | ✓ Implemented | Global, 10 arc-min | High |
| **WorldClim 2.1 Temperature** | ✓ Implemented | Global, 10 arc-min | High |
| **WorldClim 2.1 Vapor Pressure** | ✓ Implemented | Global, 10 arc-min | High |
| **SPAM 2020 Production** | ✓ Cotton only | Global, 10 arc-min | High |
| **MIRCA Cropping Calendars** | ✓ Cotton only | Global, 5 arc-min | Medium |

### 🔄 **Needs Extension for New Crops**

| Crop | SPAM 2020 Code | MIRCA Code | Availability |
|------|----------------|------------|--------------|
| **Cotton** | COTT | Cotton | ✓ Already implemented |
| **Paprika** | CHIL (Chili/Pepper) | Vegetables | ✓ Available |
| **Garlic** | ORTS (Other crops) | Vegetables | ⚠️ Bundled with onions |
| **Onion** | ORTS (Other crops) | Vegetables | ⚠️ Bundled with garlic |

**Note**: SPAM groups garlic/onion together in "Other crops". We'll need to separate them using additional data or use combined.

### 🆕 **Data to Add**

| Data Type | Source | Purpose | Status |
|-----------|--------|---------|--------|
| **VPD/RH calculation** | Derive from WorldClim | Evaporative enrichment | Can be computed |
| **Solar radiation** | WorldClim 2.1 | Photosynthesis/evaporation | Available to download |
| **Soil moisture** | TerraClimate / GLDAS | Irrigation effects | Optional enhancement |
| **Elevation** | SRTM / GMTED | Temperature correction | Available |

---

## 🌾 Crop-Specific Requirements

### **1. Cotton (Gossypium)**
- **Tissue**: Cotton fiber (cellulose)
- **Current Status**: ✓ Implemented
- **Growing Season**: Summer (varies by region)
- **Isotope Source**: Precipitation during boll formation
- **Key Factors**: Temperature, precipitation δ18O, VPD
- **Calibration Samples**: 32 samples (10 currently used)

---

### **2. Paprika (Capsicum annuum)**
- **Tissue**: Dried fruit pericarp
- **Biochemistry**: Sugars, carotenoids, cell wall (not pure cellulose)
- **Growing Season**: Warm season (spring-summer planting, summer-fall harvest)
- **Isotope Incorporation**: During fruit development and ripening
- **Key Physiological Differences**:
  - C3 photosynthesis (like cotton)
  - High transpiration during fru
