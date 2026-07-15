(function () {
  function createMap(targetId, center, zoom) {
    const map = L.map(targetId, { zoomControl: false }).setView(center, zoom);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234',
      attribution: '高德地图'
    }).addTo(map);
    return map;
  }

  function enablePointPicker(map, onPick) {
    if (!map) return () => {};
    const container = map.getContainer();
    container.classList.add('is-picking-point');
    function handleClick(event) {
      container.classList.remove('is-picking-point');
      map.off('click', handleClick);
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
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
    const underlay = L.polyline(points, routeHaloStyleForStatus(status));
    const foreground = L.polyline(points, lineStyleForStatus(status));
    return L.layerGroup([underlay, foreground]).addTo(map);
  }

  window.AeroTravelMap = Object.freeze({
    createMap,
    enablePointPicker,
    cssToken,
    lineStyleForStatus,
    routeHaloStyleForStatus,
    replaceRoutePolyline
  });
})();
