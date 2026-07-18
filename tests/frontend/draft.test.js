const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/js/planning/draft.js');

const { itineraryToDraft, draftToItinerary, draftToCities, isTripDraft } = window.AeroTravelDraft;

const itinerary = {
  title: '杭州两日游',
  days: [{
    day: 1,
    city: '杭州',
    items: [
      { id: 'poi-1', type: 'experience', title: '西湖', city: '杭州', time: '09:00', lat: 30.25, lng: 120.15 },
      { id: 'hotel-1', type: 'hotel', title: '住宿区域', city: '杭州', time: '20:00', lat: 30.26, lng: 120.16 }
    ]
  }]
};

test('itineraryToDraft keeps order without inventing user locks', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 2, transport: 'auto' }], { seed: 'snapshot-1' });
  assert.equal(Object.isFrozen(window.AeroTravelDraft), true);
  assert.equal(draft.schema_version, 2);
  assert.equal(draft.revision, 0);
  assert.equal(draft.mode, 'itinerary');
  assert.equal(draft.route_shape, 'one_way');
  assert.equal(draft.strategy, 'balanced');
  assert.equal(draft.route, null);
  assert.equal(draft.city_stops[0].days, 2);
  assert.deepEqual(draft.days[0].node_ids, draft.nodes.map(node => node.id));
  assert.equal(draft.nodes.find(node => node.name === '西湖').source, 'ai');
  assert.equal(draft.nodes.find(node => node.name === '住宿区域').source, 'system');
  assert.equal(draft.nodes.find(node => node.name === '住宿区域').constraints.fixed_order, false);
  assert.equal(draft.nodes.every(node => Object.values(node.constraints).every(value => value === false)), true);
  assert.equal(isTripDraft(draft), true);

  const rereadDraft = itineraryToDraft(structuredClone(itinerary), [{ name: '杭州', days: 2 }], { seed: 'snapshot-1' });
  assert.deepEqual(rereadDraft.nodes.map(node => node.id), draft.nodes.map(node => node.id));

  const normalizedItinerary = structuredClone(itinerary);
  normalizedItinerary.days[0].items[0].title = '  西湖  ';
  normalizedItinerary.days[0].items[0].lat = '30.2500';
  normalizedItinerary.days[0].items[0].lng = '120.1500';
  const normalizedDraft = itineraryToDraft(normalizedItinerary, [{ name: '杭州', days: 2 }], { seed: 'snapshot-1' });
  assert.equal(normalizedDraft.nodes[0].id, draft.nodes[0].id);
});

