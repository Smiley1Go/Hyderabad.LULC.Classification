# Supervised LULC Classification of Hyderabad

A supervised land-use/land-cover (LULC) classification of the Hyderabad metropolitan area, built using Sentinel-2 Surface Reflectance imagery and a Random Forest classifier in Google Earth Engine, presented through an interactive companion webpage.

## Overview

This project classifies land cover into five classes — Water, Built-up, Vegetation / Tree Cover, Cropland / Managed Vegetation, and Bare / Open Land — using cloud-masked Sentinel-2 imagery and a suite of spectral predictors. The classification is evaluated against an independent validation dataset and published as an interactive public web application, embedded inside a standalone webpage with project details, accuracy metrics, and area statistics.

## Data & Methods

- **Imagery:** Sentinel-2 MSI Level-2A Surface Reflectance, Harmonized (`COPERNICUS/S2_SR_HARMONIZED`)
- **Date range:** November 2024 – February 2025 (dry-season composite)
- **Cloud handling:** Scene-level cloud percentage filtering combined with pixel-level cloud/shadow masking using the Scene Classification Layer (SCL)
- **Predictors:** Blue, Green, Red, NIR, SWIR-1, SWIR-2 bands, plus NDVI, NDBI, and MNDWI spectral indices
- **Processing scale:** 10 m
- **Classifier:** Random Forest (100 trees, seed 42)
- **Validation:** Independent, spatially separated validation samples (8,318 points) assessed via a confusion matrix, with overall accuracy (0.820), Kappa coefficient (0.699), and class-level producer's/user's accuracy reported
- **Area statistics:** Class-wise area computed in square kilometres and as a percentage of the total mapped extent (191.4 sq km)

## Outputs

- **Earth Engine App** — default Code Editor layout displaying the true-colour composite and classified map as toggleable layers, with accuracy and area statistics printed to the Console
- **Companion webpage** (`hyderabad-lulc.html`) — a standalone, light-themed page that embeds the live Earth Engine App alongside:
  - A **Project Details** tab covering study area, mapped extent, imagery window, and classifier summary
  - A **Statistics** tab with a class-distribution donut chart, area breakdown bars, accuracy metrics, a producer's/user's accuracy table, and an interpretation & limitations note

## Links

- **Earth Engine App:** [LULC](https://degrasskob.projects.earthengine.app/view/lulc)
- **Companion Webpage (GitHub Pages):** [Hyderabad LULC Explorer](https://smiley1go.github.io/Works_GEE/hyderabad-lulc.html)
- **Repository:** [Smiley1Go/Works_GEE at Exercise_1](https://github.com/Smiley1Go/Works_GEE/tree/Exercise_1)

## Live Demo

The classification can be viewed either directly as a public Earth Engine App, or through the companion webpage above, which embeds the same App with supporting documentation, statistics, and interpretation.

## Hosting the Webpage on GitHub Pages

1. Push `hyderabad-lulc.html` to the repository (root, or a `/docs` folder).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **Deploy from a branch**.
4. Pick the branch containing the file (e.g. `main` or `Exercise_1`) and the folder (`/root` or `/docs`), then **Save**.
5. GitHub will publish the page at:
   `https://<username>.github.io/<repository>/hyderabad-lulc.html`
   — update the link above once the branch/folder is confirmed, as GitHub Pages by default serves from `main`, not `Exercise_1`.

## Data Attribution

Imagery: Copernicus Sentinel-2 data, European Space Agency (ESA), accessed via Google Earth Engine.
