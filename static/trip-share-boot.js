(function initTripShareBoot(root) {
  'use strict';

  const PREVIEW_KEY = 'aerotravel:trip-share-preview';
  const mapRegistry = [];

  function showToast(message) {
    const el = document.getElementById('tripToast');
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function loadPackage() {
    if (root.__TRIP_PACKAGE__ && typeof root.__TRIP_PACKAGE__ === 'object') {
      return root.__TRIP_PACKAGE__;
    }
    try {
      const raw = sessionStorage.getItem(PREVIEW_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_err) {
      /* ignore */
    }
    const params = new URLSearchParams(location.search);
    const embedded = params.get('embedded');
    if (embedded === '1') {
      try {
        const raw = localStorage.getItem(PREVIEW_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_err) {
        /* ignore */
      }
    }
    return null;
  }

  function collectAnchors(pkg, dayFilter) {
    if (dayFilter && dayFilter !== 'all') {
      const day = (pkg.days || []).find(d => String(d.day) === String(dayFilter));
      return day ? (day.anchors || []) : [];
    }
    return pkg.map_anchors || [];
  }

  function lineStyleForStatus(status) {
    if (root.AeroTravelTripPackage && typeof root.AeroTravelTripPackage.lineStyleForStatus === 'function') {
      return root.AeroTravelTripPackage.lineStyleForStatus(status);
    }
    if (status === 'provider') {
      return { color: '#c96442', weight: 4, opacity: 0.9, dashArray: null };
    }
    if (status === 'intercity') {
      return { color: '#0f766e', weight: 4, opacity: 0.9, dashArray: null };
    }
    return { color: '#77736b', weight: 3, opacity: 0.9, dashArray: '8 8' };
  }

  function collectRouteLines(pkg, dayFilter) {
    const lines = Array.isArray(pkg?.route_lines) ? pkg.route_lines : [];
    if (!lines.length) return [];
    if (!dayFilter || dayFilter === 'all') {
      const overview = lines.filter(line => line.day === null || line.day === undefined || line.day === '');
      return overview.length ? overview : lines;
    }
    const dayNum = Number(dayFilter);
    const dayLines = lines.filter(line => Number(line.day) === dayNum);
    return dayLines;
  }

  function paintMap(container, pkg, dayFilter) {
    if (!container || !root.L) return null;
    if (container._tripMap) {
      container._tripMap.remove();
      container._tripMap = null;
    }

    const anchors = collectAnchors(pkg, dayFilter).filter(a => (
      Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng))
    ));
    const routeLines = collectRouteLines(pkg, dayFilter);
    const center = anchors[0]
      ? [anchors[0].lat, anchors[0].lng]
      : [34.2, 108.9];
    const map = root.L.map(container, { zoomControl: false }).setView(center, anchors.length ? 11 : 5);
    root.L.control.zoom({ position: 'bottomright' }).addTo(map);
    root.L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234',
      attribution: '高德地图'
    }).addTo(map);

    const latlngs = [];
    anchors.forEach((anchor, index) => {
      const latlng = [Number(anchor.lat), Number(anchor.lng)];
      latlngs.push(latlng);
      const html = `<div class="trip-marker${anchor.kind === 'hotel' ? ' is-hotel' : ''}" style="background:${anchor.color || '#c96442'}">${anchor.order || index + 1}</div>`;
      const icon = root.L.divIcon({
        className: '',
        html,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      root.L.marker(latlng, { icon }).addTo(map).bindPopup(
        `<strong>${root.AeroTravelTripShareRender.escapeHtml(anchor.title)}</strong><br>${root.AeroTravelTripShareRender.escapeHtml(anchor.time || '')}`
      );
    });

    let paintedRoute = false;
    routeLines.forEach(line => {
      const points = (line.points || [])
        .map(point => [Number(point[0]), Number(point[1])])
        .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (points.length < 2) return;
      root.L.polyline(points, lineStyleForStatus(line.status)).addTo(map);
      points.forEach(point => latlngs.push(point));
      paintedRoute = true;
    });

    if (!paintedRoute && latlngs.length >= 2) {
      root.L.polyline(latlngs, lineStyleForStatus('estimate')).addTo(map);
    }

    if (latlngs.length) {
      map.fitBounds(latlngs, { padding: [28, 28], maxZoom: 13 });
    }

    container._tripMap = map;
    mapRegistry.push(map);
    setTimeout(() => map.invalidateSize(), 50);
    return map;
  }

  function mountMaps(pkg) {
    document.querySelectorAll('[data-trip-map]').forEach(node => {
      paintMap(node, pkg, node.getAttribute('data-day') || 'all');
    });
  }

  function bindMapScope(pkg) {
    document.querySelectorAll('[data-map-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-map-scope]').forEach(el => el.classList.remove('is-active'));
        btn.classList.add('is-active');
        const scope = btn.getAttribute('data-map-scope') || 'all';
        document.querySelectorAll('.trip-overview-mobile [data-trip-map="overview"]').forEach(node => {
          paintMap(node, pkg, scope);
        });
      });
    });
  }

  async function handleCopy(text) {
    try {
      await root.AeroTravelTripNav.copyText(text);
      showToast('已复制');
    } catch (_err) {
      showToast('复制失败，请手动选择文本');
    }
  }

  function fullPlainText(pkg) {
    const lines = [
      pkg.title || '',
      pkg.summary || '',
      `${pkg.route || ''} · ${pkg.total_days || ''}天 · ${pkg.budget_label || ''}`,
      ''
    ];
    (pkg.days || []).forEach(day => {
      lines.push(root.AeroTravelTripNav.dayPlainText(day), '');
    });
    if ((pkg.transport_guide || []).length) {
      lines.push('【城际交通】');
      pkg.transport_guide.forEach(segment => {
        const selected = segment.selected;
        lines.push(`- ${segment.segment}｜${segment.source_label || '需确认'}`);
        if (selected) {
          lines.push(`  ${[selected.id, selected.time, selected.duration, selected.price].filter(Boolean).join(' · ')}`);
        }
      });
      lines.push('');
    }
    lines.push('【费用参考】');
    (pkg.budget?.rows || []).forEach(row => lines.push(`- ${row.label}：${row.value}`));
    lines.push('', '【出行贴士】');
    (pkg.tips || []).forEach(tip => lines.push(`- ${tip}`));
    lines.push('', pkg.disclaimer || '');
    return lines.join('\n');
  }

  async function exportOverviewPng(pkg) {
    if (!root.html2canvas) {
      showToast('长图组件不可用，请改用 PDF');
      return;
    }
    const host = document.getElementById('tripExportHost');
    if (!host) return;
    host.hidden = false;
    host.innerHTML = root.AeroTravelTripShareRender.renderOverviewPngSheet(pkg);
    const sheet = host.querySelector('.trip-png-sheet');
    const mapNode = sheet.querySelector('[data-trip-map]');
    if (mapNode) paintMap(mapNode, pkg, 'all');
    await new Promise(resolve => setTimeout(resolve, 400));
    try {
      const canvas = await root.html2canvas(sheet, {
        backgroundColor: '#faf9f5',
        scale: 2,
        useCORS: true,
        logging: false
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
      if (!blob) throw new Error('empty');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${pkg.title || '行程总览'}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('总览图已下载');
    } catch (_err) {
      showToast('总览图导出失败');
    } finally {
      host.innerHTML = '';
      host.hidden = true;
    }
  }

  function exportPdf(_pkg) {
    // Self-contained pages already have print CSS; avoid relative asset popups.
    showToast('请在打印对话框中选择“另存为 PDF”');
    setTimeout(() => window.print(), 120);
  }

  function bindActions(pkg) {
    document.addEventListener('click', async event => {
      const target = event.target.closest('[data-action], [data-copy], a.trip-chip');
      if (!target) return;
      if (target.hasAttribute('data-copy')) {
        event.preventDefault();
        await handleCopy(target.getAttribute('data-copy') || '');
        return;
      }
      const action = target.getAttribute('data-action');
      if (action === 'copy-all') {
        await handleCopy(fullPlainText(pkg));
      } else if (action === 'copy-day') {
        const dayNum = target.getAttribute('data-day');
        const day = (pkg.days || []).find(d => String(d.day) === String(dayNum));
        if (day) await handleCopy(root.AeroTravelTripNav.dayPlainText(day));
      } else if (action === 'download-png') {
        await exportOverviewPng(pkg);
      } else if (action === 'download-pdf') {
        exportPdf(pkg);
      } else if (
        target.matches('a.trip-chip')
        && root.AeroTravelTripNav
        && root.AeroTravelTripNav.isInAppBrowser()
        && /uri\.amap\.com/i.test(target.getAttribute('href') || '')
      ) {
        showToast(root.AeroTravelTripNav.inAppBrowserHint());
      }
    });
  }

  function revealInAppBanner() {
    if (!root.AeroTravelTripNav || !root.AeroTravelTripNav.isInAppBrowser()) return;
    document.querySelectorAll('[data-inapp-banner]').forEach(node => {
      node.hidden = false;
    });
  }

  function renderEmpty() {
    document.body.innerHTML = `
      <main class="trip-main" style="padding-top:48px">
        <section class="trip-panel">
          <h1>未找到行程数据</h1>
          <p>请通过 AeroTravel 工作台「发布专属行程」生成页面，或重新打开预览链接。</p>
        </section>
      </main>
    `;
  }

  function boot() {
    const Render = root.AeroTravelTripShareRender;
    const pkg = loadPackage();
    if (!pkg || !Render) {
      renderEmpty();
      return;
    }
    document.title = `${pkg.title || '专属行程'} · AeroTravel`;
    document.body.classList.add('trip-share-body');
    document.body.innerHTML = Render.renderTripPage(pkg);
    bindActions(pkg);
    bindMapScope(pkg);
    mountMaps(pkg);
    revealInAppBanner();
    window.addEventListener('resize', () => {
      mapRegistry.forEach(map => {
        try { map.invalidateSize(); } catch (_err) { /* ignore */ }
      });
    });
  }

  root.AeroTravelTripShareBoot = Object.freeze({
    PREVIEW_KEY,
    boot,
    loadPackage,
    fullPlainText,
    exportOverviewPng,
    exportPdf
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
