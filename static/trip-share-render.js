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

  function dayOverviewLine(day) {
    const titles = (day.anchors || [])
      .filter(a => a && a.title && a.type !== 'food' && !String(a.title).startsWith('风味美食：'))
      .slice(0, 3)
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
    const dayLines = (pkg.days || []).map(day => {
      const line = dayOverviewLine(day);
      return `<div class="png-day"><span>D${escapeHtml(day.day)}</span><strong>${escapeHtml(day.city || '')}</strong><em>${escapeHtml(line || '')}</em></div>`;
    }).join('');
    const tips = (pkg.overview_notes || pkg.tips || []).slice(0, 2);
    return `
      <div class="trip-png-sheet">
        <div class="png-brand">AeroTravel</div>
        <h1>${escapeHtml(pkg.title)}</h1>
        <p class="png-route">${escapeHtml(pkg.route || '')}</p>
        <p class="png-meta">${escapeHtml(pkg.total_days)} 天 · ${escapeHtml(pkg.budget_label)} · ${escapeHtml(pkg.departure_date || '日期待定')}</p>
        <div class="png-map-frame">
          ${staticMapBlock(pkg, 'png-static-map')}
        </div>
        <div class="png-days">${dayLines}</div>
        <div class="png-bottom">
          <div>
            <div class="png-budget">${escapeHtml((pkg.budget?.rows || []).find(r => r.label === '合计')?.value || '')}</div>
            <ul>${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
          </div>
          <div class="png-qr">
            ${qr ? `<img src="${escapeHtml(qr)}" alt="QR" width="96" height="96">` : '<div class="png-qr-placeholder">QR</div>'}
            <small>扫码打开行程</small>
          </div>
        </div>
        <footer>更新 ${formatUpdatedAt(pkg.updated_at)} · 参考规划，以官方实时信息为准</footer>
      </div>
    `;
  }

  function renderItemCard(item, dayItems, index, pkg) {
    const Nav = root.AeroTravelTripNav;
    const next = Nav ? Nav.nextStop(dayItems, index) : null;
    const actions = Nav ? Nav.buildItemActions(item, next?.item) : [];
    const actionHtml = actions.map(action => {
      if (action.href) {
        return `<a class="trip-chip" href="${escapeHtml(action.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`;
      }
      return `<button type="button" class="trip-chip" data-copy="${escapeHtml(action.copyText || '')}">${escapeHtml(action.label)}</button>`;
    }).join('');
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
        <a class="trip-skip" href="#daily">跳到每日详情</a>
        <header class="trip-topbar">
          <div>
            <div class="trip-brand">AeroTravel</div>
            <strong>${escapeHtml(data.title || '专属行程')}</strong>
          </div>
          <div class="trip-topbar-actions">
            <button type="button" class="trip-btn" data-action="download-png">总览图</button>
            <button type="button" class="trip-btn" data-action="download-pdf">PDF 备份</button>
            <button type="button" class="trip-btn" data-action="copy-all">复制全文</button>
          </div>
        </header>
        <main class="trip-main">
          ${renderOverviewMobile(data)}
          <div class="trip-desktop-only">
            ${renderOverviewDesktop(data)}
          </div>
          <div class="trip-section-break" id="daily">
            <h2>每日行程</h2>
            <p class="trip-muted">按天查看时间线、地图与导航</p>
          </div>
          ${renderDailySections(data)}
          ${renderTransport(data)}
          <section class="trip-panel">
            <h2>费用参考</h2>
            <div class="trip-side-card">
              ${budgetBlock(data)}
              ${data.budget?.selected_transport_total > 0 ? `<p class="trip-muted">已选交通参考合计：约 ¥${escapeHtml(Math.round(data.budget.selected_transport_total))}</p>` : ''}
            </div>
          </section>
          <section class="trip-panel">
            <h2>出行注意事项</h2>
            <div class="trip-side-card">
              ${tipsBlock(data, 10)}
            </div>
          </section>
          <footer class="trip-footer">
            <p>${escapeHtml(data.disclaimer || '')}</p>
            <p class="trip-muted">行程 ID：${escapeHtml(data.id || '')} · 更新 ${formatUpdatedAt(data.updated_at)}${data.valid_until ? ` · 建议保留至 ${escapeHtml(data.valid_until)}` : ''}</p>
          </footer>
        </main>
        <div class="trip-export-host" id="tripExportHost" hidden></div>
        <div class="trip-toast" id="tripToast" hidden></div>
      </div>
    `;
  }

  function renderPrintableDocument(pkg) {
    const daysHtml = (pkg.days || []).map(day => {
      const summary = dayOverviewLine(day);
      return `
        <section class="print-day">
          <header class="print-day-header">
            <span class="trip-day-badge" style="--day-color:${escapeHtml(day.color || '#c96442')}">D${escapeHtml(day.day)}</span>
            <div>
              <h2>${escapeHtml(day.city || '')}${day.date ? ` · ${escapeHtml(day.date)}` : ''}</h2>
              <div class="print-day-meta">
                ${day.weather ? `<span class="trip-weather-chip">${escapeHtml(day.weather)}</span>` : ''}
                ${summary ? `<span class="trip-day-summary">${escapeHtml(summary)}</span>` : ''}
              </div>
            </div>
          </header>
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
        </section>
      `;
    }).join('');

    const printMap = staticMapBlock(pkg, 'print-static-map png-static-map');

    return `
      <article class="trip-print-doc">
        <div class="print-static-map-wrap">${printMap}</div>
        ${renderOverviewDesktop(pkg)}
        ${daysHtml}
        ${renderTransport(pkg)}
        <section class="print-day">
          <h2>费用与提示</h2>
          <div class="trip-side-card">${budgetBlock(pkg)}</div>
          <div class="trip-side-card" style="margin-top:10px">${tipsBlock(pkg, 10)}</div>
          <p class="trip-muted" style="margin-top:12px">${escapeHtml(pkg.disclaimer || '')}</p>
        </section>
      </article>
    `;
  }

  root.AeroTravelTripShareRender = Object.freeze({
    escapeHtml,
    renderTripPage,
    renderOverviewDesktop,
    renderOverviewMobile,
    renderOverviewPngSheet,
    renderPrintableDocument,
    qrImageUrl
  });
})(typeof window !== 'undefined' ? window : globalThis);
