const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/draft.js');
require('../../static/draft-ops.js');

const { isTripDraft } = window.AeroTravelDraft;
const {
  addNode,
  moveNode,
  updateNode,
  updateConstraints,
  removeNode,
  reorderCityStops,
  validateStructure
} = window.AeroTravelDraftOps;

function emptyDraft() {
  return {
    schema_version: 2,
    id: 'trip-editable',
    revision: 0,
    mode: 'itinerary',
    route_shape: 'one_way',
    strategy: 'balanced',
    start_date: '2026-08-01',
    city_stops: [{
      id: 'city-hz', name: '杭州', days: 1, transport: 'auto', fixed_order: false
    }],
    days: [{
      id: 'day-1',
      day: 1,
      date: '2026-08-01',
      primary_city_id: 'city-hz',
      node_ids: [],
      max_driving_minutes: null
    }],
    nodes: [],
    route: null
  };
}

test('user-added nodes default to required and can move into a day', () => {
  const base = emptyDraft();
  const added = addNode(base, {
    name: '西溪湿地', city: '杭州', city_id: 'city-hz', lat: 0, lng: 0
  }, () => 'node-user');

  assert.equal(added.nodes[0].constraints.required, true);
  assert.equal(added.nodes[0].status, 'wishlist');
  assert.equal(added.nodes[0].location.status, 'resolved');
  assert.equal(base.nodes.length, 0);

  const moved = moveNode(added, 'node-user', 'day-1', 0);
  assert.deepEqual(moved.days[0].node_ids, ['node-user']);
  assert.deepEqual(moved.nodes[0].schedule, { day_id: 'day-1', time_window: null });
  assert.equal(moved.nodes[0].status, 'scheduled');
  assert.equal(moved.revision, 2);
  assert.equal(isTripDraft(moved), true);
});

test('constraint updates are explicit and structural validation finds duplicates', () => {
  const added = addNode(emptyDraft(), {
    name: '西湖', city: '杭州', city_id: 'city-hz'
  }, () => 'node-user');
  const locked = updateConstraints(added, 'node-user', {
    fixed_day: true,
    unexpected_key: true
  });

  assert.equal(locked.nodes[0].constraints.fixed_day, true);
  assert.equal(Object.hasOwn(locked.nodes[0].constraints, 'unexpected_key'), false);
  assert.equal(isTripDraft(locked), true);

  const broken = structuredClone(locked);
  broken.days[0].node_ids = ['node-user', 'node-user'];
  assert.deepEqual(validateStructure(broken).map(error => error.code), ['duplicate_node']);

  const brokenRoute = structuredClone(added);
  brokenRoute.route = { ordered_node_ids: ['node-user', 'node-user'] };
  assert.deepEqual(validateStructure(brokenRoute).map(error => error.code), ['duplicate_route_node']);
});

test('node edits, deletion and city reordering keep canonical references consistent', () => {
  const draft = emptyDraft();
  draft.city_stops.push({
    id: 'city-sh', name: '上海', days: 1, transport: 'driving', fixed_order: false
  });
  draft.days.push({
    id: 'day-2',
    day: 2,
    date: '2026-08-02',
    primary_city_id: 'city-sh',
    node_ids: [],
    max_driving_minutes: null
  });

  const added = addNode(draft, {
    name: '外滩', city: '上海', city_id: 'city-sh'
  }, () => 'node-user');
  added.route = { ordered_node_ids: ['node-user'] };

  const renamed = updateNode(added, 'node-user', {
    name: '外滩观景步道', duration_minutes: 90, city: '不应被修改'
  });
  assert.equal(renamed.nodes[0].name, '外滩观景步道');
  assert.equal(renamed.nodes[0].duration_minutes, 90);
  assert.equal(renamed.nodes[0].city, '上海');

  const scheduled = moveNode(renamed, 'node-user', 'day-2', 0);
  const locked = updateConstraints(scheduled, 'node-user', {
    fixed_day: true, fixed_order: true
  });
  assert.throws(
    () => moveNode(locked, 'node-user', 'day-1', 0),
    /fixed_day_locked/
  );

  const reordered = reorderCityStops(renamed, 1, 0);
  assert.deepEqual(reordered.city_stops.map(city => city.id), ['city-sh', 'city-hz']);
  assert.deepEqual(reordered.days.map(day => day.primary_city_id), ['city-sh', 'city-hz']);
  assert.deepEqual(reordered.days.map(day => day.date), ['2026-08-01', '2026-08-02']);
  assert.equal(isTripDraft(reordered), true);

  const removed = removeNode(reordered, 'node-user');
  assert.deepEqual(removed.route.ordered_node_ids, []);
  assert.equal(removed.nodes[0].status, 'removed');
  assert.deepEqual(removed.nodes[0].schedule, { day_id: null, time_window: null });
  assert.equal(removed.nodes[0].constraints.required, false);
  assert.equal(isTripDraft(removed), true);
});

test('invalid city reorder is an immutable no-op and fixed days do not move', () => {
  const draft = emptyDraft();
  const invalid = reorderCityStops(draft, -1, 0);
  assert.notEqual(invalid, draft);
  assert.deepEqual(invalid, draft);
  assert.equal(invalid.revision, 0);

  const scheduled = moveNode(addNode(draft, {
    name: '灵隐寺', city: '杭州', city_id: 'city-hz'
  }, () => 'node-fixed'), 'node-fixed', 'day-1', 0);
  const fixed = updateConstraints(scheduled, 'node-fixed', { fixed_day: true });
  fixed.city_stops.push({
    id: 'city-sh', name: '上海', days: 1, transport: 'driving', fixed_order: false
  });
  fixed.days.push({
    id: 'day-2', day: 2, date: '2026-08-02', primary_city_id: 'city-sh',
    node_ids: [], max_driving_minutes: null
  });
  const blocked = reorderCityStops(fixed, 1, 0);
  assert.deepEqual(blocked, fixed);
  assert.notEqual(blocked, fixed);
});

test('operations remain compatible with the minimal task fixture', () => {
  const minimal = {
    schema_version: 2,
    revision: 0,
    city_stops: [{ id: 'city-hz', name: '杭州', days: 1 }],
    days: [{ id: 'day-1', day: 1, primary_city_id: 'city-hz', node_ids: [] }],
    nodes: []
  };
  const added = addNode(minimal, {
    name: '西溪湿地', city: '杭州', city_id: 'city-hz'
  }, () => 'node-minimal');
  const moved = moveNode(added, 'node-minimal', 'day-1', 0);

  assert.equal(moved.revision, 2);
  assert.deepEqual(moved.days[0].node_ids, ['node-minimal']);
});
