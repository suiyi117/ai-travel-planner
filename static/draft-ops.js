(function (root) {
  const { clone, isTripDraft } = root.AeroTravelDraft;
  const CONSTRAINT_KEYS = ['required', 'fixed_day', 'fixed_time', 'fixed_order'];
  const USER_REQUIRED_SOURCES = new Set(['manual', 'amap_search', 'map_pick']);
  const NODE_SOURCES = new Set(['ai', 'system', 'amap_search', 'map_pick', 'manual', 'city_stop']);

  function next(draft) {
    const result = clone(draft);
    const revision = Number(draft.revision);
    result.revision = Number.isSafeInteger(revision) && revision >= 0 ? revision + 1 : 1;
    return result;
  }

  function finish(original, result) {
    if (typeof isTripDraft === 'function' && isTripDraft(original) && !isTripDraft(result)) {
      throw new Error('invalid_draft');
    }
    return result;
  }

  function boundedText(value, field, { allowNull = false } = {}) {
    if (allowNull && value == null) return null;
    const text = String(value ?? '').trim();
    if (!text || text.length > 200) throw new Error(`invalid_${field}`);
    return text;
  }

  function coordinate(value, min, max) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function durationMinutes(value, fallback = 0) {
    if (value === '' || value == null) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1440, Math.round(number)));
  }

  function metadataValue(value) {
    if (value == null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_metadata');
    const metadata = clone(value);
    if (Object.keys(metadata).length > 30) throw new Error('invalid_metadata');
    return metadata;
  }

  function normalizeIndex(value, length) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(Math.trunc(number), length));
  }

  function findNode(draft, nodeId) {
    const node = draft.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error(`unknown node: ${nodeId}`);
    return node;
  }

  function updateManualRanks(draft) {
    const nodeById = new Map(draft.nodes.map(node => [node.id, node]));
    for (const day of draft.days) {
      day.node_ids.forEach((nodeId, index) => {
        const node = nodeById.get(nodeId);
        if (node) node.manual_rank = index;
      });
    }
  }

  function lockedAnchorPositions(draft) {
    const dayPositionByNode = new Map();
    for (const day of draft.days) {
      day.node_ids.forEach((nodeId, index) => {
        dayPositionByNode.set(nodeId, { dayId: day.id, index });
      });
    }

    const routeIds = draft.mode === 'self_drive' && Array.isArray(draft.route?.ordered_node_ids)
      ? draft.route.ordered_node_ids
      : [];
    const routeIndexByNode = new Map(routeIds.map((nodeId, index) => [nodeId, index]));

    return draft.nodes.flatMap(node => {
      if (node.schedule.day_id == null
        || (!node.constraints.fixed_order && !node.constraints.fixed_time)) {
        return [];
      }
      const dayPosition = dayPositionByNode.get(node.id);
      return [{
        id: node.id,
        fixedOrder: node.constraints.fixed_order,
        fixedTime: node.constraints.fixed_time,
        dayId: dayPosition?.dayId ?? node.schedule.day_id,
        dayIndex: dayPosition?.index ?? -1,
        routeIndex: routeIndexByNode.get(node.id) ?? -1
      }];
    });
  }

  function assertLockedAnchorsStable(before, draft) {
    const after = new Map(lockedAnchorPositions(draft).map(anchor => [anchor.id, anchor]));
    const moved = anchor => {
      const current = after.get(anchor.id);
      return current == null
        || current.dayId !== anchor.dayId
        || current.dayIndex !== anchor.dayIndex
        || current.routeIndex !== anchor.routeIndex;
    };
    if (before.some(anchor => anchor.fixedOrder && moved(anchor))) {
      throw new Error('fixed_order_locked');
    }
    if (before.some(anchor => anchor.fixedTime && moved(anchor))) {
      throw new Error('fixed_time_order_locked');
    }
  }

  function addNode(draft, place, idFactory = () => globalThis.crypto.randomUUID()) {
    const result = next(draft);
    if (result.nodes.length >= 200) throw new Error('node_limit_reached');

    const cityId = boundedText(place?.city_id, 'city_id');
    const cityStop = result.city_stops.find(city => city.id === cityId);
    if (!cityStop) throw new Error(`unknown city: ${cityId}`);

    const rawId = idFactory();
    const id = boundedText(rawId, 'node_id');
    if (result.nodes.some(node => node.id === id)) throw new Error(`duplicate node: ${id}`);

    const requestedSource = String(place?.source || 'manual');
    const source = NODE_SOURCES.has(requestedSource) ? requestedSource : 'manual';
    const lat = coordinate(place?.lat, -90, 90);
    const lng = coordinate(place?.lng, -180, 180);
    const providerId = place?.provider_id == null || String(place.provider_id).trim() === ''
      ? null
      : boundedText(place.provider_id, 'provider_id');
    const city = place?.city == null || String(place.city).trim() === ''
      ? cityStop.name
      : boundedText(place.city, 'city');

    result.nodes.push({
      id,
      source,
      provider_id: providerId,
      name: boundedText(place?.name, 'node_name'),
      city_id: cityId,
      city,
      location: {
        lat: lat ?? 0,
        lng: lng ?? 0,
        status: lat != null && lng != null ? 'resolved' : 'unresolved'
      },
      status: 'wishlist',
      duration_minutes: durationMinutes(place?.duration_minutes, 120),
      schedule: { day_id: null, time_window: null },
      constraints: {
        required: USER_REQUIRED_SOURCES.has(source),
        fixed_day: false,
        fixed_time: false,
        fixed_order: false
      },
      manual_rank: null,
      metadata: metadataValue(place?.metadata)
    });
    return finish(draft, result);
  }

  function moveNode(draft, nodeId, dayId, targetIndex = 0) {
    const result = next(draft);
    const lockedAnchors = lockedAnchorPositions(result);
    const node = findNode(result, nodeId);
    const targetDay = dayId == null ? null : result.days.find(day => day.id === dayId);
    if (dayId != null && !targetDay) throw new Error(`unknown day: ${dayId}`);

    const currentDay = result.days.find(day => day.node_ids.includes(nodeId)) || null;
    const currentIndex = currentDay ? currentDay.node_ids.indexOf(nodeId) : -1;
    const targetLength = targetDay
      ? targetDay.node_ids.filter(id => id !== nodeId).length
      : 0;
    const desiredIndex = targetDay ? normalizeIndex(targetIndex, targetLength) : -1;
    const changesDay = node.schedule.day_id != null && dayId !== node.schedule.day_id;
    const changesOrder = node.schedule.day_id != null && (
      changesDay || desiredIndex !== currentIndex
    );

    if (node.constraints.fixed_day && changesDay) throw new Error('fixed_day_locked');
    if (node.constraints.fixed_order && changesOrder) throw new Error('fixed_order_locked');
    if (node.constraints.fixed_time && changesDay) throw new Error('fixed_time_locked');
    if (node.constraints.fixed_time && changesOrder) throw new Error('fixed_time_order_locked');

    result.days.forEach(day => {
      day.node_ids = day.node_ids.filter(id => id !== nodeId);
    });

    if (targetDay == null) {
      node.status = 'wishlist';
      node.schedule.day_id = null;
      node.schedule.time_window = null;
      node.manual_rank = null;
      if (result.mode === 'self_drive' && Array.isArray(result.route?.ordered_node_ids)) {
        result.route.ordered_node_ids = result.route.ordered_node_ids.filter(id => id !== nodeId);
      }
      updateManualRanks(result);
      assertLockedAnchorsStable(lockedAnchors, result);
      return finish(draft, result);
    }

    targetDay.node_ids.splice(desiredIndex, 0, nodeId);
    node.status = 'scheduled';
    node.schedule.day_id = targetDay.id;
    if (result.mode === 'self_drive' && Array.isArray(result.route?.ordered_node_ids)
      && !result.route.ordered_node_ids.includes(nodeId)) {
      result.route.ordered_node_ids.push(nodeId);
    }
    updateManualRanks(result);
    assertLockedAnchorsStable(lockedAnchors, result);
    return finish(draft, result);
  }

  function updateNode(draft, nodeId, patch = {}) {
    const result = next(draft);
    const node = findNode(result, nodeId);
    if (Object.hasOwn(patch, 'name')) {
      node.name = boundedText(patch.name, 'node_name');
    }
    if (Object.hasOwn(patch, 'duration_minutes')) {
      node.duration_minutes = durationMinutes(patch.duration_minutes);
    }
    return finish(draft, result);
  }

  function reorderCityStops(draft, fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
      || fromIndex < 0 || fromIndex >= draft.city_stops.length
      || toIndex < 0 || toIndex >= draft.city_stops.length
      || fromIndex === toIndex) {
      return clone(draft);
    }

    const result = next(draft);
    const fixedAt = new Map(result.city_stops.flatMap((city, index) => (
      city.fixed_order ? [[index, city.id]] : []
    )));
    const chronologicalDates = result.days.map(day => day.date ?? null);
    const oldDayRank = new Map(result.days.map((day, index) => [day.id, index]));

    const [moved] = result.city_stops.splice(fromIndex, 1);
    result.city_stops.splice(toIndex, 0, moved);
    if ([...fixedAt].some(([index, id]) => result.city_stops[index]?.id !== id)) {
      return clone(draft);
    }

    const cityRank = new Map(result.city_stops.map((city, index) => [city.id, index]));
    result.days.sort((left, right) => (
      (cityRank.get(left.primary_city_id) ?? Number.MAX_SAFE_INTEGER)
      - (cityRank.get(right.primary_city_id) ?? Number.MAX_SAFE_INTEGER)
      || oldDayRank.get(left.id) - oldDayRank.get(right.id)
    ));

    const newDayRank = new Map(result.days.map((day, index) => [day.id, index]));
    const fixedDayIds = result.nodes
      .filter(node => node.constraints.fixed_day && node.schedule.day_id != null)
      .map(node => node.schedule.day_id);
    if (fixedDayIds.some(dayId => oldDayRank.get(dayId) !== newDayRank.get(dayId))) {
      return clone(draft);
    }

    result.days.forEach((day, index) => {
      day.day = index + 1;
      day.date = chronologicalDates[index];
    });
    return finish(draft, result);
  }

  function updateConstraints(draft, nodeId, patch = {}, timeWindow) {
    const result = next(draft);
    const node = findNode(result, nodeId);
    for (const key of CONSTRAINT_KEYS) {
      if (Object.hasOwn(patch, key) && typeof patch[key] === 'boolean') {
        node.constraints[key] = patch[key];
      }
    }
    if (timeWindow !== undefined) {
      node.schedule.time_window = timeWindow == null || String(timeWindow).trim() === ''
        ? null
        : boundedText(timeWindow, 'time_window');
    }
    return finish(draft, result);
  }

  function removeNode(draft, nodeId) {
    const result = next(draft);
    const node = findNode(result, nodeId);
    result.days.forEach(day => {
      day.node_ids = day.node_ids.filter(id => id !== nodeId);
    });
    node.status = 'removed';
    node.schedule.day_id = null;
    node.schedule.time_window = null;
    node.manual_rank = null;
    node.constraints.required = false;
    if (Array.isArray(result.route?.ordered_node_ids)) {
      result.route.ordered_node_ids = result.route.ordered_node_ids.filter(id => id !== nodeId);
    }
    updateManualRanks(result);
    return finish(draft, result);
  }

  function validateStructure(draft) {
    const errors = [];
    const cities = Array.isArray(draft?.city_stops) ? draft.city_stops : [];
    const days = Array.isArray(draft?.days) ? draft.days : [];
    const nodes = Array.isArray(draft?.nodes) ? draft.nodes : [];
    const cityIds = new Set(cities.map(city => city.id));
    const dayIds = new Set(days.map(day => day.id));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const seenNodes = new Set();
    const referencedNodes = new Set();
    const cityDayCounts = new Map();
    const referenceCounts = new Map();

    for (const day of days) {
      for (const id of Array.isArray(day.node_ids) ? day.node_ids : []) {
        referenceCounts.set(id, (referenceCounts.get(id) || 0) + 1);
      }
    }

    for (const day of days) {
      if (!cityIds.has(day.primary_city_id)) {
        errors.push({ code: 'unknown_day_city', city_id: day.primary_city_id, day_id: day.id });
      } else {
        cityDayCounts.set(day.primary_city_id, (cityDayCounts.get(day.primary_city_id) || 0) + 1);
      }
      for (const id of Array.isArray(day.node_ids) ? day.node_ids : []) {
        const node = nodeById.get(id);
        if (!node) {
          errors.push({ code: 'unknown_node', node_id: id, day_id: day.id });
        } else if (seenNodes.has(id)) {
          errors.push({ code: 'duplicate_node', node_id: id, day_id: day.id });
        } else {
          referencedNodes.add(id);
          if (referenceCounts.get(id) === 1 && node.schedule?.day_id !== day.id) {
            errors.push({ code: 'schedule_day_mismatch', node_id: id, day_id: day.id });
          }
        }
        seenNodes.add(id);
      }
    }

    for (const city of cities) {
      if ((cityDayCounts.get(city.id) || 0) > city.days) {
        errors.push({ code: 'city_day_capacity', city_id: city.id });
      }
    }
    for (const node of nodes) {
      if (!cityIds.has(node.city_id)) {
        errors.push({ code: 'unknown_node_city', node_id: node.id, city_id: node.city_id });
      }
      const scheduledDayId = node.schedule?.day_id;
      if (scheduledDayId != null && !dayIds.has(scheduledDayId)) {
        errors.push({ code: 'unknown_schedule_day', node_id: node.id, day_id: scheduledDayId });
      } else if (scheduledDayId != null && !referencedNodes.has(node.id)) {
        errors.push({ code: 'missing_day_reference', node_id: node.id, day_id: scheduledDayId });
      }
    }

    const routeSeen = new Set();
    const routeNodeIds = draft?.route == null ? [] : draft.route.ordered_node_ids;
    for (const id of Array.isArray(routeNodeIds) ? routeNodeIds : []) {
      if (!nodeById.has(id)) {
        errors.push({ code: 'unknown_route_node', node_id: id });
      } else if (routeSeen.has(id)) {
        errors.push({ code: 'duplicate_route_node', node_id: id });
      }
      routeSeen.add(id);
    }
    return errors;
  }

  root.AeroTravelDraftOps = Object.freeze({
    addNode,
    moveNode,
    updateNode,
    updateConstraints,
    removeNode,
    reorderCityStops,
    validateStructure
  });
})(typeof window !== 'undefined' ? window : globalThis);
