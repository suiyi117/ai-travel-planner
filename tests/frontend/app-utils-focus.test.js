// tests/frontend/app-utils-focus.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/js/core/app-utils.js');

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

test('buildDoorToDoorTime applies mode-specific station and airport buffers', () => {
  assert.equal(U.buildDoorToDoorTime('09:30 - 11:15', 'train'), '08:10 - 12:15');
  assert.equal(U.buildDoorToDoorTime('09:30 - 11:15', 'plane'), '07:00 - 13:00');
  assert.equal(U.buildDoorToDoorTime('09:30 - 11:15', 'driving'), '09:15 - 11:35');
});

test('parseTimeRange understands previous-day and next-day door-to-door labels', () => {
  assert.deepEqual(U.parseTimeRange('前一日 23:40 - 01:10'), [-20, 70]);
  assert.deepEqual(U.parseTimeRange('22:30 - 次日 07:15'), [1350, 1875]);
});

test('parseTimeRange gives Chinese day periods deterministic ordering', () => {
  assert.deepEqual(U.parseTimeRange('上午'), [540, 630]);
  assert.deepEqual(U.parseTimeRange('下午抵达'), [840, 930]);
  assert.deepEqual(U.parseTimeRange('晚上'), [1140, 1230]);
});

test('sortItineraryItems keeps period labels before evening and is stable for unknown labels', () => {
  const input = [
    { id: 'hotel', time: '20:00' },
    { id: 'unknown-a', time: '待确认' },
    { id: 'transfer', time: '上午' },
    { id: 'spot', time: '09:30' },
    { id: 'unknown-b', time: '' }
  ];

  assert.deepEqual(
    U.sortItineraryItems(input).map(item => item.id),
    ['transfer', 'spot', 'hotel', 'unknown-a', 'unknown-b']
  );
  assert.deepEqual(input.map(item => item.id), ['hotel', 'unknown-a', 'transfer', 'spot', 'unknown-b']);
});

test('hasExplicitClockTime excludes broad day periods from conflict detection', () => {
  assert.equal(U.hasExplicitClockTime('上午'), false);
  assert.equal(U.hasExplicitClockTime('下午抵达'), false);
  assert.equal(U.hasExplicitClockTime('上午 09:30 出发'), true);
  assert.equal(U.hasExplicitClockTime('09:30 - 11:00'), true);
});

test('buildHotelCheckInTime follows the final scheduled activity', () => {
  assert.equal(U.buildHotelCheckInTime([
    { type: 'experience', time: '17:30 - 19:30' },
    { type: 'experience', time: '20:00 - 21:00' }
  ]), '21:30');
  assert.equal(U.buildHotelCheckInTime([
    { type: 'experience', time: '09:00 - 11:00' }
  ]), '20:00');
  assert.equal(U.buildHotelCheckInTime([
    { type: 'experience', time: '23:00 - 次日 00:15' }
  ]), '次日 00:45');
});
