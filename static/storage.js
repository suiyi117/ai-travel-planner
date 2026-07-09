(function () {
  function createTripStorage(storageKey, maxSavedTrips) {
    function load() {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function save(entry) {
      try {
        const trips = load();
        trips.unshift(entry);
        trips.length = Math.min(trips.length, maxSavedTrips);
        window.localStorage.setItem(storageKey, JSON.stringify(trips));
      } catch (_) {
        // Storage may be unavailable in private mode; ignore to keep planning usable.
      }
    }

    function remove(id) {
      try {
        const trips = load().filter(entry => entry.id !== id);
        window.localStorage.setItem(storageKey, JSON.stringify(trips));
      } catch (_) {
        // Storage may be unavailable in private mode; ignore to keep planning usable.
      }
    }

    return Object.freeze({ load, save, remove });
  }

  window.AeroTravelStorage = Object.freeze({ createTripStorage });
})();
