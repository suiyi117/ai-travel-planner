(function initAeroTravelTripPackage(root) {
  'use strict';

  // Build share-token alphabet without high-entropy string literals
  // (detect-secrets Base64HighEntropyString false positives).
  function buildTokenAlphabet() {
    const chars = [];
    for (let code = 65; code <= 90; code += 1) {
      const ch = String.fromCharCode(code);
      if (ch === 'I' || ch === 'O') continue;
      chars.push(ch);
    }
    for (let code = 97; code <= 122; code += 1) {
      const ch = String.fromCharCode(code);
      if (ch === 'l') continue;
      chars.push(ch);
    }
    for (let digit = 2; digit <= 9; digit += 1) {
      chars.push(String(digit));
    }
    return chars.join('');
  }
  const TOKEN_ALPHABET = buildTokenAlphabet();
  const DAY_COLORS = ['#c96442', '#0f766e', '#b45309', '#4338ca', '#be123c'];
  const DISCLAIMER = '本方案为参考旅行规划，不含机票、酒店、门票代订；开放时间、票价、班次与道路状况以官方实时信息为准。专属链接不可检索但并非绝对私密，请勿写入证件号、完整订单号或手机号。';

  function clean(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join('、');
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function generateShareToken(length) {
    const size = Math.max(12, Math.min(32, Number(length) || 20));
    const bytes = new Uint8Array(size);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    let token = '';
    for (let i = 0; i < size; i += 1) {
      token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    }
    return token;
  }

  function dayColor(dayNumber) {
    const index = Math.max(0, Number(dayNumber) - 1) % DAY_COLORS.length;
    return DAY_COLORS[index];
  }

  function budgetRows(budget) {
    const data = budget || {};
    return [
      { label: '交通', value: clean(data.transport) || '暂无估算' },
      { label: '住宿', value: clean(data.hotel) || '暂无估算' },
      { label: '餐饮', value: clean(data.food) || '暂无估算' },
      { label: '门票', value: clean(data.tickets) || '暂无估算' },
      { label: '合计', value: clean(data.total) || '暂无估算' }
    ];
  }

  function isMappableItem(item) {
    if (!item || item.type === 'transport') return false;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  }

  function anchorTypeWeight(type, title) {
    const name = clean(title);
    // Synthetic mapPlanToItems placeholders sit near city center; demote them.
    if (name.startsWith('住宿区域：') || name.startsWith('风味美食：')) return 5;
    if (type === 'spot' || type === 'experience') return 100;
    if (type === 'hotel') return 40;
    if (type === 'food') return 15;
    return 20;
  }

  function rankMappableItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((item, index) => ({ item, index }))
      .filter(entry => isMappableItem(entry.item))
      .sort((a, b) => {
        const wa = anchorTypeWeight(a.item.type, a.item.title);
        const wb = anchorTypeWeight(b.item.type, b.item.title);
        if (wb !== wa) return wb - wa;
        return a.index - b.index;
      })
      .map(entry => entry.item);
  }

  function selectDayAnchors(items, dayNumber, limit) {
    const max = Math.max(1, Number(limit) || 5);
    return rankMappableItems(items)
      .slice(0, max)
      .map((item, index) => toAnchor(item, index + 1, dayNumber));
  }

  function buildDaySummary(dayRoute, anchors) {
    const titles = (Array.isArray(anchors) ? anchors : [])
      .filter(a => a && a.title && a.type !== 'food' && !clean(a.title).startsWith('风味美食：'))
      .map(a => clean(a.title))
      .filter(Boolean)
      .slice(0, 3);
    if (titles.length) return titles.join(' · ');
    return clean(dayRoute) || '安排待补充';
  }

  function selectOverviewMarkers(anchors, limit) {
    const max = Math.max(1, Math.min(10, Number(limit) || 10));
    const list = (Array.isArray(anchors) ? anchors : []).filter(a =>
      Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng))
    );
    if (!list.length) return [];

    const dayKeys = [];
    const buckets = new Map();
    list.forEach(anchor => {
      const key = Number.isFinite(Number(anchor.day)) ? Number(anchor.day) : 0;
      if (!buckets.has(key)) {
        buckets.set(key, []);
        dayKeys.push(key);
      }
      buckets.get(key).push(anchor);
    });
    dayKeys.sort((a, b) => a - b);
    dayKeys.forEach(key => {
      buckets.get(key).sort((a, b) => {
        const wa = anchorTypeWeight(a.type, a.title);
        const wb = anchorTypeWeight(b.type, b.title);
        if (wb !== wa) return wb - wa;
        return (Number(a.order) || 0) - (Number(b.order) || 0);
      });
    });

    const pointers = new Map(dayKeys.map(key => [key, 0]));
    const selected = [];
    let progress = true;
    while (selected.length < max && progress) {
      progress = false;
      for (const key of dayKeys) {
        if (selected.length >= max) break;
        const bucket = buckets.get(key) || [];
        const idx = pointers.get(key) || 0;
        if (idx < bucket.length) {
          selected.push(bucket[idx]);
          pointers.set(key, idx + 1);
          progress = true;
        }
      }
    }

    return selected
      .slice()
      .sort((a, b) => {
        const da = Number(a.day) || 0;
        const db = Number(b.day) || 0;
        if (da !== db) return da - db;
        return (Number(a.order) || 0) - (Number(b.order) || 0);
      })
      .map((anchor, index) => ({ ...anchor, order: index + 1 }));
  }

  function toAnchor(item, order, dayNumber) {
    return {
      order,
      id: clean(item.id) || `anchor-${dayNumber}-${order}`,
      title: clean(item.title) || '未命名地点',
      type: clean(item.type) || 'spot',
      kind: item.type === 'hotel' ? 'hotel' : 'spot',
      time: clean(item.time),
      duration: clean(item.duration),
      address: clean(item.address),
      lat: Number(item.lat),
      lng: Number(item.lng),
      day: dayNumber,
      color: dayColor(dayNumber)
    };
  }

  function normalizeRefs(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const ref of list) {
      if (!ref) continue;
      const url = clean(ref.url);
      if (!/^https?:\/\//i.test(url)) continue;
      const kind = ['web', 'xhs', 'dianping', 'official'].includes(ref.kind)
        ? ref.kind
        : 'web';
      out.push({
        label: clean(ref.label) || '参考',
        url,
        kind
      });
      if (out.length >= 3) break;
    }
    return out;
  }

  function normalizeStaticMap(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const status = data.status === 'ready' && clean(data.data_url) ? 'ready' : 'unavailable';
    return {
      data_url: status === 'ready' ? clean(data.data_url) : '',
      status,
      width: Number(data.width) || 0,
      height: Number(data.height) || 0,
      note: clean(data.note)
    };
  }

  function pickOverviewRouteLine(routeLines) {
    const lines = Array.isArray(routeLines) ? routeLines : [];
    const overview = lines.filter(l => l && (l.day == null || l.day === undefined || l.day === ''));
    return overview.find(l => l.status === 'provider')
      || overview.find(l => l.status === 'intercity')
      || overview.find(l => l.status === 'estimate')
      || lines.find(l => l && l.status === 'provider')
      || overview[0]
      || null;
  }

  function buildStaticMapRequest(pkg, options) {
    const opts = options || {};
    const width = Math.min(1024, Math.max(200, Number(opts.width) || 1024));
    const height = Math.min(1024, Math.max(200, Number(opts.height) || 1024));
    const markers = selectOverviewMarkers(pkg.map_anchors || [], 10)
      .map((a, i) => ({
        lat: Number(a.lat),
        lng: Number(a.lng),
        label: String(i + 1)
      }));
    const overview = pickOverviewRouteLine(pkg.route_lines);
    let path = null;
    if (overview && Array.isArray(overview.points) && overview.points.length >= 2) {
      path = simplifyPath(overview.points, 80);
    }
    return { width, height, markers, path, path_status: overview?.status || 'estimate' };
  }

  function normalizeItem(item, options, dayNumber) {
    const display = item.type === 'transport' && typeof options.transportDisplay === 'function'
      ? options.transportDisplay(item)
      : { time: item.time, extra: '' };
    return {
      id: clean(item.id),
      type: clean(item.type) || 'spot',
      time: clean(display.time || item.time),
      extra: clean(display.extra),
      title: clean(item.title) || '未命名安排',
      desc: clean(item.desc),
      duration: clean(item.duration),
      address: clean(item.address),
      rating: clean(item.rating),
      tel: clean(item.tel),
      opentime: clean(item.opentime),
      city: clean(item.city),
      fromCity: clean(item.fromCity),
      lat: Number(item.lat) || null,
      lng: Number(item.lng) || null,
      refs: normalizeRefs(item.refs)
    };
  }

  function normalizeTransportSegment(segment, options) {
    const selected = typeof options.selectedOption === 'function'
      ? options.selectedOption(segment)
      : null;
    return {
      segment: clean(segment.segment),
      tool: clean(segment.tool) || 'train',
      source_label: clean(segment.source_label) || '需确认',
      data_source: clean(segment.data_source) || 'unknown',
      advice: clean(segment.advice),
      selected: selected ? {
        id: clean(selected.id),
        time: clean(selected.time),
        duration: clean(selected.duration),
        price: clean(selected.price),
        from_station: clean(selected.from_station || selected.from_airport),
        to_station: clean(selected.to_station || selected.to_airport),
        desc: clean(selected.desc)
      } : null
    };
  }

  function weatherLabel(cast) {
    if (!cast) return '';
    const weather = clean(cast.dayweather);
    const low = clean(cast.nighttemp);
    const high = clean(cast.daytemp);
    if (!weather && !low && !high) return '';
    if (low && high) return `${weather} ${low}~${high}℃`.trim();
    return weather;
  }

  function lineStyleForStatus(status) {
    if (status === 'provider') {
      return { color: '#c96442', weight: 4, opacity: 0.9, dashArray: null };
    }
    if (status === 'intercity') {
      return { color: '#0f766e', weight: 4, opacity: 0.9, dashArray: null };
    }
    return { color: '#77736b', weight: 3, opacity: 0.9, dashArray: '8 8' };
  }

  function simplifyPoints(points, maxPoints) {
    const list = Array.isArray(points) ? points : [];
    const limit = Math.max(2, Number(maxPoints) || 200);
    if (list.length <= limit) return list.slice();
    const out = [];
    const step = (list.length - 1) / (limit - 1);
    for (let i = 0; i < limit; i += 1) {
      const idx = Math.min(list.length - 1, Math.round(i * step));
      out.push(list[idx]);
    }
    return out;
  }

  function pointDistanceSq(a, b) {
    const dx = Number(a[0]) - Number(b[0]);
    const dy = Number(a[1]) - Number(b[1]);
    return dx * dx + dy * dy;
  }

  function perpendicularDistanceSq(point, start, end) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const x1 = Number(start[0]);
    const y1 = Number(start[1]);
    const x2 = Number(end[0]);
    const y2 = Number(end[1]);
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return pointDistanceSq(point, start);
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const pdx = x - projX;
    const pdy = y - projY;
    return pdx * pdx + pdy * pdy;
  }

  function douglasPeucker(points, epsilonSq, first, last, keep) {
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const dist = perpendicularDistanceSq(points[i], points[first], points[last]);
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
    }
    if (index > 0 && maxDist > epsilonSq) {
      keep[index] = true;
      if (index - first > 1) douglasPeucker(points, epsilonSq, first, index, keep);
      if (last - index > 1) douglasPeucker(points, epsilonSq, index, last, keep);
    }
  }

  function simplifyPath(points, maxPoints) {
    const normalized = (Array.isArray(points) ? points : [])
      .map(normalizePoint)
      .filter(Boolean);
    const limit = Math.max(2, Number(maxPoints) || 80);
    if (normalized.length <= limit) return normalized;

    // Binary-search epsilon so RDP keeps roughly `limit` points (smoother than uniform step).
    let low = 0;
    let high = 1;
    // Expand upper bound until under limit or geometrically large.
    for (let i = 0; i < 12; i += 1) {
      const keep = new Array(normalized.length).fill(false);
      keep[0] = true;
      keep[normalized.length - 1] = true;
      douglasPeucker(normalized, high * high, 0, normalized.length - 1, keep);
      const count = keep.reduce((sum, flag) => sum + (flag ? 1 : 0), 0);
      if (count <= limit) break;
      high *= 2;
    }

    let best = null;
    for (let i = 0; i < 18; i += 1) {
      const mid = (low + high) / 2;
      const keep = new Array(normalized.length).fill(false);
      keep[0] = true;
      keep[normalized.length - 1] = true;
      douglasPeucker(normalized, mid * mid, 0, normalized.length - 1, keep);
      const selected = normalized.filter((_, idx) => keep[idx]);
      if (selected.length > limit) {
        low = mid;
      } else {
        high = mid;
        best = selected;
      }
    }
    if (best && best.length >= 2) {
      if (best.length <= limit) return best;
      return simplifyPoints(best, limit);
    }
    return simplifyPoints(normalized, limit);
  }

  function normalizePoint(point) {
    if (!point) return null;
    if (Array.isArray(point) && point.length >= 2) {
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
      return null;
    }
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    return null;
  }

  function normalizeRouteLine(line) {
    if (!line) return null;
    const status = ['provider', 'estimate', 'intercity'].includes(line.status)
      ? line.status
      : 'estimate';
    const points = simplifyPoints(
      (Array.isArray(line.points) ? line.points : [])
        .map(normalizePoint)
        .filter(Boolean),
      200
    );
    if (points.length < 2) return null;
    const day = line.day === null || line.day === undefined || line.day === ''
      ? null
      : Number(line.day);
    return {
      day: Number.isFinite(day) ? day : null,
      status,
      points
    };
  }

  function normalizeRouteLines(lines) {
    return (Array.isArray(lines) ? lines : [])
      .map(normalizeRouteLine)
      .filter(Boolean);
  }

  function representativeAnchorForDay(anchors) {
    const list = Array.isArray(anchors) ? anchors : [];
    if (!list.length) return null;
    return list.slice().sort((a, b) => {
      const wa = anchorTypeWeight(a.type, a.title);
      const wb = anchorTypeWeight(b.type, b.title);
      if (wb !== wa) return wb - wa;
      return (Number(a.order) || 0) - (Number(b.order) || 0);
    })[0];
  }

  function estimateRouteLinesFromDays(packageDays) {
    const lines = [];
    (packageDays || []).forEach(day => {
      const points = (day.anchors || [])
        .map(anchor => normalizePoint([anchor.lat, anchor.lng]))
        .filter(Boolean);
      if (points.length >= 2) {
        lines.push({
          day: day.day,
          status: 'estimate',
          points
        });
      }
    });
    // Overview: one representative pin per day keeps multi-city lines clean
    // (avoids zig-zag "yarn" through every local POI on a national zoom).
    const overview = [];
    (packageDays || []).forEach(day => {
      const rep = representativeAnchorForDay(day.anchors);
      const point = rep ? normalizePoint([rep.lat, rep.lng]) : null;
      if (point) overview.push(point);
    });
    if (overview.length >= 2) {
      lines.push({
        day: null,
        status: 'estimate',
        points: simplifyPath(overview, 80)
      });
    }
    return lines;
  }

  function routeLinesFromDrivingRoute(route) {
    if (!route || typeof route !== 'object') return [];
    const lines = [];
    const segments = Array.isArray(route.segments) ? route.segments : [];
    if (segments.length) {
      segments.forEach(segment => {
        const status = segment.status === 'provider' ? 'provider' : 'estimate';
        const points = simplifyPath(
          (segment.polyline || []).map(normalizePoint).filter(Boolean),
          200
        );
        if (points.length >= 2) {
          lines.push({ day: null, status, points });
        }
      });
    }
    if (!lines.length) {
      const points = simplifyPath(
        (route.polyline || []).map(normalizePoint).filter(Boolean),
        200
      );
      if (points.length >= 2) {
        const status = route.status === 'provider' ? 'provider' : 'estimate';
        lines.push({ day: null, status, points });
      }
    }
    return lines;
  }

  function defaultValidUntil(departureDate, totalDays, options) {
    const opts = options || {};
    const keepDays = Number(opts.keepDays);
    const retention = Number.isFinite(keepDays) && keepDays > 0 ? keepDays : 30;
    const tripDays = Math.max(0, Number(totalDays) || 0);
    if (typeof opts.addDays === 'function' && clean(departureDate)) {
      return opts.addDays(departureDate, Math.max(tripDays - 1, 0) + retention);
    }
    return '';
  }

  function buildTripPackage(plan, options) {
    const opts = options || {};
    const days = Array.isArray(plan?.days) ? plan.days : [];
    const route = clean(opts.route)
      || (Array.isArray(opts.cities) ? opts.cities.map(city => city.name || city).join(' → ') : '')
      || days.map(day => day.city).filter(Boolean).filter((city, index, arr) => arr.indexOf(city) === index).join(' → ');
    const packageDays = days.map(day => {
      const dayNumber = Number(day.day) || 1;
      const items = (day.items || []).map(item => normalizeItem(item, opts, dayNumber));
      const anchors = selectDayAnchors(items, dayNumber, 5);
      const date = typeof opts.addDays === 'function' && opts.departureDate
        ? opts.addDays(opts.departureDate, dayNumber - 1)
        : clean(day.date);
      const cast = typeof opts.weatherForDay === 'function' ? opts.weatherForDay(day) : null;
      return {
        day: dayNumber,
        date: clean(date),
        city: clean(day.city),
        route: clean(day.route),
        weather: weatherLabel(cast),
        color: dayColor(dayNumber),
        summary: buildDaySummary(day.route, anchors),
        anchors,
        items
      };
    });

    const allAnchors = [];
    packageDays.forEach(day => {
      day.anchors.forEach(anchor => allAnchors.push(anchor));
    });

    const cityOrder = [];
    packageDays.forEach(day => {
      if (day.city && !cityOrder.includes(day.city)) cityOrder.push(day.city);
    });

    const token = clean(opts.token) || generateShareToken(20);
    const updatedAt = clean(opts.updatedAt) || new Date().toISOString();
    const providedLines = normalizeRouteLines(opts.routeLines);
    const drivingLines = routeLinesFromDrivingRoute(opts.drivingRoute);
    const routeLines = providedLines.length
      ? providedLines
      : (drivingLines.length ? drivingLines : estimateRouteLinesFromDays(packageDays));

    return {
      schema_version: 1,
      id: token,
      path: `/t/${token}`,
      title: clean(plan?.title) || '专属旅行行程',
      summary: clean(plan?.summary),
      route,
      cities: cityOrder,
      total_days: Number(opts.totalDays) || packageDays.length || 0,
      budget_label: clean(opts.budget) || '未设定',
      departure_date: clean(opts.departureDate),
      updated_at: updatedAt,
      valid_until: clean(opts.validUntil),
      share_url: clean(opts.shareUrl),
      days: packageDays,
      transport_guide: (plan?.transport_guide || []).map(segment => normalizeTransportSegment(segment, opts)),
      budget: {
        rows: budgetRows(plan?.budget),
        selected_transport_total: Number(opts.selectedTransportTotal) || 0
      },
      tips: (plan?.tips || []).map(clean).filter(Boolean).slice(0, 10),
      map_anchors: allAnchors,
      route_lines: routeLines,
      static_map: normalizeStaticMap(opts.staticMap),
      overview_notes: (plan?.tips || []).map(clean).filter(Boolean).slice(0, 2),
      disclaimer: DISCLAIMER,
      meta: {
        brand: 'AeroTravel',
        noindex: true,
        readonly: true,
        source: 'structured_itinerary'
      }
    };
  }

  function packageToDeliveryPlan(pkg) {
    return {
      title: pkg.title,
      summary: pkg.summary,
      days: (pkg.days || []).map(day => ({
        day: day.day,
        city: day.city,
        route: day.route,
        date: day.date,
        items: day.items || []
      })),
      transport_guide: (pkg.transport_guide || []).map(segment => ({
        segment: segment.segment,
        source_label: segment.source_label,
        advice: segment.advice,
        options: segment.selected ? [segment.selected] : []
      })),
      budget: Object.fromEntries((pkg.budget?.rows || []).map(row => {
        const keyMap = { 交通: 'transport', 住宿: 'hotel', 餐饮: 'food', 门票: 'tickets', 合计: 'total' };
        return [keyMap[row.label] || row.label, row.value];
      })),
      tips: pkg.tips || []
    };
  }

  root.AeroTravelTripPackage = Object.freeze({
    generateShareToken,
    dayColor,
    budgetRows,
    lineStyleForStatus,
    simplifyPoints,
    simplifyPath,
    anchorTypeWeight,
    rankMappableItems,
    selectDayAnchors,
    buildDaySummary,
    selectOverviewMarkers,
    pickOverviewRouteLine,
    normalizeRefs,
    normalizeStaticMap,
    buildStaticMapRequest,
    normalizeRouteLines,
    routeLinesFromDrivingRoute,
    estimateRouteLinesFromDays,
    defaultValidUntil,
    buildTripPackage,
    packageToDeliveryPlan,
    DISCLAIMER
  });
})(typeof window !== 'undefined' ? window : globalThis);
