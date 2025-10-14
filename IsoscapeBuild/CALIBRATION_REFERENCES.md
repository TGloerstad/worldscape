# Cotton Cellulose δ18O Calibration: Academic References & Data Sources

## Executive Summary

The current `cotton_calibration_enhanced.csv` dataset appears to be proprietary/unpublished data. This document compiles published academic references that could provide properly cited calibration data for cotton cellulose oxygen isotope models.

---

## 🎯 Priority References for Cotton-Specific Data

### 1. **Cotton Geographic Origin Studies**

#### Meier-Augenstein et al. (2014)
**"Discrimination of Unprocessed Cotton on the Basis of Geographic Origin Using Multi-Element Stable Isotope Signatures"**

- **Key Value**: Directly analyzes cotton samples with multi-element isotope signatures (likely including δ18O, δ13C, δ2H, δ15N)
- **Geographic Coverage**: Multiple cotton-producing regions
- **Application**: Geographic authentication and provenance determination
- **Access**: 
  - PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC11609901/
  - ResearchGate: https://www.researchgate.net/publication/260108237

**Action**: This is your best source for cotton-specific calibration data. Contact authors for raw data or supplementary materials.

---

## 📚 Foundational Methodology Papers

### 2. **Cellulose Oxygen Isotope Analysis Standards**

#### Loader et al. (1997)
**"Oxygen Isotope Analysis of Cellulose: An Interlaboratory Comparison"**

- **Key Value**: Establishes analytical standards and inter-laboratory calibration
- **Application**: Quality control and methodological validation
- **Citation**: Analytical Chemistry
- **Access**: https://pubs.acs.org/doi/10.1021/ac971022f

#### Werner & Brand (2001)
**"Carbon and Oxygen Isotope Working Standards from C3 and C4 Photosynthates"**

- **Key Value**: Reference materials for C3 plants (cotton is C3)
- **Application**: Calibration standards for IRMS analysis
- **Citation**: PMID: 16870558
- **Access**: https://pubmed.ncbi.nlm.nih.gov/16870558/

### 3. **Cellulose Extraction Methods**

#### Gaudinski et al. (2005)
**"Comparison of Cellulose Extraction Methods for Analysis of Stable Isotope Ratios of Carbon and Oxygen in Plant Material"**

- **Key Value**: Evaluates extraction protocols that affect isotope measurements
- **Application**: Ensuring consistent sample preparation
- **Citation**: Tree Physiology, 25(5), 563-572
- **Access**: https://academic.oup.com/treephys/article-pdf/25/5/563/4787137/25-5-563.pdf

---

## 🌍 Precipitation Isotope Data (Model Inputs)

### 4. **OIPC/WaterIsotopes Database**

#### Bowen & Revenaugh (2003)
**"Interpolating the Isotopic Composition of Modern Meteoric Precipitation"**

- **Key Value**: Foundational paper for OIPC precipitation δ18O grids
- **Citation**: Water Resources Research, 39(10)
- **DOI**: 10.1029/2003WR002086

#### Bowen et al. (2005)
**"Global Application of Stable Hydrogen and Oxygen Isotopes to Wildlife Forensics"**

- **Key Value**: Application of precipitation isoscapes to biological tissues
- **Citation**: Oecologia, 143, 337-348
- **DOI**: 10.1007/s00442-004-1813-y

**Note**: Your model uses OIPC data from https://wateriso.utah.edu - these papers provide the scientific basis and validation.

---

## 🔬 Mechanistic Models (Theoretical Framework)

### 5. **Plant Cellulose Fractionation Theory**

#### Roden et al. (2000)
**"A Mechanistic Model for Interpretation of Hydrogen and Oxygen Isotope Ratios in Tree-Ring Cellulose"**

- **Key Value**: Mechanistic understanding of cellulose δ18O fractionation
- **Citation**: Geochimica et Cosmochimica Acta, 64(1), 21-35
- **Application**: Theoretical basis for relating precipitation/leaf water to cellulose

#### Barbour (2007)
**"Stable Oxygen Isotope Composition of Plant Tissue: A Review"**

- **Key Value**: Comprehensive review of δ18O in plant tissues
- **Citation**: Functional Plant Biology, 34(2), 83-94
- **Application**: Understanding temperature, humidity, and source water effects

