const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/js/planning/map.js");

const MapUtils = window.AeroTravelMap;

test("GCJ-02 display coordinates round-trip through WGS84", () => {
  const gcj = [34.2655, 108.9531];
  const wgs = MapUtils.gcj02ToWgs84(gcj);
  const roundTrip = MapUtils.wgs84ToGcj02(wgs);

  assert.ok(Math.abs(gcj[0] - wgs[0]) > 0.001);
  assert.ok(Math.abs(gcj[1] - wgs[1]) > 0.001);
  assert.ok(Math.abs(gcj[0] - roundTrip[0]) < 1e-6);
  assert.ok(Math.abs(gcj[1] - roundTrip[1]) < 1e-6);
});

test('vector activation and WebGL fallback preserve the visible place and emit coordinate changes', () => {
  const previousL = global.L;
  const previousMapLibre = window.maplibregl;
  const previousCustomEvent = window.CustomEvent;
  const events = [];
  const paintUpdates = [];
  const container = {
    dataset: {},
    dispatchEvent(event) {
      events.push(event);
    }
  };
  let center = { lat: 39.9163, lng: 116.3972 };
  let rasterMounted = true;
  let loadHandler;
  let contextLostHandler;
  let vectorRemoveCount = 0;
  const rasterLayer = {
    addTo() {
      rasterMounted = true;
      return this;
    }
  };
  const vectorMap = {
    getStyle() {
      return { layers: [{ id: 'background', type: 'background' }] };
    },
    setPaintProperty(id, property, value) {
      paintUpdates.push({ id, property, value });
    },
    setLayoutProperty() {},
    once(eventName, handler) {
      if (eventName === 'load') loadHandler = handler;
    },
    getCanvas() {
      return {
        addEventListener(eventName, handler) {
          if (eventName === 'webglcontextlost') contextLostHandler = handler;
        }
      };
    }
  };
  const vectorLayer = {
    getMaplibreMap() {
      return vectorMap;
    },
    remove() {
      vectorRemoveCount += 1;
    }
  };
  const map = {
    _aeroCoordinateSystem: 'gcj02',
    getContainer() {
      return container;
    },
    getCenter() {
      return center;
    },
    getZoom() {
      return 12;
    },
    hasLayer(layer) {
      return layer === rasterLayer && rasterMounted;
    },
    removeLayer(layer) {
      if (layer === rasterLayer) rasterMounted = false;
    },
    setView(point) {
      center = { lat: Number(point[0]), lng: Number(point[1]) };
      return this;
    }
  };
  global.L = {
    maplibreGL() {
      return {
        addTo() {
          return vectorLayer;
        }
      };
    }
  };
  window.maplibregl = {};
  window.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  try {
    MapUtils.installVectorBasemap(map, rasterLayer);
    assert.equal(typeof loadHandler, 'function');
    assert.equal(typeof contextLostHandler, 'function');

    loadHandler();
    const wgsCenter = MapUtils.gcj02ToWgs84([39.9163, 116.3972]);
    assert.equal(map._aeroCoordinateSystem, 'wgs84');
    assert.equal(container.dataset.basemap, 'vector');
    assert.equal(rasterMounted, false);
    assert.ok(Math.abs(center.lat - wgsCenter[0]) < 1e-7);
    assert.ok(Math.abs(center.lng - wgsCenter[1]) < 1e-7);
    assert.equal(events.at(-1).type, 'aerotravel:basemapchange');
    assert.equal(events.at(-1).detail.coordinateSystem, 'wgs84');
    assert.equal(events.at(-1).detail.previousCoordinateSystem, 'gcj02');
    assert.ok(paintUpdates.some(update => (
      update.property === 'background-color'
      && update.value === MapUtils.BASEMAP_THEME.land
    )));

    contextLostHandler();
    assert.equal(map._aeroCoordinateSystem, 'gcj02');
    assert.equal(container.dataset.basemap, 'raster');
    assert.equal(rasterMounted, true);
    assert.ok(Math.abs(center.lat - 39.9163) < 1e-6);
    assert.ok(Math.abs(center.lng - 116.3972) < 1e-6);
    assert.equal(events.at(-1).detail.coordinateSystem, 'gcj02');
    assert.equal(events.at(-1).detail.previousCoordinateSystem, 'wgs84');
    assert.equal(vectorRemoveCount, 1);
  } finally {
    if (previousL === undefined) delete global.L;
    else global.L = previousL;
    window.maplibregl = previousMapLibre;
    window.CustomEvent = previousCustomEvent;
  }
});

