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

  global.AeroTravelWizard = Object.freeze({
    validateStep1,
    canEnterStep,
    buildSummary,
    routeLabel
  });
})(typeof window !== 'undefined' ? window : global);
