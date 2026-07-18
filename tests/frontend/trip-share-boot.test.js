const test = require("node:test");
const assert = require("node:assert/strict");

const previewPackage = { id: "preview-1", title: "Preview trip", days: [] };

global.window = {};
global.document = {
  readyState: "loading",
  addEventListener() {}
};
global.sessionStorage = {
  getItem() {
    return null;
  }
};
global.localStorage = {
  getItem(key) {
    return key === "aerotravel:trip-share-preview"
      ? JSON.stringify(previewPackage)
      : null;
  }
};
global.location = { search: "?preview=1" };

require("../../static/js/delivery/trip-share-boot.js");

test("preview pages can load the package saved by the opener tab", () => {
  assert.deepEqual(window.AeroTravelTripShareBoot.loadPackage(), previewPackage);
});

test('share maps keep controls legible and translate overlays when basemap coordinates change', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  assert.match(source, /zoomControlPosition:\s*'topright'/);
  assert.match(source, /attributionControlPosition:\s*'bottomleft'/);
  assert.match(source, /vectorFirst:\s*true/);
  assert.match(source, /function toShareLatLng\(point, map\)/);
  assert.match(source, /AeroTravelMap\.toMapLatLng\(point, map\)/);
  assert.match(source, /function translateMapOverlays\(map, coordinateSystem\)/);
  assert.match(source, /map\.eachLayer\(layer =>/);
  assert.match(source, /addEventListener\('aerotravel:basemapchange'/);
  assert.match(source, /event\.detail\?\.coordinateSystem/);
  assert.match(source, /event\.detail\?\.previousCoordinateSystem/);
});

test('share map fallback remains the no-key Amap raster layer', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  assert.match(source, /webrd0\{s\}\.is\.autonavi\.com/);
  assert.match(source, /detectRetina:\s*false/);
  assert.match(source, /container\.dataset\.basemap = 'raster'/);
});

test('dedicated journey waits for the shared vector basemap and supports app fallbacks', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  assert.match(source, /classList\.add\('is-vector-pending'\)/);
  assert.match(source, /function bindJourneyWorkspace\(pkg\)/);
  assert.match(source, /function openAppLinkWithFallback\(target\)/);
  assert.match(source, /data-app-href/);
  assert.match(source, /visibilityState === 'visible'/);
  assert.match(source, /root\.location\.href = fallbackHref/);
  assert.match(source, /compactMenu\.removeAttribute\('open'\)/);
  assert.doesNotMatch(source, /root\.open\(fallbackHref/);
});

test('dedicated journey keeps map accessibility state in sync with the selected day', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  assert.match(source, /mapNode\.setAttribute\('data-day', String\(day\.day\)\)/);
  assert.match(source, /mapNode\.setAttribute\('aria-label', `Day \$\{day\.day\} 路线地图`\)/);
});

test('local preview resets stale scroll only when no hash target is present', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  assert.match(source, /function resetPreviewScrollPosition\(\)/);
  assert.match(source, /params\.get\('preview'\) !== '1' \|\| root\.location\?\.hash/);
  assert.match(source, /root\.history\.scrollRestoration = 'manual'/);
  assert.match(source, /root\.scrollTo\?\.\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(source, /revealInAppBanner\(\);\s*resetPreviewScrollPosition\(\);/);
});

test('journey focus card visibility stays synchronized with accessibility state', () => {
  const previousDocument = global.document;
  const attributes = {};
  const focusCard = {
    hidden: false,
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };
  global.document = {
    ...previousDocument,
    querySelector(selector) {
      return selector === '[data-focus-card]' ? focusCard : null;
    }
  };

  try {
    window.AeroTravelTripShareBoot.setJourneyFocusCardVisible(false);
    assert.equal(focusCard.hidden, true);
    assert.equal(attributes['aria-hidden'], 'true');

    window.AeroTravelTripShareBoot.setJourneyFocusCardVisible(true);
    assert.equal(focusCard.hidden, false);
    assert.equal(attributes['aria-hidden'], 'false');
  } finally {
    global.document = previousDocument;
  }
});

test('dedicated map dismisses details on background clicks and restores them from places', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  const isBackground = window.AeroTravelTripShareBoot.isJourneyMapBackgroundTarget;
  assert.equal(isBackground({ closest: () => null }), true);
  assert.equal(isBackground({ closest: () => ({}) }), false);
  assert.match(source, /mapNode\?\.setAttribute\('data-dismiss-focus', 'map-background'\)/);
  assert.match(source, /mapNode\?\.addEventListener\('click', event => \{[\s\S]{0,180}setJourneyFocusCardVisible\(false\);[\s\S]{0,40}\}, true\);/);
  assert.match(source, /bubblingMouseEvents:\s*false/);
  assert.match(source, /function updateJourneyFocus[\s\S]{0,180}setJourneyFocusCardVisible\(true\)/);
  assert.match(source, /mapNode\?\.addEventListener\('aerotravel:focusanchor'/);
  assert.match(source, /if \(index >= 0\) updateJourneyFocus/);
});

test('journey fact details share one modal with keyboard and outside-click dismissal', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../../static/js/delivery/trip-share-boot.js'), 'utf8');

  assert.match(source, /function bindJourneyFactDetails\(pkg\)/);
  assert.match(source, /bindJourneyFactDetails\(pkg\);/);
  assert.match(source, /\['budget', 'tips'\]\.includes\(type\)/);
  assert.match(source, /content\.hidden = content\.getAttribute\('data-fact-detail-content'\) !== type/);
  assert.match(source, /trigger\.setAttribute\('aria-expanded'/);
  assert.match(source, /panel\.setAttribute\('data-fact-detail-type', type\)/);
  assert.match(source, /document\.body\.classList\.add\('is-fact-detail-open'\)/);
  assert.match(source, /document\.body\.classList\.remove\('is-fact-detail-open'\)/);
  assert.match(source, /event\.target\.closest\?\.\('\[data-fact-detail-close\]'\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /focusTarget\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /trip-fact-detail-close'\)\?\.focus\(\{ preventScroll: true \}\)/);
});