test('itineraryToDraft resolves administrative suffixes and whitespace to canonical city stops', () => {
  const beijingItinerary = {
    title: '北京一日游',
    days: [{
      day: 1,
      city: ' 北 京 市 ',
      items: [{ id: 'poi-1', type: 'experience', title: '故宫', city: '北京市', lat: 39.916, lng: 116.397 }]
    }]
  };

  const draft = itineraryToDraft(beijingItinerary, [{ name: '北京', days: 1 }], { seed: 'beijing-snapshot' });

  assert.equal(draft.days[0].primary_city_id, draft.city_stops[0].id);
  assert.equal(draft.nodes[0].city_id, draft.city_stops[0].id);
  assert.equal(draft.nodes[0].city, '北京市');
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft prefers exact city names before normalized matches', () => {
  const beijingItinerary = {
    title: '北京行政区匹配',
    days: [{ day: 1, city: '北京市', items: [] }]
  };
  const draft = itineraryToDraft(
    beijingItinerary,
    [{ name: '北京', days: 1 }, { name: '北京市', days: 1 }],
    { seed: 'exact-city-snapshot' }
  );

  assert.equal(draft.days[0].primary_city_id, draft.city_stops[1].id);
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft reserves capacity used by exact city matches before unknown fallback', () => {
  const mixedItinerary = {
    title: '精确城市与未知标签',
    days: [
      { day: 1, city: '乙城', items: [] },
      { day: 2, city: '未知城市', items: [] }
    ]
  };
  const draft = itineraryToDraft(
    mixedItinerary,
    [{ name: '甲城', days: 1 }, { name: '乙城', days: 1 }],
    { seed: 'exact-then-unknown-snapshot' }
  );

  assert.deepEqual(
    draft.days.map(day => day.primary_city_id),
    [draft.city_stops[1].id, draft.city_stops[0].id]
  );
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft reserves later exact city capacity before earlier unknown fallback', () => {
  const mixedItinerary = {
    title: '未知城市在精确城市之前',
    days: [
      { day: 1, city: '未知城市', items: [] },
      { day: 2, city: '甲城', items: [] }
    ]
  };
  const draft = itineraryToDraft(
    mixedItinerary,
    [{ name: '甲城', days: 1 }, { name: '乙城', days: 1 }],
    { seed: 'unknown-before-exact-snapshot' }
  );

  assert.deepEqual(
    draft.days.map(day => day.primary_city_id),
    [draft.city_stops[1].id, draft.city_stops[0].id]
  );
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft reserves later exact match before earlier normalized-only match', () => {
  const beijingItinerary = {
    title: '规范化城市在精确城市之前',
    days: [
      { day: 1, city: '北 京', items: [] },
      { day: 2, city: '北京', items: [] }
    ]
  };
  const draft = itineraryToDraft(
    beijingItinerary,
    [{ name: '北京', days: 1 }, { name: '北京市', days: 1 }],
    { seed: 'normalized-before-exact-snapshot' }
  );

  assert.deepEqual(
    draft.days.map(day => day.primary_city_id),
    [draft.city_stops[1].id, draft.city_stops[0].id]
  );
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft remaps exact city overflow onto remaining stay capacity', () => {
  const repeatedExactItinerary = {
    title: '精确城市超出容量',
    days: [
      { day: 1, city: '乙城', items: [] },
      { day: 2, city: '乙城', items: [] }
    ]
  };

  const draft = itineraryToDraft(
    repeatedExactItinerary,
    [{ name: '甲城', days: 1 }, { name: '乙城', days: 1 }],
    { seed: 'repeated-exact-snapshot' }
  );
  // Day1 takes 乙城; day2 remaps to remaining stay city 甲城 instead of throwing.
  assert.equal(draft.days[0].primary_city_id, draft.city_stops[1].id);
  assert.equal(draft.days[1].primary_city_id, draft.city_stops[0].id);
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft assigns normalized duplicate candidates in city stop order', () => {
  const normalizedDuplicateItinerary = {
    title: '规范化城市候选',
    days: [
      { day: 1, city: '北 京', items: [] },
      { day: 2, city: '北 京 市', items: [] }
    ]
  };
  const draft = itineraryToDraft(
    normalizedDuplicateItinerary,
    [{ name: '北京', days: 1 }, { name: '北京市', days: 1 }],
    { seed: 'normalized-duplicate-snapshot' }
  );

  assert.deepEqual(
    draft.days.map(day => day.primary_city_id),
    draft.city_stops.map(stop => stop.id)
  );
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft maps unresolved day labels by ordered city day capacity', () => {
  const driftingItinerary = {
    title: '城市标签漂移',
    days: [
      { day: 10, city: '未知甲', items: [{ type: 'experience', title: '景点甲', city: '未知甲' }] },
      { day: 20, city: '未知乙', items: [{ type: 'experience', title: '景点乙', city: '未知乙' }] },
      { day: 30, city: '未知丙', items: [{ type: 'experience', title: '景点丙', city: '未知丙' }] }
    ]
  };
  const draft = itineraryToDraft(
    driftingItinerary,
    [{ name: '北京', days: 2 }, { name: '上海', days: 1 }],
    { seed: 'drifting-city-snapshot' }
  );

  assert.deepEqual(
    draft.days.map(day => day.primary_city_id),
    [draft.city_stops[0].id, draft.city_stops[0].id, draft.city_stops[1].id]
  );
  assert.deepEqual(draft.nodes.map(node => node.city_id), draft.days.map(day => day.primary_city_id));
  assert.equal(isTripDraft(draft), true);
});

