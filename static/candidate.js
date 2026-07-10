(function (root) {
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
            if (d.from_position && d.from_position.day_id) {
              detail += ' (Day ' + d.from_position.index + ')';
            }
            if (d.to_position && d.to_position.day_id) {
              detail += ' \u2192 Day ' + d.to_position.index;
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
