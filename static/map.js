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
