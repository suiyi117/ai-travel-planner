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
      return `
      <article class="draft-node" draggable="${draggable}" data-node-id="${escapeHtml(node.id)}" data-index="${index}">
        <button class="drag-handle" type="button" aria-label="移动 ${escapeHtml(node.name)}" ${draggable === "false" ? "disabled" : ""}>⠿</button>
        <div class="draft-node-info">
          <strong>${escapeHtml(node.name)}</strong>
          <small>${escapeHtml(timeDisplay)}</small>
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
    return cities.map((city, index) => `
      <article class="city-order-item" data-city-id="${escapeHtml(city.id)}">
        <strong>${escapeHtml(city.name)}</strong>
        <span>${city.days}天 · ${city.transport}</span>
        <div class="city-order-actions">
          <button class="btn btn-icon" type="button" data-action="city-up" data-index="${index}" ${index === 0 ? "disabled" : ""} aria-label="${escapeHtml(city.name)} 上移">↑</button>
          <button class="btn btn-icon" type="button" data-action="city-down" data-index="${index}" ${index === cities.length - 1 ? "disabled" : ""} aria-label="${escapeHtml(city.name)} 下移">↓</button>
        </div>
      </article>`).join("");
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
    renderConstraintPanel
  });
})(typeof window !== "undefined" ? window : globalThis);