test('itineraryToDraft rejects unresolved days without city capacity', () => {
  const unresolvedItinerary = {
    title: '无法解析城市',
    days: [{ day: 1, city: '未知城市', items: [] }]
  };
  assert.throws(
    () => itineraryToDraft(unresolvedItinerary, [], { seed: 'missing-city-snapshot' }),
    new Error('draft_city_unresolved')
  );

  const overCapacityItinerary = {
    title: '超出城市天数',
    days: [
      { day: 1, city: '未知城市甲', items: [] },
      { day: 2, city: '未知城市乙', items: [] }
    ]
  };
  assert.throws(
    () => itineraryToDraft(overCapacityItinerary, [{ name: '北京', days: 1 }], { seed: 'over-capacity-snapshot' }),
    new Error('draft_city_unresolved')
  );
});

test('itineraryToDraft treats days=0 without plan_stay as transit', () => {
  const plan = {
    title: 'legacy-zero-days',
    days: [{ day: 1, city: '西安', items: [{ id: 'p1', type: 'experience', title: '大雁塔', city: '西安', lat: 34.2, lng: 108.9 }] }]
  };
  const draft = itineraryToDraft(
    plan,
    [
      { name: '北京', days: 0, transport: 'auto' },
      { name: '西安', days: 1, transport: 'train' }
    ],
    { seed: 'legacy-zero' }
  );
  assert.equal(draft.city_stops[0].days, 0);
  assert.equal(draft.city_stops[0].plan_stay, false);
  assert.equal(draft.days[0].primary_city_id, draft.city_stops[1].id);
});

test('itineraryToDraft remaps AI day on transit city onto stay city capacity', () => {
  const plan = {
    title: '过境起点',
    days: [
      { day: 1, city: '淮北', items: [{ id: 'x1', type: 'experience', title: '误排', city: '淮北', lat: 33.9, lng: 116.7 }] },
      { day: 2, city: '合肥', items: [{ id: 'x2', type: 'experience', title: '包公园', city: '合肥', lat: 31.8, lng: 117.2 }] }
    ]
  };
  const draft = itineraryToDraft(
    plan,
    [
      { name: '淮北', days: 0, plan_stay: false, transport: 'auto' },
      { name: '合肥', days: 2, plan_stay: true, transport: 'train' }
    ],
    { seed: 'transit-remap' }
  );
  assert.equal(draft.city_stops[0].days, 0);
  assert.equal(draft.city_stops[0].plan_stay, false);
  assert.equal(draft.days[0].primary_city_id, draft.city_stops[1].id);
  assert.equal(isTripDraft(draft), true);
  assert.deepEqual(draftToCities(draft)[0], {
    name: '淮北', days: 0, transport: 'auto', plan_stay: false
  });
});

test('draftToItinerary keeps round_trip return transport segment', () => {
  const base = {
    title: '环线',
    days: [
      { day: 1, city: '合肥', items: [] },
      { day: 2, city: '武汉', items: [] }
    ],
    transport_guide: [
      { segment: '淮北 → 合肥', tool: 'train', options: [] },
      { segment: '合肥 → 武汉', tool: 'train', options: [] },
      { segment: '武汉 → 淮北', tool: 'train', advice: '回程', options: [{ id: 'G9' }] }
    ]
  };
  const draft = itineraryToDraft(
    base,
    [
      { name: '淮北', days: 0, plan_stay: false },
      { name: '合肥', days: 1, plan_stay: true },
      { name: '武汉', days: 1, plan_stay: true }
    ],
    { seed: 'ring-draft', routeShape: 'round_trip' }
  );
  assert.equal(draft.route_shape, 'round_trip');
  const result = draftToItinerary(draft, base);
  assert.ok(result.transport_guide.some(seg => seg.segment === '武汉 → 淮北'));
  const ret = result.transport_guide.find(seg => seg.segment === '武汉 → 淮北');
  assert.equal(ret.advice, '回程');
});

