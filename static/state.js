(function () {
  const STORAGE_KEY = 'aerotravel:trips';
  const MAX_SAVED_TRIPS = 8;

  const fallbackCenters = {
    北京: { lat: 39.9042, lng: 116.4074 },
    西安: { lat: 34.3416, lng: 108.9398 },
    上海: { lat: 31.2304, lng: 121.4737 },
    成都: { lat: 30.5728, lng: 104.0668 },
    杭州: { lat: 30.2741, lng: 120.1551 },
    广州: { lat: 23.1291, lng: 113.2644 },
    深圳: { lat: 22.5431, lng: 114.0579 },
    重庆: { lat: 29.563, lng: 106.5516 },
    长沙: { lat: 28.2282, lng: 112.9388 },
    南京: { lat: 32.0603, lng: 118.7969 }
  };

  function createInitialState() {
    return {
      cities: [
        { name: '北京', transport: 'auto', days: 2 },
        { name: '西安', transport: 'train', days: 1 }
      ],
      totalDays: 3,
      pace: '适中均衡',
      globalTransport: 'auto',
      budget: '舒适型',
      interests: '',
      currentDay: 1,
      currentFilter: 'all',
      activeItemId: null,
      itinerary: null,
      cityCenters: {},
      cityWeather: {},
      selectedOptions: {},
      editMode: false,
      workingDraft: null,
      candidatePlan: null,
      draftHistory: null,
      appliedUndo: null,
      planningMode: 'itinerary',
      routeShape: 'one_way',
      routeStrategy: 'balanced',
      activeOptimizationController: null,
      activeRouteController: null,
      routeRequestTimer: null,
      cancelPointPicker: null
    };
  }

  window.AeroTravelState = Object.freeze({
    STORAGE_KEY,
    MAX_SAVED_TRIPS,
    fallbackCenters,
    createInitialState
  });
})();
