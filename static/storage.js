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
        return { ok: true };
      } catch (_) {
        return { ok: false, error: 'storage_unavailable' };
      }
    }

    function remove(id) {
      try {
        const trips = load().filter(entry => entry.id !== id);
        window.localStorage.setItem(storageKey, JSON.stringify(trips));
        return { ok: true };
      } catch (_) {
        return { ok: false, error: 'storage_unavailable' };
      }
    }

    return Object.freeze({ load, save, remove });
  }

  window.AeroTravelStorage = Object.freeze({ createTripStorage });
})();
