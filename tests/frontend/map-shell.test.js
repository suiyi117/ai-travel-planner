const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "static/index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "static/css/styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "static/js/app.js"), "utf8");
const mapJs = fs.readFileSync(path.join(repoRoot, "static/js/planning/map.js"), "utf8");
const tripShareBootJs = fs.readFileSync(path.join(repoRoot, "static/js/delivery/trip-share-boot.js"), "utf8");
const tripShareHtml = fs.readFileSync(path.join(repoRoot, "static/trip-share.html"), "utf8");

test("map overlay keeps the map as the primary canvas", () => {
  assert.match(indexHtml, /class="map-workspace"/);
  assert.match(indexHtml, /id="mapStopRail"/);
  assert.match(indexHtml, /id="fitMapBtn"/);
  assert.doesNotMatch(indexHtml, /id="mapViewModeBtn"/);
  assert.doesNotMatch(indexHtml, /style="[^\"]*(grid-template-columns|border-left)/);
  assert.doesNotMatch(stylesCss, /width:\s*min\(48vw,\s*560px\)/);
  assert.match(stylesCss, /\.map-drawer-panel\s*\{[^}]*inset:/s);
  assert.match(stylesCss, /\.map-stop-rail\s*\{/);
});

test("map selection and mobile sheet share the active itinerary item", () => {
  assert.match(appJs, /function renderMapStopRail\(\)/);
  assert.match(appJs, /function setMapViewMode\(/);
  assert.match(appJs, /mapSheetState/);
  assert.match(appJs, /data-map-item/);
  assert.match(stylesCss, /\.map-place-card\[data-sheet="expanded"\]/);
});

test("route geometry keeps a visible hierarchy over the base map", () => {
  assert.match(mapJs, /function routeHaloStyleForStatus\(status\)/);
  assert.match(mapJs, /L\.layerGroup\(\[underlay, foreground\]\)/);
  assert.match(mapJs, /lineCap:\s*['"]round['"]/);
  assert.match(appJs, /replaceRoutePolyline\(map, null, points, \{[\s\S]*status: 'estimate'/);
  assert.match(stylesCss, /\.marker-pin:not\(\.is-focused\)/);
});

test("zoom control follows the app surface language and touch contract", () => {
  assert.match(mapJs, /zoomControlPosition \|\| 'topright'/);
  assert.match(stylesCss, /\.leaflet-control-zoom\s*\{[^}]*border:\s*1px solid var\(--border\)/s);
  assert.match(stylesCss, /\.map-drawer-panel \.leaflet-control-zoom a\s*\{[^}]*min-width:\s*44px/s);
  assert.match(stylesCss, /\.map-drawer-panel \.leaflet-control-zoom a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(stylesCss, /\.leaflet-control-zoom a:focus-visible/);
});

test("interactive maps prefer a high-DPI vector basemap with a raster fallback", () => {
  assert.match(indexHtml, /maplibre-gl@5\.24\.0/);
  assert.match(indexHtml, /maplibre-gl-leaflet@0\.1\.3/);
  assert.match(mapJs, /tiles\.openfreemap\.org\/styles\/bright/);
  assert.match(mapJs, /L\.maplibreGL\(/);
  assert.match(mapJs, /function applyChineseLabels\(/);
  assert.match(mapJs, /name:zh-Hans/);
  assert.match(mapJs, /name:nonlatin/);
  assert.match(mapJs, /detectRetina:\s*false/);
  assert.match(tripShareBootJs, /function createShareMap\(/);
  assert.match(tripShareBootJs, /webrd0\{s\}\.is\.autonavi\.com/);
  assert.match(indexHtml, /trip-publish\.js\?v=[^\s>]+/);
  assert.match(tripShareHtml, /map\.js\?v=[^\s>]+/);
  assert.doesNotMatch(stylesCss, /\.leaflet-tile-pane\s*\{[^}]*contrast\(/s);
});

test('map clients use the active basemap coordinate system for overlays', () => {
  assert.match(mapJs, /function coordinateSystemForMap\(map\)/);
  assert.match(mapJs, /function toMapLatLng\(point, map\)/);
  assert.match(mapJs, /function fromMapLatLng\(point, map\)/);
  assert.match(mapJs, /points\.map\(point => toMapLatLng\(point, map\)\)/);
  assert.match(appJs, /AeroTravelMap\.toMapLatLng\(point, map\)/);
  assert.match(appJs, /addEventListener\('aerotravel:basemapchange'/);
  assert.match(tripShareBootJs, /toMapLatLng\(point, map\)/);
  assert.match(tripShareBootJs, /translateMapOverlays\(map,/);
  assert.match(tripShareBootJs, /addEventListener\('aerotravel:basemapchange'/);
});

test('vector map applies the restrained product palette and keeps Amap fallback attribution', () => {
  assert.match(mapJs, /const BASEMAP_THEME = Object\.freeze\(/);
  assert.match(mapJs, /function applyAeroBasemapTheme\(/);
  assert.match(mapJs, /applyAeroBasemapTheme\(vectorMap\)/);
  assert.match(mapJs, /container\.dataset\.basemap = 'vector'/);
  assert.match(mapJs, /container\.dataset\.basemap = 'raster'/);
  assert.match(mapJs, /const mapIsAlive = \(\) => \(\s*!disposed/);
  assert.match(mapJs, /map\.once\('unload'/);
  assert.match(mapJs, /aerotravel:basemapchange/);
  assert.match(mapJs, /amap\.com/);
  assert.match(mapJs, /OpenFreeMap/);
});
