const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/storage.js');

test('storage preserves legacy entries and writes version 2 entries', () => {
  let raw = JSON.stringify([{ id: 1, plan: { days: [] } }]);
  window.localStorage = {
    getItem: () => raw,
    setItem: (_key, value) => { raw = value; }
  };

  const storage = window.AeroTravelStorage.createTripStorage('trips', 8);
  assert.equal(storage.load()[0].schema_version, undefined);

  const result = storage.save({ id: 2, schema_version: 2, appliedPlan: {}, draft: {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(JSON.parse(raw)[0].schema_version, 2);
});

test('storage reports quota failures instead of silently claiming success', () => {
  window.localStorage = {
    getItem: () => '[]',
    setItem: () => { throw new Error('quota'); }
  };

  const storage = window.AeroTravelStorage.createTripStorage('trips', 8);
  assert.deepEqual(storage.save({ id: 1 }), { ok: false, error: 'storage_unavailable' });
  assert.deepEqual(storage.remove(1), { ok: false, error: 'storage_unavailable' });
});
