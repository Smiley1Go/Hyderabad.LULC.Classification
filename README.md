# Supervised LULC Classification of Hyderabad

A supervised land-use/land-cover (LULC) classification of the Hyderabad metropolitan area, built using Sentinel-2 Surface Reflectance imagery and a Random Forest classifier in Google Earth Engine.

## Overview

This project classifies land cover into five classes — Water, Built-up, Vegetation / Tree Cover, Cropland / Managed Vegetation, and Bare / Open Land — using cloud-masked Sentinel-2 imagery and a suite of spectral predictors. The classification is evaluated against an independent validation dataset and published as an interactive public web application.

## Data & Methods

- **Imagery:** Sentinel-2 MSI Level-2A Surface Reflectance, Harmonized (`COPERNICUS/S2_SR_HARMONIZED`)
- **Cloud handling:** Scene-level cloud percentage filtering combined with pixel-level cloud/shadow masking using the Scene Classification Layer (SCL)
- **Predictors:** Blue, Green, Red, NIR, SWIR-1, SWIR-2 bands, plus NDVI, NDBI, and MNDWI spectral indices
- **Processing scale:** 10 m
- **Classifier:** Random Forest (100 trees)
- **Validation:** Independent, spatially separated validation samples assessed via a confusion matrix, with overall accuracy, Kappa coefficient, and class-level producer's/user's accuracy reported
- **Area statistics:** Class-wise area computed in square kilometres and as a percentage of the total mapped extent

## Outputs

- An interactive Earth Engine App displaying the true-colour composite, classified map, legend, methods summary, accuracy results, and area statistics
- A standalone webpage embedding the same App with supporting documentation

## Live Demo

The classification can be viewed as a public Earth Engine App (linked within the webpage).

## Data Attribution

Imagery: Copernicus Sentinel-2 data, European Space Agency (ESA), accessed via Google Earth Engine.
