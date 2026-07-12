(function initAeroTravelTripPackage(root) {
  'use strict';

  const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
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

  function normalizeItem(item, options, dayNumber) {
    const display = item.type === 'transport' && typeof options.transportDisplay === 'function'
      ? options.transportDisplay(item)
      : { time: item.time, extra: '' };
    const refs = Array.isArray(item.refs)
      ? item.refs.map(ref => ({
        label: clean(ref.label) || '参考',
        url: clean(ref.url),
        kind: clean(ref.kind) || 'web'
      })).filter(ref => ref.url)
      : [];
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
      refs
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

  function buildTripPackage(plan, options) {
    const opts = options || {};
    const days = Array.isArray(plan?.days) ? plan.days : [];
    const route = clean(opts.route)
      || (Array.isArray(opts.cities) ? opts.cities.map(city => city.name || city).join(' → ') : '')
      || days.map(day => day.city).filter(Boolean).filter((city, index, arr) => arr.indexOf(city) === index).join(' → ');
    const packageDays = days.map(day => {
      const dayNumber = Number(day.day) || 1;
      const items = (day.items || []).map(item => normalizeItem(item, opts, dayNumber));
      const mappable = items.filter(isMappableItem);
      const anchors = mappable.slice(0, 5).map((item, index) => toAnchor(item, index + 1, dayNumber));
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
        summary: clean(day.route) || anchors.map(anchor => anchor.title).slice(0, 3).join(' · '),
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
    buildTripPackage,
    packageToDeliveryPlan,
    DISCLAIMER
  });
})(typeof window !== 'undefined' ? window : globalThis);
