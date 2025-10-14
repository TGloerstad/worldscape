# Summary: Cotton Calibration Academic References

## What Was Created

I've compiled academic references and actionable guidance for building a properly cited cotton cellulose δ18O calibration dataset. Your current data lacks source attribution, which is essential for scientific publication and validation.

---

## 📁 New Resources

### 1. **CALIBRATION_REFERENCES.md**
Comprehensive bibliography of academic papers organized by category:

- **Cotton-specific studies**: Meier-Augenstein et al. (2014) - multi-element isotope geographic origin
- **Analytical methods**: Cellulose extraction protocols, IRMS standards
- **Mechanistic models**: Roden, Barbour, Sternberg - theoretical framework for δ18O fractionation
- **Precipitation isotopes**: Bowen's OIPC database papers
- **Geographic assignment**: assignR package, Ehleringer, Wasser
- **Climate data**: WorldClim, MIRCA, SPAM sources

**Key Finding**: Meier-Augenstein (2014) has direct cotton isotope data - **REQUEST THIS DATA**

### 2. **CALIBRATION_ACTION_PLAN.md**
Three pathways to improve your calibration:

**Path A (FASTEST)**: Acquire published data from authors  
- Timeline: 2-4 weeks  
- Cost: Low  
- Includes email template to request data

**Path B (BEST)**: Collect 75-100 new reference samples  
- Timeline: 6-12 months  
- Cost: ~$14-28k  
- Sampling design, lab protocols, potential sources

**Path C (INTERMEDIATE)**: Hybrid mechanistic-empirical model  
- Timeline: 4-8 weeks  
- Cost: Low  
- Use Roden/Barbour theory + limited calibration

**Recommended**: Combine A+C immediately, then B long-term

### 3. **scripts/diagnose_calibration.R**
Diagnostic script to investigate why only 10 of 32 samples are used:

```bash
Rscript IsoscapeBuild/scripts/diagnose_calibration.R
```

Will identify:
- Empty rows in CSV
- Invalid coordinates
- Samples missing climate data (NA values)
- High-elevation or ocean samples
- Discrepancy between available and used samples

### 4. **references.bib**
BibTeX file with all key citations ready to import into:
- Zotero, Mendeley, EndNote
- LaTeX documents
- Manuscript preparation

---

## 🎯 Priority Actions (This Week)

### 1. Run the diagnostic script
```bash
cd /Users/navseeker/Desktop/Projects/worldscape
Rscript IsoscapeBuild/scripts/diagnose_calibration.R
```

This will reveal why only 10/32 samples are being used.

### 2. Download the Meier-Augenstein paper
**Citation**: Meier-Augenstein, W., Hobson, K.A., & Wassenaar, L.I. (2014). Discrimination of unprocessed cotton on the basis of geographic origin using multi-element stable isotope signatures. *Rapid Communications in Mass Spectrometry*, 28(16), 1819-1826.

**DOI**: 10.1002/rcm.6964

**Access**: 
- PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC11609901/
- ResearchGate: https://www.researchgate.net/publication/260108237

**Look for**: Supplementary data with raw isotope measurements and GPS coordinates

### 3. Email the authors for data
Use the template in `CALIBRATION_ACTION_PLAN.md` to request:
- Raw δ18O measurements
- Sample GPS coordinates
- Collection dates and metadata
- Analytical protocols