test('createMap defaults to top-right zoom, bottom-left attribution, and raw GCJ center', () => {
  const previousL = global.L;
  const previousMapLibre = window.maplibregl;
  const calls = {};
  const container = { dataset: {} };
  const map = {
    attributionControl: {
      setPrefix(value) { calls.prefix = value; },
      setPosition(value) { calls.attribution = value; }
    },
    setView(center, zoom) {
      calls.center = center;
      calls.zoom = zoom;
      return this;
    },
    getContainer() {
      return container;
    }
  };
  global.L = {
    map(target, options) {
      calls.target = target;
      calls.options = options;
      return map;
    },
    control: {
      zoom(options) {
        calls.zoomControl = options;
        return { addTo() {} };
      }
    },
    tileLayer(url, options) {
      calls.tileUrl = url;
      calls.tileOptions = options;
      return {
        addTo() {
          return this;
        }
      };
    }
  };
  window.maplibregl = null;

  try {
    const created = MapUtils.createMap('map', [39.9163, 116.3972], 12);
    assert.equal(created, map);
    assert.equal(created._aeroCoordinateSystem, 'gcj02');
    assert.deepEqual(calls.center, [39.9163, 116.3972]);
    assert.equal(calls.zoomControl.position, 'topright');
    assert.equal(calls.attribution, 'bottomleft');
    assert.equal(calls.prefix, false);
    assert.equal(calls.tileOptions.detectRetina, false);
  } finally {
    if (previousL === undefined) delete global.L;
    else global.L = previousL;
    window.maplibregl = previousMapLibre;
  }
});

test('createMap can start directly on the vector basemap without mounting Amap first', () => {
  const previousL = global.L;
  const previousMapLibre = window.maplibregl;
  const calls = { centers: [], rasterMounts: 0 };
  const container = {
    dataset: {},
    dispatchEvent() {}
  };
  let loadHandler;
  let rasterMounted = false;
  let center = null;
  const rasterLayer = {
    addTo() {
      calls.rasterMounts += 1;
      rasterMounted = true;
      return this;
    }
  };
  const vectorMap = {
    getStyle() { return { layers: [] }; },
    setPaintProperty() {},
    setLayoutProperty() {},
    once(eventName, handler) {
      if (eventName === 'load') loadHandler = handler;
    },
    getCanvas() { return { addEventListener() {} }; }
  };
  const vectorLayer = {
    getMaplibreMap() { return vectorMap; },
    remove() {}
  };
  const map = {
    attributionControl: {
      setPrefix() {},
      setPosition() {}
    },
    setView(point) {
      center = { lat: Number(point[0]), lng: Number(point[1]) };
      calls.centers.push([center.lat, center.lng]);
      return this;
    },
    getCenter() { return center; },
    getZoom() { return 12; },
    getContainer() { return container; },
    hasLayer(layer) { return layer === rasterLayer && rasterMounted; },
    removeLayer(layer) {
      if (layer === rasterLayer) rasterMounted = false;
    }
  };
  global.L = {
    map() { return map; },
    control: {
      zoom() { return { addTo() {} }; }
    },
    tileLayer() { return rasterLayer; },
    maplibreGL() {
      return { addTo() { return vectorLayer; } };
    }
  };
  window.maplibregl = {};

  try {
    const gcjCenter = [39.9163, 116.3972];
    const wgsCenter = MapUtils.gcj02ToWgs84(gcjCenter);
    const created = MapUtils.createMap('map', gcjCenter, 12, { vectorFirst: true });

    assert.equal(created._aeroCoordinateSystem, 'wgs84');
    assert.equal(container.dataset.basemap, 'vector-pending');
    assert.equal(calls.rasterMounts, 0);
    assert.ok(Math.abs(calls.centers[0][0] - wgsCenter[0]) < 1e-7);
    assert.ok(Math.abs(calls.centers[0][1] - wgsCenter[1]) < 1e-7);

    loadHandler();
    assert.equal(container.dataset.basemap, 'vector');
    assert.equal(calls.rasterMounts, 0);
    assert.equal(calls.centers.length, 1);
  } finally {
    if (previousL === undefined) delete global.L;
    else global.L = previousL;
    window.maplibregl = previousMapLibre;
  }
});

