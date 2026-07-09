(function initAeroTravelUtils(global) {
  'use strict';

  function todayPlus(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function addDays(dateStr, n) {
    const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) return '';
    base.setDate(base.getDate() + n);
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeType(type) {
    if (type === 'food') return '美食';
    if (type === 'hotel') return '住宿';
    if (type === 'transport') return '交通';
    return '景点';
  }

  function cleanMetaValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join('、');
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function copyPoiMeta(source = {}) {
    return {
      rating: cleanMetaValue(source.rating),
      address: cleanMetaValue(source.address),
      tel: cleanMetaValue(source.tel),
      opentime: cleanMetaValue(source.opentime)
    };
  }

  function mergePoiMeta(source = {}, fallback = {}) {
    return {
      rating: cleanMetaValue(source.rating) || cleanMetaValue(fallback.rating),
      address: cleanMetaValue(source.address) || cleanMetaValue(fallback.address),
      tel: cleanMetaValue(source.tel) || cleanMetaValue(fallback.tel),
      opentime: cleanMetaValue(source.opentime) || cleanMetaValue(fallback.opentime)
    };
  }

  function escapeHtml(value) {
    return cleanMetaValue(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function parseTimeRange(str) {
    const toMinutes = (hour, minute) => {
      const h = Number(hour);
      const m = Number(minute);
      if (h < 0 || h > 23 || m < 0 || m > 59) return null;
      return h * 60 + m;
    };
    const rangeMatch = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(String(str || ''));
    if (rangeMatch) {
      const startMin = toMinutes(rangeMatch[1], rangeMatch[2]);
      let endMin = toMinutes(rangeMatch[3], rangeMatch[4]);
      if (startMin === null || endMin === null) return null;
      if (endMin < startMin) endMin += 1440;
      return [startMin, endMin];
    }
    const pointMatch = /(?:^|\D)(\d{1,2}):(\d{2})(?:\D|$)/.exec(String(str || ''));
    if (!pointMatch) return null;
    const pointMin = toMinutes(pointMatch[1], pointMatch[2]);
    return pointMin === null ? null : [pointMin, pointMin + 90];
  }

  function parsePriceValue(str) {
    const nums = String(str || '').match(/\d+(\.\d+)?/g);
    if (!nums || !nums.length) return null;
    if (nums.length >= 2) return (Number(nums[0]) + Number(nums[1])) / 2;
    return Number(nums[0]);
  }

  function normalizeSegKey(s) {
    return String(s).split(/→|->/).map(t => t.trim()).join(' → ');
  }

  function cityToken(city) {
    return cleanMetaValue(city).replace(/市$/, '');
  }

  function textHasCity(text, city) {
    const token = cityToken(city);
    return Boolean(token && cleanMetaValue(text).includes(token));
  }

  function optionMatchesDirection(option, fromCity, toCity) {
    const from = option.from_station || option.from_airport || '';
    const to = option.to_station || option.to_airport || '';
    if (from && !textHasCity(from, fromCity)) return false;
    if (to && !textHasCity(to, toCity)) return false;
    return true;
  }

  global.AeroTravelUtils = Object.freeze({
    todayPlus,
    addDays,
    normalizeType,
    cleanMetaValue,
    copyPoiMeta,
    mergePoiMeta,
    escapeHtml,
    parseTimeRange,
    parsePriceValue,
    normalizeSegKey,
    cityToken,
    textHasCity,
    optionMatchesDirection
  });
})(typeof window !== 'undefined' ? window : globalThis);
