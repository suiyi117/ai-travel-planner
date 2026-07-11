(function () {
  function createMap(targetId, center, zoom) {
    const map = L.map(targetId, { zoomControl: false }).setView(center, zoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
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

  function replaceRoutePolyline(map, currentLayer, points, options) {
    if (currentLayer) currentLayer.remove();
    if (!points || points.length < 2 || !map || !window.L) return null;
    const status = (options && options.status) || 'estimate';
    return L.polyline(points, {
      color: status === 'provider' ? '#c96442' : '#77736b',
      weight: 4,
      opacity: 0.9,
      dashArray: status === 'provider' ? null : '8 8'
    }).addTo(map);
  }

  window.AeroTravelMap = Object.freeze({
    createMap,
    enablePointPicker,
    replaceRoutePolyline
  });
})();