#### Sternberg et al. (2006)
**"Oxygen Stable Isotope Ratios of Tree-Ring Cellulose: The Next Phase of Understanding"**

- **Key Value**: Advances in mechanistic understanding
- **Citation**: New Phytologist, 181(3), 553-562
- **Application**: Linking climate variables to cellulose δ18O

**Note**: The "West model" mentioned in your code likely refers to work by **Jason West** or builds on these mechanistic frameworks. Search for "West + cellulose + oxygen isotope" in botanical/ecological journals.

---

## 🧪 Geographic Assignment Methods

### 6. **assignR Package & Methodology**

#### Wasser et al. (2007)
**"The Use of Stable Isotopes to Determine the Geographic Origin of Wildlife"**

- **Key Value**: Foundational paper for isotope-based geographic assignment
- **Citation**: Wildlife Society Bulletin, 35(3)
- **Application**: Bayesian assignment methodology

#### Ehleringer et al. (2008)
**"Hydrogen and Oxygen Isotope Ratios in Human Hair Are Related to Geography"**

- **Key Value**: Demonstrates precipitation isoscape → tissue isotope relationships
- **Citation**: PNAS, 105(8), 2788-2793
- **Application**: Model framework for geographic assignment

#### Ma et al. (2020)
**"assignR: An R Package for Isotope-Based Geographic Assignment"**

- **Key Value**: Software documentation for the package your code uses
- **Citation**: Methods in Ecology and Evolution, 11(8), 996-1001
- **DOI**: 10.1111/2041-210X.13426
- **Access**: CRAN documentation and paper

---

## 📊 Recommendations for Building Calibration Dataset

### Option 1: Contact Authors for Existing Data

**Highest Priority Contacts:**

1. **Meier-Augenstein et al.** - Request raw cotton isotope data and sample metadata
2. **FloraTrace colleagues** - Check for unpublished datasets or ongoing studies
3. **Textile authentication labs** - Forensic labs may have reference collections

### Option 2: Collect New Reference Samples

**Design Principles:**

- **Sample Size**: Minimum 50-100 globally distributed samples (current n=10 is insufficient)
- **Geographic Coverage**: 
  - Major producers: India, China, USA, Brazil, Pakistan, Turkey, Uzbekistan
  - Include both rainfed and irrigated systems
  - Span climatic gradients (hot/cold, wet/dry)

- **Required Metadata**:
  - GPS coordinates (lat/lon)
  - Harvest year and month
  - Variety/cultivar
  - Irrigation status
  - Elevation
  - Known source precipitation δ18O (if available)

- **Sample Type**: Standardize on same tissue (e.g., fiber vs. leaf vs. seed)

### Option 3: Synthetic Dataset from Theory

**Method**: Use mechanistic models to generate training data

1. Start with Roden/Barbour cellulose fractionation model
2. Input known precipitation δ18O, temperature, humidity
3. Generate predicted cellulose δ18O for global cotton regions
4. Validate against limited reference samples
5. Adjust mechanistic parameters based on validation

**Advantages**: 
- Process-based, extrapolates better
- Documented theoretical basis
- Can cite published fractionation factors

**Disadvantages**:
- May not capture crop-specific effects
- Requires validation with real cotton data

---

## 🔍 Additional Search Strategies

### Keywords for Literature Searches

**Cotton-Specific:**
```
"cotton" AND ("oxygen isotope" OR "δ18O" OR "delta-18-O")
"cotton cellulose" AND "provenance"
"cotton authentication" AND "stable isotope"
"Gossypium" AND "oxygen isotope"
```

**General Plant Cellulose:**
```
"plant cellulose" AND "oxygen isotope" AND "precipitation"
"leaf water enrichment" AND "cellulose"
"isoscape" AND "crop" AND "assignment"
```

**Forensic/Authentication:**
```
"textile authentication" AND "isotope"
"fiber provenance" AND "stable isotope"
"agricultural product" AND "geographic origin" AND "isotope"
```

### Databases to Search

1. **Web of Science** / **Scopus**: Most comprehensive for scientific literature
2. **PubMed**: Biological and analytical chemistry papers
3. **Google Scholar**: Broader coverage, includes theses
4. **IAEA Isotope Hydrology Database**: May have cotton tissue samples
5. **GNIP/GNIR**: Global precipitation and river isotope databases

