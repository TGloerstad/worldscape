# SPAM 2020 Crop Production Data

## Current Status
- **COTT (cotton)**: ✅ Available (36 MB)
- **Other crops**: Not yet downloaded

## How to Add More Crops

SPAM 2020 provides global production data for 40+ crops. To add a crop:

### 1. Download from SPAM 2020
Visit: https://www.mapspam.info/data/

Click **"SPAM 2020 v2.0 Global data"** (Updated 2025-06-09)

**Required selections:**
- **Variable**: Production (tons per pixel)
- **Format**: GeoTIFF
- **Production system**: All technologies (A)

**File naming convention**: `spam2020_v2r0_global_prod-{tech}_{CROP}.tif`

Example for cotton with all technologies: `spam2020_v2r0_global_prod-a_cott.tif`

⚠️ **Important**: 
- Use **v2.0** (not v1.0) - updated June 2025
- Select **GeoTIFF** format (not CSV)  
- Choose **Production** variable (not Harvested Area, Physical Area, or Yield)

### 2. Available Crop Codes
Common crops for isotope work:
- **COTT**: Cotton (already present)
- **MAIZ**: Maize
- **RICE**: Rice  
- **WHEA**: Wheat
- **SOYB**: Soybean
- **BARL**: Barley
- **SORG**: Sorghum
- **MILL**: Millet
- **SUGC**: Sugarcane
- **CASS**: Cassava

Full list: https://www.mapspam.info/methodology/spam-crops/

### 3. Rename for Compatibility
The current system expects v1.0 naming. Rename downloaded v2.0 files:

From v2.0: `spam2020_v2r0_global_prod-a_rice.tif`  
To v1.0:   `spam2020_v1r0_global_P_RICE_A.tif`

Pattern: `spam2020_v1r0_global_P_{CROP_UPPERCASE}_A.tif`

### 4. Place Files Here
Save renamed `.tif` files to:
```
/Users/navseeker/Desktop/Projects/worldscape/FTMapping/shapefilesEtc/
```

Example: `spam2020_v1r0_global_P_RICE_A.tif`

### 5. Process in IsoscapeBuild
1. Go to **IsoscapeBuild** tab
2. Select crop from dropdown (e.g., RICE)
3. Check "SPAM 2020 production"
4. Click **Fetch inputs** → processes the `.tif` into `IsoscapeBuild/data_proc/{crop}_production.tif`

### 6. Use in Interactive Tab
Once processed, the crop appears in the **Interactive** tab → **Crop** dropdown → enable **Prior (SPAM)** to visualize.

---

**Note**: SPAM files are large (~30-50 MB each). Download only the crops you need. Data is updated infrequently (every ~5 years), so one-time download is sufficient.
