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

  function overviewDayRows(pkg) {
    return (pkg.days || []).map(day => {
      const anchors = (day.anchors || []).slice(0, 3).map(a => escapeHtml(a.title)).join(' · ');
      return `
        <div class="trip-ov-day">
          <div class="trip-ov-day-index" style="--day-color:${escapeHtml(day.color || '#c96442')}">D${escapeHtml(day.day)}</div>
          <div class="trip-ov-day-body">
            <strong>${escapeHtml(day.city || '')}</strong>
            <p>${escapeHtml(day.summary || anchors || '安排待补充')}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function budgetBlock(pkg) {
    const rows = pkg.budget?.rows || [];
    return rows.map(row => `
      <div class="trip-budget-row">
        <span>${escapeHtml(row.label)}</span>
        <strong>${escapeHtml(row.value)}</strong>
      </div>
    `).join('');
  }

  function tipsBlock(pkg, limit) {
    const tips = (pkg.tips || []).slice(0, limit || 2);
    if (!tips.length) return '<p class="trip-muted">暂无特别提示</p>';
    return `<ul class="trip-tip-list">${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>`;
  }

  function renderOverviewDesktop(pkg) {
    const shareUrl = pkg.share_url || '';
    const qr = qrImageUrl(shareUrl);
    return `
      <section class="trip-overview trip-overview-desktop" aria-label="行程总览">
        <header class="trip-overview-head">
          <div>
            <div class="trip-brand">AeroTravel 专属行程</div>
            <h1>${escapeHtml(pkg.title)}</h1>
            <p class="trip-route-line">${escapeHtml(pkg.route || pkg.cities?.join(' → ') || '')}</p>
          </div>
          <div class="trip-overview-meta">
            <span>${escapeHtml(pkg.departure_date || '日期待定')}</span>
            <span>${escapeHtml(pkg.total_days)} 天</span>
            <span>${escapeHtml(pkg.budget_label)}</span>
            <span>更新 ${formatUpdatedAt(pkg.updated_at)}</span>
          </div>
        </header>
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
            <h2>关键数据</h2>
            ${budgetBlock(pkg)}
            <h3>重要提示</h3>
            ${tipsBlock(pkg, 2)}
            ${(pkg.days || []).some(d => d.weather) ? `<h3>天气</h3><p class="trip-muted">${(pkg.days || []).filter(d => d.weather).slice(0, 3).map(d => `D${escapeHtml(d.day)} ${escapeHtml(d.weather)}`).join(' · ')}</p>` : ''}
          </aside>
        </div>
        <footer class="trip-overview-foot">
          <p class="trip-disclaimer">${escapeHtml(pkg.disclaimer || '')}</p>
          <div class="trip-qr-block">
            ${qr ? `<img src="${escapeHtml(qr)}" alt="专属行程二维码" width="88" height="88" loading="lazy">` : ''}
            <div>
              <strong>扫码打开专属行程</strong>
              <p class="trip-muted">${escapeHtml(shareUrl || '发布后填写访问链接')}</p>
            </div>
          </div>
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
          <p class="trip-muted">${escapeHtml(pkg.departure_date || '日期待定')} · ${escapeHtml(pkg.budget_label)}</p>
        </header>
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
          ${budgetBlock(pkg)}
          ${tipsBlock(pkg, 2)}
        </div>
        <div class="trip-mobile-cta">
          <a class="trip-btn trip-btn-primary" href="#daily">查看每日详情</a>
          <button type="button" class="trip-btn" data-action="download-pdf">下载 PDF</button>
        </div>
      </section>
    `;
  }

  function renderOverviewPngSheet(pkg) {
    const shareUrl = pkg.share_url || '';
    const qr = qrImageUrl(shareUrl);
    const dayLines = (pkg.days || []).map(day => {
      const anchors = (day.anchors || []).slice(0, 2).map(a => a.title).join(' / ');
      return `<div class="png-day"><span>D${escapeHtml(day.day)}</span><strong>${escapeHtml(day.city || '')}</strong><em>${escapeHtml(day.summary || anchors || '')}</em></div>`;
    }).join('');
    const tips = (pkg.overview_notes || pkg.tips || []).slice(0, 2);
    return `
      <div class="trip-png-sheet">
        <div class="png-brand">AeroTravel</div>
        <h1>${escapeHtml(pkg.title)}</h1>
        <p class="png-route">${escapeHtml(pkg.route || '')}</p>
        <p class="png-meta">${escapeHtml(pkg.total_days)} 天 · ${escapeHtml(pkg.budget_label)} · ${escapeHtml(pkg.departure_date || '日期待定')}</p>
        <div class="png-map-frame">
          <div class="trip-map" data-trip-map="png" data-day="all"></div>
          <div class="png-map-fallback">
            ${(pkg.map_anchors || []).slice(0, 8).map((a, i) => `<span>${i + 1}. ${escapeHtml(a.title)}</span>`).join('')}
          </div>
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

    return `
      <article class="trip-item" id="item-${escapeHtml(item.id || `${index}`)}" data-item-id="${escapeHtml(item.id || '')}">
        <div class="trip-item-time">
          <strong>${escapeHtml(item.time || '—')}</strong>
          <span>${escapeHtml(typeLabel(item.type))}</span>
        </div>
        <div class="trip-item-body">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="trip-meta-line">${[item.duration, item.extra, item.rating ? `评分 ${item.rating}` : ''].filter(Boolean).map(escapeHtml).join(' · ')}</p>
          ${item.desc ? `<p>${escapeHtml(item.desc)}</p>` : ''}
          ${item.address ? `<p class="trip-meta-line">地址：${escapeHtml(item.address)}</p>` : ''}
          ${item.opentime ? `<p class="trip-meta-line">开放：${escapeHtml(item.opentime)}</p>` : ''}
          <div class="trip-item-actions">${actionHtml}</div>
        </div>
      </article>
    `;
  }

  function renderDailySections(pkg) {
    return (pkg.days || []).map(day => {
      const items = day.items || [];
      return `
        <section class="trip-day-section" id="day-${escapeHtml(day.day)}">
          <header class="trip-day-header">
            <div>
              <div class="trip-day-kicker" style="color:${escapeHtml(day.color || '#c96442')}">Day ${escapeHtml(day.day)}</div>
              <h2>${escapeHtml(day.city || '')}${day.date ? ` · ${escapeHtml(day.date)}` : ''}</h2>
              ${day.weather ? `<p class="trip-muted">${escapeHtml(day.weather)}</p>` : ''}
              ${day.route ? `<p>${escapeHtml(day.route)}</p>` : ''}
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
          <div id="daily" class="trip-daily-anchor"></div>
          ${renderDailySections(data)}
          ${renderTransport(data)}
          <section class="trip-panel">
            <h2>费用参考</h2>
            ${budgetBlock(data)}
            ${data.budget?.selected_transport_total > 0 ? `<p class="trip-muted">已选交通参考合计：约 ¥${escapeHtml(Math.round(data.budget.selected_transport_total))}</p>` : ''}
          </section>
          <section class="trip-panel">
            <h2>出行注意事项</h2>
            ${tipsBlock(data, 10)}
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
    const daysHtml = (pkg.days || []).map(day => `
      <section class="print-day">
        <h2>Day ${escapeHtml(day.day)} · ${escapeHtml(day.city || '')}${day.date ? ` · ${escapeHtml(day.date)}` : ''}</h2>
        ${day.weather ? `<p>${escapeHtml(day.weather)}</p>` : ''}
        ${day.route ? `<p>${escapeHtml(day.route)}</p>` : ''}
        <ol>
          ${(day.items || []).map(item => `
            <li>
              <strong>${escapeHtml(item.time || '')} ${escapeHtml(item.title || '')}</strong>
              <div>${escapeHtml([typeLabel(item.type), item.duration].filter(Boolean).join(' · '))}</div>
              ${item.desc ? `<div>${escapeHtml(item.desc)}</div>` : ''}
              ${item.address ? `<div>地址：${escapeHtml(item.address)}</div>` : ''}
            </li>
          `).join('')}
        </ol>
      </section>
    `).join('');

    return `
      <article class="trip-print-doc">
        ${renderOverviewDesktop(pkg)}
        ${daysHtml}
        ${renderTransport(pkg)}
        <section class="print-day">
          <h2>费用与提示</h2>
          ${budgetBlock(pkg)}
          ${tipsBlock(pkg, 10)}
          <p>${escapeHtml(pkg.disclaimer || '')}</p>
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
