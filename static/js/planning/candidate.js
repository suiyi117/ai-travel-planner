(function (root) {
  function formatPosition(position) {
    if (!position || typeof position !== 'object') return '';
    if (position.day_id) {
      const match = String(position.day_id).match(/(\d+)$/);
      const dayLabel = match ? match[1] : String(position.day_id);
      const stopLabel = Number.isInteger(position.index)
        ? ` 第 ${position.index + 1} 站`
        : '';
      return `Day ${dayLabel}${stopLabel}`;
    }
    if (Number.isInteger(position.route_index)) {
      return `路线第 ${position.route_index + 1} 站`;
    }
    return '';
  }

  function renderCandidatePanel(candidate, diff, escapeHtml) {
    if (!candidate || !diff || !diff.length) {
      return '<div class="candidate-empty">暂无优化建议</div>';
    }

    const summary = diff.map(function (d) {
      switch (d.type) {
        case "add": return '新增 ' + escapeHtml(d.node_name);
        case "remove": return '移除 ' + escapeHtml(d.node_name);
        case "move": return '移动 ' + escapeHtml(d.node_name);
        case "update": return '更新 ' + escapeHtml(d.node_name);
        default: return '';
      }
    }).filter(Boolean);

    return '' +
      '<div class="candidate-panel">' +
        '<div class="candidate-summary">' +
          '<strong>优化建议</strong>' +
          '<span>' + escapeHtml(summary.join('；')) + '</span>' +
        '</div>' +
        '<div class="candidate-diff-list">' +
          diff.map(function (d) {
            var icon = '';
            if (d.type === 'add') icon = '+';
            else if (d.type === 'remove') icon = '-';
            else if (d.type === 'move') icon = '\u2192';
            else icon = '\u270e';
            var detail = d.reason || '';
            var fromLabel = formatPosition(d.from_position);
            var toLabel = formatPosition(d.to_position);
            if (fromLabel || toLabel) {
              detail += ' (' + (fromLabel || '未安排') + ' \u2192 ' + (toLabel || '未安排') + ')';
            }
            return '<article class="candidate-diff-item">' +
              '<span class="diff-icon">' + icon + '</span>' +
              '<div class="diff-info">' +
                '<strong>' + escapeHtml(d.node_name) + '</strong>' +
                '<small>' + escapeHtml(detail) + '</small>' +
              '</div>' +
            '</article>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  root.AeroTravelCandidate = Object.freeze({
    renderCandidatePanel
  });
})(typeof window !== "undefined" ? window : globalThis);
