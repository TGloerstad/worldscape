# Semi-Automated Mapping of Gossypium Isoscape

Last updated April 2024
By Chris Stantis, PhD

This program will produce report-ready posterior probability density maps for cotton (Genus Gossypium) δ18O values. For each sample, two types of maps will be produced: one with the top 10% assignment region, one with 95% assignment region.

## Installation
Ensure you have R and RStudio on your computer (instructions here, external webpage). Download the Floratrace Mapping R Project Folder from Github (link here WIP). 

## Makings Maps
The R Project contains four folders: code, input, output, shapefilesEtc, and renv. The folders code, mapsEtc, and renv should not need to be altered, but you might want to check that input and output are empty before beginning a new set of maps. 
Load stable isotope data
In the input folder, load whatever samples you want analyzed in an .xlsx format. The first column should have the header ‘samples’ and the second column ‘d18O'. For this documentation, there is a file names ‘ExampleData.xlsx’ with two samples to be analyzed, Example1 and Example2.

### Load and Run R Script
Ensure your device is connected to the Internet to load the world map vector and any packages if needed. In the code folder, open the script ‘2024ForLoop.R’ in R Studio. Click ‘Source’ to run all of the code. 

### Check Maps
Probability maps should have been made and filed in the output file, with each sample name having its own folder. 

## Troubleshooting
Any issues? Contact Chris Stantis through cms@floratrace.com






