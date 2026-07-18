const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/js/planning/candidate.js');

const Candidate = window.AeroTravelCandidate;
const escapeHtml = value => String(value ?? '');

test('candidate diff labels day number and one-based stop position separately', () => {
  const html = Candidate.renderCandidatePanel({}, [{
    type: 'move',
    node_name: '陕西历史博物馆',
    reason: '优化器调整顺序',
    from_position: { day_id: 'day-1', index: 0, route_index: null },
    to_position: { day_id: 'day-1', index: 3, route_index: null }
  }], escapeHtml);

  assert.match(html, /Day 1 第 1 站 → Day 1 第 4 站/);
  assert.doesNotMatch(html, /Day 0/);
});

test('candidate diff describes route-only position changes', () => {
  const html = Candidate.renderCandidatePanel({}, [{
    type: 'move',
    node_name: '康定',
    reason: '优化器调整顺序',
    from_position: { day_id: null, index: null, route_index: 0 },
    to_position: { day_id: null, index: null, route_index: 2 }
  }], escapeHtml);

  assert.match(html, /路线第 1 站 → 路线第 3 站/);
});
