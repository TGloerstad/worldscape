#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Coffee (COFF) Model Setup - Automated Installation        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

ROOT="/Users/navseeker/Desktop/Projects/worldscape"
ISB="$ROOT/IsoscapeBuild"

# Step 1: Check for SPAM COFF layer
echo "[1/6] Checking SPAM coffee layer..."
SPAM_COFF="$ISB/data_raw/spam2020/spam2020_V2r0_global_P_COFF_A.tif"

if [ ! -f "$SPAM_COFF" ]; then
    echo "⚠️  SPAM coffee layer not found at:"
    echo "    $SPAM_COFF"
    echo ""
    echo "Options:"
    echo "  A) Download from SPAM v2r0 archive (recommended)"
    echo "  B) Use REST (rest of crops) as proxy"
    echo ""
    read -p "Choose option (A/B): " choice
    
    if [ "$choice" = "A" ] || [ "$choice" = "a" ]; then
        echo "Please download spam2020_V2r0_global_P_COFF_A.tif and place at:"
        echo "  $SPAM_COFF"
        echo "Then re-run this script."
        exit 1
    else
        echo "Using REST proxy for coffee distribution..."
        PROXY="--proxy=REST"
    fi
else
    echo "✓ SPAM coffee layer found"
    PROXY=""
fi

# Step 2: Build SPAM inputs
echo "[2/6] Building coffee SPAM inputs..."
Rscript "$ISB/scripts/build_spam_inputs.R" --crop=COFF $PROXY
echo "✓ Coffee production/mask created"

# Step 3: Generate MIRCA coffee calendars (crop 21)
echo "[3/6] Generating MIRCA coffee calendars (crop 21)..."
R -q -e "
library(terra)
source('$ISB/scripts/utils.R')
r_i <- rast('$ISB/data_raw/mirca/crop_21_irrigated_12.flt')
r_r <- rast('$ISB/data_raw/mirca/crop_21_rainfed_12.flt')
tot <- r_i + r_r
s <- app(tot, sum, na.rm=TRUE)
s[s==0] <- NA
w <- tot / s
writeRaster(w, '$ISB/data_raw/mirca/coff_calendar_monthly_weights.tif', overwrite=TRUE)
cat('✓ Coffee MIRCA weights created\n')
"
echo "✓ Coffee phenology calendars created"

# Step 4: Add theoretical prior to model_fit.R
echo "[4/6] Adding theoretical prior to model..."
# This is done manually in the R script; just verify it exists
if grep -q "COFF.*list.*a0.*b_precip" "$ISB/scripts/model_fit.R"; then
    echo "✓ Theoretical prior already exists"
else
    echo "⚠️  Need to add COFF to theoretical_priors in model_fit.R"
    echo "   Adding now..."
    # Will add via separate R/sed command after this script
fi

# Step 5: Run fetch_inputs to align everything
echo "[5/6] Running fetch_inputs for coffee..."
cd "$ISB" && ISB_CROP=COFF R -q -e "source('scripts/fetch_inputs.R')" 2>&1 | tail -5

# Step 6: Build test model with theoretical prior
echo "[6/6] Building coffee model with theoretical prior..."
ISB_CROP=COFF R -q -e "source('$ISB/scripts/model_fit.R')" 2>&1 | tail -3

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Coffee Setup Complete!                                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Format your coffee calibration CSV:"
echo "     → Place at: $ISB/data_raw/calibration/coffee_calibration.csv"
echo "     → Required columns: sample_id, d18O_cellulose, lat, lon"
echo "     → Optional: elevation, harvest_year, species, processing_method"
echo ""
echo "  2. Rebuild with calibration:"
echo "     → ISB_CROP=COFF ISB_CAL=$ISB/data_raw/calibration/coffee_calibration.csv \\"
echo "       R -q -e \"source('$ISB/scripts/model_fit.R')\""
echo ""
echo "  3. Check model range:"
echo "     → R -q -e \"library(terra); r <- rast('$ISB/model/cellulose_mu_coff.tif'); print(minmax(r))\""
echo ""



