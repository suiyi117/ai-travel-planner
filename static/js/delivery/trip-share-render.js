(function initAeroTravelTripShareRender(root) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function typeLabel(type) {
    if (type === 'food') return '美食';
    if (type === 'hotel') return '住宿';
    if (type === 'transport') return '交通';
    if (type === 'experience') return '体验';
    return '景点';
  }

  function formatUpdatedAt(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return escapeHtml(iso);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  function qrImageUrl(url) {
    if (!url) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`;
  }

  function dayOverviewLine(day, limit) {
    const maxTitles = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 3;
    const titles = (day.anchors || [])
      .filter(a => a && a.title && a.type !== 'food' && !String(a.title).startsWith('风味美食：'))
      .slice(0, maxTitles)
      .map(a => a.title);
    if (titles.length) return titles.join(' · ');
    return day.summary || day.route || '';
  }

  function overviewDayRows(pkg) {
    return (pkg.days || []).map(day => {
      const line = dayOverviewLine(day);
      return `
        <div class="trip-ov-day">
          <div class="trip-ov-day-index" style="--day-color:${escapeHtml(day.color || '#c96442')}">D${escapeHtml(day.day)}</div>
          <div class="trip-ov-day-body">
            <strong>${escapeHtml(day.city || '')}</strong>
            <p>${escapeHtml(line || '安排待补充')}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function shortShareHost(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const path = parsed.pathname + (parsed.search || '');
      const compact = `${parsed.host}${path}`;
      return compact.length > 42 ? `${compact.slice(0, 39)}…` : compact;
    } catch (_err) {
      return String(url).length > 42 ? `${String(url).slice(0, 39)}…` : String(url);
    }
  }

  function budgetBlock(pkg) {
    const rows = pkg.budget?.rows || [];
    return `<ul class="trip-budget-list">${rows.map(row => `
      <li class="trip-budget-row${row.label === '合计' ? ' is-total' : ''}">
        <span class="trip-budget-label">${escapeHtml(row.label)}</span>
        <span class="trip-budget-value">${escapeHtml(row.value)}</span>
      </li>
    `).join('')}</ul>`;
  }

  function tipsBlock(pkg, limit) {
    const tips = (pkg.tips || []).slice(0, limit || 2);
    if (!tips.length) return '<p class="trip-muted">暂无特别提示</p>';
    return `<ul class="trip-tip-list">${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>`;
  }

  function budgetCard(pkg) {
    const rows = pkg.budget?.rows || [];
    if (!rows.length) return '';
    return `
      <section class="trip-side-card">
        <h3 class="trip-side-card-title">费用估算</h3>
        ${budgetBlock(pkg)}
      </section>
    `;
  }

  function tipsCard(pkg, limit) {
    const tips = (pkg.tips || []).slice(0, limit || 2);
    if (!tips.length) return '';
    return `
      <section class="trip-side-card">
        <h3 class="trip-side-card-title">重要提示</h3>
        ${tipsBlock(pkg, limit || 2)}
      </section>
    `;
  }

  function weatherCard(pkg) {
    const days = (pkg.days || []).filter(day => day && day.weather);
    if (!days.length) return '';
    return `
      <section class="trip-side-card">
        <h3 class="trip-side-card-title">天气</h3>
        <div class="trip-weather-chips">
          ${days.map(day => `
            <span class="trip-weather-chip">
              <em>D${escapeHtml(day.day)}</em>
              <span>${escapeHtml(day.weather)}</span>
            </span>
          `).join('')}
        </div>
      </section>
    `;
  }

  function qrCard(pkg) {
    const shareUrl = pkg.share_url || '';
    const qr = qrImageUrl(shareUrl);
    const hostLabel = shortShareHost(shareUrl);
    return `
      <section class="trip-side-card trip-side-card-qr">
        <h3 class="trip-side-card-title">扫码打开</h3>
        <div class="trip-qr-block">
          ${qr
            ? `<img src="${escapeHtml(qr)}" alt="专属行程二维码" width="88" height="88" loading="lazy">`
            : '<div class="png-qr-placeholder">QR</div>'}
          <div>
            <p class="trip-muted">${shareUrl ? '扫码查看专属行程' : '发布后生成访问链接'}</p>
            ${shareUrl
              ? `<p class="trip-share-url" title="${escapeHtml(shareUrl)}">${escapeHtml(hostLabel)}</p>`
              : '<p class="trip-share-url">链接待填写</p>'}
          </div>
        </div>
      </section>
    `;
  }

  function sideModulesHtml(pkg, options) {
    const opts = options || {};
    const includeQr = opts.includeQr !== false;
    return [
      budgetCard(pkg),
      tipsCard(pkg, opts.tipsLimit || 2),
      weatherCard(pkg),
      includeQr ? qrCard(pkg) : ''
    ].join('');
  }

  function metaSpans(pkg) {
    const spans = [
      escapeHtml(pkg.departure_date || '日期待定'),
      `${escapeHtml(pkg.total_days)} 天`,
      escapeHtml(pkg.budget_label),
      `更新 ${formatUpdatedAt(pkg.updated_at)}`
    ];
    if (pkg.valid_until) spans.push(`建议保留至 ${escapeHtml(pkg.valid_until)}`);
    return spans.map(text => `<span>${text}</span>`).join('');
  }

  function inAppBrowserBanner() {
    return `
      <div class="trip-inapp-banner" data-inapp-banner hidden role="status">
        <strong>打开提示</strong>
        <p>若在微信/QQ 内打开，地图导航可能无法调起 App。请复制地址，或点右上角「···」用系统浏览器打开本页。</p>
      </div>
    `;
  }

  function renderOverviewDesktop(pkg) {
    return `
      <section class="trip-overview trip-overview-desktop" aria-label="行程总览">
        <header class="trip-overview-head">
          <div>
            <div class="trip-brand">AeroTravel 专属行程</div>
            <h1>${escapeHtml(pkg.title)}</h1>
            <p class="trip-route-line">${escapeHtml(pkg.route || pkg.cities?.join(' → ') || '')}</p>
          </div>
          <div class="trip-overview-meta">
            ${metaSpans(pkg)}
          </div>
        </header>
        ${inAppBrowserBanner()}
        <div class='trip-print-map'>
          ${staticMapBlock(pkg, 'print-static-map png-static-map')}
        </div>
        <div class="trip-overview-grid">
          <aside class="trip-overview-days">
            <h2>每日摘要</h2>
            ${overviewDayRows(pkg)}
          </aside>
          <div class="trip-overview-map-wrap">
            <div class="trip-map" data-trip-map="overview" data-day="all" aria-label="总体路线地图"></div>
            <div class="trip-map-legend">
              <span class="legend-road">道路数据</span>
              <span class="legend-estimate">估算连线</span>
              <span class="legend-intercity">城际交通</span>
            </div>
          </div>
          <aside class="trip-overview-side">
            ${sideModulesHtml(pkg, { tipsLimit: 2, includeQr: true })}
          </aside>
        </div>
        <footer class="trip-overview-foot">
          <p class="trip-disclaimer">${escapeHtml(pkg.disclaimer || '')}</p>
        </footer>
      </section>
    `;
  }

  function renderOverviewMobile(pkg) {
    return `
      <section class="trip-overview trip-overview-mobile" aria-label="手机行程总览">
        <header class="trip-mobile-head">
          <div class="trip-brand">AeroTravel</div>
          <h1>${escapeHtml(pkg.title)}</h1>
          <p>${escapeHtml(pkg.route || '')} · ${escapeHtml(pkg.total_days)} 天</p>
          <p class="trip-muted">${escapeHtml(pkg.departure_date || '日期待定')} · ${escapeHtml(pkg.budget_label)}${pkg.valid_until ? ` · 建议保留至 ${escapeHtml(pkg.valid_until)}` : ''}</p>
        </header>
        ${inAppBrowserBanner()}
        <div class="trip-overview-map-wrap is-mobile">
          <div class="trip-map" data-trip-map="overview" data-day="all" aria-label="总体路线地图"></div>
        </div>
        <div class="trip-day-switch" role="tablist" aria-label="地图范围">
          <button type="button" class="is-active" data-map-scope="all">全程</button>
          ${(pkg.days || []).map(day => `<button type="button" data-map-scope="${escapeHtml(day.day)}">D${escapeHtml(day.day)}</button>`).join('')}
        </div>
        <div class="trip-mobile-days">
          ${overviewDayRows(pkg)}
        </div>
        <div class="trip-mobile-keyfacts">
          ${sideModulesHtml(pkg, { tipsLimit: 2, includeQr: true })}
        </div>
        <div class="trip-mobile-cta">
          <a class="trip-btn trip-btn-primary" href="#daily">查看每日详情</a>
          <button type="button" class="trip-btn" data-action="download-pdf">下载 PDF</button>
        </div>
      </section>
    `;
  }

  function staticMapBlock(pkg, className) {
    const staticMap = pkg.static_map || {};
    if (staticMap.status === 'ready' && staticMap.data_url) {
      const cls = className || 'png-static-map';
      return `<img class="${escapeHtml(cls)}" src="${escapeHtml(staticMap.data_url)}" alt="行程总览地图" width="${escapeHtml(staticMap.width || 640)}" height="${escapeHtml(staticMap.height || 640)}">`;
    }
    return `
      <div class="png-map-fallback">
        <p class="trip-muted">地图见专属链接</p>
        ${(pkg.map_anchors || []).slice(0, 8).map((a, i) => `<span>${i + 1}. ${escapeHtml(a.title)}</span>`).join('')}
      </div>
    `;
  }

  function renderOverviewPngSheet(pkg) {
    const shareUrl = pkg.share_url || '';
    const qr = qrImageUrl(shareUrl);
    const days = pkg.days || [];
    const dayLines = days.map(day => {
      const line = dayOverviewLine(day, 2);
      return `<div class="png-day"><span>D${escapeHtml(day.day)}</span><strong>${escapeHtml(day.city || '')}</strong><em>${escapeHtml(line || '')}</em></div>`;
    }).join('');
    const tips = (pkg.overview_notes || pkg.tips || []).slice(0, 2);
    const totalBudget = (pkg.budget?.rows || []).find(row => row.label === '合计')?.value || pkg.budget_label || '待估算';
    const dayRows = Math.max(1, Math.ceil(days.length / 2));
    return `
      <div class="trip-png-sheet">
        <header class="png-head">
          <div class="png-brand">AeroTravel <span>专属行程</span></div>
          <div class="png-headline-row">
            <div>
              <h1>${escapeHtml(pkg.title)}</h1>
              <p class="png-route">${escapeHtml(pkg.route || '')}</p>
            </div>
            <div class="png-budget"><span>总预算</span><strong>${escapeHtml(totalBudget)}</strong></div>
          </div>
          <p class="png-meta">${escapeHtml(pkg.departure_date || '日期待定')} · ${escapeHtml(pkg.total_days)} 天 · ${escapeHtml(pkg.budget_label)}</p>
        </header>
        <div class="png-map-frame">
          ${staticMapBlock(pkg, 'png-static-map')}
          <div class="png-map-key" aria-hidden="true"><span>铁路</span><span>当日路线</span><span>估算</span></div>
        </div>
        <div class="png-days" style="--png-day-rows:${dayRows}">${dayLines}</div>
        <div class="png-bottom">
          <div class="png-alerts">
            ${tips.length
              ? tips.map(tip => `<span>${escapeHtml(tip)}</span>`).join('')
              : '<span>出发前请复核预约与实时交通信息</span>'}
          </div>
          <div class="png-qr">
            ${qr ? `<img src="${escapeHtml(qr)}" alt="QR" width="96" height="96">` : '<div class="png-qr-placeholder">QR</div>'}
            <small>扫码打开专属行程</small>
          </div>
        </div>
        <footer>更新 ${formatUpdatedAt(pkg.updated_at)} · 参考规划，以官方实时信息为准</footer>
      </div>
    `;
  }

  function renderActionControl(action) {
    if (action.href) {
      const appAttrs = action.appHref
        ? ` data-app-href="${escapeHtml(action.appHref)}" data-fallback-href="${escapeHtml(action.fallbackHref || action.href)}" data-app-name="${escapeHtml(action.appName || '')}"`
        : '';
      return `<a class="trip-chip" data-action-id="${escapeHtml(action.id || '')}" href="${escapeHtml(action.fallbackHref || action.href)}" target="_blank" rel="noopener noreferrer"${appAttrs}>${escapeHtml(action.label)}</a>`;
    }
    return `<button type="button" class="trip-chip" data-action-id="${escapeHtml(action.id || '')}" data-copy="${escapeHtml(action.copyText || '')}">${escapeHtml(action.label)}</button>`;
  }

  function renderItemCard(item, dayItems, index, pkg) {
    const Nav = root.AeroTravelTripNav;
    const next = Nav ? Nav.nextStop(dayItems, index) : null;
    const actions = Nav ? Nav.buildItemActions(item, next?.item) : [];
    const actionHtml = actions.map(renderActionControl).join('');
    const type = item.type || 'spot';
    const metaBits = [item.duration, item.extra, item.rating ? `评分 ${item.rating}` : ''].filter(Boolean);

    return `
      <article class="trip-item" id="item-${escapeHtml(item.id || `${index}`)}" data-item-id="${escapeHtml(item.id || '')}">
        <div class="trip-item-rail" aria-hidden="true">
          <span class="trip-item-dot" data-type="${escapeHtml(type)}"></span>
        </div>
        <div class="trip-item-card">
          <div class="trip-item-card-head">
            <time>${escapeHtml(item.time || '—')}</time>
            <span class="trip-type-chip" data-type="${escapeHtml(type)}">${escapeHtml(typeLabel(type))}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          ${metaBits.length ? `<p class="trip-item-meta">${metaBits.map(escapeHtml).join(' · ')}</p>` : ''}
          ${item.desc ? `<p class="trip-item-desc">${escapeHtml(item.desc)}</p>` : ''}
          ${item.address ? `<p class="trip-item-address">地址：${escapeHtml(item.address)}</p>` : ''}
          ${item.opentime ? `<p class="trip-item-meta">开放：${escapeHtml(item.opentime)}</p>` : ''}
          <div class="trip-item-actions">${actionHtml}</div>
        </div>
      </article>
    `;
  }

  function itemHasCoords(item) {
    return Number.isFinite(Number(item?.lat))
      && Number.isFinite(Number(item?.lng))
      && !(Number(item?.lat) === 0 && Number(item?.lng) === 0);
  }

  function preferredFocusItem(day) {
    const items = Array.isArray(day?.items) ? day.items : [];
    return items.find(item => item.type !== 'transport' && itemHasCoords(item))
      || items.find(itemHasCoords)
      || items[0]
      || null;
  }

  function dayGroups(days) {
    return (Array.isArray(days) ? days : []).reduce((groups, day) => {
      const city = String(day?.city || '未命名城市');
      const previous = groups[groups.length - 1];
      if (previous && previous.city === city) previous.days.push(day);
      else groups.push({ city, days: [day] });
      return groups;
    }, []);
  }

  function renderJourneyDayNav(pkg) {
    const firstDay = pkg.days?.[0]?.day;
    return dayGroups(pkg.days).map(group => `
      <section class="trip-journey-day-group" aria-label="${escapeHtml(group.city)}行程日期">
        <strong>${escapeHtml(group.city)}</strong>
        <div>
          ${group.days.map(day => `
            <button class="trip-journey-day-tab${String(day.day) === String(firstDay) ? ' is-active' : ''}" type="button" data-journey-day="${escapeHtml(day.day)}" aria-pressed="${String(day.day) === String(firstDay) ? 'true' : 'false'}">
              <span>D${escapeHtml(day.day)} <em>${escapeHtml(day.city || group.city)}</em></span>
              ${day.weather ? `<small class="trip-journey-tab-weather">${escapeHtml(day.weather)}</small>` : ''}
            </button>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  function renderFocusItem(item, dayItems, index, activeItem) {
    const Nav = root.AeroTravelTripNav;
    const next = Nav ? Nav.nextStop(dayItems, index) : null;
    const actions = Nav ? Nav.buildItemActions(item, next?.item) : [];
    const visibleActionIds = new Set(['amap-open', 'next-route', 'copy-name', 'xhs-search', 'dianping-search']);
    const actionHtml = actions.filter(action => visibleActionIds.has(action.id)).map(renderActionControl).join('');
    const meta = [item.duration, item.travelFromPrevious, item.extra, item.rating ? `评分 ${item.rating}` : ''].filter(Boolean);
    const active = (item.id && item.id === activeItem?.id)
      || (!item.id && item.title === activeItem?.title && item.time === activeItem?.time);
    return `
      <article class="trip-focus-item${active ? ' is-active' : ''}" data-focus-item data-day="${escapeHtml(item.day || '')}" data-item-index="${index}" role="button" tabindex="0" aria-label="${escapeHtml(item.time || '')} ${escapeHtml(item.title || '')}">
        <span class="trip-focus-dot" aria-hidden="true"></span>
        <time>${escapeHtml(item.time || '—')}</time>
        <span class="trip-type-chip" data-type="${escapeHtml(item.type || 'spot')}">${escapeHtml(typeLabel(item.type))}</span>
        <div class="trip-focus-copy">
          <strong>${escapeHtml(item.title || '')}</strong>
          ${meta.length ? `<p>${meta.map(escapeHtml).join(' · ')}</p>` : ''}
          <div class="trip-focus-actions">${actionHtml}</div>
        </div>
      </article>
    `;
  }

  function renderJourneyDayPanels(pkg) {
    const firstDay = pkg.days?.[0]?.day;
    return (pkg.days || []).map(day => {
      const items = day.items || [];
      const activeItem = preferredFocusItem(day);
      return `
        <section class="trip-focus-day" data-focus-day="${escapeHtml(day.day)}"${String(day.day) === String(firstDay) ? '' : ' hidden'}>
          <header class="trip-focus-day-head">
            <h2>Day ${escapeHtml(day.day)} · ${escapeHtml(day.city || '')}</h2>
            <p>${items.length} 个点${day.route ? ` · ${escapeHtml(day.route)}` : ''}</p>
          </header>
          <div class="trip-focus-timeline">
            ${items.map((item, index) => renderFocusItem({ ...item, day: day.day }, items, index, activeItem)).join('') || '<p class="trip-muted">当日暂无安排</p>'}
          </div>
        </section>
      `;
    }).join('');
  }

  function totalBudgetValue(pkg) {
    return (pkg.budget?.rows || []).find(row => row.label === '合计')?.value || '待估算';
  }

  function journeyFactDetail(pkg) {
    const budgetRows = pkg.budget?.rows || [];
    const tips = pkg.tips || [];
    return `
      <div class="trip-fact-detail-overlay" id="tripJourneyFactDetail" data-fact-detail-panel hidden>
        <div class="trip-fact-detail-backdrop" data-fact-detail-close aria-hidden="true"></div>
        <section class="trip-fact-detail-card" role="dialog" aria-modal="true" aria-labelledby="tripJourneyFactTitle">
          <header class="trip-fact-detail-head">
            <div>
              <span data-fact-detail-kicker>行程参考</span>
              <h2 id="tripJourneyFactTitle" data-fact-detail-title>费用估算</h2>
            </div>
            <button type="button" class="trip-fact-detail-close" data-fact-detail-close aria-label="关闭详情">
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div class="trip-fact-detail-body">
            <section class="trip-fact-detail-content" data-fact-detail-content="budget">
              ${budgetRows.length ? budgetBlock(pkg) : '<p class="trip-fact-detail-empty">暂无费用估算</p>'}
            </section>
            <section class="trip-fact-detail-content" data-fact-detail-content="tips" hidden>
              ${tips.length ? tipsBlock(pkg, tips.length) : '<p class="trip-fact-detail-empty">暂无特别提示</p>'}
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function renderJourneyWorkspace(pkg) {
    const firstDay = pkg.days?.[0] || { day: 1, city: '', items: [] };
    const focusItem = preferredFocusItem(firstDay) || {};
    const focusIndex = (firstDay.items || []).indexOf(focusItem);
    const next = root.AeroTravelTripNav?.nextStop(firstDay.items || [], focusIndex);
    const navAction = root.AeroTravelTripNav
      ?.buildItemActions(focusItem, next?.item)
      .find(action => action.id === 'amap-open');
    return `
      <section class="trip-journey" aria-label="专属行程工作台">
        <header class="trip-journey-hero">
          <div class="trip-journey-hero-copy">
            <div class="trip-brand">AeroTravel 专属行程</div>
            <h1>${escapeHtml(pkg.title || '专属行程')}</h1>
            <p class="trip-route-line">${escapeHtml(pkg.route || pkg.cities?.join(' → ') || '')}</p>
            ${pkg.summary ? `<p class="trip-journey-summary">${escapeHtml(pkg.summary)}</p>` : ''}
          </div>
          <div class="trip-overview-meta">${metaSpans(pkg)}</div>
        </header>
        ${inAppBrowserBanner()}
        <nav class="trip-journey-days" aria-label="选择行程日期">
          ${renderJourneyDayNav(pkg)}
        </nav>

        <div class="trip-journey-workspace" id="daily">
          <section class="trip-focus-panel" id="tripFocusPanel" aria-label="当天行程时间线">
            ${renderJourneyDayPanels(pkg)}
          </section>
          <section class="trip-focus-map-panel" aria-label="当天路线地图">
            <div class="trip-focus-map-wrap">
              <div class="trip-map" data-trip-map="focus" data-day="${escapeHtml(firstDay.day)}" aria-label="Day ${escapeHtml(firstDay.day)} 路线地图"></div>
              <article class="trip-map-focus-card" data-focus-card>
                <span>当前地点</span>
                <h2 data-focus-title>${escapeHtml(focusItem.title || '选择时间线中的地点')}</h2>
                <p data-focus-meta>${escapeHtml([focusItem.time, typeLabel(focusItem.type), focusItem.duration].filter(Boolean).join(' · '))}</p>
                <p data-focus-desc>${escapeHtml(focusItem.desc || '点击左侧行程或地图标记查看地点详情。')}</p>
              </article>
              <div class="trip-route-quality">路线为估算，仅供参考</div>
            </div>
            <div class="trip-journey-facts">
              <button type="button" class="trip-journey-fact is-interactive" data-fact-detail-trigger="budget" aria-controls="tripJourneyFactDetail" aria-expanded="false" aria-haspopup="dialog">
                <span>费用估算 <em>查看明细</em></span>
                <strong>${escapeHtml(totalBudgetValue(pkg))}</strong>
              </button>
              <button type="button" class="trip-journey-fact is-interactive" data-fact-detail-trigger="tips" aria-controls="tripJourneyFactDetail" aria-expanded="false" aria-haspopup="dialog">
                <span>重要提示 <em>查看全部</em></span>
                <strong>${escapeHtml((pkg.tips || []).length)} 条</strong>
              </button>
              <div class="trip-journey-fact"><span>天气</span><strong data-focus-weather>${escapeHtml(firstDay.weather || `${firstDay.city || ''} · 以实时天气为准`)}</strong></div>
            </div>
          </section>
        </div>

        ${journeyFactDetail(pkg)}

        <footer class="trip-journey-actionbar">
          <div class="trip-action-day">
            <span>当前查看</span>
            <strong data-action-day>Day ${escapeHtml(firstDay.day)} · ${escapeHtml(firstDay.city || '')}</strong>
          </div>
          <div class="trip-action-place">
            <span aria-hidden="true">⌖</span>
            <strong data-action-place>${escapeHtml(focusItem.title || '选择地点')}</strong>
            <em data-action-next>${next?.item?.title ? `下一站：${escapeHtml(next.item.title)}` : '当天最后一站'}</em>
          </div>
          <div class="trip-action-buttons">
            <button type="button" class="trip-btn" data-action="copy-day" data-day="${escapeHtml(firstDay.day)}">复制当日</button>
            <a class="trip-btn trip-btn-primary" data-primary-nav href="${escapeHtml(navAction?.href || '#')}" target="_blank" rel="noopener noreferrer">高德导航</a>
          </div>
        </footer>
      </section>
    `;
  }

  function renderDailySections(pkg) {
    return (pkg.days || []).map(day => {
      const items = day.items || [];
      const summary = dayOverviewLine(day);
      const showRoute = day.route && summary && day.route !== summary && day.route !== day.summary;
      return `
        <section class="trip-day-section" id="day-${escapeHtml(day.day)}">
          <header class="trip-day-header">
            <div class="trip-day-title-row">
              <span class="trip-day-badge" style="--day-color:${escapeHtml(day.color || '#c96442')}">D${escapeHtml(day.day)}</span>
              <div>
                <h2>${escapeHtml(day.city || '')}${day.date ? ` · ${escapeHtml(day.date)}` : ''}</h2>
                <div class="trip-day-meta">
                  ${day.weather ? `<span class="trip-weather-chip">${escapeHtml(day.weather)}</span>` : ''}
                  ${summary ? `<span class="trip-day-summary">${escapeHtml(summary)}</span>` : ''}
                </div>
                ${showRoute ? `<p class="trip-day-route">${escapeHtml(day.route)}</p>` : ''}
              </div>
            </div>
            <div class="trip-day-actions">
              <button type="button" class="trip-btn" data-action="copy-day" data-day="${escapeHtml(day.day)}">复制当日文字</button>
              <a class="trip-btn" href="#map-day-${escapeHtml(day.day)}">当日地图</a>
            </div>
          </header>
          <div class="trip-day-layout">
            <div class="trip-day-timeline">
              ${items.map((item, index) => renderItemCard(item, items, index, pkg)).join('') || '<p class="trip-muted">当日暂无安排</p>'}
            </div>
            <div class="trip-day-map-col">
              <div class="trip-map" id="map-day-${escapeHtml(day.day)}" data-trip-map="day" data-day="${escapeHtml(day.day)}" aria-label="Day ${escapeHtml(day.day)} 地图"></div>
            </div>
          </div>
        </section>
      `;
    }).join('');
  }

  function renderTransport(pkg) {
    const guide = pkg.transport_guide || [];
    if (!guide.length) return '';
    return `
      <section class="trip-panel" id="transport">
        <h2>城际交通</h2>
        ${guide.map(segment => {
          const selected = segment.selected;
          const detail = selected
            ? [selected.id, selected.time, selected.duration, selected.price].filter(Boolean).join(' · ')
            : '暂无可用班次，需人工确认';
          const station = selected && (selected.from_station || selected.to_station)
            ? `${selected.from_station || ''} → ${selected.to_station || ''}`
            : '';
          return `
            <div class="trip-transport-row">
              <div>
                <strong>${escapeHtml(segment.segment)}</strong>
                <span class="trip-pill">${escapeHtml(segment.source_label || '需确认')}</span>
              </div>
              <p>${escapeHtml(detail)}</p>
              ${station ? `<p class="trip-muted">${escapeHtml(station)}</p>` : ''}
              ${segment.advice ? `<p class="trip-muted">${escapeHtml(segment.advice)}</p>` : ''}
            </div>
          `;
        }).join('')}
      </section>
    `;
  }

  function renderTripPage(pkg) {
    const data = pkg || {};
    return `
      <div class="trip-share-app" data-trip-id="${escapeHtml(data.id || '')}">
        <a class="trip-skip" href="#daily">跳到当天行程</a>
        <header class="trip-topbar">
          <div class="trip-topbar-brand">
            <span class="trip-brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>
            </span>
            <strong>AeroTravel</strong>
            <span>专属行程</span>
            <em>${escapeHtml(data.title || '专属行程')}</em>
          </div>
          <div class="trip-topbar-actions trip-topbar-actions-wide">
            <button type="button" class="trip-btn" data-action="download-png">总览图</button>
            <button type="button" class="trip-btn" data-action="download-pdf">PDF 备份</button>
            <button type="button" class="trip-btn" data-action="copy-all">复制全文</button>
          </div>
          <div class="trip-topbar-actions-compact">
            <button type="button" class="trip-btn trip-compact-overview-direct" data-action="download-png">总览图</button>
            <details class="trip-topbar-more">
              <summary class="trip-btn" aria-label="打开更多交付操作">更多</summary>
              <div class="trip-topbar-more-menu">
                <button type="button" class="trip-btn trip-compact-overview-menu" data-action="download-png">总览图</button>
                <button type="button" class="trip-btn" data-action="download-pdf">PDF 备份</button>
                <button type="button" class="trip-btn" data-action="copy-all">复制全文</button>
              </div>
            </details>
          </div>
        </header>
        <main class="trip-main">
          ${renderJourneyWorkspace(data)}
        </main>
        <div class="trip-print-host" id="tripPrintHost" aria-hidden="true"></div>
        <div class="trip-export-host" id="tripExportHost" hidden></div>
        <div class="trip-toast" id="tripToast" hidden></div>
      </div>
    `;
  }

  function printPageFooter(pageNumber) {
    return `
      <footer class="trip-print-page-footer">
        <span>AeroTravel 专属行程</span>
        <span>${String(pageNumber).padStart(2, '0')}</span>
      </footer>
    `;
  }

  function coverCities(pkg) {
    const raw = Array.isArray(pkg.cities) && pkg.cities.length
      ? pkg.cities
      : String(pkg.route || '').split(/\s*(?:→|->|—)\s*/);
    return raw
      .map(city => String(city || '').trim())
      .filter(Boolean)
      .filter((city, index, list) => list.indexOf(city) === index)
      .slice(0, 5);
  }

  function renderPrintCover(pkg) {
    const cities = coverCities(pkg);
    const routeNodes = (cities.length ? cities : ['旅程待定']).map((city, index) => `
      <li style="--cover-node-index:${index}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(city)}</strong>
      </li>
    `).join('');
    return `
      <section class="trip-print-cover" aria-label="行程封面">
        <header class="trip-print-cover-head">
          <div class="trip-print-brand-mark">A</div>
          <div><strong>AeroTravel</strong><span>专属行程</span></div>
          <small>TRAVEL BOOK · ${escapeHtml(String(pkg.updated_at || '').slice(0, 10) || '2026')}</small>
        </header>
        <div class="trip-print-cover-copy">
          <p>你的专属旅行手册</p>
          <h1>${escapeHtml(pkg.title || '专属旅行行程')}</h1>
          <div class="trip-print-cover-route">${escapeHtml(pkg.route || cities.join(' → ') || '路线待定')}</div>
          <dl>
            <div><dt>出发日期</dt><dd>${escapeHtml(pkg.departure_date || '日期待定')}</dd></div>
            <div><dt>行程天数</dt><dd>${escapeHtml(pkg.total_days || (pkg.days || []).length || '—')} 天</dd></div>
            <div><dt>预算档位</dt><dd>${escapeHtml(pkg.budget_label || '待设定')}</dd></div>
          </dl>
        </div>
        <div class="trip-print-cover-art" aria-hidden="true">
          <ol class="trip-print-cover-nodes">${routeNodes}</ol>
        </div>
        <footer class="trip-print-cover-foot">
          <strong>为每一天留出从容</strong>
          <span>路线、开放时间与票务请以出发前官方实时信息为准</span>
        </footer>
      </section>
    `;
  }

  function renderPrintOverview(pkg) {
    return `
      <section class="trip-print-overview" aria-label="PDF 行程总览">
        <header class="trip-print-overview-head">
          <div>
            <div class="trip-brand">AeroTravel 专属行程</div>
            <h1>行程总览</h1>
            <p><strong>${escapeHtml(pkg.title || '')}</strong><span>${escapeHtml(pkg.route || '')}</span></p>
          </div>
          <div class="trip-overview-meta">${metaSpans(pkg)}</div>
        </header>
        <div class="trip-print-overview-map">${staticMapBlock(pkg, 'print-static-map png-static-map')}</div>
        <div class="trip-print-overview-grid">
          <section class="trip-print-overview-days">
            <h2>每日摘要</h2>
            ${overviewDayRows(pkg)}
          </section>
          <aside class="trip-print-overview-side">
            ${sideModulesHtml(pkg, { tipsLimit: 2, includeQr: true })}
          </aside>
        </div>
        <div class="trip-print-overview-note">${escapeHtml(pkg.disclaimer || '')}</div>
        ${printPageFooter(2)}
      </section>
    `;
  }

  function renderPrintDayAside(day, pkg) {
    const items = (day.items || [])
      .filter(item => item && item.title && item.type !== 'transport')
      .slice(0, 6);
    const segment = (pkg.transport_guide || [])
      .find(entry => String(entry?.segment || '').includes(String(day.city || '')));
    const transportText = segment?.selected
      ? [segment.selected.id, segment.selected.time, segment.selected.duration, segment.selected.price].filter(Boolean).join(' · ')
      : (segment?.advice || '出发前复核实时交通与预约信息');
    return `
      <aside class="print-day-aside">
        <section>
          <h3>当日路线</h3>
          <ol class="print-day-route-list">
            ${items.map((item, index) => `
              <li><span>${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.time, item.duration].filter(Boolean).join(' · '))}</small></div></li>
            `).join('') || '<li class="trip-muted">当日路线待补充</li>'}
          </ol>
        </section>
        <section class="print-day-reminder">
          <h3>出发提醒</h3>
          ${day.weather ? `<p><strong>天气</strong>${escapeHtml(day.weather)}</p>` : ''}
          <p><strong>交通</strong>${escapeHtml(transportText)}</p>
          <p><strong>提示</strong>开放时间、预约与票务以官方实时信息为准。</p>
        </section>
      </aside>
    `;
  }

  function renderPrintableDocument(pkg) {
    const daysHtml = (pkg.days || []).map((day, dayIndex) => {
      const summary = dayOverviewLine(day);
      return `
        <section class="print-day print-day-detail">
          <header class="print-day-header">
            <span class="trip-day-badge" style="--day-color:${escapeHtml(day.color || '#c96442')}">D${escapeHtml(day.day)}</span>
            <div>
              <span class="print-day-kicker">DAY ${String(day.day).padStart(2, '0')} · ${escapeHtml(day.city || '')}</span>
              <h2>${escapeHtml(day.city || '')}${day.date ? ` · ${escapeHtml(day.date)}` : ''}</h2>
              <div class="print-day-meta">
                ${day.weather ? `<span class="trip-weather-chip">${escapeHtml(day.weather)}</span>` : ''}
                ${summary ? `<span class="trip-day-summary">${escapeHtml(summary)}</span>` : ''}
              </div>
            </div>
          </header>
          <div class="print-day-layout">
            <ol class="print-item-list">
              ${(day.items || []).map(item => `
                <li class="print-item">
                  <div class="print-item-head">
                    <span class="print-item-time">${escapeHtml(item.time || '')}</span>
                    <span class="trip-type-chip" data-type="${escapeHtml(item.type || 'spot')}">${escapeHtml(typeLabel(item.type))}</span>
                    <strong>${escapeHtml(item.title || '')}</strong>
                  </div>
                  ${[item.duration, item.extra].filter(Boolean).length
                    ? `<div class="print-item-desc">${escapeHtml([item.duration, item.extra].filter(Boolean).join(' · '))}</div>`
                    : ''}
                  ${item.desc ? `<div class="print-item-desc">${escapeHtml(item.desc)}</div>` : ''}
                  ${item.address ? `<div class="print-item-address">地址：${escapeHtml(item.address)}</div>` : ''}
                </li>
              `).join('')}
            </ol>
            ${renderPrintDayAside(day, pkg)}
          </div>
          ${printPageFooter(dayIndex + 3)}
        </section>
      `;
    }).join('');
    const summaryPageNumber = (pkg.days || []).length + 3;

    return `
      <article class="trip-print-doc">
        ${renderPrintCover(pkg)}
        ${renderPrintOverview(pkg)}
        ${daysHtml}
        <section class="print-day print-summary-page">
          <header class="print-summary-head">
            <div class="trip-brand">AeroTravel 专属行程</div>
            <h2>费用、交通与提示</h2>
          </header>
          <div class="print-summary-grid">
            <section><h3>费用估算</h3>${budgetBlock(pkg)}</section>
            <section><h3>出行提示</h3>${tipsBlock(pkg, 10)}</section>
          </div>
          ${renderTransport(pkg)}
          <p class="trip-muted print-summary-disclaimer">${escapeHtml(pkg.disclaimer || '')}</p>
          ${printPageFooter(summaryPageNumber)}
        </section>
      </article>
    `;
  }

  root.AeroTravelTripShareRender = Object.freeze({
    escapeHtml,
    renderTripPage,
    renderOverviewDesktop,
    renderOverviewMobile,
    renderJourneyWorkspace,
    renderOverviewPngSheet,
    renderPrintableDocument,
    qrImageUrl
  });
})(typeof window !== 'undefined' ? window : globalThis);
