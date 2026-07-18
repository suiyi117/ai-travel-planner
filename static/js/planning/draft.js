(function (root) {
  const SCHEMA_VERSION = 2;
  const MAX_DRAFT_SERIALIZED_LENGTH = 512 * 1024;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableNodeId(seed, dayKey, index, item) {
    const identity = [
      normalizeIdentityText(seed),
      normalizeIdentityText(dayKey),
      index,
      normalizeIdentityText(item.id),
      normalizeIdentityText(item.provider_id || item.poi_id),
      normalizeIdentityText(item.title),
      normalizeIdentityCoordinate(item.lat, -90, 90),
      normalizeIdentityCoordinate(item.lng, -180, 180)
    ].join('|');
    return `node-${hashText(identity)}`;
  }

  function cityStopId(name, index) {
    const base = `city-${hashText(String(name).trim())}`;
    return Number.isInteger(index) ? `${base}-${index}` : base;
  }

  function normalizeCityKey(value) {
    const key = String(value ?? '').replace(/\s+/g, '');
    const administrativeSuffixes = ['特别行政区', '自治州', '地区', '盟', '市'];
    const suffix = administrativeSuffixes.find(candidate => key.endsWith(candidate) && key.length > candidate.length);
    return suffix ? key.slice(0, -suffix.length) : key;
  }

  function addCityStopCandidate(index, key, stop) {
    const candidates = index.get(key) || [];
    candidates.push(stop);
    index.set(key, candidates);
  }

  function consumeAvailableCityStop(candidates, assignedCounts) {
    for (const stop of candidates) {
      const assigned = assignedCounts.get(stop) || 0;
      // Transit / zero-day stops never absorb itinerary days.
      if (!Number.isFinite(stop.days) || stop.days <= 0) continue;
      if (assigned < stop.days) {
        assignedCounts.set(stop, assigned + 1);
        return stop;
      }
    }
    return null;
  }

  function resolveCityStops(itineraryDays, cityStops, stopByName, stopByKey, assignedCounts) {
    const assignments = Array(itineraryDays.length).fill(null);

    itineraryDays.forEach((day, index) => {
      const exactCandidates = stopByName.get(String(day.city ?? '').trim()) || [];
      if (exactCandidates.length === 0) return;
      // Prefer stay cities; if only transit matches, fall through to other strategies.
      const stayCandidates = exactCandidates.filter(stop => Number(stop.days) > 0);
      const exactMatch = consumeAvailableCityStop(
        stayCandidates.length ? stayCandidates : exactCandidates,
        assignedCounts
      );
      if (exactMatch) assignments[index] = exactMatch;
    });

    itineraryDays.forEach((day, index) => {
      if (assignments[index]) return;
      const normalizedCandidates = stopByKey.get(normalizeCityKey(day.city)) || [];
      if (normalizedCandidates.length === 0) return;
      const stayCandidates = normalizedCandidates.filter(stop => Number(stop.days) > 0);
      const normalizedMatch = consumeAvailableCityStop(
        stayCandidates.length ? stayCandidates : normalizedCandidates,
        assignedCounts
      );
      if (normalizedMatch) assignments[index] = normalizedMatch;
    });

    assignments.forEach((assignment, index) => {
      if (assignment) return;
      const stayStops = cityStops.filter(stop => Number(stop.days) > 0);
      const fallbackMatch = consumeAvailableCityStop(
        stayStops.length ? stayStops : cityStops,
        assignedCounts
      );
      if (!fallbackMatch) throw new Error('draft_city_unresolved');
      assignments[index] = fallbackMatch;
    });
    return assignments;
  }

  function resolvedCoordinate(value, min, max) {
    if (value === '' || value == null) return null;
    const coordinate = Number(value);
    return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
  }

  function normalizeIdentityText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function normalizeIdentityCoordinate(value, min, max) {
    const coordinate = resolvedCoordinate(value, min, max);
    if (coordinate == null) return '';
    return String(Object.is(coordinate, -0) ? 0 : coordinate);
  }

  function itemToNode(item, dayId, cityId, seed, dayKey, index) {
    const isExperience = item.type === 'experience';
    const lat = resolvedCoordinate(item.lat, -90, 90);
    const lng = resolvedCoordinate(item.lng, -180, 180);
    return {
      id: stableNodeId(seed, dayKey, index, item),
      source: isExperience ? 'ai' : 'system',
      provider_id: item.provider_id || item.poi_id || null,
      name: String(item.title || '').trim(),
      city_id: cityId,
      city: String(item.city || '').trim(),
      location: {
        lat: lat ?? 0,
        lng: lng ?? 0,
        status: lat != null && lng != null ? 'resolved' : 'unresolved'
      },
      status: 'scheduled',
      duration_minutes: 0,
      schedule: { day_id: dayId, time_window: item.time || null },
      constraints: { required: false, fixed_day: false, fixed_time: false, fixed_order: false },
      manual_rank: index,
      metadata: { item: clone(item) }
    };
  }

  function itineraryToDraft(itinerary, cities, options = {}) {
    const seed = options.seed || itinerary.title || 'generated-trip';
    const cityStops = (cities || []).map((city, index) => {
      const rawDays = Number(city.days);
      const isTransit = city.plan_stay === false || rawDays === 0;
      const days = isTransit
        ? 0
        : (Number.isInteger(rawDays) && rawDays > 0 ? rawDays : 1);
      return {
        id: cityStopId(city.name, index),
        name: String(city.name || '').trim(),
        days,
        transport: city.transport || 'auto',
        fixed_order: false,
        plan_stay: !isTransit
      };
    });
    const stopByName = new Map();
    const stopByKey = new Map();
    cityStops.forEach(stop => {
      addCityStopCandidate(stopByName, stop.name, stop);
      addCityStopCandidate(stopByKey, normalizeCityKey(stop.name), stop);
    });
    const assignedCounts = new Map(cityStops.map(stop => [stop, 0]));
    const itineraryDays = itinerary.days || [];
    const cityAssignments = resolveCityStops(itineraryDays, cityStops, stopByName, stopByKey, assignedCounts);
    const nodes = [];
    const days = itineraryDays.map((day, dayIndex) => {
      const dayId = `day-${day.day}`;
      const assignedStop = cityAssignments[dayIndex];
      const cityId = assignedStop.id;
      const resolvedCityName = assignedStop.name;
      const dayKey = day.date || day.day;
      const dayNodes = (day.items || []).map((item, index) => {
        const node = itemToNode(item, dayId, cityId, seed, dayKey, index);
        // Only rewrite city when assignment remapped away from the AI label
        // (e.g. transit overflow). Preserve original item.city for fuzzy matches
        // like 北京市 → stop 北京 so stable IDs / labels stay intact.
        const originalCity = String(item.city || day.city || '').trim();
        const sameCity =
          originalCity === resolvedCityName
          || normalizeCityKey(originalCity) === normalizeCityKey(resolvedCityName);
        if (!sameCity) {
          node.city = resolvedCityName;
          if (node.metadata?.item && typeof node.metadata.item === 'object') {
            node.metadata.item = { ...node.metadata.item, city: resolvedCityName };
          }
        }
        return node;
      });
      nodes.push(...dayNodes);
      return {
        id: dayId,
        day: Number(day.day),
        date: day.date || null,
        primary_city_id: cityId,
        node_ids: dayNodes.map(node => node.id),
        max_driving_minutes: null
      };
    });
    return {
      schema_version: SCHEMA_VERSION,
      id: `trip-${hashText(seed)}`,
      revision: 0,
      mode: options.mode || 'itinerary',
      route_shape: options.routeShape || options.route_shape || 'one_way',
      strategy: options.strategy || 'balanced',
      start_date: options.startDate || '',
      city_stops: cityStops,
      nodes,
      days,
      route: null
    };
  }

  function nodeToItem(node) {
    const original = clone(node.metadata?.item || {});
    return {
      ...original,
      id: original.id || node.id,
      title: node.name,
      city: node.city,
      time: node.schedule.time_window ?? original.time ?? '',
      lat: node.location.lat,
      lng: node.location.lng
    };
  }

  function normalizeSegment(value) {
    return String(value || '').replace(/\s*[→>-]+\s*/g, ' → ').trim();
  }

  function reconcileTransportGuide(draft, guide) {
    const existing = new Map((Array.isArray(guide) ? guide : [])
      .filter(segment => segment && typeof segment === 'object')
      .map(segment => [normalizeSegment(segment.segment), segment]));
    const segments = draft.city_stops.slice(0, -1).map((city, index) => {
      const nextCity = draft.city_stops[index + 1];
      const segment = `${city.name} → ${nextCity.name}`;
      const retained = existing.get(normalizeSegment(segment));
      if (retained) {
        return { ...retained, segment, from_city: city.name, to_city: nextCity.name };
      }
      return {
        segment,
        from_city: city.name,
        to_city: nextCity.name,
        tool: nextCity.transport || 'auto',
        options: [],
        data_source: 'unavailable',
        note: '城市顺序已修改，需要重新确认该段交通'
      };
    });
    if (draft.route_shape === 'round_trip' && draft.city_stops.length >= 2) {
      const origin = draft.city_stops[0];
      const last = draft.city_stops[draft.city_stops.length - 1];
      if (origin.name !== last.name) {
        const segment = `${last.name} → ${origin.name}`;
        const retained = existing.get(normalizeSegment(segment));
        if (retained) {
          segments.push({ ...retained, segment, from_city: last.name, to_city: origin.name });
        } else {
          segments.push({
            segment,
            from_city: last.name,
            to_city: origin.name,
            tool: origin.transport || last.transport || 'auto',
            options: [],
            data_source: 'unavailable',
            note: '环线回程，需要重新确认该段交通'
          });
        }
      }
    }
    return segments;
  }

  function draftToItinerary(draft, baseItinerary) {
    const result = clone(baseItinerary);
    const nodeById = new Map(draft.nodes.map(node => [node.id, node]));
    const baseDayByNumber = new Map((result.days || []).map(day => [Number(day.day), day]));
    const baseDayById = new Map((result.days || []).map(day => [`day-${day.day}`, day]));
    const cityById = new Map(draft.city_stops.map(city => [city.id, city]));
    result.days = draft.days.map(day => {
      const baseDay = baseDayById.get(day.id) || baseDayByNumber.get(Number(day.day)) || {};
      const cityName = cityById.get(day.primary_city_id)?.name || '';
      return {
        ...baseDay,
        day: Number(day.day),
        date: day.date ?? baseDay.date ?? null,
        city: cityName,
        items: day.node_ids.map(id => nodeById.get(id)).filter(Boolean).map(node => {
          const item = nodeToItem(node);
          return { ...item, city: cityName || item.city };
        })
      };
    });
    result.route = draft.route == null ? null : clone(draft.route);
    result.transport_guide = reconcileTransportGuide(draft, result.transport_guide);
    return result;
  }

  function draftToCities(draft) {
    return draft.city_stops.map(city => ({
      name: city.name,
      days: city.days,
      transport: city.transport || 'auto',
      plan_stay: city.plan_stay === false ? false : city.plan_stay === true ? true : (Number(city.days) > 0)
    }));
  }

  function isObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  function isBoundedString(value, { allowEmpty = false, max = 200 } = {}) {
    return typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0);
  }

  function hasUniqueIds(values) {
    return new Set(values.map(value => value.id)).size === values.length;
  }

  function hasBoundedSerializedSize(value) {
    try {
      const serialized = JSON.stringify(value);
      return typeof serialized === 'string' && serialized.length <= MAX_DRAFT_SERIALIZED_LENGTH;
    } catch (_) {
      return false;
    }
  }

  function isTripDraft(value) {
    if (!isObject(value) || value.schema_version !== SCHEMA_VERSION || !Array.isArray(value.city_stops)
      || !Array.isArray(value.nodes) || !Array.isArray(value.days)) return false;
    if (!hasBoundedSerializedSize(value)) return false;
    if (!isBoundedString(value.id) || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !['itinerary', 'self_drive'].includes(value.mode)
      || !['one_way', 'round_trip'].includes(value.route_shape)
      || !['efficient', 'balanced', 'experience'].includes(value.strategy)
      || !isBoundedString(value.start_date, { allowEmpty: true, max: 32 })) return false;
    if (value.city_stops.length > 20 || value.nodes.length > 200 || value.days.length > 60) return false;
    const validCities = value.city_stops.every(city =>
      isObject(city) && isBoundedString(city.id) && isBoundedString(city.name)
      && Number.isInteger(city.days) && city.days >= 0 && city.days <= 15
      && ['auto', 'train', 'plane', 'driving', 'bus'].includes(city.transport)
      && typeof city.fixed_order === 'boolean'
    );
    const validNodes = value.nodes.every(node =>
      isObject(node) && isBoundedString(node.id) && isBoundedString(node.name)
      && ['ai', 'system', 'amap_search', 'map_pick', 'manual', 'city_stop'].includes(node.source)
      && (node.provider_id == null || isBoundedString(node.provider_id))
      && isBoundedString(node.city_id) && isBoundedString(node.city)
      && isObject(node.location) && Number.isFinite(node.location.lat) && node.location.lat >= -90 && node.location.lat <= 90
      && Number.isFinite(node.location.lng) && node.location.lng >= -180 && node.location.lng <= 180
      && ['resolved', 'unresolved'].includes(node.location.status)
      && ['wishlist', 'scheduled', 'removed'].includes(node.status)
      && Number.isSafeInteger(node.duration_minutes) && node.duration_minutes >= 0 && node.duration_minutes <= 1440
      && isObject(node.schedule)
      && (node.schedule.day_id == null || isBoundedString(node.schedule.day_id))
      && (node.schedule.time_window == null || isBoundedString(node.schedule.time_window))
      && isObject(node.constraints)
      && ['required', 'fixed_day', 'fixed_time', 'fixed_order'].every(key => typeof node.constraints[key] === 'boolean')
      && (node.manual_rank == null || (Number.isInteger(node.manual_rank) && node.manual_rank >= 0 && node.manual_rank < 200))
      && isObject(node.metadata) && Object.keys(node.metadata).length <= 30
    );
    const validDays = value.days.every(day =>
      isObject(day) && isBoundedString(day.id) && Number.isInteger(day.day) && day.day > 0 && day.day <= 60
      && (day.date == null || isBoundedString(day.date, { max: 32 }))
      && isBoundedString(day.primary_city_id)
      && Array.isArray(day.node_ids) && day.node_ids.length <= 200
      && day.node_ids.every(id => isBoundedString(id))
      && new Set(day.node_ids).size === day.node_ids.length
      && (day.max_driving_minutes == null
        || (Number.isSafeInteger(day.max_driving_minutes)
          && day.max_driving_minutes >= 30 && day.max_driving_minutes <= 900))
    );
    if (!validCities || !validNodes || !validDays
      || !hasUniqueIds(value.city_stops) || !hasUniqueIds(value.nodes) || !hasUniqueIds(value.days)) return false;

    const cityIds = new Set(value.city_stops.map(city => city.id));
    const nodeIds = new Set(value.nodes.map(node => node.id));
    const dayIds = new Set(value.days.map(day => day.id));
    const nodeById = new Map(value.nodes.map(node => [node.id, node]));
    if (value.nodes.some(node => !cityIds.has(node.city_id)
      || (node.schedule.day_id != null && !dayIds.has(node.schedule.day_id)))) return false;
    if (value.days.some(day => !cityIds.has(day.primary_city_id)
      || day.node_ids.some(id => !nodeIds.has(id)))) return false;

    const cityDayCapacity = new Map(value.city_stops.map(city => [city.id, city.days]));
    const assignedCityDays = new Map();
    for (const day of value.days) {
      const assigned = (assignedCityDays.get(day.primary_city_id) || 0) + 1;
      if (assigned > cityDayCapacity.get(day.primary_city_id)) return false;
      assignedCityDays.set(day.primary_city_id, assigned);
    }

    const scheduledNodeIds = new Set();
    for (const day of value.days) {
      for (const nodeId of day.node_ids) {
        if (scheduledNodeIds.has(nodeId) || nodeById.get(nodeId).schedule.day_id !== day.id) return false;
        scheduledNodeIds.add(nodeId);
      }
    }
    if (value.nodes.some(node => node.schedule.day_id != null && !scheduledNodeIds.has(node.id))) return false;

    const validRoute = value.route == null || (
      isObject(value.route) && Object.keys(value.route).length <= 30
      && Array.isArray(value.route.ordered_node_ids)
      && value.route.ordered_node_ids.length <= 200
      && value.route.ordered_node_ids.every(id => isBoundedString(id) && nodeIds.has(id))
      && new Set(value.route.ordered_node_ids).size === value.route.ordered_node_ids.length
    );
    return validRoute;
  }

  root.AeroTravelDraft = Object.freeze({
    SCHEMA_VERSION,
    clone,
    hashText,
    itineraryToDraft,
    draftToItinerary,
    draftToCities,
    isTripDraft
  });
})(typeof window !== 'undefined' ? window : globalThis);
