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

  const BASEMAP_THEME = Object.freeze({
    land: '#f2efeb',
    road: '#fffdf9',
    roadCasing: '#d5dadd',
    building: '#e7e2dd',
    water: '#dce9ec',
    park: '#cfe7c8',
    boundary: '#c8c4bd',
    placeText: '#4e6574',
    roadText: '#5f6160',
    poiText: '#a85f43',
    halo: '#fffdf9'
  });

  function themePatchForLayer(layer) {
    const type = String(layer?.type || '');
    const sourceLayer = String(layer?.['source-layer'] || '').toLowerCase();
    const identity = `${String(layer?.id || '').toLowerCase()} ${sourceLayer}`;
    const paint = {};
    const layout = {};

    if (type === 'background') {
      paint['background-color'] = BASEMAP_THEME.land;
    } else if (type === 'fill') {
      if (/water/.test(identity)) {
        paint['fill-color'] = BASEMAP_THEME.water;
      } else if (/park|grass|wood|forest|garden|green/.test(identity)) {
        paint['fill-color'] = BASEMAP_THEME.park;
        paint['fill-opacity'] = 0.86;
      } else if (/building/.test(identity)) {
        paint['fill-color'] = BASEMAP_THEME.building;
        paint['fill-outline-color'] = '#d9d3cd';
      } else if (/land|landcover|landuse/.test(identity)) {
        paint['fill-color'] = BASEMAP_THEME.land;
      }
    } else if (type === 'line') {
      if (/boundary|admin/.test(identity)) {
        paint['line-color'] = BASEMAP_THEME.boundary;
        paint['line-opacity'] = 0.62;
      } else if (/transportation|road|street|path|bridge|tunnel/.test(identity)) {
        const isCasing = /casing|outline/.test(identity);
        paint['line-color'] = isCasing ? BASEMAP_THEME.roadCasing : BASEMAP_THEME.road;
        paint['line-opacity'] = isCasing ? 0.9 : 0.98;
      }
    } else if (type === 'symbol') {
      const isNamedLayer = /place|poi|transportation_name|road_name|water_name|aeroway/.test(identity);
      if (isNamedLayer) {
        layout['text-field'] = CHINESE_LABEL_EXPRESSION;
        paint['text-halo-color'] = BASEMAP_THEME.halo;
        paint['text-halo-width'] = /place/.test(identity) ? 2 : 1.55;
        paint['text-halo-blur'] = 0.2;
        if (/poi/.test(identity)) {
          paint['text-color'] = BASEMAP_THEME.poiText;
          paint['text-opacity'] = 0.84;
          paint['icon-opacity'] = 0.78;
        } else if (/transportation_name|road_name/.test(identity)) {
          paint['text-color'] = BASEMAP_THEME.roadText;
          paint['text-opacity'] = 0.88;
        } else {
          paint['text-color'] = BASEMAP_THEME.placeText;
          paint['text-opacity'] = 0.94;
        }
      }
    }

    return { paint, layout };
  }

  function applyAeroBasemapTheme(vectorMap) {
    const layers = vectorMap?.getStyle?.()?.layers || [];
    layers.forEach(layer => {
      const patch = themePatchForLayer(layer);
      Object.entries(patch.paint).forEach(([property, value]) => {
        try { vectorMap.setPaintProperty(layer.id, property, value); } catch (_) { /* unsupported property */ }
      });
      Object.entries(patch.layout).forEach(([property, value]) => {
        try { vectorMap.setLayoutProperty(layer.id, property, value); } catch (_) { /* unsupported property */ }
      });
    });
  }

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

  function coordinateSystemForMap(map) {
    return map?._aeroCoordinateSystem === 'wgs84' ? 'wgs84' : 'gcj02';
  }

  function toMapLatLng(point, map) {
    const normalized = normalizeLatLng(point);
    return coordinateSystemForMap(map) === 'wgs84'
      ? gcj02ToWgs84(normalized)
      : normalized;
  }

  function fromMapLatLng(point, map) {
    const normalized = normalizeLatLng(point);
    return coordinateSystemForMap(map) === 'wgs84'
      ? wgs84ToGcj02(normalized)
      : normalized;
  }

  function createRasterLayer() {
    return L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234',
      detectRetina: false,
      attribution: `<a href='https://www.amap.com/' target='_blank' rel='noopener'>© 高德地图</a>`
    });
  }

  function applyChineseLabels(vectorMap) {
    const layers = vectorMap?.getStyle?.()?.layers || [];
    layers.forEach(layer => {
      const textField = layer?.layout?.['text-field'];
      const identity = `${String(layer?.id || '').toLowerCase()} ${String(layer?.['source-layer'] || '').toLowerCase()}`;
      if (
        layer.type !== 'symbol'
        || !textField
        || !JSON.stringify(textField).includes('name')
        || !/place|poi|transportation_name|road_name|water_name|aeroway/.test(identity)
      ) return;
      try {
        vectorMap.setLayoutProperty(layer.id, 'text-field', CHINESE_LABEL_EXPRESSION);
      } catch (_) {
        /* keep the source style for unsupported symbol layers */
      }
    });
  }

  function installVectorBasemap(map, rasterLayer, options) {
    const container = map.getContainer();
    const vectorFirst = options?.vectorFirst === true;
    map._aeroCoordinateSystem = vectorFirst ? 'wgs84' : 'gcj02';
    container.dataset.basemap = vectorFirst ? 'vector-pending' : 'raster';
    const emitBasemapChange = previousCoordinateSystem => {
      if (typeof container.dispatchEvent !== 'function' || typeof window.CustomEvent !== 'function') return;
      container.dispatchEvent(new window.CustomEvent('aerotravel:basemapchange', {
        detail: {
          coordinateSystem: coordinateSystemForMap(map),
          previousCoordinateSystem
        }
      }));
    };
    const mountRasterBasemap = emitChange => {
      const previousSystem = coordinateSystemForMap(map);
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      if (!map.hasLayer(rasterLayer)) rasterLayer.addTo(map);
      map._aeroCoordinateSystem = 'gcj02';
      if (previousSystem === 'wgs84') {
        map.setView(wgs84ToGcj02([currentCenter.lat, currentCenter.lng]), currentZoom, { animate: false });
      }
      container.dataset.basemap = 'raster';
      if (emitChange) emitBasemapChange(previousSystem);
    };
    if (!window.maplibregl || typeof L.maplibreGL !== 'function') {
      if (vectorFirst) mountRasterBasemap(false);
      return;
    }
    let vectorLayer = null;
    try {
      vectorLayer = L.maplibreGL({
        style: VECTOR_STYLE_URL,
        localIdeographFontFamily: 'Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
        attributionControl: {
          customAttribution: `<a href='https://openfreemap.org' target='_blank' rel='noopener'>OpenFreeMap</a> · © <a href='https://openmaptiles.org/' target='_blank' rel='noopener'>OpenMapTiles</a> · © <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener'>OpenStreetMap</a>`
        }
      }).addTo(map);
      const vectorMap = vectorLayer.getMaplibreMap();
      let settled = false;
      let disposed = false;
      const hasLifecycleEvents = typeof map.once === 'function';
      const mapIsAlive = () => (
        !disposed && (!hasLifecycleEvents || Boolean(map._loaded && map._mapPane))
      );
      const useRaster = (force) => {
        if (!mapIsAlive()) {
          settled = true;
          clearTimeout(timeoutId);
          return;
        }
        if (settled && !force) return;
        settled = true;
        clearTimeout(timeoutId);
        try { vectorLayer.remove(); } catch (_) { /* keep raster fallback */ }
        mountRasterBasemap(true);
      };
      const activateVector = () => {
        if (settled || !mapIsAlive()) return;
        const previousSystem = coordinateSystemForMap(map);
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        applyChineseLabels(vectorMap);
        applyAeroBasemapTheme(vectorMap);
        settled = true;
        clearTimeout(timeoutId);
        map._aeroCoordinateSystem = 'wgs84';
        if (map.hasLayer(rasterLayer)) map.removeLayer(rasterLayer);
        if (previousSystem === 'gcj02') {
          map.setView(gcj02ToWgs84([currentCenter.lat, currentCenter.lng]), currentZoom, { animate: false });
        }
        container.dataset.basemap = 'vector';
        emitBasemapChange(previousSystem);
      };
      const timeoutId = setTimeout(useRaster, 12000);
      if (hasLifecycleEvents) {
        map.once('unload', () => {
          disposed = true;
          settled = true;
          clearTimeout(timeoutId);
        });
      }
      vectorMap.once('load', () => {
        if (settled) return;
        activateVector();
      });
      vectorMap.getCanvas?.().addEventListener('webglcontextlost', () => useRaster(true), { once: true });
    } catch (_) {
      try { vectorLayer?.remove(); } catch (_err) { /* continue with raster fallback */ }
      mountRasterBasemap(false);
    }
  }

  function createMap(targetId, center, zoom, options) {
    const mapOptions = options || {};
    const vectorFirst = mapOptions.vectorFirst === true
      && Boolean(window.maplibregl)
      && typeof L.maplibreGL === 'function';
    const initialCenter = vectorFirst ? gcj02ToWgs84(center) : normalizeLatLng(center);
    const map = L.map(targetId, { zoomControl: false, minZoom: 2 }).setView(initialCenter, zoom);
    map._aeroCoordinateSystem = vectorFirst ? 'wgs84' : 'gcj02';
    map.attributionControl?.setPrefix(false);
    map.attributionControl?.setPosition(mapOptions.attributionControlPosition || 'bottomleft');
    L.control.zoom({
      position: mapOptions.zoomControlPosition || 'topright',
      zoomInTitle: '放大地图',
      zoomOutTitle: '缩小地图'
    }).addTo(map);
    const rasterLayer = createRasterLayer();
    if (!vectorFirst) rasterLayer.addTo(map);
    installVectorBasemap(map, rasterLayer, { vectorFirst });
    return map;
  }

  function enablePointPicker(map, onPick) {
    if (!map) return () => {};
    const container = map.getContainer();
    container.classList.add('is-picking-point');
    function handleClick(event) {
      container.classList.remove('is-picking-point');
      map.off('click', handleClick);
      const [lat, lng] = fromMapLatLng([event.latlng.lat, event.latlng.lng], map);
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
    const mapPoints = points.map(point => toMapLatLng(point, map));
    const underlay = L.polyline(mapPoints, routeHaloStyleForStatus(status));
    const foreground = L.polyline(mapPoints, lineStyleForStatus(status));
    return L.layerGroup([underlay, foreground]).addTo(map);
  }

  window.AeroTravelMap = Object.freeze({
    BASEMAP_THEME,
    createMap,
    createRasterLayer,
    installVectorBasemap,
    applyChineseLabels,
    applyAeroBasemapTheme,
    themePatchForLayer,
    wgs84ToGcj02,
    gcj02ToWgs84,
    coordinateSystemForMap,
    toMapLatLng,
    fromMapLatLng,
    enablePointPicker,
    cssToken,
    lineStyleForStatus,
    routeHaloStyleForStatus,
    replaceRoutePolyline
  });
})();