**Contact**:
- Dr. Wolfram Meier-Augenstein (Queen's University Belfast)
- Dr. Keith Hobson
- Dr. Leonard Wassenaar

### 4. Document your existing 32 samples
Answer these questions:
- Who collected samples TX_001, CA_001, etc.?
- What lab analyzed them?
- When were analyses performed?
- What extraction protocol was used?
- Can you cite these internally or are they unpublished?

---

## 📊 Current Calibration Issues

From the MODEL_COMPARISON_ANALYSIS.md and code:

1. **Only 10 samples used** (model_params.json shows n=10)
2. **32 samples exist** in cotton_calibration_enhanced.csv
3. **No source documentation** - cannot trace data provenance
4. **Insufficient geographic coverage** for global model
5. **No validation set** - all data used for training

**Impact**: 
- Model may be overfitting
- Poor extrapolation to unseen regions
- Cannot publish without proper citations
- Uncertain prediction intervals

---

## 📚 Key Papers to Read (Priority Order)

### Must Read:
1. **Meier-Augenstein et al. (2014)** - Cotton geographic origin [GET THIS DATA]
2. **Roden et al. (2000)** - Mechanistic cellulose model [THEORY]
3. **Barbour (2007)** - Plant tissue δ18O review [FRAMEWORK]
4. **Barbour & Farquhar (2000)** - Cotton-specific leaf water [COTTON!]

### Important Context:
5. **Bowen & Revenaugh (2003)** - OIPC precipitation data [YOUR INPUT]
6. **Ma et al. (2020)** - assignR package [YOUR SOFTWARE]
7. **Gaudinski et al. (2005)** - Cellulose extraction methods [PROTOCOL]

---

## 🔍 Finding the "West" Model

Your MODEL_COMPARISON_ANALYSIS.md mentions "West's cotton cellulose model" but doesn't cite it.

**Search strategies**:
```
Author: Jason West, A.G. West, Adam West, J.B. West
Keywords: cotton, cellulose, oxygen isotope, δ18O, fractionation
Journals: Plant Cell & Environment, New Phytologist, Oecologia
Date: 2000-2020
```

**Alternative**: The "West model" might be:
- An unpublished industry model
- A modification of Roden et al. (2000) by someone named West
- Part of FloraTrace proprietary methods

**Action**: Ask Chris Stantis or FloraTrace colleagues for the specific citation.

---

## 💡 Recommended Strategy

### Phase 1: Immediate (1 month)
```
[ ] Run diagnostic script
[ ] Download Meier-Augenstein (2014) paper
[ ] Email authors for supplementary data
[ ] Document existing 32-sample sources
[ ] Fix any coordinate/climate extraction issues
[ ] Expand model to use all valid samples (not just 10)
```

### Phase 2: Short-term (3 months)
```
[ ] Acquire published reference data from authors
[ ] Implement mechanistic-empirical hybrid model
[ ] Add cross-validation and uncertainty quantification
[ ] Write methods section with proper citations
[ ] Publish preliminary model with uncertainty bounds
```

### Phase 3: Long-term (6-12 months)
```
[ ] Design 75-100 sample collection campaign
[ ] Partner with cotton research institutions
[ ] Collect and analyze reference samples
[ ] Refit model with expanded dataset
[ ] Validate against independent test set
[ ] Publish peer-reviewed methodology paper
```

---

## 📧 Email Template for Data Requests

```
Subject: Request for Cotton Isotope Reference Data

Dear Dr. [Author Name],

I am working on a cotton provenance model using stable oxygen isotopes 
at FloraTrace, Inc. I read your excellent paper "Discrimination of 
unprocessed cotton on the basis of geographic origin using multi-element 
stable isotope signatures" (2014) and was impressed by the comprehensive 
reference database you developed.

Would you be willing to share the raw isotope measurements (particularly 
δ18O) and sample metadata (GPS coordinates, collection dates) from your 
study? This would significantly improve our calibration dataset for a 
mechanistic model predicting cotton cellulose δ18O from precipitation 
and climate data.

We would properly cite your work in any resulting publications and are 
happy to acknowledge your contribution. If you prefer, we could discuss 
potential collaboration on validating and extending this approach.

Thank you for considering this request. I look forward to hearing from you.

Best regards,
[Your Name]
FloraTrace, Inc.
[Email]
[Phone]
```

---

## ⚠️ Critical Next Steps

**Before collecting new data, fix the existing dataset:**

1. Why are only 10 of 32 samples used?
2. Are coordinates correct for all samples?
3. Why does PE_001 at 3400m elevation not extract climate?
4. Can the empty row (row 33) be removed?
5. Should you use bilinear interpolation for climate extraction?

**Run the diagnostic** and review the output table.

---

## 🎓 Citation Format for Methods Section

When you write up your methods, use this format:

```
Cotton cellulose oxygen isotope predictions were generated using a 
mechanistic fractionation model (Roden et al., 2000; Barbour, 2007) 
calibrated with [N] known-origin reference samples spanning major 
cotton-producing regions. Precipitation δ18O inputs were derived from 
the Online Isotopes in Precipitation Calculator (OIPC; Bowen & 
Revenaugh, 2003), monthly temperature and vapor pressure from WorldClim 
2.1 (Fick & Hijmans, 2017), and growing season weighting from MIRCA2000 
cropping calendars (Portmann et al., 2010). Geographic assignment was 
performed using Bayesian inference (Wasser et al., 2004) as implemented 
in the assignR R package (Ma et al., 2020).
```

---

## 📖 Resources Created

1. `IsoscapeBuild/CALIBRATION_REFERENCES.md` - Academic papers bibliography
2. `IsoscapeBuild/CALIBRATION_ACTION_PLAN.md` - Three pathways forward
3. `IsoscapeBuild/scripts/diagnose_calibration.R` - Debug sample count
4. `IsoscapeBuild/references.bib` - BibTeX citations
5. `IsoscapeBuild/CALIBRATION_SUMMARY.md` - This document
6. Updated `IsoscapeBuild/README.md` - Added calibration section

---

## 🚀 Get Started Now

```bash
# 1. Run diagnostic
cd /Users/navseeker/Desktop/Projects/worldscape
Rscript IsoscapeBuild/scripts/diagnose_calibration.R

# 2. Review output
cat IsoscapeBuild/status/calibration_diagnostic.csv

# 3. Read the key papers
# - Download Meier-Augenstein et al. (2014)
# - Read CALIBRATION_ACTION_PLAN.md for next steps

# 4. Email authors for data
# - Use template in CALIBRATION_ACTION_PLAN.md
```

---

**Questions?** Review the detailed documents:
- `CALIBRATION_REFERENCES.md` for paper details
- `CALIBRATION_ACTION_PLAN.md` for implementation steps
- `references.bib` for citations

**Status**: Ready to improve calibration dataset with proper academic references.




