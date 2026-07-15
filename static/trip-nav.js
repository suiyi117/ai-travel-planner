(function initAeroTravelTripNav(root) {
  'use strict';

  function clean(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function hasCoords(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
  }

  function isInAppBrowser(userAgent) {
    const ua = clean(userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''));
    if (!ua) return false;
    return /MicroMessenger|QQ\//i.test(ua)
      || /Weibo/i.test(ua)
      || /DingTalk/i.test(ua)
      || /AlipayClient/i.test(ua)
      || /miniProgram/i.test(ua);
  }

  function inAppBrowserHint() {
    return '当前可能在微信/QQ 等内置浏览器中。地图 App 调起可能失败：可先复制地址，再点右上角「···」用系统浏览器打开本页。';
  }

  function amapPoiUrl(name, lat, lng, address) {
    const title = encodeURIComponent(clean(name) || '目的地');
    if (hasCoords(lat, lng)) {
      return `https://uri.amap.com/marker?position=${Number(lng)},${Number(lat)}&name=${title}&coordinate=gaode&callnative=1`;
    }
    const query = encodeURIComponent(clean(address) || clean(name) || '目的地');
    return `https://uri.amap.com/search?keyword=${query}&callnative=1`;
  }

  function amapRouteUrl(from, to, mode) {
    const travelMode = ['car', 'bus', 'walk', 'ride'].includes(mode) ? mode : 'car';
    const params = [`mode=${travelMode}`, 'coordinate=gaode', 'callnative=1'];
    if (from && hasCoords(from.lat, from.lng)) {
      params.push(`from=${Number(from.lng)},${Number(from.lat)},${encodeURIComponent(clean(from.name) || '起点')}`);
    }
    if (to && hasCoords(to.lat, to.lng)) {
      params.push(`to=${Number(to.lng)},${Number(to.lat)},${encodeURIComponent(clean(to.name) || '终点')}`);
    } else if (to && clean(to.name)) {
      params.push(`to=${encodeURIComponent(clean(to.name))}`);
    }
    return `https://uri.amap.com/navigation?${params.join('&')}`;
  }

  function webSearchUrl(query) {
    return `https://www.bing.com/search?q=${encodeURIComponent(clean(query))}`;
  }

  function dianpingSearchUrl(name, city) {
    const q = [clean(city), clean(name)].filter(Boolean).join(' ');
    return `https://www.dianping.com/search/keyword/0/0_${encodeURIComponent(q)}`;
  }

  function xhsSearchUrl(name, city) {
    const q = [clean(city), clean(name), '攻略'].filter(Boolean).join(' ');
    return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(q)}`;
  }

  function nextStop(items, currentIndex) {
    const list = Array.isArray(items) ? items : [];
    for (let i = currentIndex + 1; i < list.length; i += 1) {
      const item = list[i];
      if (item && item.type !== 'transport') return { item, index: i };
    }
    return null;
  }

  function buildItemActions(item, nextItem, options) {
    const opts = options || {};
    const actions = [];
    const title = clean(item?.title);
    const city = clean(item?.city);
    const address = clean(item?.address);

    if (title || hasCoords(item?.lat, item?.lng)) {
      actions.push({
        id: 'amap-open',
        label: '高德打开',
        href: amapPoiUrl(title, item?.lat, item?.lng, address),
        external: true
      });
    }

    if (nextItem && (hasCoords(item?.lat, item?.lng) || hasCoords(nextItem.lat, nextItem.lng))) {
      actions.push({
        id: 'next-route',
        label: '下一站路线',
        href: amapRouteUrl(
          { name: title, lat: item?.lat, lng: item?.lng },
          { name: nextItem.title, lat: nextItem.lat, lng: nextItem.lng },
          opts.mode || 'car'
        ),
        external: true
      });
    }

    if (title) {
      actions.push({
        id: 'copy-name',
        label: '复制地点',
        copyText: title
      });
      if (address) {
        actions.push({
          id: 'copy-address',
          label: '复制地址',
          copyText: `${title}\n${address}`
        });
      }
      actions.push({
        id: 'web-search',
        label: '网页搜索',
        href: webSearchUrl(`${city} ${title}`),
        external: true
      });
      actions.push({
        id: 'xhs-search',
        label: '小红书参考',
        href: xhsSearchUrl(title, city),
        external: true
      });
      actions.push({
        id: 'dianping-search',
        label: '大众点评',
        href: dianpingSearchUrl(title, city),
        external: true
      });
    }

    (item?.refs || []).forEach((ref, index) => {
      if (!ref?.url) return;
      actions.push({
        id: `ref-${index}`,
        label: clean(ref.label) || '参考链接',
        href: clean(ref.url),
        external: true
      });
    });

    return actions;
  }

  function dayPlainText(day) {
    const lines = [];
    lines.push(`Day ${day.day}${day.date ? ` · ${day.date}` : ''} · ${day.city || ''}`);
    if (day.weather) lines.push(`天气：${day.weather}`);
    if (day.route) lines.push(day.route);
    (day.items || []).forEach(item => {
      const meta = [item.time, item.duration].filter(Boolean).join(' · ');
      lines.push(`- ${meta ? `${meta}｜` : ''}${item.title || ''}`);
      if (item.desc) lines.push(`  ${item.desc}`);
      if (item.address) lines.push(`  地址：${item.address}`);
    });
    return lines.join('\n');
  }

  async function copyText(text) {
    const value = clean(text);
    if (!value) throw new Error('无可复制内容');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('复制失败');
  }

  root.AeroTravelTripNav = Object.freeze({
    amapPoiUrl,
    amapRouteUrl,
    webSearchUrl,
    dianpingSearchUrl,
    xhsSearchUrl,
    nextStop,
    buildItemActions,
    dayPlainText,
    copyText,
    hasCoords,
    isInAppBrowser,
    inAppBrowserHint
  });
})(typeof window !== 'undefined' ? window : globalThis);
