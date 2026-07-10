(function (root) {
  function renderRouteSummary(route, mode, shape, strategy, escapeHtml) {
    if (!route || !Array.isArray(route.ordered_node_ids)) {
      return '<div class="self-drive-empty">尚未规划自驾路线</div>';
    }

    var summaryParts = [];
    if (shape === 'round_trip') summaryParts.push('环线');
    else summaryParts.push('单程');

    if (strategy === 'efficient') summaryParts.push('少开车');
    else if (strategy === 'balanced') summaryParts.push('均衡');
    else summaryParts.push('多体验');

    var totalKm = typeof route.total_km === 'number' ? route.total_km.toFixed(0) : '--';
    var totalMin = typeof route.total_driving_minutes === 'number' ? route.total_driving_minutes : -1;
    var totalHours = totalMin > 0 ? Math.floor(totalMin / 60) + 'h' + (totalMin % 60) + 'm' : '--';

    return '' +
      '<div class="route-summary">' +
        '<div class="route-metrics">' +
          '<div class="route-metric"><span class="metric-value">' + escapeHtml(summaryParts.join(' · ')) + '</span><span class="metric-label">路线类型</span></div>' +
          '<div class="route-metric"><span class="metric-value">' + escapeHtml(totalKm) + '</span><span class="metric-label">总里程(km)</span></div>' +
          '<div class="route-metric"><span class="metric-value">' + escapeHtml(totalHours) + '</span><span class="metric-label">总驾驶时间</span></div>' +
          '<div class="route-metric"><span class="metric-value">' + escapeHtml(String(route.toll_yuan != null ? '¥' + route.toll_yuan : '--')) + '</span><span class="metric-label">预估过路费</span></div>' +
        '</div>' +
      '</div>';
  }

  function renderRouteNodes(nodes, route, escapeHtml) {
    if (!nodes || !nodes.length) return '';
    var ids = Array.isArray(route && route.ordered_node_ids) ? route.ordered_node_ids : [];
    if (!ids.length) ids = nodes.map(function (n) { return n.id; });
    var nodeById = new Map(nodes.map(function (n) { return [n.id, n]; }));

    return '' +
      '<div class="route-node-list">' +
        ids.map(function (id, idx) {
          var node = nodeById.get(id);
          if (!node) return '';
          var segment = route && Array.isArray(route.segments) ? route.segments[idx] : null;
          var segmentInfo = '';
          if (segment && idx < ids.length - 1) {
            segmentInfo = '<small class="route-segment">\u2192 ' +
              (typeof segment.distance_km === 'number' ? segment.distance_km.toFixed(0) + 'km ' : '') +
              (typeof segment.duration_minutes === 'number' ? Math.round(segment.duration_minutes) + 'min' : '') +
              '</small>';
          }
          return '' +
            '<article class="route-node-item" draggable="true" data-node-id="' + escapeHtml(id) + '" data-route-index="' + idx + '">' +
              '<span class="route-index">' + (idx + 1) + '</span>' +
              '<div class="route-node-info">' +
                '<strong>' + escapeHtml(node.name) + '</strong>' +
                '<small>' + escapeHtml(node.city || '') + '</small>' +
              '</div>' +
              segmentInfo +
              '<div class="route-node-actions">' +
                '<button class="btn btn-icon" type="button" data-action="route-up" data-index="' + idx + '" ' + (idx === 0 ? 'disabled' : '') + '>\u2191</button>' +
                '<button class="btn btn-icon" type="button" data-action="route-down" data-index="' + idx + '" ' + (idx === ids.length - 1 ? 'disabled' : '') + '>\u2193</button>' +
              '</div>' +
            '</article>';
        }).join('') +
      '</div>';
  }

  root.AeroTravelSelfDrive = Object.freeze({
    renderRouteSummary,
    renderRouteNodes
  });
})(typeof window !== "undefined" ? window : globalThis);
