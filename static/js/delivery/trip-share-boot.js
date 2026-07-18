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
    const canUseLocalPreview = params.get('embedded') === '1' || params.get('preview') === '1';
    if (canUseLocalPreview) {
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

  function createShareMap(container, center, zoom) {
    if (root.AeroTravelMap?.createMap) {
      container.classList.add('is-vector-pending');
      const map = root.AeroTravelMap.createMap(container, center, zoom, {
        zoomControlPosition: 'topright',
        attributionControlPosition: 'bottomleft',
        vectorFirst: true
      });
      const settleVectorPreview = () => container.classList.remove('is-vector-pending');
      if (container.dataset.basemap === 'vector-pending') {
        container.addEventListener('aerotravel:basemapchange', settleVectorPreview, { once: true });
        setTimeout(settleVectorPreview, 12500);
      } else {
        settleVectorPreview();
      }
      return map;
    }
    const map = root.L.map(container, { zoomControl: false }).setView(center, zoom);
    map.attributionControl?.setPosition('bottomleft');
    root.L.control.zoom({ position: 'topright' }).addTo(map);
    root.L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234',
      detectRetina: false,
      attribution: '高德地图'
    }).addTo(map);
    container.dataset.basemap = 'raster';
    return map;
  }

  function toShareLatLng(point, map) {
    return root.AeroTravelMap?.toMapLatLng ? root.AeroTravelMap.toMapLatLng(point, map) : point;
  }

  function translateMapOverlays(map, coordinateSystem) {
    const converter = coordinateSystem === 'wgs84'
      ? root.AeroTravelMap?.gcj02ToWgs84
      : root.AeroTravelMap?.wgs84ToGcj02;
    if (!map || typeof converter !== 'function') return;
    const convertLatLng = latlng => converter([Number(latlng.lat), Number(latlng.lng)]);
    const convertShape = value => {
      if (Array.isArray(value)) return value.map(convertShape);
      if (value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
        return convertLatLng(value);
      }
      return value;
    };
    map.eachLayer(layer => {
      if (typeof layer.getLatLng === 'function' && typeof layer.setLatLng === 'function') {
        layer.setLatLng(convertLatLng(layer.getLatLng()));
      } else if (typeof layer.getLatLngs === 'function' && typeof layer.setLatLngs === 'function') {
        layer.setLatLngs(convertShape(layer.getLatLngs()));
      }
    });
  }

  async function waitForExportAssets(rootNode) {
    const pending = [];
    if (document.fonts?.ready) pending.push(Promise.resolve(document.fonts.ready).catch(() => {}));
    rootNode?.querySelectorAll?.('img').forEach(image => {
      if (image.complete) {
        if (typeof image.decode === 'function') pending.push(image.decode().catch(() => {}));
        return;
      }
      pending.push(new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }));
    });
    await Promise.race([
      Promise.allSettled(pending),
      new Promise(resolve => setTimeout(resolve, 1800))
    ]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function paintMap(container, pkg, dayFilter) {
    if (!container || !root.L) return null;
    if (container._tripBasemapHandler) {
      container.removeEventListener('aerotravel:basemapchange', container._tripBasemapHandler);
      container._tripBasemapHandler = null;
    }
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
    const map = createShareMap(container, center, anchors.length ? 11 : 5);
    const handleBasemapChange = event => {
      const coordinateSystem = event.detail?.coordinateSystem || 'gcj02';
      const previousCoordinateSystem = event.detail?.previousCoordinateSystem;
      if (!previousCoordinateSystem || previousCoordinateSystem !== coordinateSystem) {
        translateMapOverlays(map, coordinateSystem);
      }
    };
    container._tripBasemapHandler = handleBasemapChange;
    container.addEventListener('aerotravel:basemapchange', handleBasemapChange);

    const latlngs = [];
    const markerRecords = [];
    anchors.forEach((anchor, index) => {
      const latlng = toShareLatLng([Number(anchor.lat), Number(anchor.lng)], map);
      latlngs.push(latlng);
      const html = `<div class="trip-marker${anchor.kind === 'hotel' ? ' is-hotel' : ''}" style="background:${anchor.color || '#c96442'}">${anchor.order || index + 1}</div>`;
      const icon = root.L.divIcon({
        className: '',
        html,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const marker = root.L.marker(latlng, {
        icon,
        bubblingMouseEvents: false,
        title: anchor.title || `行程节点 ${index + 1}`,
        alt: `行程节点 ${anchor.order || index + 1}：${anchor.title || ''}`
      }).addTo(map);
      marker.on('click', () => {
        container.dispatchEvent(new CustomEvent('aerotravel:focusanchor', {
          detail: { anchor, index }
        }));
      });
      markerRecords.push({ anchor, marker });
    });

    let paintedRoute = false;
    routeLines.forEach(line => {
      const points = (line.points || [])
        .map(point => toShareLatLng([Number(point[0]), Number(point[1])], map))
        .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (points.length < 2) return;
      const lineStyle = lineStyleForStatus(line.status);
      root.L.polyline(points, {
        ...lineStyle,
        color: '#fffcf5',
        weight: Math.max(Number(lineStyle.weight || 3) + 6, 9),
        opacity: 0.88
      }).addTo(map);
      root.L.polyline(points, lineStyle).addTo(map);
      points.forEach(point => latlngs.push(point));
      paintedRoute = true;
    });

    if (!paintedRoute && latlngs.length >= 2) {
      const lineStyle = lineStyleForStatus('estimate');
      root.L.polyline(latlngs, {
        ...lineStyle,
        color: '#fffcf5',
        weight: Math.max(Number(lineStyle.weight || 3) + 6, 9),
        opacity: 0.88
      }).addTo(map);
      root.L.polyline(latlngs, lineStyle).addTo(map);
    }

    if (latlngs.length) {
      map.fitBounds(latlngs, { padding: [28, 28], maxZoom: 13 });
    }

    container._tripMap = map;
    container._tripMarkers = markerRecords;
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

  function isJourneyMapBackgroundTarget(target) {
    return !target?.closest?.('.leaflet-marker-icon, .leaflet-control, .maplibregl-ctrl');
  }

  function setJourneyFocusCardVisible(isVisible) {
    const focusCard = document.querySelector('[data-focus-card]');
    if (!focusCard) return;
    focusCard.hidden = !isVisible;
    focusCard.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
  }

  function updateJourneyFocus(pkg, day, item, itemIndex) {
    if (!day || !item) return;
    setJourneyFocusCardVisible(true);
    const panel = document.querySelector(`[data-focus-day="${String(day.day)}"]`);
    panel?.querySelectorAll('[data-focus-item]').forEach(row => {
      row.classList.toggle('is-active', Number(row.getAttribute('data-item-index')) === Number(itemIndex));
    });

    const focusCard = document.querySelector('[data-focus-card]');
    if (focusCard) {
      const focusType = item.type === 'food' ? '美食'
        : item.type === 'hotel' ? '住宿'
        : item.type === 'transport' ? '交通'
        : item.type === 'experience' ? '体验'
        : '景点';
      const meta = [item.time, focusType, item.duration, item.rating ? `评分 ${item.rating}` : ''].filter(Boolean);
      const titleNode = focusCard.querySelector('[data-focus-title]');
      const metaNode = focusCard.querySelector('[data-focus-meta]');
      const descNode = focusCard.querySelector('[data-focus-desc]');
      if (titleNode) titleNode.textContent = item.title || '未命名地点';
      if (metaNode) metaNode.textContent = meta.join(' · ');
      if (descNode) descNode.textContent = item.desc || item.address || '点击时间线或地图标记查看地点详情。';
    }

    const actionDay = document.querySelector('[data-action-day]');
    const actionPlace = document.querySelector('[data-action-place]');
    const actionNext = document.querySelector('[data-action-next]');
    const weather = document.querySelector('[data-focus-weather]');
    if (actionDay) actionDay.textContent = `Day ${day.day} · ${day.city || ''}`;
    if (actionPlace) actionPlace.textContent = item.title || '未命名地点';
    if (weather) weather.textContent = day.weather || `${day.city || ''} · 以实时天气为准`;

    const next = root.AeroTravelTripNav?.nextStop(day.items || [], Number(itemIndex));
    if (actionNext) actionNext.textContent = next?.item?.title ? `下一站：${next.item.title}` : '当天最后一站';

    const copyDay = document.querySelector('[data-action="copy-day"]');
    if (copyDay) copyDay.setAttribute('data-day', String(day.day));
    const navAction = root.AeroTravelTripNav
      ?.buildItemActions(item, next?.item)
      .find(action => action.id === 'amap-open');
    const primaryNav = document.querySelector('[data-primary-nav]');
    if (primaryNav) {
      primaryNav.hidden = !navAction?.href;
      primaryNav.setAttribute('href', navAction?.href || '#');
    }

    const mapNode = document.querySelector('[data-trip-map="focus"]');
    const map = mapNode?._tripMap;
    if (map && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))) {
      const point = toShareLatLng([Number(item.lat), Number(item.lng)], map);
      map.setView(point, Math.max(map.getZoom(), 13), { animate: true });
      const record = (mapNode._tripMarkers || []).find(entry => (
        (item.id && entry.anchor?.id === item.id)
        || entry.anchor?.title === item.title
      ));
      (mapNode._tripMarkers || []).forEach(entry => {
        entry.marker?.setZIndexOffset?.(entry === record ? 600 : 0);
      });
    }
  }

  function selectJourneyDay(pkg, dayNumber) {
    const day = (pkg.days || []).find(entry => String(entry.day) === String(dayNumber));
    if (!day) return;
    document.querySelectorAll('[data-journey-day]').forEach(button => {
      const active = String(button.getAttribute('data-journey-day')) === String(day.day);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-focus-day]').forEach(panel => {
      panel.hidden = String(panel.getAttribute('data-focus-day')) !== String(day.day);
    });
    const mapNode = document.querySelector('[data-trip-map="focus"]');
    if (mapNode) {
      mapNode.setAttribute('data-day', String(day.day));
      mapNode.setAttribute('aria-label', `Day ${day.day} 路线地图`);
      paintMap(mapNode, pkg, day.day);
    }
    const items = day.items || [];
    const item = items.find(entry => entry.type !== 'transport' && Number(entry.lat) && Number(entry.lng))
      || items.find(entry => Number(entry.lat) && Number(entry.lng))
      || items[0];
    if (item) updateJourneyFocus(pkg, day, item, items.indexOf(item));
  }

  function bindJourneyFactDetails(pkg) {
    const panel = document.querySelector('[data-fact-detail-panel]');
    const card = panel?.querySelector('.trip-fact-detail-card');
    const triggers = Array.from(document.querySelectorAll('[data-fact-detail-trigger]'));
    if (!panel || !card || !triggers.length) return;

    let lastTrigger = null;
    const setExpandedTrigger = activeTrigger => {
      triggers.forEach(trigger => {
        trigger.setAttribute('aria-expanded', trigger === activeTrigger ? 'true' : 'false');
      });
    };
    const closeDetail = (restoreFocus = true) => {
      if (panel.hidden) return;
      panel.hidden = true;
      panel.removeAttribute('data-fact-detail-type');
      document.body.classList.remove('is-fact-detail-open');
      setExpandedTrigger(null);
      const focusTarget = lastTrigger;
      lastTrigger = null;
      if (restoreFocus) focusTarget?.focus({ preventScroll: true });
    };
    const openDetail = trigger => {
      const type = trigger?.getAttribute('data-fact-detail-trigger');
      if (!['budget', 'tips'].includes(type)) return;
      if (!panel.hidden && panel.getAttribute('data-fact-detail-type') === type) {
        closeDetail();
        return;
      }

      const rows = pkg.budget?.rows || [];
      const tips = pkg.tips || [];
      const meta = type === 'budget'
        ? { title: '费用估算', kicker: `${rows.length} 项费用明细` }
        : { title: '重要提示', kicker: `${tips.length} 条出行提醒` };
      panel.querySelectorAll('[data-fact-detail-content]').forEach(content => {
        content.hidden = content.getAttribute('data-fact-detail-content') !== type;
      });
      const title = panel.querySelector('[data-fact-detail-title]');
      const kicker = panel.querySelector('[data-fact-detail-kicker]');
      if (title) title.textContent = meta.title;
      if (kicker) kicker.textContent = meta.kicker;
      panel.setAttribute('data-fact-detail-type', type);
      panel.hidden = false;
      document.body.classList.add('is-fact-detail-open');
      lastTrigger = trigger;
      setExpandedTrigger(trigger);
      root.requestAnimationFrame?.(() => {
        panel.querySelector('.trip-fact-detail-close')?.focus({ preventScroll: true });
      });
    };

    triggers.forEach(trigger => {
      trigger.addEventListener('click', () => openDetail(trigger));
    });
    panel.addEventListener('click', event => {
      if (event.target.closest?.('[data-fact-detail-close]')) closeDetail();
    });
    document.addEventListener('keydown', event => {
      if (panel.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(card.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => !element.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !card.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function bindJourneyWorkspace(pkg) {
    bindJourneyFactDetails(pkg);
    document.querySelectorAll('[data-journey-day]').forEach(button => {
      button.addEventListener('click', () => selectJourneyDay(pkg, button.getAttribute('data-journey-day')));
    });

    const focusPanel = document.getElementById('tripFocusPanel');
    const selectRow = row => {
      const dayNode = row?.closest('[data-focus-day]');
      const day = (pkg.days || []).find(entry => String(entry.day) === String(dayNode?.getAttribute('data-focus-day')));
      const index = Number(row?.getAttribute('data-item-index'));
      const item = day?.items?.[index];
      if (day && item) updateJourneyFocus(pkg, day, item, index);
    };
    focusPanel?.addEventListener('click', event => {
      if (event.target.closest('a, button')) return;
      const row = event.target.closest('[data-focus-item]');
      if (row) selectRow(row);
    });
    focusPanel?.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const row = event.target.closest('[data-focus-item]');
      if (!row || event.target.closest('a, button')) return;
      event.preventDefault();
      selectRow(row);
    });

    const mapNode = document.querySelector('[data-trip-map="focus"]');
    mapNode?.setAttribute('data-dismiss-focus', 'map-background');
    mapNode?.addEventListener('click', event => {
      if (!isJourneyMapBackgroundTarget(event.target)) return;
      setJourneyFocusCardVisible(false);
    }, true);
    mapNode?.addEventListener('aerotravel:focusanchor', event => {
      const activeDayNode = document.querySelector('[data-focus-day]:not([hidden])');
      const day = (pkg.days || []).find(entry => String(entry.day) === String(activeDayNode?.getAttribute('data-focus-day')));
      if (!day) return;
      const anchor = event.detail?.anchor;
      const index = (day.items || []).findIndex(item => (
        (item.id && anchor?.id === item.id) || item.title === anchor?.title
      ));
      if (index >= 0) updateJourneyFocus(pkg, day, day.items[index], index);
    });

    const firstDay = pkg.days?.[0];
    const firstItem = firstDay?.items?.find(item => item.type !== 'transport' && Number(item.lat) && Number(item.lng))
      || firstDay?.items?.find(item => Number(item.lat) && Number(item.lng))
      || firstDay?.items?.[0];
    if (firstDay && firstItem) updateJourneyFocus(pkg, firstDay, firstItem, firstDay.items.indexOf(firstItem));
  }

  function openAppLinkWithFallback(target) {
    const Nav = root.AeroTravelTripNav;
    if (!Nav?.isMobileDevice?.()) return false;
    const appHref = target.getAttribute('data-app-href') || '';
    const fallbackHref = target.getAttribute('data-fallback-href') || target.getAttribute('href') || '';
    if (!appHref) return false;
    const appName = target.getAttribute('data-app-name') || '对应 App';
    if (Nav.isInAppBrowser()) {
      showToast(Nav.inAppBrowserHint());
      if (fallbackHref) root.location.href = fallbackHref;
      return true;
    }

    let pageHidden = false;
    const markHidden = () => {
      if (document.visibilityState === 'hidden') pageHidden = true;
    };
    document.addEventListener('visibilitychange', markHidden, { once: true });
    root.location.href = appHref;
    setTimeout(() => {
      if (!pageHidden && document.visibilityState === 'visible' && fallbackHref) {
        showToast(`未检测到${appName}，已打开网页版`);
        root.location.href = fallbackHref;
      }
    }, 1200);
    return true;
  }

  function ensurePrintHost(pkg) {
    const host = document.getElementById('tripPrintHost');
    if (!host || host.childElementCount) return host;
    host.innerHTML = root.AeroTravelTripShareRender.renderPrintableDocument(pkg);
    return host;
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
    await waitForExportAssets(sheet);
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

  function exportPdf(pkg) {
    // Self-contained pages already have print CSS; avoid relative asset popups.
    ensurePrintHost(pkg);
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
      if (
        target.matches('a.trip-chip[data-app-href]')
        && root.AeroTravelTripNav?.isMobileDevice?.()
      ) {
        event.preventDefault();
        openAppLinkWithFallback(target);
        return;
      }
      const action = target.getAttribute('data-action');
      const compactMenu = target.closest('details.trip-topbar-more');
      if (compactMenu) compactMenu.removeAttribute('open');
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

  function resetPreviewScrollPosition() {
    const params = new URLSearchParams(root.location?.search || '');
    if (params.get('preview') !== '1' || root.location?.hash) return;
    if (root.history && 'scrollRestoration' in root.history) {
      root.history.scrollRestoration = 'manual';
    }
    const reset = () => root.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
    reset();
    root.requestAnimationFrame?.(reset);
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
    bindJourneyWorkspace(pkg);
    revealInAppBanner();
    resetPreviewScrollPosition();
    window.addEventListener('beforeprint', () => ensurePrintHost(pkg));
    window.addEventListener('afterprint', () => {
      const host = document.getElementById('tripPrintHost');
      if (host) host.innerHTML = '';
    });
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
    setJourneyFocusCardVisible,
    isJourneyMapBackgroundTarget,
    exportOverviewPng,
    exportPdf
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
