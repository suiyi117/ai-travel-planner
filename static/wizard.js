(function (global) {
  'use strict';

  function validateStep1(input) {
    const cities = Array.isArray(input?.cities) ? input.cities : [];
    if (!cities.length) {
      return { ok: false, message: '请至少添加一个目的地城市。' };
    }
    for (const city of cities) {
      const name = String(city?.name || '').trim();
      const days = Number(city?.days);
      if (!name) {
        return { ok: false, message: '城市名称不能为空。' };
      }
      if (!Number.isInteger(days) || days < 1 || days > 7) {
        return { ok: false, message: `「${name}」的停留天数需在 1–7 天之间。` };
      }
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

  function buildSummary(stateLike) {
    const cities = Array.isArray(stateLike?.cities) ? stateLike.cities : [];
    const names = cities.map(c => String(c?.name || '').trim()).filter(Boolean);
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
      route: names.length ? names.join(' → ') : '未设置路线',
      totalDays,
      meta: metaParts.join(' · ')
    };
  }

  global.AeroTravelWizard = Object.freeze({
    validateStep1,
    canEnterStep,
    buildSummary
  });
})(typeof window !== 'undefined' ? window : global);
