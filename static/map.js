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

  window.AeroTravelMap = Object.freeze({ createMap });
})();

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

  window.AeroTravelMap = Object.freeze({
    initMap: window.AeroTravelMap ? window.AeroTravelMap.initMap : undefined,
    updateMarkers: window.AeroTravelMap ? window.AeroTravelMap.updateMarkers : undefined,
    drawRouteLine: window.AeroTravelMap ? window.AeroTravelMap.drawRouteLine : undefined,
    fitRoute: window.AeroTravelMap ? window.AeroTravelMap.fitRoute : undefined,
    enablePointPicker
  });