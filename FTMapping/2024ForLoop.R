# Chris note 14 Nov 24: There seems to be errors from the magick package. 
# Error: rsession: IO error writing tag data. `TIFFWriteDirectoryTagData' @ error/tiff.c/TIFFErrors/604
# removing logo as quick-fix (hopefully)

run_mapping_code <- function(input_dir = "input", output_dir = "output", shapes_dir = "shapefilesEtc") {
  # This is a new plotting setup with a smooth underlay map, logo, and text. 
  library(assignR); library(terra); library(dplyr); library(tidyr)
  library(cowplot); library(readxl); library(tibble)
  
  # Ensure output directory exists
  if (!dir.exists(output_dir)) dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  
  #updated to divide China into XUAR and non-XUAR
  worldvect <- vect(file.path(shapes_dir, 'worldXUAR.shp'))
  fixname <- gsub("Xinjiang Uygur Autonomous Region", "Xinjiang Uyghur Autonomous Region", worldvect$NAME_0)
  worldvect$NAME_0 <- fixname  
  xinjiang <- subset(worldvect, worldvect$NAME_0 == "Xinjiang Uyghur Autonomous Region") 
  
  cotmap <- rast(file.path(shapes_dir, 'Model1.tif')) #using Model One created in a FloraTrace Project
  # rename first layer to d18O without tidyterra
  if (nlyr(cotmap) >= 1) {
    names(cotmap)[1] <- 'd18O'
  }
  
  prod <- rast(file.path(shapes_dir, 'spam2020_v1r0_global_P_COTT_A.tif')) # global production map of cotton in 2020
  if (nlyr(prod) >= 1) {
    names(prod)[1] <- 'production'
  }
  prod <- crop(prod, cotmap)

  # Data --------------------------------------------------------------------
  # call in sample ids and oxygen values by reading excel sheet
  file.list <- list.files(path = input_dir, pattern = "\\.xlsx$", full.names = TRUE) # read all Excel files in input folder
  try({ print(paste0("[mapping] using input xlsx: ", paste(basename(file.list), collapse=", "))) }, silent = TRUE)
  df.list <- lapply(file.list, read_excel)
  df <- as.data.frame(bind_rows(df.list))
  
  #Unweighted probability
  prob <- pdRaster(cotmap, df) #calculate probabilities
  
  #Weighted by production
  prob2 <- pdRaster(cotmap, df, prior = prod)
  # For-loop, 10% by probability ------------------------------------
  
  qtl1 <- qtlRaster(prob, threshold = 0.1, thresholdType = 'prob')
  
  samples <- list(names(qtl1))
  
  # Create Folders for Each Sample ------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir <- paste0(i)
    dir.create(newdir)      # should test for error
  }
  ## World Map ---------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    dir.create(newdir2)      # should test for error
    setwd(newdir2)
    tiff(filename = paste(i,"world10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  ylim = c(-55 , 83.500904), xlim = c(-140, 180), axes = F, 
                main = paste(i, "Top 10% by probability")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(5000, 'bottomleft', type="bar", below="km", label=c('',2500,5000), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  ## Asia --------------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"asia10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(32.827755, 146.909785),
                ylim = c(4, 56.943359), axes = F, 
                main = paste(i, "Top 10% by probability")
    )
    lines(xinjiang, col = '#3d62a9', lwd= 3)
    terra::plot(x = qtl1[[i]], xlim = c(32.827755, 146.909785),
                ylim = c(4, 56.943359),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0, 250, 500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## North America -----------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"na10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-139, -64), ylim = c(4.5, 51), axes = F, 
                main = paste(i, "Top 10% by probability, North America")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## South America -----------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"sa10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-85, -33),
                ylim = c(-56.592345, 14.376895), axes = F, 
                main = paste(i, "Top 10% by probability, South America")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,'',500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Africa ------------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"af10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-22.015995, 53.218379),
                ylim = c(-37.626679, 37.408635), axes = F, 
                main = paste(i, "Top 10% by probability, Africa")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(44, -35)) 
    sbar(500, 'bottomright', type="bar", below="km", label=c(0,'',500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Europe ------------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"eu10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-11, 53.7),
                ylim = c(34.112436, 55.841826), axes = F, 
                main = paste(i, "Top 10% by probability, Europe")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(53, 55)) 
    sbar(500, 'topright', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## Australia ---------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"aus10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(88.550411, 163.609004),
                ylim = c(-44.507714, 7.651866), axes = F, 
                main = paste(i, "Top 10% by probability, Australia/Oceania")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(88, -42)) 
    sbar(500, 'bottomleft', type="bar", below="km", label = c(0,250,500), cex = 0.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 2)
    dev.off()
  }
  
  # For-loop, 95% by probability ---------------------------------------------
  
  qtl95 <- qtlRaster(prob, threshold = 0.95, thresholdType = 'prob')
  samples <- list(names(qtl95))
  
  ## World -------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"world95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  ylim = c(-55 , 83.500904), xlim = c(-140, 180), axes = F, 
                main = paste(i, "Top 95% by probability")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(5000, 'bottomleft', type="bar", below="km", label=c('',2500,5000), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## North America -----------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"na95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-139, -64), ylim = c(4.5, 51), axes = F, 
                main = paste(i, "Top 95% by probability, North America")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## South America -----------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"sa95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-85, -33),
                ylim = c(-56.592345, 14.376895), axes = F, 
                main = paste(i, "Top 95% by probability, South America")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0, " ", 500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Africa ------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"af95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-22.015995, 53.218379),
                ylim = c(-37.626679, 37.408635), axes = F, 
                main = paste(i, "Top 95% by probability, Africa")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(44, -35)) 
    sbar(500, 'bottomright', type="bar", below="km", label=c(0,'',500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Europe ------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"eu95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-11, 53.7),
                ylim = c(34.112436, 55.841826), axes = F, 
                main = paste(i, "Top 95% by probability, Europe")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(53, 55)) 
    sbar(500, 'topright', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## Australia ---------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"aus95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(88.550411, 163.609004),
                ylim = c(-44.507714, 7.651866), axes = F, 
                main = paste(i, "Top 95% by probability, Australia/Oceania")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(88, -42)) 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 2)
    dev.off()
  }
  
  ## Asia --------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Unweighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"asia95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(32.827755, 146.909785),
                ylim = c(4, 56.943359), axes = F, 
                main = paste(i, "Top 95% by probability, Asia")
    )
    lines(xinjiang, col = '#3d62a9', lwd= 3)
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0, 250, 500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  # New maps, but weighted probability
  # Weighted Probability For-loop, 10% by probability ------------------------------------
  
  qtl1 <- qtlRaster(prob2, threshold = 0.1, thresholdType = 'prob')
  
  samples <- list(names(qtl1))
  
  ## World Map ---------------------------------------------------------------
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    dir.create(newdir2)      # should test for error
    setwd(newdir2)
    tiff(filename = paste(i,"world10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  ylim = c(-55 , 83.500904), xlim = c(-140, 180), axes = F, 
                main = paste(i, "Top 10% by probability (weighted)")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(5000, 'bottomleft', type="bar", below="km", label=c('',2500,5000), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## Asia --------------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"asia10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(32.827755, 146.909785),
                ylim = c(4, 56.943359), axes = F, 
                main = paste(i, "Top 10% by probability (weighted)")
    )
    lines(xinjiang, col = '#3d62a9', lwd= 3)
    terra::plot(x = qtl1[[i]], xlim = c(32.827755, 146.909785),
                ylim = c(4, 56.943359),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0, 250, 500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## North America -----------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"na10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-139, -64), ylim = c(4.5, 51), axes = F, 
                main = paste(i, "Top 10% by probability (weighted), North America")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## South America -----------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"sa10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-85, -33),
                ylim = c(-56.592345, 14.376895), axes = F, 
                main = paste(i, "Top 10% by probability (weighted), South America")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,'',500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Africa ------------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"af10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-22.015995, 53.218379),
                ylim = c(-37.626679, 37.408635), axes = F, 
                main = paste(i, "Top 10% by probability (weighted), Africa")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(44, -35)) 
    sbar(500, 'bottomright', type="bar", below="km", label=c(0,'',500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Europe ------------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"eu10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-11, 53.7),
                ylim = c(34.112436, 55.841826), axes = F, 
                main = paste(i, "Top 10% by probability (weighted), Europe")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(53, 55)) 
    sbar(500, 'topright', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## Australia ---------------------------------------------------------------
  
  for(i in names(qtl1)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"aus10.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(88.550411, 163.609004),
                ylim = c(-44.507714, 7.651866), axes = F, 
                main = paste(i, "Top 10% by probability (weighted), Australia/Oceania")
    )
    terra::plot(x = qtl1[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(88, -42)) 
    sbar(500, 'bottomleft', type="bar", below="km", label = c(0,250,500), cex = 0.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 2)
    dev.off()
  }
  
  # Probability for-loop, 95% by probability (weighted) ---------------------------------------------
  
  qtl95 <- qtlRaster(prob2, threshold = 0.95, thresholdType = 'prob')
  samples <- list(names(qtl95))
  
  ## World -------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"world95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  ylim = c(-55 , 83.500904), xlim = c(-140, 180), axes = F, 
                main = paste(i, "Top 95% by probability (weighted)")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(5000, 'bottomleft', type="bar", below="km", label=c('',2500,5000), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## North America -----------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"na95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-139, -64), ylim = c(4.5, 51), axes = F, 
                main = paste(i, "Top 95% by probability (weighted), North America")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## South America -----------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"sa95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-85, -33),
                ylim = c(-56.592345, 14.376895), axes = F, 
                main = paste(i, "Top 95% by probability (weighted), South America")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0, " ", 500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Africa ------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"af95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-22.015995, 53.218379),
                ylim = c(-37.626679, 37.408635), axes = F, 
                main = paste(i, "Top 95% by probability (weighted), Africa")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(44, -35)) 
    sbar(500, 'bottomright', type="bar", below="km", label=c(0,'',500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  ## Europe ------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"eu95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(-11, 53.7),
                ylim = c(34.112436, 55.841826), axes = F, 
                main = paste(i, "Top 95% by probability (weighted), Europe")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(53, 55)) 
    sbar(500, 'topright', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1)
    dev.off()
  }
  
  ## Australia ---------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"aus95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(88.550411, 163.609004),
                ylim = c(-44.507714, 7.651866), axes = F, 
                main = paste(i, "Top 95% by probability (weighted), Australia/Oceania")
    )
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = c(88, -42)) 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0,250,500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 2)
    dev.off()
  }
  
  ## Asia --------------------------------------------------------------------
  
  for(i in names(qtl95)) {
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Weighted")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    tiff(filename = paste(i,"asia95.tiff"), 
         width = 1402, height = 748, units = "px", pointsize = 18)
    terra::plot(worldvect, col = "grey96",  xlim = c(32.827755, 146.909785),
                ylim = c(4, 56.943359), axes = F, 
                main = paste(i, "Top 95% by probability (weighted), Asia")
    )
    lines(xinjiang, col = '#3d62a9', lwd= 3)
    terra::plot(x = qtl95[[i]], xlim = c(-140, 180), ylim = c(-55, 83.500904),
                legend = F, add = T, col = rep(c('transparent', '#50b691')))
    north(type = 2, label = '', xy = 'bottomleft') 
    sbar(500, 'bottomleft', type="bar", below="km", label=c(0, 250, 500), cex=.8)
    mtext(paste0("FloraTrace, Inc. 2024, All Rights Reserved. 
     Proprietary and Confidential. Date Created: ", format(Sys.time(),"%m/%d/%Y")),
          side = 1, line = 3)
    dev.off()
  }
  
  # Data Frames of Probability ----------------------------------------------
  
  # this will generate a dataframe of summed probability for each country in the world
  probUnweighted <- zonal(prob, worldvect, fun = "sum", na.rm = T) 
  probUnweighted$country_name = worldvect$NAME_0
  # After moving country to rownames, all remaining columns are sample columns (numeric)
  probUnweighted <- column_to_rownames(probUnweighted, var = "country_name") %>%
    drop_na() %>%
    mutate(across(everything(), ~ round(.x * 100, 1)))
  
  # this dataframe is summed probability, weighted by the prior of production
  probWeighted <- zonal(prob2, worldvect, fun = "sum", na.rm = T)
  probWeighted$country_name = worldvect$NAME_0
  probWeighted <- column_to_rownames(probWeighted, var = "country_name") %>%
    mutate(across(everything(), ~ round(.x * 100, 1)))
  
  # we want to see what effect the prior is having
  priorWeight <- zonal(round((prod/sum(values(prod), na.rm = TRUE))*100, 2), worldvect, sum, na.rm = TRUE) %>% 
    rename(prior_weight = production)
  priorWeight$prior_weight <- format(priorWeight$prior_weight, scientific = F, digits = 4)
  probWeighted <- cbind(probWeighted, priorWeight) %>% 
    drop_na()
  
  # Creating Tabular Output --------------------------------------------------
  
  # now trying to grab the ten highest probability values for unweighted
  output_long <- probUnweighted %>%
    tibble::rownames_to_column(var = "country") %>% 
    pivot_longer(-country,
                 names_to = "sample",
                 values_to = "value"
    ) %>% 
    group_by(sample) %>% 
    arrange(desc(value)) %>% 
    dplyr::slice_max(value, n = 10) %>% 
    rename(probability = value)
  
  # okay now to make it wide again for a table
  output_wide <- output_long %>% 
    pivot_wider(names_from = sample, 
                values_from = c(probability)
    ) 
  
  for (i in names(probUnweighted)){
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Tables")
    cwd <- getwd() 
    setwd(newdir1)# CURRENT dir
    dir.create(newdir2)      # should test for error
    setwd(newdir2)
    assign(paste0("Unweighted",i), output_long %>% 
             filter(sample == i) %>% 
             drop_na()) %>% 
      select(-c(sample)) %>% 
      write.csv(.,file = paste0(i, "Unweighted.csv"), row.names = F)
    
  }
  
  # now trying to grab the ten highest probability values for Weighted
  output_long <- probWeighted %>%
    tibble::rownames_to_column(var = "country") %>% 
    pivot_longer(-c(country, prior_weight),
                 names_to = "sample",
                 values_to = "value"
    ) %>% 
    group_by(sample) %>% 
    arrange(desc(value)) %>% 
    dplyr::slice_max(value, n = 10) %>% 
    rename(probability = value) 
  
  # okay now to make it wide again for a table
  output_wide <- output_long %>% 
    pivot_wider(names_from = sample, 
                values_from = c(probability)
    ) 
  
  for (i in names(probUnweighted)){
    setwd(output_dir)
    newdir1 <- paste0(i)
    newdir2 <- paste0(i, ", Tables")
    setwd(newdir1)# CURRENT dir
    setwd(newdir2)
    assign(paste0("Weighted",i), output_long %>% 
             filter(sample == i) %>% 
             drop_na() %>% 
             relocate(prior_weight, .after = last_col())
    )  %>%
      select(-c(sample)) %>% 
      write.csv(.,file = paste0(i, "Weighted.csv"), row.names = F)
  }
}

