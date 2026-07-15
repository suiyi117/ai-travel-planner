(function (global) {
  'use strict';

  function validateStep1(input) {
    const cities = Array.isArray(input?.cities) ? input.cities : [];
    if (!cities.length) {
      return { ok: false, message: '请至少添加一个目的地城市。' };
    }
    let playable = 0;
    for (let index = 0; index < cities.length; index += 1) {
      const city = cities[index];
      const name = String(city?.name || '').trim();
      const days = Number(city?.days);
      if (!name) {
        return { ok: false, message: '城市名称不能为空。' };
      }
      // Explicit plan_stay=false OR days===0 means transit (align with backend).
      if (city?.plan_stay === false || days === 0) {
        if (!Number.isInteger(days) || days < 0 || days > 7) {
          return { ok: false, message: `「${name}」的停留天数需在 0–7 天之间。` };
        }
        continue;
      }
      if (!Number.isInteger(days) || days < 1 || days > 7) {
        return { ok: false, message: `「${name}」的停留天数需在 1–7 天之间。` };
      }
      playable += 1;
    }
    if (playable < 1) {
      return { ok: false, message: '请至少为一个城市安排游玩天数，或勾选起点「安排当地游玩」。' };
    }
    return { ok: true, message: '' };
  }

  function canEnterStep(step, flags) {
    const n = Number(step);
    if (n === 1) return true;
    if (n === 2) return Boolean(flags?.step1Done);
    if (n === 3) return Boolean(flags?.hasPlan);
    return false;
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
    const totalDays = cities.reduce((sum, c) => sum + (Number(c?.days) || 0), 0);
    const budget = String(stateLike?.budget || '').trim();
    const pace = String(stateLike?.pace || '').trim();
    const transport = String(stateLike?.globalTransport || 'auto');
    const transportLabel = transport === 'train' ? '高铁'
      : transport === 'plane' ? '飞机'
      : transport === 'driving' ? '自驾'
      : '智能交通';
    const metaParts = [
      totalDays ? `${totalDays} 天` : '',
      budget,
      pace,
      transportLabel
    ].filter(Boolean);
    return {
      route: routeLabel(cities, stateLike?.routeShape || stateLike?.route_shape),
      totalDays,
      meta: metaParts.join(' · ')
    };
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
      globalTransport: String(stateLike?.globalTransport || 'auto').trim() || 'auto'
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
    const cities = Array.isArray(stateLike?.cities) ? stateLike.cities : [];
    const totalDays = cities.reduce((sum, c) => sum + (Number(c?.days) || 0), 0);
    const budget = String(stateLike?.budget || '').trim();
    const shortMeta = [totalDays ? `${totalDays} 天` : '', budget].filter(Boolean).join(' · ');
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
    validateStep1,
    canEnterStep,
    shouldAnimateStepTransition,
    buildSummary,
    buildSummaryDisplay,
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
