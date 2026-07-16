(function () {
  const PI = Math.PI;
  const EARTH_RADIUS = 6378245.0;
  const ECCENTRICITY = 0.006693421622965943;
  const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
  const CHINESE_LABEL_EXPRESSION = [
    'coalesce',
    ['get', 'name:zh-Hans'],
    ['get', 'name:zh'],
    ['get', 'name:nonlatin'],
    ['get', 'name']
  ];

  function normalizeLatLng(point) {
    if (Array.isArray(point)) return [Number(point[0]), Number(point[1])];
    return [Number(point?.lat), Number(point?.lng)];
  }

  function outsideChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function transformLatitude(x, y) {
    let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    value += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
    value += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
    return value;
  }

  function transformLongitude(x, y) {
    let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    value += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
    value += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
    return value;
  }

  function wgs84ToGcj02(point) {
    const [lat, lng] = normalizeLatLng(point);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || outsideChina(lng, lat)) return [lat, lng];
    let dLat = transformLatitude(lng - 105, lat - 35);
    let dLng = transformLongitude(lng - 105, lat - 35);
    const radLat = lat / 180 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - ECCENTRICITY * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = dLat * 180 / ((EARTH_RADIUS * (1 - ECCENTRICITY)) / (magic * sqrtMagic) * PI);
    dLng = dLng * 180 / (EARTH_RADIUS / sqrtMagic * Math.cos(radLat) * PI);
    return [lat + dLat, lng + dLng];
  }

  function gcj02ToWgs84(point) {
    const [lat, lng] = normalizeLatLng(point);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || outsideChina(lng, lat)) return [lat, lng];
    let wgsLat = lat;
    let wgsLng = lng;
    for (let index = 0; index < 8; index += 1) {
      const converted = wgs84ToGcj02([wgsLat, wgsLng]);
      const latDelta = converted[0] - lat;
      const lngDelta = converted[1] - lng;
      wgsLat -= latDelta;
      wgsLng -= lngDelta;
      if (Math.abs(latDelta) < 1e-7 && Math.abs(lngDelta) < 1e-7) break;
    }
    return [wgsLat, wgsLng];
  }

  function toMapLatLng(point) {
    return gcj02ToWgs84(point);
  }

  function fromMapLatLng(point) {
    return wgs84ToGcj02(point);
  }

  function createRasterLayer() {
    return L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234',
      detectRetina: false,
      attribution: '高德地图'
    });
  }

  function applyChineseLabels(vectorMap) {
    const layers = vectorMap?.getStyle?.()?.layers || [];
    layers.forEach(layer => {
      const textField = layer?.layout?.['text-field'];
      if (layer.type !== 'symbol' || !textField || !JSON.stringify(textField).includes('name')) return;
      try {
        vectorMap.setLayoutProperty(layer.id, 'text-field', CHINESE_LABEL_EXPRESSION);
      } catch (_) {
        /* keep the source style for unsupported symbol layers */
      }
    });
  }

  function installVectorBasemap(map, rasterLayer) {
    const container = map.getContainer();
    container.dataset.basemap = 'raster';
    if (!window.maplibregl || typeof L.maplibreGL !== 'function') return;
    try {
      const vectorLayer = L.maplibreGL({
        style: VECTOR_STYLE_URL,
        localIdeographFontFamily: 'Noto Sans CJK SC, Noto Sans SC, Microsoft YaHei, sans-serif',
        attributionControl: {
          customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © OpenMapTiles © OpenStreetMap'
        }
      }).addTo(map);
      const vectorMap = vectorLayer.getMaplibreMap();
      let settled = false;
      const useRaster = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        try { vectorLayer.remove(); } catch (_) { /* keep raster fallback */ }
        container.dataset.basemap = 'raster';
      };
      const timeoutId = setTimeout(useRaster, 10000);
      vectorMap.once('load', () => {
        if (settled) return;
        applyChineseLabels(vectorMap);
        settled = true;
        clearTimeout(timeoutId);
        if (map.hasLayer(rasterLayer)) map.removeLayer(rasterLayer);
        container.dataset.basemap = 'vector';
      });
      vectorMap.on('error', useRaster);
    } catch (_) {
      container.dataset.basemap = 'raster';
    }
  }

  function createMap(targetId, center, zoom, options) {
    const mapOptions = options || {};
    const map = L.map(targetId, { zoomControl: false, minZoom: 2 }).setView(toMapLatLng(center), zoom);
    L.control.zoom({ position: mapOptions.zoomControlPosition || 'bottomleft' }).addTo(map);
    const rasterLayer = createRasterLayer().addTo(map);
    installVectorBasemap(map, rasterLayer);
    return map;
  }

  function enablePointPicker(map, onPick) {
    if (!map) return () => {};
    const container = map.getContainer();
    container.classList.add('is-picking-point');
    function handleClick(event) {
      container.classList.remove('is-picking-point');
      map.off('click', handleClick);
      const [lat, lng] = fromMapLatLng([event.latlng.lat, event.latlng.lng]);
      onPick({ lat, lng });
    }
    map.on('click', handleClick);
    return () => {
      container.classList.remove('is-picking-point');
      map.off('click', handleClick);
    };
  }

  function cssToken(name) {
    if (typeof document === 'undefined' || !document.documentElement) return `var(${name})`;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || `var(${name})`;
  }

  function lineStyleForStatus(status) {
    const base = {
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    };
    if (status === 'provider') {
      return { ...base, color: cssToken('--accent'), weight: 4.5, opacity: 0.96, dashArray: null };
    }
    if (status === 'intercity') {
      return { ...base, color: cssToken('--fg-2'), weight: 4, opacity: 0.94, dashArray: '2 8' };
    }
    return { ...base, color: cssToken('--muted'), weight: 3.6, opacity: 0.94, dashArray: '10 8' };
  }

  function routeHaloStyleForStatus(status) {
    const foreground = lineStyleForStatus(status);
    return {
      ...foreground,
      color: cssToken('--surface'),
      weight: Math.max(foreground.weight + 6, 9),
      opacity: 0.86
    };
  }

  function replaceRoutePolyline(map, currentLayer, points, options) {
    if (currentLayer) currentLayer.remove();
    if (!points || points.length < 2 || !map || !window.L) return null;
    const status = (options && options.status) || 'estimate';
    const mapPoints = points.map(toMapLatLng);
    const underlay = L.polyline(mapPoints, routeHaloStyleForStatus(status));
    const foreground = L.polyline(mapPoints, lineStyleForStatus(status));
    return L.layerGroup([underlay, foreground]).addTo(map);
  }

  window.AeroTravelMap = Object.freeze({
    createMap,
    createRasterLayer,
    installVectorBasemap,
    applyChineseLabels,
    wgs84ToGcj02,
    gcj02ToWgs84,
    toMapLatLng,
    fromMapLatLng,
    enablePointPicker,
    cssToken,
    lineStyleForStatus,
    routeHaloStyleForStatus,
    replaceRoutePolyline
  });
})();
