(function () {
  const STORAGE_KEY = 'aerotravel:trips';
  const MAX_SAVED_TRIPS = 8;

  const fallbackCenters = {
    // Fallback data follows the same GCJ-02 contract as Amap responses.
    北京: { lat: 39.905603, lng: 116.413642 },
    西安: { lat: 34.340044, lng: 108.944456 },
    上海: { lat: 31.228458, lng: 121.478223 },
    成都: { lat: 30.570346, lng: 104.069305 },
    杭州: { lat: 30.271771, lng: 120.159794 },
    广州: { lat: 23.126423, lng: 113.26973 },
    深圳: { lat: 22.540383, lng: 114.063014 },
    重庆: { lat: 29.560151, lng: 106.555318 },
    长沙: { lat: 28.224692, lng: 112.94425 },
    南京: { lat: 32.058224, lng: 118.802084 }
  };

  function createInitialState() {
    return {
      cities: [
        { name: '北京', transport: 'auto', days: 0, plan_stay: false },
        { name: '西安', transport: 'train', days: 2, plan_stay: true }
      ],
      totalDays: 2,
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
      wizardStep: 1,
      step1Done: false,
      /** Snapshot taken when entering settings from Step 3 workspace; null when not editing-from-workspace. */
      settingsSnapshot: null,
      editingFromWorkspace: false,
      /** Topbar/workspace summary: false = default "收一点". */
      summaryExpanded: false,
      mapDrawerOpen: false,
      mapFocusItemId: null,
      editMode: false,
      editTool: 'daily',
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
      activePlaceSearchController: null,
      placeSearchTimer: null,
      placeSearchResults: [],
      cancelPointPicker: null,
      /** Pure UI route-editor state (not sent to /api/plan). */
      routeDirty: false,
      routeValidation: { ok: false, field: null, message: '' },
      recentlyRemovedCity: null,
      highlightedCityIndex: null,
      routeTip: ''
    };
  }

  window.AeroTravelState = Object.freeze({
    STORAGE_KEY,
    MAX_SAVED_TRIPS,
    fallbackCenters,
    createInitialState
  });
})();
