const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "static/index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "static/styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "static/app.js"), "utf8");
const mapJs = fs.readFileSync(path.join(repoRoot, "static/map.js"), "utf8");

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
  assert.match(mapJs, /L\.control\.zoom\(\{ position: 'bottomleft' \}\)/);
  assert.match(stylesCss, /\.leaflet-control-zoom\s*\{[^}]*border:\s*1px solid var\(--border\)/s);
  assert.match(stylesCss, /\.map-drawer-panel \.leaflet-control-zoom a\s*\{[^}]*min-width:\s*44px/s);
  assert.match(stylesCss, /\.map-drawer-panel \.leaflet-control-zoom a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(stylesCss, /\.leaflet-control-zoom a:focus-visible/);
});
