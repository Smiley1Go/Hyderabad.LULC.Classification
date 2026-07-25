// ============================================================
// STEP 1: STUDY AREA
// ============================================================
var appMap = Map;
var hydGeom = hyderabad.geometry(); // 'hyderabad' = imported boundary asset
appMap.centerObject(hydGeom, 10);
appMap.addLayer(hydGeom, {color: 'red'}, 'Hyderabad Boundary', true, 0.5);

print('Boundary area (sq km):', hydGeom.area().divide(1e6));

// ============================================================
// STEP 2: SENTINEL-2 COMPOSITE
// ============================================================
var START_DATE = '2024-11-01';
var END_DATE   = '2025-02-28';
var CLOUD_FILTER = 20;

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

appMap.addLayer(composite, {bands: ['B4','B3','B2'], min: 0, max: 0.3}, 'True Colour Composite');

// ============================================================
// STEP 3: PREDICTOR VARIABLES
// ============================================================
var ndvi  = composite.normalizedDifference(['B8','B4']).rename('NDVI');
var ndbi  = composite.normalizedDifference(['B11','B8']).rename('NDBI');
var mndwi = composite.normalizedDifference(['B3','B11']).rename('MNDWI');

var coreBands = composite.select(['B2','B3','B4','B8','B11','B12']);
var predictors = coreBands.addBands([ndvi, ndbi, mndwi]).clip(hydGeom);
var bandNames = predictors.bandNames();
print('Predictor bands:', bandNames);

var SCALE = 10;

// ============================================================
// STEP 4: TRAINING SAMPLES
// (water, builtup, vegetation, cropland, bareland are Geometry
//  Imports drawn in the Code Editor, each a FeatureCollection
//  with a 'class' property: 0-4)
// ============================================================
var trainingPoints = water.merge(builtup).merge(vegetation).merge(cropland).merge(bareland);
print('Total training features:', trainingPoints.size());
print('Training samples by class:', trainingPoints.aggregate_histogram('class'));

// ============================================================
// STEP 5: VALIDATION SAMPLES
// (val_water, val_builtup, val_vegetation, val_cropland,
//  val_bareland are separate, independent Geometry Imports)
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

appMap.addLayer(classified, classVis, 'LULC Classified');

// ============================================================
// STEP 9: ACCURACY ASSESSMENT
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
// STEP 10: AREA STATISTICS
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

// ============================================================
// STEP 11: AREA CHART
// ============================================================
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

// ============================================================
// STEP 12: BUILD APP INTERFACE
// ============================================================

// ---- Title ----
var titlePanel = ui.Panel([
  ui.Label('Supervised LULC Classification of Hyderabad', {fontWeight: 'bold', fontSize: '20px', margin: '8px 0 0 8px'}),
  ui.Label('Geospatial Big Data Analysis | Exercise 2', {fontSize: '13px', margin: '2px 0 0 8px', color: '444444'}),
  ui.Label('Use the layer checkboxes to compare the Sentinel-2 composite with the classified LULC map.',
    {fontSize: '12px', margin: '4px 0 8px 8px', fontStyle: 'italic', color: '666666'})
]);

// ---- Legend ----
var legendPanel = ui.Panel({style: {padding: '8px', margin: '4px 0'}});
legendPanel.add(ui.Label('Legend', {fontWeight: 'bold', fontSize: '14px'}));
var legendItems = [
  {name: 'Water', color: '0066CC'},
  {name: 'Built-up', color: 'D73027'},
  {name: 'Vegetation / Tree Cover', color: '1A9850'},
  {name: 'Cropland / Managed Vegetation', color: 'A6D96A'},
  {name: 'Bare / Open Land', color: 'D9A45B'}
];
legendItems.forEach(function(item) {
  var colorBox = ui.Label('', {backgroundColor: item.color, padding: '8px', margin: '2px 6px 2px 0'});
  var label = ui.Label(item.name, {margin: '2px 0'});
  legendPanel.add(ui.Panel([colorBox, label], ui.Panel.Layout.Flow('horizontal')));
});

// ---- Methods ----
var methodsPanel = ui.Panel({style: {padding: '8px', margin: '4px 0'}});
methodsPanel.add(ui.Label('Methods', {fontWeight: 'bold', fontSize: '14px'}));
methodsPanel.add(ui.Label('Imagery: Sentinel-2 SR Harmonized (COPERNICUS/S2_SR_HARMONIZED)'));
methodsPanel.add(ui.Label('Date range: 2024-11-01 to 2025-02-28'));
methodsPanel.add(ui.Label('Scenes used: 31'));
methodsPanel.add(ui.Label('Cloud filter: <20% CLOUDY_PIXEL_PERCENTAGE + SCL masking'));
methodsPanel.add(ui.Label('Predictors: B2, B3, B4, B8, B11, B12, NDVI, NDBI, MNDWI'));
methodsPanel.add(ui.Label('Scale: 10 m'));
methodsPanel.add(ui.Label('Model: Random Forest (trees=100, seed=42)'));

