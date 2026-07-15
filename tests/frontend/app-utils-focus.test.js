// tests/frontend/app-utils-focus.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/app-utils.js');

const U = window.AeroTravelUtils;

test('itemHasMapCoords rejects zero and missing coords', () => {
  assert.equal(U.itemHasMapCoords({ lat: 39.9, lng: 116.4 }), true);
  assert.equal(U.itemHasMapCoords({ location: { lat: 34.2, lng: 108.9 } }), true);
  assert.equal(U.itemHasMapCoords({ lat: 0, lng: 0 }), false);
  assert.equal(U.itemHasMapCoords({ title: '无坐标' }), false);
});

test('pickFocusItemForDay keeps preferred id when present', () => {
  const items = [
    { id: 'a', lat: 1, lng: 1 },
    { id: 'b', lat: 2, lng: 2 }
  ];
  assert.equal(U.pickFocusItemForDay(items, 'b').id, 'b');
});

test('pickFocusItemForDay falls back to first mappable then first', () => {
  const mixed = [
    { id: 'x' },
    { id: 'y', lat: 3, lng: 4 },
    { id: 'z', lat: 5, lng: 6 }
  ];
  assert.equal(U.pickFocusItemForDay(mixed, 'missing').id, 'y');
  assert.equal(U.pickFocusItemForDay([{ id: 'only' }], null).id, 'only');
  assert.equal(U.pickFocusItemForDay([], 'a'), null);
});

test('shouldUpdateMapOnItemFocus only when map is open', () => {
  assert.equal(U.shouldUpdateMapOnItemFocus(true), true);
  assert.equal(U.shouldUpdateMapOnItemFocus(false), false);
});

test('shouldOpenMapOnCardAction recognizes explicit map actions', () => {
  assert.equal(U.shouldOpenMapOnCardAction('open-map'), true);
  assert.equal(U.shouldOpenMapOnCardAction('view-location'), true);
  assert.equal(U.shouldOpenMapOnCardAction('看位置'), true);
  assert.equal(U.shouldOpenMapOnCardAction('select'), false);
  assert.equal(U.shouldOpenMapOnCardAction(''), false);
});