test('draftToItinerary round-trips current item order', () => {
  const baseItinerary = structuredClone(itinerary);
  baseItinerary.days[0].summary = '保留的每日摘要';
  baseItinerary.days[0].items[0].rating = '4.9';
  baseItinerary.days.push({ day: 2, city: '上海', theme: '外滩漫步', items: [] });
  baseItinerary.transport_guide = [{ segment: '杭州→上海', tool: 'train', advice: '保留原建议' }];
  const cities = [{ name: '杭州', days: 1 }, { name: '上海', days: 1, transport: 'train' }];
  const draft = itineraryToDraft(baseItinerary, cities, { seed: 'snapshot-1' });
  draft.days[0].node_ids.reverse();
  draft.route = { status: 'provider', ordered_node_ids: [...draft.days[0].node_ids] };

  const result = draftToItinerary(draft, baseItinerary);
  assert.deepEqual(result.days[0].items.map(item => item.title), ['住宿区域', '西湖']);
  assert.equal(result.days[0].summary, '保留的每日摘要');
  assert.equal(result.days[0].items[1].rating, '4.9');
  assert.equal(result.days[0].items[1].id, 'poi-1');
  assert.deepEqual(result.route, draft.route);
  assert.equal(result.transport_guide[0].segment, '杭州 → 上海');
  assert.equal(result.transport_guide[0].advice, '保留原建议');
  assert.deepEqual(draftToCities(draft), [
    { name: '杭州', days: 1, transport: 'auto', plan_stay: true },
    { name: '上海', days: 1, transport: 'train', plan_stay: true }
  ]);

  const fallback = draftToItinerary(draft, { ...baseItinerary, transport_guide: undefined });
  assert.equal(fallback.transport_guide[0].segment, '杭州 → 上海');
  assert.equal(fallback.transport_guide[0].data_source, 'unavailable');

  const duplicateSourceItinerary = {
    title: '重复来源行程',
    days: [
      {
        day: 1,
        date: '2026-08-01',
        city: '杭州',
        items: [{ id: 'shared-poi', type: 'experience', title: '城市展馆', city: '杭州', time: '09:00', lat: 30.25, lng: 120.15 }]
      },
      {
        day: 2,
        date: '2026-08-02',
        city: '上海',
        items: [{ id: 'shared-poi', type: 'experience', title: '城市展馆', city: '上海', time: '15:30', lat: 31.23, lng: 121.47 }]
      }
    ]
  };
  const duplicateCities = [{ name: '杭州', days: 1 }, { name: '上海', days: 1 }];
  const duplicateDraft = itineraryToDraft(duplicateSourceItinerary, duplicateCities, { seed: 'duplicate-snapshot' });
  const duplicateReread = itineraryToDraft(structuredClone(duplicateSourceItinerary), duplicateCities, { seed: 'duplicate-snapshot' });
  assert.notEqual(duplicateDraft.nodes[0].id, duplicateDraft.nodes[1].id);
  assert.deepEqual(duplicateReread.nodes.map(node => node.id), duplicateDraft.nodes.map(node => node.id));

  const duplicateResult = draftToItinerary(duplicateDraft, duplicateSourceItinerary);
  assert.deepEqual(
    duplicateResult.days.map(day => [day.day, day.items[0].time]),
    [[1, '09:00'], [2, '15:30']]
  );
});

test('isTripDraft rejects day assignments beyond a city stop capacity', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 1 }], { seed: 'city-capacity-snapshot' });
  draft.days.push({
    id: 'day-2',
    day: 2,
    date: null,
    primary_city_id: draft.city_stops[0].id,
    node_ids: [],
    max_driving_minutes: null
  });

  assert.equal(isTripDraft(draft), false);
});

test('isTripDraft accepts 15 city days and rejects 16', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 15 }], { seed: 'city-days-boundary' });
  assert.equal(isTripDraft(draft), true);

  draft.city_stops[0].days = 16;
  assert.equal(isTripDraft(draft), false);
});

test('isTripDraft accepts 1440 duration minutes and rejects 1441', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 1 }], { seed: 'duration-boundary' });
  draft.nodes[0].duration_minutes = 1440;
  assert.equal(isTripDraft(draft), true);

  draft.nodes[0].duration_minutes = 1441;
  assert.equal(isTripDraft(draft), false);
});

test('isTripDraft accepts driving limits from 30 through 900 minutes', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 1 }], { seed: 'driving-boundaries' });
  draft.days[0].max_driving_minutes = 30;
  assert.equal(isTripDraft(draft), true);
  draft.days[0].max_driving_minutes = 900;
  assert.equal(isTripDraft(draft), true);
});

test('isTripDraft rejects driving limits below 30 or above 900 minutes', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 1 }], { seed: 'invalid-driving-boundaries' });
  draft.days[0].max_driving_minutes = 29;
  assert.equal(isTripDraft(draft), false);
  draft.days[0].max_driving_minutes = 901;
  assert.equal(isTripDraft(draft), false);
});

