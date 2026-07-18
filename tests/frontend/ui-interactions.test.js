const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/js/ui-interactions.js');

const UI = window.AeroTravelInteractions;

test('nextSegmentIndex wraps arrow navigation in both directions', () => {
  assert.equal(UI.nextSegmentIndex(0, 3, 'ArrowLeft'), 2);
  assert.equal(UI.nextSegmentIndex(2, 3, 'ArrowRight'), 0);
  assert.equal(UI.nextSegmentIndex(1, 3, 'ArrowUp'), 0);
  assert.equal(UI.nextSegmentIndex(1, 3, 'ArrowDown'), 2);
});

test('nextSegmentIndex supports Home and End and handles empty groups', () => {
  assert.equal(UI.nextSegmentIndex(2, 4, 'Home'), 0);
  assert.equal(UI.nextSegmentIndex(0, 4, 'End'), 3);
  assert.equal(UI.nextSegmentIndex(0, 0, 'ArrowRight'), -1);
});

test('nextSegmentIndex leaves the selection unchanged for unrelated keys', () => {
  assert.equal(UI.nextSegmentIndex(1, 3, 'Enter'), 1);
});
