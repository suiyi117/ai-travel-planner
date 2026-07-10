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

function addDay(draft, id = 'day-2') {
  draft.city_stops[0].days += 1;
  draft.days.push({
    id,
    day: draft.days.length + 1,
    date: '2026-08-02',
    primary_city_id: 'city-hz',
    node_ids: [],
    max_driving_minutes: null
  });
  return draft;
}

function scheduleNodes(draft, dayId, nodeIds) {
  return nodeIds.reduce((current, nodeId, index) => {
    const added = addNode(current, {
      name: `Place ${nodeId}`,
      city: 'Hangzhou',
      city_id: 'city-hz'
    }, () => nodeId);
    return moveNode(added, nodeId, dayId, index);
  }, draft);
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
  assert.deepEqual(validateStructure(broken).map(error => error.code), [
    'duplicate_node',
    'status_schedule_mismatch'
  ]);

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
  assert.deepEqual(removed.nodes[0].constraints, {
    required: false,
    fixed_day: false,
    fixed_time: false,
    fixed_order: false
  });
  assert.equal(removed.nodes[0].manual_rank, null);
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

test('moving another node cannot change a fixed-order anchor position', () => {
  const scheduled = scheduleNodes(emptyDraft(), 'day-1', ['a', 'b', 'c']);
  const locked = updateConstraints(scheduled, 'b', { fixed_order: true });
  const before = structuredClone(locked);

  assert.throws(
    () => moveNode(locked, 'c', 'day-1', 0),
    /fixed_order_locked/
  );
  assert.deepEqual(locked, before);
});

test('moving another node cannot cross a fixed-time anchor position', () => {
  const scheduled = scheduleNodes(emptyDraft(), 'day-1', ['a', 'b', 'c']);
  const locked = updateConstraints(
    scheduled,
    'b',
    { fixed_time: true },
    '10:00-11:00'
  );
  const before = structuredClone(locked);

  assert.throws(
    () => moveNode(locked, 'c', 'day-1', 0),
    /fixed_time_order_locked/
  );
  assert.deepEqual(locked, before);
});

test('cross-day moves preserve anchors in both source and target days', () => {
  let sourceLocked = scheduleNodes(addDay(emptyDraft()), 'day-1', ['moving', 'source-anchor']);
  sourceLocked = updateConstraints(sourceLocked, 'source-anchor', { fixed_order: true });

  assert.throws(
    () => moveNode(sourceLocked, 'moving', 'day-2', 0),
    /fixed_order_locked/
  );

  let targetLocked = scheduleNodes(addDay(emptyDraft()), 'day-1', ['moving']);
  targetLocked = scheduleNodes(targetLocked, 'day-2', ['target-anchor']);
  targetLocked = updateConstraints(targetLocked, 'target-anchor', { fixed_time: true }, '09:00');

  assert.throws(
    () => moveNode(targetLocked, 'moving', 'day-2', 0),
    /fixed_time_order_locked/
  );
});

test('fixed-order anchor errors take priority over fixed-time anchor errors', () => {
  let draft = scheduleNodes(emptyDraft(), 'day-1', ['moving', 'time-anchor', 'order-anchor']);
  draft = updateConstraints(draft, 'time-anchor', { fixed_time: true }, '09:00');
  draft = updateConstraints(draft, 'order-anchor', { fixed_order: true });

  assert.throws(
    () => moveNode(draft, 'moving', null),
    /fixed_order_locked/
  );
});

test('self-drive moves preserve locked anchor indexes in the route order', () => {
  let draft = addDay(emptyDraft());
  draft.mode = 'self_drive';
  draft = scheduleNodes(draft, 'day-1', ['moving']);
  draft = scheduleNodes(draft, 'day-2', ['route-anchor']);
  draft.route = { ordered_node_ids: ['moving', 'route-anchor'] };
  const locked = updateConstraints(draft, 'route-anchor', { fixed_order: true });
  const before = structuredClone(locked);

  assert.throws(
    () => moveNode(locked, 'moving', null),
    /fixed_order_locked/
  );
  assert.deepEqual(locked, before);
});

test('removing a locked target is rejected without changing the input', () => {
  const cases = [
    ['fixed_day', 'fixed_day_locked'],
    ['fixed_order', 'fixed_order_locked'],
    ['fixed_time', 'fixed_time_locked']
  ];

  for (const [constraint, errorCode] of cases) {
    const scheduled = scheduleNodes(emptyDraft(), 'day-1', [`target-${constraint}`]);
    const locked = updateConstraints(scheduled, `target-${constraint}`, { [constraint]: true });
    const before = structuredClone(locked);

    assert.throws(
      () => removeNode(locked, `target-${constraint}`),
      new RegExp(errorCode)
    );
    assert.deepEqual(locked, before);
  }
});

test('removing another node cannot shift fixed-order or fixed-time anchors', () => {
  let orderLocked = scheduleNodes(emptyDraft(), 'day-1', ['a', 'b', 'c']);
  orderLocked = updateConstraints(orderLocked, 'b', { fixed_order: true });
  const orderBefore = structuredClone(orderLocked);

  assert.throws(() => removeNode(orderLocked, 'a'), /fixed_order_locked/);
  assert.deepEqual(orderLocked, orderBefore);

  let timeLocked = scheduleNodes(emptyDraft(), 'day-1', ['a', 'b', 'c']);
  timeLocked = updateConstraints(timeLocked, 'b', { fixed_time: true }, '10:00');
  const timeBefore = structuredClone(timeLocked);

  assert.throws(() => removeNode(timeLocked, 'a'), /fixed_time_order_locked/);
  assert.deepEqual(timeLocked, timeBefore);
});

test('removing a trailing node preserves anchors and fully clears the removed node', () => {
  let draft = scheduleNodes(emptyDraft(), 'day-1', ['a', 'b', 'c']);
  draft = updateConstraints(draft, 'b', { fixed_order: true });

  const removed = removeNode(draft, 'c');
  const removedNode = removed.nodes.find(node => node.id === 'c');

  assert.deepEqual(removed.days[0].node_ids, ['a', 'b']);
  assert.equal(removed.nodes.find(node => node.id === 'b').manual_rank, 1);
  assert.deepEqual(removedNode, {
    ...draft.nodes.find(node => node.id === 'c'),
    status: 'removed',
    schedule: { day_id: null, time_window: null },
    constraints: {
      required: false,
      fixed_day: false,
      fixed_time: false,
      fixed_order: false
    },
    manual_rank: null
  });
});

test('self-drive removal cannot shift a route-only locked city stop', () => {
  let draft = addNode(emptyDraft(), {
    name: 'Route start', city: 'Hangzhou', city_id: 'city-hz', source: 'city_stop'
  }, () => 'route-start');
  draft = addNode(draft, {
    name: 'Route anchor', city: 'Hangzhou', city_id: 'city-hz', source: 'city_stop'
  }, () => 'route-anchor');
  draft.mode = 'self_drive';
  draft.nodes.forEach(node => {
    node.status = 'scheduled';
  });
  draft.route = { ordered_node_ids: ['route-start', 'route-anchor'] };
  draft = updateConstraints(draft, 'route-anchor', { fixed_order: true });
  const before = structuredClone(draft);

  assert.throws(() => removeNode(draft, 'route-start'), /fixed_order_locked/);
  assert.deepEqual(draft, before);
});

test('structural validation reports one stable status and schedule mismatch per node', () => {
  const scheduled = scheduleNodes(addDay(emptyDraft()), 'day-1', ['scheduled-node']);

  const removedWithSchedule = structuredClone(scheduled);
  removedWithSchedule.nodes[0].status = 'removed';
  assert.deepEqual(validateStructure(removedWithSchedule).map(error => error.code), [
    'status_schedule_mismatch'
  ]);

  const scheduledWithoutDay = structuredClone(scheduled);
  scheduledWithoutDay.days[0].node_ids = [];
  scheduledWithoutDay.nodes[0].schedule.day_id = null;
  scheduledWithoutDay.nodes[0].manual_rank = null;
  assert.deepEqual(validateStructure(scheduledWithoutDay).map(error => error.code), [
    'status_schedule_mismatch'
  ]);

  const scheduledOnWrongDay = structuredClone(scheduled);
  scheduledOnWrongDay.nodes[0].schedule.day_id = 'day-2';
  assert.deepEqual(validateStructure(scheduledOnWrongDay).map(error => error.code), [
    'status_schedule_mismatch'
  ]);

  const wishlistWithDay = addNode(emptyDraft(), {
    name: 'Wishlist place', city: 'Hangzhou', city_id: 'city-hz'
  }, () => 'wishlist-node');
  wishlistWithDay.days[0].node_ids = ['wishlist-node'];
  assert.deepEqual(validateStructure(wishlistWithDay).map(error => error.code), [
    'status_schedule_mismatch'
  ]);
});

test('self-drive city stops may be scheduled only in the route', () => {
  const draft = addNode(emptyDraft(), {
    name: 'Route city', city: 'Hangzhou', city_id: 'city-hz', source: 'city_stop'
  }, () => 'route-city');
  draft.mode = 'self_drive';
  draft.nodes[0].status = 'scheduled';
  draft.route = { ordered_node_ids: ['route-city'] };

  assert.equal(
    validateStructure(draft).some(error => error.code === 'status_schedule_mismatch'),
    false
  );
});
