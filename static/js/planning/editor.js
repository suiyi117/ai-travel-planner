(function (root) {
  function renderWishlist(nodes, escapeHtml) {
    if (!nodes.length) return '<div class="editor-empty">想去清单为空</div>';
    return nodes.map((node) => `
      <article class="wishlist-item" data-node-id="${escapeHtml(node.id)}">
        <div class="wishlist-item-info">
          <strong>${escapeHtml(node.name)}</strong>
          <small>${node.location.status === "resolved" ? escapeHtml(node.city || "已定位") : "待定位"}</small>
        </div>
        <span class="constraint-badge">${node.constraints.required ? "必去" : "可选"}</span>
        <div class="wishlist-item-actions">
          <button class="btn btn-icon" type="button" data-action="schedule" data-node-id="${escapeHtml(node.id)}" aria-label="安排 ${escapeHtml(node.name)}" title="安排到日程">+</button>
          <button class="btn btn-icon" type="button" data-action="edit-node" data-node-id="${escapeHtml(node.id)}" aria-label="编辑 ${escapeHtml(node.name)}" title="编辑">✎</button>
          <button class="btn btn-icon" type="button" data-action="remove-node" data-node-id="${escapeHtml(node.id)}" aria-label="删除 ${escapeHtml(node.name)}" title="删除">✕</button>
        </div>
      </article>`).join("");
  }

  function renderDayNodes(nodes, escapeHtml) {
    if (!nodes.length) return '<div class="editor-empty">当天暂无安排，从想去清单中添加景点</div>';
    return nodes.map((node, index) => {
      const isSystemNode = node.source === "system";
      const isLocked = node.constraints.fixed_order || node.constraints.fixed_time;
      const draggable = !isSystemNode && !isLocked ? "true" : "false";
      const timeDisplay = node.schedule.time_window || "时间待安排";
      const constraintBadges = [];
      if (node.constraints.required) constraintBadges.push("必去");
      if (node.constraints.fixed_day) constraintBadges.push("固定日期");
      if (node.constraints.fixed_time) constraintBadges.push("固定时段");
      if (node.constraints.fixed_order) constraintBadges.push("固定顺序");
      const lockHint = isLocked ? "已锁定，不可拖拽" : (isSystemNode ? "系统节点不可拖拽" : "拖拽调整顺序");
      return `
      <article class="draft-node ${draggable === "false" ? "is-locked" : ""}" draggable="${draggable}" data-node-id="${escapeHtml(node.id)}" data-index="${index}" aria-grabbed="false" title="${lockHint}">
        <button class="drag-handle" type="button" tabindex="-1" aria-hidden="true" ${draggable === "false" ? "disabled" : ""}>⠿</button>
        <div class="draft-node-info">
          <strong>${escapeHtml(node.name)}</strong>
          <small>${escapeHtml(timeDisplay)}${draggable === "false" ? " · " + lockHint : " · 可拖拽"}</small>
          ${constraintBadges.length ? `<span class="node-constraint-badges">${constraintBadges.map((b) => `<span class="badge badge-constraint">${b}</span>`).join("")}</span>` : ""}
        </div>
        <div class="draft-node-actions">
          <button class="btn btn-icon" type="button" data-action="constraints" data-node-id="${escapeHtml(node.id)}" aria-label="设置 ${escapeHtml(node.name)} 的约束" title="约束设置">⚙</button>
          <button class="btn btn-icon" type="button" data-action="edit-node" data-node-id="${escapeHtml(node.id)}" aria-label="编辑 ${escapeHtml(node.name)}" title="编辑">✎</button>
          <button class="btn btn-icon" type="button" data-action="remove-node" data-node-id="${escapeHtml(node.id)}" aria-label="从日程移除 ${escapeHtml(node.name)}" title="从日程移除">✕</button>
        </div>
        <div class="node-move-menu">
          <button type="button" data-action="move-up" data-index="${index}" ${isLocked ? "disabled" : ""}>上移</button>
          <button type="button" data-action="move-down" data-index="${index}" ${isLocked ? "disabled" : ""}>下移</button>
          <button type="button" data-action="move-day" data-node-id="${escapeHtml(node.id)}" ${node.constraints.fixed_day || node.constraints.fixed_order ? "disabled" : ""}>移到其他日期</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderCityStops(cities, escapeHtml) {
    if (!cities.length) return "";
    const transportLabels = {
      auto: "智能推荐",
      train: "高铁优先",
      plane: "飞机优先",
      driving: "自驾优先"
    };
    return cities.map((city, index) => {
      const days = Math.max(0, Number(city.days) || 0);
      const isTransitOnly = days === 0 || city.plan_stay === false;
      const routeLabel = isTransitOnly
        ? "仅过境"
        : index === 0
          ? "出发地"
          : (transportLabels[city.transport] || transportLabels.auto);
      return `
      <article class="city-order-item" draggable="true" data-city-id="${escapeHtml(city.id)}" data-index="${index}" aria-grabbed="false" title="拖拽调整城市顺序">
        <span class="city-order-handle" aria-hidden="true">⠿</span>
        <div class="city-order-info">
          <strong>${escapeHtml(city.name)}</strong>
          <span>${days}天 · ${escapeHtml(routeLabel)}</span>
        </div>
        <div class="city-order-actions">
          <button class="btn btn-icon" type="button" data-action="city-up" data-index="${index}" ${index === 0 ? "disabled" : ""} aria-label="${escapeHtml(city.name)} 上移">↑</button>
          <button class="btn btn-icon" type="button" data-action="city-down" data-index="${index}" ${index === cities.length - 1 ? "disabled" : ""} aria-label="${escapeHtml(city.name)} 下移">↓</button>
        </div>
      </article>`;
    }).join("");
  }

  function normalizePlaceSearchResults(pois, fallbackCity) {
    const results = [];
    const seen = new Set();
    const clean = (value, maxLength = 300) => {
      const source = Array.isArray(value) ? value.filter(Boolean).join("、") : value;
      if (source === null || source === undefined) return "";
      return String(source).trim().slice(0, maxLength);
    };

    for (const raw of Array.isArray(pois) ? pois : []) {
      if (!raw || typeof raw !== "object") continue;
      const name = clean(raw.name, 200);
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      if (
        !name
        || !Number.isFinite(lat)
        || !Number.isFinite(lng)
        || lat < -90
        || lat > 90
        || lng < -180
        || lng > 180
        || lat === 0
        || lng === 0
      ) {
        continue;
      }

      const place = {
        provider_id: clean(raw.provider_id || raw.id, 200),
        name,
        city: clean(raw.city || raw.cityname || fallbackCity, 100),
        district: clean(raw.district || raw.adname, 100),
        address: clean(raw.address, 300),
        rating: clean(raw.rating, 30),
        tel: clean(raw.tel, 100),
        opentime: clean(raw.opentime, 200),
        lat,
        lng
      };
      const key = place.provider_id || [
        place.name,
        place.address,
        place.lat.toFixed(6),
        place.lng.toFixed(6)
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(place);
      if (results.length >= 8) break;
    }
    return results;
  }

  function renderPlaceSearchResults(places, escapeHtml) {
    if (!Array.isArray(places) || !places.length) return "";
    return places.map((place, index) => {
      const meta = [place.city, place.district, place.address]
        .filter((value, position, values) => value && values.indexOf(value) === position)
        .join(" · ") || "已匹配地图坐标";
      const rating = place.rating
        ? '<span class="place-search-rating">评分 ' + escapeHtml(place.rating) + '</span>'
        : "";
      return [
        '<button class="place-search-result" type="button" data-place-result-index="' + index + '" aria-label="选择地图地点：' + escapeHtml(place.name) + '">',
        '<span class="place-search-result-main">',
        '<span class="place-search-result-title"><strong>' + escapeHtml(place.name) + '</strong>' + rating + '</span>',
        '<small>' + escapeHtml(meta) + '</small>',
        '</span>',
        '<span class="place-search-result-source">高德地图</span>',
        '</button>'
      ].join("");
    }).join("");
  }

  function renderConstraintPanel(node, escapeHtml) {
    const constraints = node.constraints || {};
    const schedule = node.schedule || {};
    return `
      <div class="constraint-panel" data-node-id="${escapeHtml(node.id)}">
        <h4>约束设置 · ${escapeHtml(node.name)}</h4>
        <label class="constraint-toggle">
          <input type="checkbox" data-constraint="required" ${constraints.required ? "checked" : ""}>
          <span>必去</span>
          <small>优化时不可移除此景点</small>
        </label>
        <label class="constraint-toggle">
          <input type="checkbox" data-constraint="fixed_day" ${constraints.fixed_day ? "checked" : ""}>
          <span>固定日期</span>
          <small>优化时不可移动到此日期之外</small>
        </label>
        <label class="constraint-toggle">
          <input type="checkbox" data-constraint="fixed_time" ${constraints.fixed_time ? "checked" : ""}>
          <span>固定时段</span>
          <small>必须在指定时间窗口内</small>
        </label>
        <label class="constraint-toggle">
          <input type="checkbox" data-constraint="fixed_order" ${constraints.fixed_order ? "checked" : ""}>
          <span>固定顺序</span>
          <small>优化时不可改变此景点相对顺序</small>
        </label>
        ${constraints.fixed_time ? `
          <div class="constraint-time-input">
            <label>
              时间窗口
              <input type="text" name="time_window" value="${escapeHtml(schedule.time_window || "")}" placeholder="例如：09:00-11:00">
            </label>
          </div>` : ""}
        <div class="constraint-actions">
          <button class="btn" type="button" data-action="save-constraints" data-node-id="${escapeHtml(node.id)}">保存约束</button>
          <button class="btn btn-ghost" type="button" data-action="cancel-constraints">取消</button>
        </div>
      </div>`;
  }

  root.AeroTravelEditor = Object.freeze({
    renderWishlist,
    renderDayNodes,
    renderCityStops,
    normalizePlaceSearchResults,
    renderPlaceSearchResults,
    renderConstraintPanel
  });
})(typeof window !== "undefined" ? window : globalThis);