test('basemap theme assigns the quiet travel palette by layer role', () => {
  const theme = MapUtils.BASEMAP_THEME;
  assert.equal(
    MapUtils.themePatchForLayer({ id: 'background', type: 'background' }).paint['background-color'],
    theme.land
  );
  assert.equal(
    MapUtils.themePatchForLayer({ id: 'water', type: 'fill', 'source-layer': 'water' }).paint['fill-color'],
    theme.water
  );
  assert.equal(
    MapUtils.themePatchForLayer({ id: 'road-primary', type: 'line', 'source-layer': 'transportation' }).paint['line-color'],
    theme.road
  );
  const poi = MapUtils.themePatchForLayer({ id: 'poi-label', type: 'symbol', 'source-layer': 'poi' });
  assert.equal(poi.paint['text-color'], theme.poiText);
  assert.deepEqual(poi.layout['text-field'], [
    'coalesce',
    ['get', 'name:zh-Hans'],
    ['get', 'name:zh'],
    ['get', 'name:nonlatin'],
    ['get', 'name']
  ]);
});

test('map-aware conversion keeps Amap raster coordinates and converts vector coordinates', () => {
  const gcj = [39.9163, 116.3972];
  const rasterMap = { _aeroCoordinateSystem: 'gcj02' };
  const vectorMap = { _aeroCoordinateSystem: 'wgs84' };

  assert.equal(MapUtils.coordinateSystemForMap(rasterMap), 'gcj02');
  assert.equal(MapUtils.coordinateSystemForMap(vectorMap), 'wgs84');
  assert.deepEqual(MapUtils.toMapLatLng(gcj, rasterMap), gcj);
  assert.deepEqual(MapUtils.fromMapLatLng(gcj, rasterMap), gcj);

  const vectorPoint = MapUtils.toMapLatLng(gcj, vectorMap);
  assert.deepEqual(vectorPoint, MapUtils.gcj02ToWgs84(gcj));
  const roundTrip = MapUtils.fromMapLatLng(vectorPoint, vectorMap);
  assert.ok(Math.abs(roundTrip[0] - gcj[0]) < 1e-6);
  assert.ok(Math.abs(roundTrip[1] - gcj[1]) < 1e-6);
});

test("coordinates outside China remain unchanged", () => {
  const london = [51.5074, -0.1278];
  assert.deepEqual(MapUtils.gcj02ToWgs84(london), london);
  assert.deepEqual(MapUtils.wgs84ToGcj02(london), london);
});

test("vector labels replace bilingual names with Chinese-priority fields", () => {
  const updates = [];
  MapUtils.applyChineseLabels({
    getStyle() {
      return {
        layers: [
          { id: 'city', type: 'symbol', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'] } },
          { id: "city", type: "symbol", layout: { "text-field": ["concat", ["get", "name:latin"], ["get", "name:nonlatin"]] } },
          { id: "road-shield", type: "symbol", layout: { "text-field": ["get", "ref"] } },
          { id: "road", type: "line", layout: {} }
        ]
      };
    },
    setLayoutProperty(id, property, value) {
      updates.push({ id, property, value });
    }
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "city");
  assert.equal(updates[0].property, "text-field");
  assert.deepEqual(updates[0].value, [
    "coalesce",
    ["get", "name:zh-Hans"],
    ["get", "name:zh"],
    ["get", "name:nonlatin"],
    ["get", "name"]
  ]);
});
