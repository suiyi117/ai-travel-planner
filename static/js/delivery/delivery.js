(function initAeroTravelDelivery(root) {
  function budgetRows(budget = {}) {
    return [
      ['交通', budget.transport || '暂无估算'],
      ['住宿', budget.hotel || '暂无估算'],
      ['餐饮', budget.food || '暂无估算'],
      ['门票', budget.tickets || '暂无估算'],
      ['合计', budget.total || '暂无估算']
    ];
  }

  function transportOptionText(segment, selectedOption) {
    const option = selectedOption(segment);
    if (!option) return '暂无可用班次，需人工确认';
    const code = option.id ? `${option.id} ` : '';
    const price = option.price ? ` · ${option.price}` : '';
    const station = option.from_station || option.to_station
      ? ` · ${option.from_station || segment.from_city || ''} → ${option.to_station || segment.to_city || ''}`
      : '';
    return `${code}${option.time || '时间待定'} · ${option.duration || '时长待定'}${price}${station}`;
  }

  function formatDeliveryDate(day, options) {
    const date = options.addDays(options.departureDate, day.day - 1);
    return date ? `${date} · ` : '';
  }

  function buildDeliveryText(plan, options) {
    const lines = [];
    lines.push(plan.title || '旅行规划方案');
    if (plan.summary) lines.push(plan.summary);
    lines.push('', `【行程概览】${options.route} · ${options.totalDays}天 · ${options.budget}`, '');

    (plan.days || []).forEach(day => {
      const cast = options.weatherForDay(day);
      const weather = cast ? ` · ${cast.dayweather} ${cast.nighttemp}~${cast.daytemp}℃` : '';
      lines.push(`【Day ${day.day}｜${formatDeliveryDate(day, options)}${day.city}${weather}】`);
      if (day.route) lines.push(day.route);
      (day.items || []).forEach(item => {
        const display = item.type === 'transport'
          ? options.transportDisplay(item)
          : { time: item.time, extra: '' };
        const meta = [display.time, options.normalizeType(item.type), item.duration].filter(Boolean).join(' · ');
        lines.push(`- ${meta}｜${item.title}`);
        if (item.desc) lines.push(`  ${item.desc}`);
        if (item.address) lines.push(`  地址：${item.address}`);
      });
      lines.push('');
    });

    const guide = plan.transport_guide || [];
    if (guide.length) {
      lines.push('【城际交通】');
      guide.forEach(segment => {
        lines.push(`- ${segment.segment}｜${segment.source_label || '需确认'}`);
        lines.push(`  ${transportOptionText(segment, options.selectedOption)}`);
        if (segment.advice) lines.push(`  建议：${segment.advice}`);
      });
      lines.push('');
    }

    lines.push('【费用估算】');
    budgetRows(plan.budget).forEach(([label, value]) => lines.push(`- ${label}：${value}`));
    if (options.selectedTransportTotal > 0) {
      lines.push(`- 已选交通参考合计：约 ¥${Math.round(options.selectedTransportTotal)}`);
    }
    lines.push('', '【出行贴士】');
    (plan.tips || []).slice(0, 8).forEach(tip => lines.push(`- ${tip}`));
    lines.push('', '【温馨说明】');
    lines.push('- 景点地址、评分、开放时间等信息来自高德 POI 或本地参考数据。');
    lines.push('- 火车班次优先参考 12306；航班如无实时接口则显示典型参考数据。');
    lines.push('- 本方案为参考旅行规划，不含机票、酒店、门票代订；开放时间、票价、班次以官方实时信息为准。');
    return lines.join('\n');
  }

  function deliveryItemHtml(item, options) {
    const display = item.type === 'transport'
      ? options.transportDisplay(item)
      : { time: item.time, extra: '' };
    const escapeHtml = options.escapeHtml;
    const desc = item.desc ? `<p>${escapeHtml(item.desc)}</p>` : '';
    const address = item.address ? `<p class="delivery-meta">地址：${escapeHtml(item.address)}</p>` : '';
    return `
      <div class="delivery-item">
        <div class="delivery-time">${escapeHtml(display.time)}</div>
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <div class="delivery-meta">${escapeHtml(options.normalizeType(item.type))} · ${escapeHtml(item.duration)}</div>
          ${desc}
          ${address}
        </div>
      </div>
    `;
  }

  function buildDeliverySheetHtml(plan, options) {
    const escapeHtml = options.escapeHtml;
    const daysHtml = (plan.days || []).map(day => {
      const cast = options.weatherForDay(day);
      const weather = cast
        ? `${escapeHtml(cast.dayweather)} ${escapeHtml(cast.nighttemp)}~${escapeHtml(cast.daytemp)}℃`
        : '';
      return `
        <section class="delivery-section">
          <div class="delivery-day-head">
            <span>Day ${escapeHtml(day.day)}</span>
            <strong>${escapeHtml(day.city)}</strong>
            ${weather ? `<em>${weather}</em>` : ''}
          </div>
          ${day.route ? `<p class="delivery-route">${escapeHtml(day.route)}</p>` : ''}
          ${(day.items || []).map(item => deliveryItemHtml(item, options)).join('')}
        </section>
      `;
    }).join('');

    const transportHtml = (plan.transport_guide || []).map(segment => `
      <div class="delivery-mini-row">
        <strong>${escapeHtml(segment.segment)}</strong>
        <span>${escapeHtml(segment.source_label || '需确认')}</span>
        <p>${escapeHtml(transportOptionText(segment, options.selectedOption))}</p>
      </div>
    `).join('');

    return `
      <div class="delivery-sheet">
        <header class="delivery-cover">
          <div class="delivery-brand">AeroTravel</div>
          <h2>${escapeHtml(plan.title || '旅行规划方案')}</h2>
          <p>${escapeHtml(plan.summary || '')}</p>
          <div class="delivery-tags">
            <span>${escapeHtml(options.route)}</span>
            <span>${options.totalDays} 天</span>
            <span>${escapeHtml(options.budget)}</span>
          </div>
        </header>
        ${daysHtml}
        ${transportHtml ? `<section class="delivery-section"><h3>城际交通</h3>${transportHtml}</section>` : ''}
        <section class="delivery-section">
          <h3>费用估算</h3>
          ${budgetRows(plan.budget).map(([label, value]) => `
            <div class="delivery-budget"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
          `).join('')}
        </section>
        <section class="delivery-section">
          <h3>出行贴士</h3>
          <ul>${(plan.tips || []).slice(0, 8).map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
        </section>
        <footer class="delivery-disclaimer">
          本方案为参考旅行规划，不含机票、酒店、门票代订；开放时间、票价、班次以官方实时信息为准。
        </footer>
      </div>
    `;
  }

  function buildDeliveryDaySheetHtml(plan, day, options) {
    const escapeHtml = options.escapeHtml;
    const cast = options.weatherForDay(day);
    const weather = cast
      ? `${escapeHtml(cast.dayweather)} ${escapeHtml(cast.nighttemp)}~${escapeHtml(cast.daytemp)}℃`
      : '';
    const dateLabel = formatDeliveryDate(day, options).replace(/ · $/, '');
    return `
      <div class="delivery-sheet delivery-sheet-day">
        <header class="delivery-cover delivery-cover-day">
          <div class="delivery-brand">AeroTravel</div>
          <h2>${escapeHtml(plan.title || '旅行规划方案')}</h2>
          <div class="delivery-tags">
            <span>Day ${escapeHtml(day.day)}</span>
            <span>${escapeHtml(day.city || '')}</span>
            ${dateLabel ? `<span>${escapeHtml(dateLabel)}</span>` : ''}
            ${weather ? `<span>${weather}</span>` : ''}
          </div>
          ${day.route ? `<p>${escapeHtml(day.route)}</p>` : ''}
        </header>
        <section class="delivery-section">
          <div class="delivery-day-head">
            <span>Day ${escapeHtml(day.day)}</span>
            <strong>${escapeHtml(day.city || '')}</strong>
            ${weather ? `<em>${weather}</em>` : ''}
          </div>
          ${(day.items || []).map(item => deliveryItemHtml(item, options)).join('') || '<p class="delivery-meta">当日暂无安排</p>'}
        </section>
        <footer class="delivery-disclaimer">
          本方案为参考旅行规划，不含机票、酒店、门票代订；开放时间、票价、班次以官方实时信息为准。
        </footer>
      </div>
    `;
  }

  root.AeroTravelDelivery = Object.freeze({
    buildDeliveryText,
    buildDeliverySheetHtml,
    buildDeliveryDaySheetHtml,
    transportOptionText
  });
})(typeof window !== 'undefined' ? window : globalThis);