test('isTripDraft accepts metadata with 30 own enumerable keys and rejects 31', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 1 }], { seed: 'metadata-boundary' });
  draft.nodes[0].metadata = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`key_${index}`, index])
  );
  assert.equal(isTripDraft(draft), true);

  draft.nodes[0].metadata.key_30 = 30;
  assert.equal(isTripDraft(draft), false);
});

test('isTripDraft accepts route with 30 own enumerable keys and rejects 31', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 1 }], { seed: 'route-boundary' });
  draft.route = {
    ordered_node_ids: [draft.nodes[0].id],
    ...Object.fromEntries(Array.from({ length: 29 }, (_, index) => [`key_${index}`, index]))
  };
  assert.equal(isTripDraft(draft), true);

  draft.route.key_29 = 29;
  assert.equal(isTripDraft(draft), false);
});

test('isTripDraft rejects malformed or unbounded local snapshots', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 2 }], { seed: 'snapshot-1' });
  assert.equal(isTripDraft(draft), true);
  assert.equal(isTripDraft({ schema_version: 2, nodes: 'not-an-array' }), false);
  assert.equal(isTripDraft({ ...draft, revision: -1 }), false);
  assert.equal(isTripDraft({ ...draft, mode: 'unknown' }), false);
  assert.equal(isTripDraft({ ...draft, city_stops: Array.from({ length: 21 }, () => draft.city_stops[0]) }), false);
  assert.equal(isTripDraft({ ...draft, nodes: Array.from({ length: 201 }, () => ({})) }), false);
  assert.equal(isTripDraft({ ...draft, days: Array.from({ length: 61 }, () => draft.days[0]) }), false);
  assert.equal(isTripDraft({ ...draft, city_stops: [{ ...draft.city_stops[0], days: 0 }] }), false);
  const cityStopSource = structuredClone(draft);
  cityStopSource.nodes[0].source = 'city_stop';
  cityStopSource.nodes[0].provider_id = null;
  assert.equal(isTripDraft(cityStopSource), true);
  assert.equal(isTripDraft({ ...draft, nodes: [{ ...draft.nodes[0], source: 'unknown' }, draft.nodes[1]] }), false);
  assert.equal(isTripDraft({ ...draft, days: [{ ...draft.days[0], node_ids: Array(201).fill(draft.nodes[0].id) }] }), false);
  assert.equal(isTripDraft({ ...draft, days: [{ ...draft.days[0], node_ids: ['missing-node'] }] }), false);
  assert.equal(isTripDraft({ ...draft, route: { ordered_node_ids: ['missing-node'] } }), false);
  assert.equal(isTripDraft({ ...draft, route: { ordered_node_ids: [draft.nodes[0].id, draft.nodes[0].id] } }), false);

  const duplicateDayReference = structuredClone(draft);
  duplicateDayReference.days.push({
    ...duplicateDayReference.days[0],
    id: 'day-2',
    day: 2,
    node_ids: [duplicateDayReference.nodes[0].id]
  });
  assert.equal(isTripDraft(duplicateDayReference), false);

  const mismatchedSchedule = structuredClone(draft);
  mismatchedSchedule.days.push({
    ...mismatchedSchedule.days[0],
    id: 'day-2',
    day: 2,
    node_ids: []
  });
  mismatchedSchedule.nodes[0].schedule.day_id = 'day-2';
  assert.equal(isTripDraft(mismatchedSchedule), false);

  const unreferencedSchedule = structuredClone(draft);
  unreferencedSchedule.days[0].node_ids = unreferencedSchedule.days[0].node_ids.slice(1);
  assert.equal(isTripDraft(unreferencedSchedule), false);

  const oversizedMetadata = structuredClone(draft);
  oversizedMetadata.nodes[0].metadata.note = 'x'.repeat(512 * 1024);
  assert.equal(isTripDraft(oversizedMetadata), false);

  const cyclicDraft = structuredClone(draft);
  cyclicDraft.route = { ordered_node_ids: [] };
  cyclicDraft.route.self = cyclicDraft.route;
  assert.equal(isTripDraft(cyclicDraft), false);
});