// ---- Results (hardcoded from confirmed console output) ----
var resultsPanel = ui.Panel({style: {padding: '8px', margin: '4px 0'}});
resultsPanel.add(ui.Label('Accuracy Assessment', {fontWeight: 'bold', fontSize: '14px'}));
resultsPanel.add(ui.Label('Validation points: 8318'));
resultsPanel.add(ui.Label('Overall Accuracy: 0.820'));
resultsPanel.add(ui.Label('Kappa Coefficient: 0.699'));
resultsPanel.add(ui.Label('Class-wise Producer\'s / User\'s Accuracy:', {fontWeight: 'bold', margin: '8px 0 2px 0'}));
resultsPanel.add(ui.Label('Water:  Producer=0.955  User=0.959'));
resultsPanel.add(ui.Label('Built-up:  Producer=0.939  User=0.985'));
resultsPanel.add(ui.Label('Vegetation:  Producer=0.920  User=0.633'));
resultsPanel.add(ui.Label('Cropland:  Producer=0.573  User=0.998'));
resultsPanel.add(ui.Label('Bare land:  Producer=0.193  User=0.304'));

// ---- Area Stats (hardcoded from confirmed Area Statistics Table) ----
var areaPanel = ui.Panel({style: {padding: '8px', margin: '4px 0'}});
areaPanel.add(ui.Label('Class Area Statistics', {fontWeight: 'bold', fontSize: '14px'}));
areaPanel.add(ui.Label('Water:  7.89 sq km  (4.1%)'));
areaPanel.add(ui.Label('Built-up:  96.92 sq km  (50.5%)'));
areaPanel.add(ui.Label('Vegetation:  49.92 sq km  (26.0%)'));
areaPanel.add(ui.Label('Cropland:  1.04 sq km  (0.5%)'));
areaPanel.add(ui.Label('Bare land:  35.65 sq km  (18.6%)'));
areaPanel.add(areaChart);

// ---- Interpretation ----
var interpPanel = ui.Panel({style: {padding: '8px', margin: '4px 0'}});
interpPanel.add(ui.Label('Interpretation & Limitations', {fontWeight: 'bold', fontSize: '14px'}));
interpPanel.add(ui.Label(
  'Built-up land is the dominant class in Hyderabad, occupying 96.92 sq km (50.5% of the mapped area), ' +
  'reflecting the city\'s dense urban core. Vegetation (26.0%) and bare land (18.6%) follow, with water ' +
  '(4.1%) and cropland (0.5%) comprising the smallest shares. Built-up and bare land classes show the most ' +
  'spectral confusion, likely due to overlapping reflectance signatures of dry-season exposed soil, ' +
  'construction sites, and bright rooftops. Vegetation and cropland show moderate confusion during the dry ' +
  'season when seasonal crops senesce and approach the spectral profile of natural vegetation. Overall ' +
  'accuracy of 0.82 meets the assignment target of 0.80. Reliability could be further improved through a ' +
  'wetter-season composite for stronger vegetation/cropland separability, additional training samples ' +
  'targeting the confused class pairs, and testing an alternate classifier such as Gradient Tree Boost.',
  {fontSize: '12px'}
));
interpPanel.add(ui.Label('Data source: Copernicus Sentinel-2, ESA / Google Earth Engine.',
  {fontSize: '11px', color: '888888', margin: '8px 0 0 0'}));

// ---- Assemble side panel ----
var scrollPanel = ui.Panel({
  widgets: [titlePanel, legendPanel, methodsPanel, resultsPanel, areaPanel, interpPanel],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '360px', height: '100%'}
});

// ---- Fresh map instance for the App ----
var newMap = ui.Map();
newMap.setOptions('SATELLITE');
newMap.centerObject(hydGeom, 11);
newMap.addLayer(hydGeom, {color: 'red'}, 'Hyderabad Boundary', true, 0.5);
newMap.addLayer(composite, {bands: ['B4','B3','B2'], min: 0, max: 0.3}, 'True Colour Composite');
newMap.addLayer(classified, classVis, 'LULC Classified');

ui.root.clear();
ui.root.add(ui.SplitPanel({
  firstPanel: scrollPanel,
  secondPanel: newMap,
  orientation: 'horizontal',
  wipe: false,
  style: {stretch: 'both'}
}));