---

## 📋 Citation Template for Methods Section

```
Cotton cellulose oxygen isotope predictions were based on a mechanistic 
fractionation model (Roden et al., 2000; Barbour, 2007) calibrated using 
[N] known-origin reference samples spanning major cotton-producing regions. 
Precipitation δ18O inputs were obtained from the Online Isotopes in 
Precipitation Calculator (OIPC; Bowen & Revenaugh, 2003), and climate data 
from WorldClim 2.1 (Fick & Hijmans, 2017). Geographic assignment was 
performed using Bayesian inference following Wasser et al. (2007) as 
implemented in the assignR package (Ma et al., 2020).
```

---

## ⚠️ Critical Issues with Current Dataset

### Problems Identified

1. **No source attribution** - Cannot trace data provenance
2. **Only 10 of 32 samples used** - Need to debug why 22 samples were excluded
3. **No validation data** - All samples used for training, none held out for testing
4. **Proprietary status** - Cannot share or publish without proper documentation

### Immediate Actions Needed

1. **Document existing data**: 
   - Who collected samples TX_001, CA_001, etc.?
   - What analytical lab measured δ18O?
   - What year were analyses performed?
   - What extraction protocol was used?

2. **Debug sample exclusion**:
   ```r
   # Run diagnostic to see why n=10 instead of n=32
   source("check_calibration_usage.R")
   ```

3. **Implement cross-validation**:
   - Split data: 80% training, 20% testing
   - Report RMSE on held-out test set
   - Calculate prediction intervals

4. **Add analytical uncertainty**:
   - Include measurement precision (typically ±0.2-0.5‰ for cellulose δ18O)
   - Propagate uncertainty through model

---

## 📖 Key Papers to Obtain

### Must-Read (in priority order):

1. ✅ **Meier-Augenstein et al. (2014)** - Cotton geographic origin
2. ✅ **Roden et al. (2000)** - Mechanistic cellulose model
3. ✅ **Barbour (2007)** - Plant tissue δ18O review
4. ✅ **Bowen & Revenaugh (2003)** - OIPC precipitation isotopes
5. ✅ **Ma et al. (2020)** - assignR methodology
6. ⚠️ **"West" cotton model** - Still need to identify this reference

### Search for "West" Model

The MODEL_COMPARISON_ANALYSIS.md mentions "West's cotton cellulose model" but doesn't cite it. Try:

```
Author: Jason West, A.G. West, J.B. West
Keywords: cotton, cellulose, oxygen, isotope
Date: 2000-2020
Journals: Plant Cell & Environment, New Phytologist, Oecologia
```

---

## 🎬 Next Steps

### Immediate (This Week)

1. [ ] Download and read Meier-Augenstein (2014) paper
2. [ ] Request supplementary data from authors
3. [ ] Document source of existing 32 samples
4. [ ] Debug why only 10 samples were used in model

### Short-Term (This Month)

1. [ ] Compile bibliography of 10-15 key papers
2. [ ] Identify potential collaborators with reference samples
3. [ ] Design sampling campaign for 50+ reference samples
4. [ ] Implement cross-validation in model_fit.R

### Long-Term (6 Months)

1. [ ] Collect 50-100 validated reference samples
2. [ ] Publish calibration dataset with proper metadata
3. [ ] Validate model against independent test set
4. [ ] Submit methodology paper describing approach

---

## 📞 Contact Information for Data Requests

### Authors to Contact

**Dr. Wolfram Meier-Augenstein**  
Queen's University Belfast (check current affiliation)  
Research Area: Stable isotope forensics, textile authentication  
Likely has cotton reference database

**Dr. Gabriel Bowen**  
University of Utah  
OIPC database curator  
May know others working on cotton isotopes

**assignR Package Authors**  
Contact via GitHub or Methods in Ecology and Evolution

### Professional Organizations

- **Isotope Forensics Network** (IF-Net)
- **International Society for Isotope Forensics** (ISIF)
- **American Society of Plant Biologists** (ASPB)

---

## License & Attribution

This reference compilation prepared for WorldScape/IsoscapeBuild project.  
**Date**: October 2025  
**Purpose**: Building scientifically robust cotton provenance model with proper citations

---

**Document Status**: Draft - Needs verification of paper availability and data access

