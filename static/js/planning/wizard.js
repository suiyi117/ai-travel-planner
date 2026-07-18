(function (global) {
  'use strict';

  const MAX_ROUTE_CITIES = 10;
  const MAX_PLAY_DAYS = 30;
  const MAX_CITY_NAME_LENGTH = 30;

  function localDateISO(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function defaultDepartureDate(fromDate) {
    const base = fromDate instanceof Date ? fromDate : new Date();
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
    return localDateISO(next);
  }

  function normalizeCityName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function validateCityName(value) {
    const normalized = normalizeCityName(value);
    if (!normalized) {
      return { ok: false, message: '请输入城市名称', normalized: '' };
    }
    if (normalized.length > MAX_CITY_NAME_LENGTH) {
      return { ok: false, message: '请输入有效的城市名称', normalized };
    }
    // Must contain at least one letter, digit, or CJK character (reject punctuation-only).
    if (!/[\u4e00-\u9fffA-Za-z0-9]/.test(normalized)) {
      return { ok: false, message: '请输入有效的城市名称', normalized };
    }
    return { ok: true, message: '', normalized };
  }

  function findDuplicateCityIndex(cities, name) {
    const target = normalizeCityName(name);
    if (!target) return -1;
    const list = Array.isArray(cities) ? cities : [];
    for (let index = 0; index < list.length; index += 1) {
      if (normalizeCityName(list[index]?.name) === target) return index;
    }
    return -1;
  }

  function canAddCity(cities, rawName, maxCities) {
    const list = Array.isArray(cities) ? cities : [];
    const limit = Number.isFinite(Number(maxCities)) ? Number(maxCities) : MAX_ROUTE_CITIES;
    if (list.length >= limit) {
      return {
        ok: false,
        message: '单次最多规划 10 座城市',
        reason: 'limit',
        duplicateIndex: -1,
        normalized: ''
      };
    }
    const nameCheck = validateCityName(rawName);
    if (!nameCheck.ok) {
      return {
        ok: false,
        message: nameCheck.message,
        reason: 'invalid',
        duplicateIndex: -1,
        normalized: nameCheck.normalized
      };
    }
    const duplicateIndex = findDuplicateCityIndex(list, nameCheck.normalized);
    if (duplicateIndex >= 0) {
      return {
        ok: false,
        message: '该城市已在路线中',
        reason: 'duplicate',
        duplicateIndex,
        normalized: nameCheck.normalized
      };
    }
    return {
      ok: true,
      message: '',
      reason: null,
      duplicateIndex: -1,
      normalized: nameCheck.normalized
    };
  }

  function isTransitCity(city) {
    const days = Number(city?.days);
    return city?.plan_stay === false || days === 0;
  }

  function buildRouteStats(cities) {
    const list = Array.isArray(cities) ? cities : [];
    let playDays = 0;
    let playCities = 0;
    let transitCities = 0;
    for (let index = 0; index < list.length; index += 1) {
      const city = list[index];
      if (isTransitCity(city)) {
        transitCities += 1;
      } else {
        playCities += 1;
        playDays += Number(city?.days) || 0;
      }
    }
    return {
      playDays,
      playCities,
      transitCities,
      totalCities: list.length
    };
  }

  function buildDaysSummaryText(statsLike) {
    const playDays = Number(statsLike?.playDays) || 0;
    const playCities = Number(statsLike?.playCities) || 0;
    const transitCities = Number(statsLike?.transitCities) || 0;
    return `共 ${playDays} 个游玩日 · ${playCities} 个游玩城市 · ${transitCities} 个过境城市`;
  }

  function transportDisplayLabel(value) {
    const transport = String(value || 'auto').trim() || 'auto';
    if (transport === 'train') return '高铁优先';
    if (transport === 'plane') return '飞机优先';
    if (transport === 'driving') return '自驾优先';
    return '智能推荐';
  }

  function segmentKey(fromName, toName) {
    return `${normalizeCityName(fromName)} → ${normalizeCityName(toName)}`;
  }

  function segmentLabel(fromName, toName) {
    return segmentKey(fromName, toName);
  }

  function arrivalLabel(fromName, toName, transport) {
    const from = normalizeCityName(fromName);
    const to = normalizeCityName(toName);
    const segment = segmentLabel(from, to);
    const transportLabel = transportDisplayLabel(transport);
    return {
      segment,
      transportLabel,
      short: `上一段：${segment}`,
      full: `从${from}到达${to}：${transportLabel}`
    };
  }

  function getOriginName(cities) {
    const list = Array.isArray(cities) ? cities : [];
    return normalizeCityName(list[0]?.name);
  }

  function isRoundTripAllowed(cities) {
    return (Array.isArray(cities) ? cities : []).length >= 2;
  }

  function routeShapeAfterCityRestore(previousRouteShape, cities) {
    const shape = String(previousRouteShape || 'one_way').trim() || 'one_way';
    return shape === 'round_trip' && isRoundTripAllowed(cities)
      ? 'round_trip'
      : 'one_way';
  }

  function createCityEntry(rawName, index, options) {
    const name = normalizeCityName(rawName);
    const isFirst = Number(index) === 0;
    const transport = String(options?.transport || 'auto').trim() || 'auto';
    if (isFirst) {
      const planStay = options?.plan_stay === true;
      const days = planStay
        ? Math.min(7, Math.max(1, Number(options?.days) || 1))
        : 0;
      return {
        name,
        days: planStay ? days : 0,
        plan_stay: planStay,
        transport: 'auto'
      };
    }
    const planStay = options?.plan_stay === false ? false : true;
    let days = Number(options?.days);
    if (!planStay) days = 0;
    else if (!Number.isFinite(days) || days < 1) days = 1;
    else if (days > 7) days = 7;
    return {
      name,
      days,
      plan_stay: planStay,
      transport
    };
  }

  function cloneCity(city) {
    return {
      name: String(city?.name || '').trim(),
      days: Number(city?.days) || 0,
      plan_stay: city?.plan_stay !== false && (Number(city?.days) || 0) > 0
        ? true
        : city?.plan_stay === true,
      transport: String(city?.transport || 'auto').trim() || 'auto'
    };
  }

  function removeCityAt(cities, index) {
    const list = Array.isArray(cities) ? cities.slice() : [];
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) {
      return { cities: list, removed: null, index: -1 };
    }
    const [removed] = list.splice(i, 1);
    return {
      cities: list,
      removed: {
        name: String(removed?.name || '').trim(),
        days: Number(removed?.days) || 0,
        plan_stay: removed?.plan_stay === false
          ? false
          : removed?.plan_stay === true
            ? true
            : (Number(removed?.days) || 0) > 0,
        transport: String(removed?.transport || 'auto').trim() || 'auto'
      },
      index: i
    };
  }

  function restoreCityAt(cities, removed, index) {
    const list = Array.isArray(cities) ? cities.slice() : [];
    if (!removed || typeof removed !== 'object') return list;
    const i = Number(index);
    const insertAt = Number.isInteger(i) ? Math.max(0, Math.min(i, list.length)) : list.length;
    list.splice(insertAt, 0, {
      name: String(removed.name || '').trim(),
      days: Number(removed.days) || 0,
      plan_stay: removed.plan_stay === false
        ? false
        : removed.plan_stay === true
          ? true
          : (Number(removed.days) || 0) > 0,
      transport: String(removed.transport || 'auto').trim() || 'auto'
    });
    return list;
  }

  function reorderCityList(cities, fromIndex, toIndex) {
    const list = Array.isArray(cities) ? cities.slice() : [];
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    if (from === to) return list;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return list;
  }

  function originChangeMessage(cityName, routeShape) {
    const name = normalizeCityName(cityName) || '新起点';
    if (String(routeShape || '') === 'round_trip') {
      return `出发地和回程终点已改为 ${name}。`;
    }
    return `出发地已改为 ${name}。`;
  }

  function formatDepartureLabel(dateStr) {
    const raw = String(dateStr || '').trim();
    if (!raw) return '日期未定';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return raw;
    const month = Number(match[2]);
    const day = Number(match[3]);
    return `${month}月${day}日出发`;
  }

  function isPastDate(dateStr, todayStr) {
    const date = String(dateStr || '').trim();
    if (!date) return false;
    const today = String(todayStr || localDateISO()).trim();
    return date < today;
  }

  function validateStep1(input) {
    const cities = Array.isArray(input?.cities) ? input.cities : [];
    const routeShape = String(input?.routeShape || input?.route_shape || 'one_way').trim() || 'one_way';
    const departureDate = input?.departureDate ?? input?.start_date ?? '';
    const today = String(input?.today || localDateISO()).trim();

    if (!cities.length) {
      return { ok: false, field: 'cities', message: '先添加出发地和目的地' };
    }

    if (cities.length > MAX_ROUTE_CITIES) {
      return {
        ok: false,
        field: 'cities',
        message: `单次最多规划 ${MAX_ROUTE_CITIES} 座城市`
      };
    }

    if (routeShape === 'round_trip' && cities.length < 2) {
      return {
        ok: false,
        field: 'routeShape',
        message: '添加至少两个城市后可设置环线'
      };
    }

    if (isPastDate(departureDate, today)) {
      return {
        ok: false,
        field: 'departureDate',
        message: '出发日期不能早于今天'
      };
    }

    let playable = 0;
    let playDays = 0;
    for (let index = 0; index < cities.length; index += 1) {
      const city = cities[index];
      const name = normalizeCityName(city?.name);
      const days = Number(city?.days);
      if (!name) {
        return { ok: false, field: 'cities', message: '城市名称不能为空。' };
      }
      // Explicit plan_stay=false OR days===0 means transit (align with backend).
      if (city?.plan_stay === false || days === 0) {
        if (!Number.isInteger(days) || days < 0 || days > 7) {
          return {
            ok: false,
            field: 'cities',
            message: `「${name}」的停留天数需在 0–7 天之间。`
          };
        }
        continue;
      }
      if (!Number.isInteger(days) || days < 1 || days > 7) {
        return {
          ok: false,
          field: 'cities',
          message: `「${name}」的停留天数需在 1–7 天之间。`
        };
      }
      playable += 1;
      playDays += days;
    }
    if (playable < 1) {
      return {
        ok: false,
        field: 'cities',
        message: '请至少为一座城市安排游玩天数'
      };
    }
    if (playDays > MAX_PLAY_DAYS) {
      return {
        ok: false,
        field: 'days',
        message: '单次最多规划 30 个游玩日，请拆分行程'
      };
    }
    return { ok: true, field: null, message: '' };
  }

  function isSetupWizardStep(step) {
    const n = Number(step);
    return n === 1 || n === 2;
  }

  function canEnterStep(step, flags) {
    const n = Number(step);
    if (n === 1) return true;
    if (n === 2) return Boolean(flags?.step1Done);
    if (n === 3) return Boolean(flags?.hasPlan);
    return false;
  }

  function wizardStepState(step, currentStep, flags) {
    const value = Number(step);
    const current = Number(currentStep);
    const allowed = canEnterStep(value, flags);
    return {
      active: value === current,
      complete: allowed && value < current,
      locked: !allowed
    };
  }

  function shouldAnimateStepTransition(previousStep, nextStep, reducedMotion) {
    if (previousStep === null || previousStep === undefined) return false;
    const previous = Number(previousStep);
    const next = Number(nextStep);
    return Number.isFinite(previous)
      && Number.isFinite(next)
      && previous !== next
      && !reducedMotion;
  }

  function routeLabel(cities, routeShape) {
    const names = (Array.isArray(cities) ? cities : [])
      .map(c => String(c?.name || '').trim())
      .filter(Boolean);
    if (!names.length) return '未设置路线';
    if (routeShape === 'round_trip' && names.length) {
      return `${names.join(' → ')} → ${names[0]}`;
    }
    return names.join(' → ');
  }

  function buildSummary(stateLike) {
    const cities = Array.isArray(stateLike?.cities) ? stateLike.cities : [];
    const stats = buildRouteStats(cities);
    const totalDays = stats.playDays;
    const routeShape = String(
      stateLike?.routeShape || stateLike?.route_shape || 'one_way'
    ).trim() || 'one_way';
    const shapeLabel = !cities.length
      ? ''
      : routeShape === 'round_trip' ? '环线' : '单程';
    const departureDate = String(
      stateLike?.departureDate || stateLike?.start_date || ''
    ).trim();
    const dateLabel = cities.length ? formatDepartureLabel(departureDate) : '';
    const budget = String(stateLike?.budget || '').trim();
    const pace = String(stateLike?.pace || '').trim();
    const transport = String(stateLike?.globalTransport || 'auto');
    const transportLabel = transport === 'train' ? '高铁'
      : transport === 'plane' ? '飞机'
      : transport === 'driving' ? '自驾'
      : '智能交通';
    // Route-first meta (FR-10), then preference chips for workspace/summary rail.
    const metaParts = [
      shapeLabel,
      totalDays ? `${totalDays} 个游玩日` : '',
      stats.playCities ? `${stats.playCities} 个游玩城市` : '',
      stats.transitCities ? `${stats.transitCities} 个过境城市` : '',
      dateLabel,
      budget,
      pace,
      cities.length ? transportLabel : ''
    ].filter(Boolean);
    return {
      route: routeLabel(cities, routeShape),
      totalDays,
      meta: metaParts.join(' · '),
      stats,
      shapeLabel,
      dateLabel
    };
  }

  /**
   * Reason the Step 1 primary action is disabled (empty string when enabled).
   */
  function step1BlockReason(input) {
    const result = validateStep1(input);
    if (result.ok) return { ok: true, message: '', field: null };
    return { ok: false, message: result.message, field: result.field || null };
  }

  function findAddedCityNames(previousNames, cities) {
    const previous = new Set(
      (Array.isArray(previousNames) ? previousNames : [])
        .map(name => String(name || '').trim())
        .filter(Boolean)
    );
    const added = [];
    const seen = new Set();
    (Array.isArray(cities) ? cities : []).forEach(city => {
      const name = String(city?.name || '').trim();
      if (!name || previous.has(name) || seen.has(name)) return;
      seen.add(name);
      added.push(name);
    });
    return added;
  }

  function isDrivingTransport(value) {
    return String(value || '').trim() === 'driving';
  }

  function hasSelfDriveRouteData(draft) {
    if (!draft || typeof draft !== 'object') return false;
    if (draft.mode === 'self_drive') return true;
    const ordered = draft.route?.ordered_node_ids;
    return Array.isArray(ordered) && ordered.length > 0;
  }

  /**
   * Derive whether the user has self-drive intent (UI only; not an API field).
   * auto/智能推荐 alone is never self-drive intent.
   */
  function hasSelfDriveIntent(stateLike) {
    if (!stateLike || typeof stateLike !== 'object') return false;
    if (isDrivingTransport(stateLike.globalTransport)) return true;
    const cities = Array.isArray(stateLike.cities) ? stateLike.cities : [];
    if (cities.some(city => isDrivingTransport(city?.transport))) return true;
    return hasSelfDriveRouteData(stateLike.workingDraft || stateLike.draft);
  }

  function shouldShowSelfDrivePrefs(stateLike) {
    if (!stateLike || typeof stateLike !== 'object') return false;
    if (isDrivingTransport(stateLike.globalTransport)) return true;
    const cities = Array.isArray(stateLike.cities) ? stateLike.cities : [];
    return cities.some(city => isDrivingTransport(city?.transport));
  }

  function shouldShowSelfDriveEditEntry(stateLike) {
    return hasSelfDriveIntent(stateLike);
  }

  function canSwitchEditTool(candidatePlan) {
    return !candidatePlan;
  }

  function normalizeEditTool(value) {
    return value === 'driving' ? 'driving' : 'daily';
  }

  function isEditToolChange(currentTool, nextTool) {
    return normalizeEditTool(currentTool) !== normalizeEditTool(nextTool);
  }

  function buildEditToolOptimizationRequest(draft, editTool, currentDayId) {
    const tool = normalizeEditTool(editTool);
    const mode = tool === 'driving' ? 'self_drive' : 'itinerary';
    return {
      base_revision: Number(draft?.revision || 0),
      scope: mode === 'self_drive'
        ? { type: 'trip', id: null }
        : { type: 'day', id: currentDayId || null },
      draft: { ...draft, mode }
    };
  }

  /**
   * Stable settings snapshot for workspace edit → regenerate flow.
   * Accepts either live app state or a previous snapshot.
   */
  function settingsSnapshot(stateLike) {
    const cities = Array.isArray(stateLike?.cities) ? stateLike.cities : [];
    const strategy = String(
      stateLike?.routeStrategy || stateLike?.strategy || 'balanced'
    ).trim() || 'balanced';
    return {
      cities: cities.map(city => {
        const days = Number(city?.days);
        const normalizedDays = Number.isFinite(days) ? days : 0;
        let planStay;
        if (city?.plan_stay === false) planStay = false;
        else if (city?.plan_stay === true) planStay = true;
        else planStay = normalizedDays > 0;
        return {
          name: String(city?.name || '').trim(),
          days: normalizedDays,
          plan_stay: planStay,
          transport: String(city?.transport || 'auto').trim() || 'auto'
        };
      }),
      routeShape: String(
        stateLike?.routeShape || stateLike?.route_shape || 'one_way'
      ).trim() || 'one_way',
      budget: String(stateLike?.budget || '').trim(),
      pace: String(stateLike?.pace || '').trim(),
      globalTransport: String(stateLike?.globalTransport || 'auto').trim() || 'auto',
      // Free-text prefs + self-drive strategy must participate in dirty checks.
      interests: String(stateLike?.interests || '').trim(),
      routeStrategy: strategy,
      // Departure date affects tickets/weather/export; include for dirty checks.
      departureDate: String(
        stateLike?.departureDate || stateLike?.start_date || ''
      ).trim()
    };
  }

  function settingsChanged(a, b) {
    return JSON.stringify(settingsSnapshot(a)) !== JSON.stringify(settingsSnapshot(b));
  }

  /**
   * Step 3 with a plan uses workspace chrome (status bar), not wizard steps.
   */
  function step3ChromeMode(wizardStep, hasPlan) {
    if (Number(wizardStep) === 3 && Boolean(hasPlan)) return 'workspace';
    return 'wizard';
  }

  /**
   * Summary display: default collapsed shows route + short meta (days · budget).
   */
  function buildSummaryDisplay(stateLike, expanded) {
    const full = buildSummary(stateLike);
    if (expanded) {
      return {
        route: full.route,
        totalDays: full.totalDays,
        meta: full.meta,
        expanded: true
      };
    }
    const shortMeta = [
      full.shapeLabel,
      full.totalDays ? `${full.totalDays} 个游玩日` : '',
      full.dateLabel
    ].filter(Boolean).join(' · ');
    return {
      route: full.route,
      totalDays: full.totalDays,
      meta: shortMeta || full.meta,
      expanded: false
    };
  }

  function countMappableStops(day) {
    const items = Array.isArray(day?.items) ? day.items : [];
    return items.filter(item => {
      const lat = Number(item?.lat);
      const lng = Number(item?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    }).length;
  }

  function dayMapHintLabel(day) {
    const count = countMappableStops(day);
    if (count <= 0) return '';
    return `${count} 个点 · 可看地图`;
  }

  global.AeroTravelWizard = Object.freeze({
    MAX_ROUTE_CITIES,
    MAX_PLAY_DAYS,
    MAX_CITY_NAME_LENGTH,
    localDateISO,
    defaultDepartureDate,
    normalizeCityName,
    validateCityName,
    findDuplicateCityIndex,
    canAddCity,
    isTransitCity,
    buildRouteStats,
    buildDaysSummaryText,
    transportDisplayLabel,
    segmentKey,
    segmentLabel,
    arrivalLabel,
    getOriginName,
    isRoundTripAllowed,
    routeShapeAfterCityRestore,
    createCityEntry,
    removeCityAt,
    restoreCityAt,
    reorderCityList,
    originChangeMessage,
    formatDepartureLabel,
    isPastDate,
    validateStep1,
    isSetupWizardStep,
    canEnterStep,
    wizardStepState,
    shouldAnimateStepTransition,
    buildSummary,
    buildSummaryDisplay,
    step1BlockReason,
    findAddedCityNames,
    routeLabel,
    isDrivingTransport,
    hasSelfDriveRouteData,
    hasSelfDriveIntent,
    shouldShowSelfDrivePrefs,
    shouldShowSelfDriveEditEntry,
    canSwitchEditTool,
    normalizeEditTool,
    isEditToolChange,
    buildEditToolOptimizationRequest,
    settingsSnapshot,
    settingsChanged,
    step3ChromeMode,
    countMappableStops,
    dayMapHintLabel
  });
})(typeof window !== 'undefined' ? window : global);
