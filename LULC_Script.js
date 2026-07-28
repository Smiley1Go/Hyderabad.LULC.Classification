// ============================================================
// HYDERABAD — SUPERVISED LULC CLASSIFICATION
// Default Code Editor layout (native Layers panel, no custom
// ui.Panel / SplitPanel). All accuracy & area statistics print
// to the Console. Only LULC-related layers are added to the map:
//   AOI Boundary | Sentinel-2 True Colour Composite | LULC Classified
// ============================================================
//
// REQUIRED IMPORTS (Code Editor > Imports, before running):
//   hyderabad   -> FeatureCollection or Geometry, Hyderabad boundary
//   water, builtup, vegetation, cropland, bareland
//               -> training point FeatureCollections, each with
//                  a 'class' property (0=Water,1=Built-up,
//                  2=Vegetation,3=Cropland,4=Bare land)
//   val_water, val_builtup, val_vegetation, val_cropland, val_bareland
//               -> independent validation point FeatureCollections,
//                  same 'class' property scheme
// ============================================================

// ============================================================
// STEP 1: STUDY AREA
// ============================================================
var hydGeom = hyderabad.geometry();
Map.centerObject(hydGeom, 10);

print('Boundary area (sq km):', hydGeom.area().divide(1e6));

// ============================================================
// STEP 2: SENTINEL-2 COMPOSITE
// ============================================================
var START_DATE = '2024-11-01';
var END_DATE   = '2025-02-28';
var CLOUD_FILTER = 20;
var SCALE = 10;

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(hydGeom)
  .filterDate(START_DATE, END_DATE)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_FILTER));

print('Number of scenes:', s2.size());

function maskS2clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9))
               .and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(mask)
    .divide(10000)
    .copyProperties(image, ['system:time_start']);
}

var s2Masked = s2.map(maskS2clouds);
var composite = s2Masked.median().clip(hydGeom);

// ============================================================
// STEP 3: PREDICTOR VARIABLES
// ============================================================
var ndvi  = composite.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndbi  = composite.normalizedDifference(['B11', 'B8']).rename('NDBI');
var mndwi = composite.normalizedDifference(['B3', 'B11']).rename('MNDWI');

var coreBands = composite.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']);
var predictors = coreBands.addBands([ndvi, ndbi, mndwi]).clip(hydGeom);
var bandNames = predictors.bandNames();
print('Predictor bands:', bandNames);

// ============================================================
// STEP 4: TRAINING SAMPLES
// ============================================================
var trainingPoints = water.merge(builtup).merge(vegetation).merge(cropland).merge(bareland);
print('Total training features:', trainingPoints.size());
print('Training samples by class:', trainingPoints.aggregate_histogram('class'));

// ============================================================
// STEP 5: VALIDATION SAMPLES
// ============================================================
var validationPoints = val_water.merge(val_builtup).merge(val_vegetation).merge(val_cropland).merge(val_bareland);
print('Total validation features:', validationPoints.size());
print('Validation samples by class:', validationPoints.aggregate_histogram('class'));

// ============================================================
// STEP 6: SAMPLE PREDICTORS AT TRAINING LOCATIONS
// ============================================================
var trainingData = predictors.sampleRegions({
  collection: trainingPoints,
  properties: ['class'],
  scale: SCALE,
  geometries: true
});
print('Training data size after sampling:', trainingData.size());
print('First training feature:', trainingData.first());

// ============================================================
// STEP 7: TRAIN RANDOM FOREST
// ============================================================
var RF_TREES = 100;
var RF_SEED  = 42;

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: RF_TREES,
  seed: RF_SEED
}).train({
  features: trainingData,
  classProperty: 'class',
  inputProperties: bandNames
});

var explain = classifier.explain();
print('RF explain (variable importance, OOB error):', explain);

// ============================================================
// STEP 8: CLASSIFY
// ============================================================
var classified = predictors.classify(classifier).clip(hydGeom);

var classVis = {
  min: 0,
  max: 4,
  palette: ['0066CC', 'D73027', '1A9850', 'A6D96A', 'D9A45B']
  // 0 Water, 1 Built-up, 2 Vegetation, 3 Cropland, 4 Bare land
};

// ============================================================
// STEP 9: ACCURACY ASSESSMENT (console)
// ============================================================
var validationSample = classified.sampleRegions({
  collection: validationPoints,
  properties: ['class'],
  scale: SCALE,
  geometries: true
});

print('Validation sample size:', validationSample.size());

var confusionMatrix = validationSample.errorMatrix('class', 'classification');
print('Confusion Matrix:', confusionMatrix);
print('Overall Accuracy:', confusionMatrix.accuracy());
print('Kappa Coefficient:', confusionMatrix.kappa());
print('Producers Accuracy (per class, recall):', confusionMatrix.producersAccuracy());
print('Users Accuracy (per class, precision):', confusionMatrix.consumersAccuracy());

// ============================================================
// STEP 10: AREA STATISTICS + CHART (console)
// ============================================================
var areaImage = ee.Image.pixelArea().addBands(classified);

var classAreas = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'class'
  }),
  geometry: hydGeom,
  scale: SCALE,
  maxPixels: 1e13
});

print('Class areas (raw, sq m):', classAreas);

var classNames = ['Water', 'Built-up', 'Vegetation', 'Cropland', 'Bare land'];
var areaList = ee.List(classAreas.get('groups'));
var totalAreaSqM = hydGeom.area(1);

var areaStatsList = areaList.map(function(item) {
  item = ee.Dictionary(item);
  var classNum = ee.Number(item.get('class'));
  var areaSqM = ee.Number(item.get('sum'));
  var areaSqKm = areaSqM.divide(1e6);
  var percent = areaSqM.divide(totalAreaSqM).multiply(100);
  return ee.Feature(null, {
    'class': classNum,
    'className': ee.List(classNames).get(classNum),
    'area_sqkm': areaSqKm,
    'percent': percent
  });
});

var areaStatsFC = ee.FeatureCollection(areaStatsList);
print('Area Statistics Table:', areaStatsFC);

var areaChart = ui.Chart.feature.byFeature({
  features: areaStatsFC,
  xProperty: 'className',
  yProperties: ['area_sqkm']
}).setChartType('ColumnChart')
  .setOptions({
    title: 'Land Cover Class Area (Hyderabad)',
    hAxis: {title: 'Class'},
    vAxis: {title: 'Area (sq km)'},
    legend: {position: 'none'},
    colors: ['1A9850']
  });

print(areaChart);

// ============================================================
// STEP 11: ADD LAYERS — default Code Editor layout, LULC only
// (bottom-to-top, so Layers panel reads top-to-bottom:
//  LULC Classified, True Colour Composite, AOI Boundary)
// ============================================================
Map.addLayer(hydGeom, {color: 'red'}, 'Hyderabad Boundary', true, 0.5);
Map.addLayer(composite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'True Colour Composite');
Map.addLayer(classified, classVis, 'LULC Classified');