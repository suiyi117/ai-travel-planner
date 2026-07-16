// tests/frontend/wizard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/wizard.js');

const W = window.AeroTravelWizard;

test('validateStep1 rejects empty cities', () => {
  const result = W.validateStep1({ cities: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /出发地|目的地/);
  assert.equal(result.field, 'cities');
});

test('validateStep1 accepts one city with days 1-7', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 2, transport: 'auto' }]
  });
  assert.equal(result.ok, true);
});

test('validateStep1 rejects single-city all-transit (days 0)', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 0, transport: 'auto' }]
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /安排游玩天数/);
});

test('validateStep1 allows origin transit-only days=0 with plan_stay false when another city plays', () => {
  const result = W.validateStep1({
    cities: [
      { name: '淮北', days: 0, plan_stay: false, transport: 'auto' },
      { name: '合肥', days: 2, plan_stay: true, transport: 'train' }
    ]
  });
  assert.equal(result.ok, true);
});

test('validateStep1 allows non-origin transit city with plan_stay false', () => {
  const result = W.validateStep1({
    cities: [
      { name: '合肥', days: 2, plan_stay: true, transport: 'auto' },
      { name: '淮北', days: 0, plan_stay: false, transport: 'train' },
      { name: '武汉', days: 2, plan_stay: true, transport: 'train' }
    ]
  });
  assert.equal(result.ok, true);
});

test('validateStep1 rejects all-transit routes', () => {
  const result = W.validateStep1({
    cities: [
      { name: '北京', days: 0, plan_stay: false, transport: 'auto' },
      { name: '西安', days: 0, plan_stay: false, transport: 'train' }
    ]
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /请至少为一座城市安排游玩天数/);
});

test('validateStep1 treats days=0 without plan_stay as transit', () => {
  const result = W.validateStep1({
    cities: [
      { name: '淮北', days: 0, transport: 'auto' },
      { name: '合肥', days: 2, plan_stay: true, transport: 'train' }
    ]
  });
  assert.equal(result.ok, true);
});

test('routeLabel appends origin for round_trip', () => {
  assert.equal(
    W.routeLabel([{ name: '淮北' }, { name: '合肥' }, { name: '武汉' }], 'round_trip'),
    '淮北 → 合肥 → 武汉 → 淮北'
  );
});

test('validateStep1 rejects empty city name', () => {
  const result = W.validateStep1({
    cities: [{ name: '   ', days: 2, transport: 'auto' }]
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /城市名称/);
});

test('validateStep1 rejects days above 7', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 8, transport: 'auto' }]
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /1–7/);
});

test('validateStep1 rejects non-integer days', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 2.5, transport: 'auto' }]
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /1–7/);
});

test('validateStep1 accepts play city with 1 day and 7 days', () => {
  assert.equal(W.validateStep1({
    cities: [{ name: '北京', days: 1, plan_stay: true, transport: 'auto' }]
  }).ok, true);
  assert.equal(W.validateStep1({
    cities: [{ name: '北京', days: 7, plan_stay: true, transport: 'auto' }]
  }).ok, true);
});

test('validateStep1 accepts total play days 30 and rejects 31', () => {
  const makeCities = totalDays => {
    const cities = [];
    let remaining = totalDays;
    let index = 0;
    while (remaining > 0) {
      const days = Math.min(7, remaining);
      cities.push({ name: `城${index}`, days, plan_stay: true, transport: 'auto' });
      remaining -= days;
      index += 1;
    }
    return cities;
  };
  assert.equal(W.validateStep1({ cities: makeCities(30) }).ok, true);
  const over = W.validateStep1({ cities: makeCities(31) });
  assert.equal(over.ok, false);
  assert.match(over.message, /30/);
});

test('validateStep1 accepts 10 cities and rejects 11 cities', () => {
  const cities = Array.from({ length: 11 }, (_, index) => ({
    name: `city-${index + 1}`,
    days: 1,
    plan_stay: true,
    transport: 'auto'
  }));

  assert.equal(W.validateStep1({ cities: cities.slice(0, 10) }).ok, true);
  const over = W.validateStep1({ cities });
  assert.equal(over.ok, false);
  assert.equal(over.field, 'cities');
  assert.match(over.message, /10/);
});

test('validateStep1 rejects single-city round trip', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 2, plan_stay: true, transport: 'auto' }],
    routeShape: 'round_trip'
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /至少两个城市后可设置环线/);
  assert.equal(result.field, 'routeShape');
});

test('validateStep1 rejects past departure date and allows empty or future', () => {
  const cities = [{ name: '北京', days: 2, plan_stay: true, transport: 'auto' }];
  const past = W.validateStep1({ cities, departureDate: '2026-07-10', today: '2026-07-15' });
  assert.equal(past.ok, false);
  assert.match(past.message, /出发日期不能早于今天/);
  assert.equal(past.field, 'departureDate');

  assert.equal(W.validateStep1({ cities, departureDate: '', today: '2026-07-15' }).ok, true);
  assert.equal(W.validateStep1({ cities, departureDate: null, today: '2026-07-15' }).ok, true);
  assert.equal(W.validateStep1({
    cities,
    departureDate: '2026-07-20',
    today: '2026-07-15'
  }).ok, true);
  assert.equal(W.validateStep1({
    cities,
    departureDate: '2026-07-15',
    today: '2026-07-15'
  }).ok, true);
});

test('isSetupWizardStep only matches route and preference setup steps', () => {
  assert.equal(W.isSetupWizardStep(1), true);
  assert.equal(W.isSetupWizardStep('2'), true);
  assert.equal(W.isSetupWizardStep(3), false);
  assert.equal(W.isSetupWizardStep(null), false);
});

// --- Slice A: city name normalize / add / stats / segment / undo ---

test('normalizeCityName trims and collapses whitespace', () => {
  assert.equal(W.normalizeCityName('  北  京  '), '北 京');
  assert.equal(W.normalizeCityName('\t合肥\n'), '合肥');
});

test('validateCityName rejects blank, punctuation-only, and too long names', () => {
  assert.equal(W.validateCityName('').ok, false);
  assert.match(W.validateCityName('   ').message, /请输入城市名称/);
  assert.equal(W.validateCityName('...').ok, false);
  assert.match(W.validateCityName('...').message, /有效的城市名称/);
  assert.equal(W.validateCityName('！！！').ok, false);
  assert.equal(W.validateCityName('a'.repeat(31)).ok, false);
  assert.equal(W.validateCityName('成都').ok, true);
  assert.equal(W.validateCityName('  成 都  ').normalized, '成 都');
});

test('findDuplicateCityIndex matches after normalization', () => {
  const cities = [{ name: '北 京' }, { name: '西安' }];
  assert.equal(W.findDuplicateCityIndex(cities, '  北  京  '), 0);
  assert.equal(W.findDuplicateCityIndex(cities, '成都'), -1);
});

test('canAddCity allows 10th city and blocks 11th', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ name: `城${i}`, days: 1, plan_stay: true }));
  const ninth = ten.slice(0, 9);
  const add10 = W.canAddCity(ninth, '城9');
  assert.equal(add10.ok, true);
  assert.equal(add10.normalized, '城9');

  const add11 = W.canAddCity(ten, '城X');
  assert.equal(add11.ok, false);
  assert.match(add11.message, /最多规划 10 座城市/);
});

test('canAddCity rejects duplicate and invalid names', () => {
  const cities = [{ name: '北京', days: 1, plan_stay: true }];
  const dup = W.canAddCity(cities, ' 北京 ');
  assert.equal(dup.ok, false);
  assert.equal(dup.duplicateIndex, 0);
  assert.match(dup.message, /已在路线中/);

  const empty = W.canAddCity(cities, '  ');
  assert.equal(empty.ok, false);
  assert.match(empty.message, /请输入城市名称/);
});

test('buildRouteStats counts play days and transit cities', () => {
  const stats = W.buildRouteStats([
    { name: '淮北', days: 0, plan_stay: false },
    { name: '合肥', days: 1, plan_stay: true },
    { name: '武汉', days: 2, plan_stay: true }
  ]);
  assert.equal(stats.playDays, 3);
  assert.equal(stats.playCities, 2);
  assert.equal(stats.transitCities, 1);
  assert.equal(stats.totalCities, 3);
});

test('buildRouteStats ignores transit city days for play total', () => {
  const stats = W.buildRouteStats([
    { name: '上海', days: 2, plan_stay: true },
    { name: '杭州', days: 0, plan_stay: false },
    { name: '黄山', days: 3, plan_stay: true }
  ]);
  assert.equal(stats.playDays, 5);
  assert.equal(stats.playCities, 2);
  assert.equal(stats.transitCities, 1);
});

test('segmentLabel and arrival labels use previous → current city', () => {
  assert.equal(W.segmentLabel('淮北', '合肥'), '淮北 → 合肥');
  assert.equal(W.segmentKey('淮北', '合肥'), '淮北 → 合肥');
  const arrival = W.arrivalLabel('淮北', '合肥', 'driving');
  assert.match(arrival.full, /从淮北到达合肥/);
  assert.match(arrival.full, /自驾优先/);
  assert.equal(arrival.segment, '淮北 → 合肥');
  assert.match(arrival.short, /上一段/);
});

test('routeLabel for two-city round trip appends origin once', () => {
  assert.equal(
    W.routeLabel([{ name: '北京' }, { name: '西安' }], 'round_trip'),
    '北京 → 西安 → 北京'
  );
});

test('removeCityAt and restoreCityAt preserve full city object and index', () => {
  const cities = [
    { name: '淮北', days: 0, plan_stay: false, transport: 'auto' },
    { name: '合肥', days: 1, plan_stay: true, transport: 'driving' },
    { name: '武汉', days: 2, plan_stay: true, transport: 'train' }
  ];
  const removed = W.removeCityAt(cities, 1);
  assert.equal(removed.cities.length, 2);
  assert.equal(removed.cities[0].name, '淮北');
  assert.equal(removed.cities[1].name, '武汉');
  assert.deepEqual(removed.removed, {
    name: '合肥', days: 1, plan_stay: true, transport: 'driving'
  });
  assert.equal(removed.index, 1);

  const restored = W.restoreCityAt(removed.cities, removed.removed, removed.index);
  assert.deepEqual(restored, cities);
});

test('reorderCityList moves city and keeps stay/days/transport', () => {
  const cities = [
    { name: '淮北', days: 0, plan_stay: false, transport: 'auto' },
    { name: '合肥', days: 1, plan_stay: true, transport: 'driving' },
    { name: '武汉', days: 2, plan_stay: true, transport: 'train' }
  ];
  const reordered = W.reorderCityList(cities, 2, 0);
  assert.equal(reordered[0].name, '武汉');
  assert.equal(reordered[0].days, 2);
  assert.equal(reordered[0].transport, 'train');
  assert.equal(reordered[1].name, '淮北');
  assert.equal(reordered[2].name, '合肥');
});

test('after reorder origin and segment labels follow new order', () => {
  const cities = [
    { name: '淮北', days: 0, plan_stay: false, transport: 'auto' },
    { name: '合肥', days: 1, plan_stay: true, transport: 'driving' },
    { name: '武汉', days: 2, plan_stay: true, transport: 'train' }
  ];
  const reordered = W.reorderCityList(cities, 2, 0);
  assert.equal(W.getOriginName(reordered), '武汉');
  assert.equal(W.segmentLabel(reordered[0].name, reordered[1].name), '武汉 → 淮北');
  assert.equal(W.segmentLabel(reordered[1].name, reordered[2].name), '淮北 → 合肥');
  assert.equal(
    W.routeLabel(reordered, 'round_trip'),
    '武汉 → 淮北 → 合肥 → 武汉'
  );
});

test('createCityEntry defaults first city to transit origin', () => {
  const first = W.createCityEntry('  成都  ', 0);
  assert.deepEqual(first, {
    name: '成都',
    days: 0,
    plan_stay: false,
    transport: 'auto'
  });
  const second = W.createCityEntry('康定', 1, { transport: 'driving' });
  assert.equal(second.name, '康定');
  assert.equal(second.days, 1);
  assert.equal(second.plan_stay, true);
  assert.equal(second.transport, 'driving');
});

test('originChangeMessage differs for one_way vs round_trip', () => {
  assert.match(W.originChangeMessage('武汉', 'one_way'), /出发地已改为 武汉/);
  assert.match(W.originChangeMessage('武汉', 'round_trip'), /回程终点已改为 武汉/);
});

test('isRoundTripAllowed requires at least two cities', () => {
  assert.equal(W.isRoundTripAllowed([{ name: '北京' }]), false);
  assert.equal(W.isRoundTripAllowed([{ name: '北京' }, { name: '西安' }]), true);
});

test('formatDepartureLabel handles empty and concrete dates', () => {
  assert.equal(W.formatDepartureLabel(''), '日期未定');
  assert.equal(W.formatDepartureLabel(null), '日期未定');
  assert.equal(W.formatDepartureLabel('2026-07-20'), '7月20日出发');
});

test('defaultDepartureDate is local tomorrow', () => {
  const base = new Date(2026, 6, 15); // July 15 local
  assert.equal(W.defaultDepartureDate(base), '2026-07-16');
});

test('localDateISO uses local calendar date not UTC shift', () => {
  const d = new Date(2026, 0, 1, 0, 30, 0);
  assert.equal(W.localDateISO(d), '2026-01-01');
});

test('buildDaysSummaryText matches PRD copy', () => {
  const text = W.buildDaysSummaryText({
    playDays: 3,
    playCities: 2,
    transitCities: 1
  });
  assert.equal(text, '共 3 个游玩日 · 2 个游玩城市 · 1 个过境城市');
});

test('settingsSnapshot includes departureDate and settingsChanged detects it', () => {
  const base = {
    cities: [{ name: '北京', days: 2, plan_stay: true, transport: 'auto' }],
    routeShape: 'one_way',
    budget: '舒适型',
    pace: '适中均衡',
    globalTransport: 'auto',
    interests: '',
    routeStrategy: 'balanced',
    departureDate: '2026-07-20'
  };
  assert.equal(W.settingsSnapshot(base).departureDate, '2026-07-20');
  assert.equal(
    W.settingsChanged(base, { ...base, departureDate: '2026-07-21' }),
    true
  );
  assert.equal(
    W.settingsChanged(base, { ...base, departureDate: '2026-07-20' }),
    false
  );
});

test('settingsChanged detects route shape, city order, and segment transport changes', () => {
  const base = {
    cities: [
      { name: '北京', days: 2, plan_stay: true, transport: 'auto' },
      { name: '西安', days: 1, plan_stay: true, transport: 'train' }
    ],
    routeShape: 'one_way',
    budget: '舒适型',
    pace: '适中均衡',
    globalTransport: 'auto',
    interests: '',
    routeStrategy: 'balanced',
    departureDate: '2026-07-20'
  };
  assert.equal(
    W.settingsChanged(base, { ...base, routeShape: 'round_trip' }),
    true
  );
  assert.equal(
    W.settingsChanged(base, {
      ...base,
      cities: [
        { name: '西安', days: 1, plan_stay: true, transport: 'train' },
        { name: '北京', days: 2, plan_stay: true, transport: 'auto' }
      ]
    }),
    true
  );
  assert.equal(
    W.settingsChanged(base, {
      ...base,
      cities: [
        { name: '北京', days: 2, plan_stay: true, transport: 'auto' },
        { name: '西安', days: 1, plan_stay: true, transport: 'driving' }
      ]
    }),
    true
  );
});
test('canEnterStep: step1 always', () => {
  assert.equal(W.canEnterStep(1, { step1Done: false, hasPlan: false }), true);
});

test('canEnterStep: step2 only after step1Done', () => {
  assert.equal(W.canEnterStep(2, { step1Done: false, hasPlan: false }), false);
  assert.equal(W.canEnterStep(2, { step1Done: true, hasPlan: false }), true);
});

test('canEnterStep: step3 only when hasPlan', () => {
  assert.equal(W.canEnterStep(3, { step1Done: true, hasPlan: false }), false);
  assert.equal(W.canEnterStep(3, { step1Done: true, hasPlan: true }), true);
});

test('canEnterStep: invalid step is false', () => {
  assert.equal(W.canEnterStep(0, { step1Done: true, hasPlan: true }), false);
  assert.equal(W.canEnterStep(4, { step1Done: true, hasPlan: true }), false);
});

test('shouldAnimateStepTransition only animates real step changes', () => {
  assert.equal(W.shouldAnimateStepTransition(null, 1, false), false);
  assert.equal(W.shouldAnimateStepTransition(1, 1, false), false);
  assert.equal(W.shouldAnimateStepTransition(1, 2, false), true);
  assert.equal(W.shouldAnimateStepTransition(1, 2, true), false);
});

test('buildSummary lines from state', () => {
  const summary = W.buildSummary({
    cities: [
      { name: '北京', days: 2, transport: 'auto' },
      { name: '西安', days: 1, transport: 'train' }
    ],
    pace: '适中均衡',
    budget: '舒适型',
    globalTransport: 'auto',
    departureDate: '2026-07-20'
  });
  assert.equal(summary.route, '北京 → 西安');
  assert.equal(summary.totalDays, 3);
  assert.match(summary.meta, /单程/);
  assert.match(summary.meta, /3 个游玩日/);
  assert.match(summary.meta, /7月20日出发/);
  assert.match(summary.meta, /舒适型/);
});

test('buildSummary uses empty-route fallback', () => {
  const summary = W.buildSummary({ cities: [], budget: '经济型' });
  assert.equal(summary.route, '未设置路线');
  assert.equal(summary.totalDays, 0);
});

test('buildSummary maps transport labels', () => {
  assert.match(W.buildSummary({ cities: [{ name: '北京', days: 1 }], globalTransport: 'train' }).meta, /高铁/);
  assert.match(W.buildSummary({ cities: [{ name: '北京', days: 1 }], globalTransport: 'plane' }).meta, /飞机/);
  assert.match(W.buildSummary({ cities: [{ name: '北京', days: 1 }], globalTransport: 'driving' }).meta, /自驾/);
});

test('buildSummary round trip includes shape and transit counts', () => {
  const summary = W.buildSummary({
    cities: [
      { name: '淮北', days: 0, plan_stay: false, transport: 'auto' },
      { name: '合肥', days: 1, plan_stay: true, transport: 'driving' },
      { name: '武汉', days: 2, plan_stay: true, transport: 'train' }
    ],
    routeShape: 'round_trip',
    departureDate: '2026-07-20'
  });
  assert.equal(summary.route, '淮北 → 合肥 → 武汉 → 淮北');
  assert.match(summary.meta, /环线/);
  assert.match(summary.meta, /2 个游玩城市/);
  assert.match(summary.meta, /1 个过境城市/);
});

test('findAddedCityNames returns only cities that were not rendered before', () => {
  assert.deepEqual(
    W.findAddedCityNames(['北京', '西安'], [
      { name: '西安' },
      { name: '成都' },
      { name: '北京' }
    ]),
    ['成都']
  );
});

test('findAddedCityNames ignores blank and duplicate city names', () => {
  assert.deepEqual(
    W.findAddedCityNames([], [
      { name: '  ' },
      { name: '杭州' },
      { name: '杭州' }
    ]),
    ['杭州']
  );
});

test('hasSelfDriveIntent true when default transport is driving', () => {
  assert.equal(W.hasSelfDriveIntent({ globalTransport: 'driving', cities: [] }), true);
});

test('hasSelfDriveIntent true when any city segment is driving', () => {
  assert.equal(W.hasSelfDriveIntent({
    globalTransport: 'train',
    cities: [
      { name: '成都', transport: 'auto' },
      { name: '康定', transport: 'driving' }
    ]
  }), true);
});

test('hasSelfDriveIntent false for auto-only routes', () => {
  assert.equal(W.hasSelfDriveIntent({
    globalTransport: 'auto',
    cities: [
      { name: '北京', transport: 'auto' },
      { name: '西安', transport: 'train' }
    ]
  }), false);
});

test('hasSelfDriveIntent true when draft has self-drive route data', () => {
  assert.equal(W.hasSelfDriveIntent({
    globalTransport: 'train',
    cities: [{ name: '北京', transport: 'train' }],
    workingDraft: { mode: 'self_drive', route: { ordered_node_ids: ['a', 'b'] } }
  }), true);
  assert.equal(W.hasSelfDriveIntent({
    globalTransport: 'auto',
    cities: [],
    draft: { mode: 'itinerary', route: { ordered_node_ids: ['n1'] } }
  }), true);
});

test('shouldShowSelfDrivePrefs only for explicit driving transport', () => {
  assert.equal(W.shouldShowSelfDrivePrefs({ globalTransport: 'driving', cities: [] }), true);
  assert.equal(W.shouldShowSelfDrivePrefs({
    globalTransport: 'auto',
    cities: [{ name: 'A', transport: 'driving' }]
  }), true);
  assert.equal(W.shouldShowSelfDrivePrefs({
    globalTransport: 'auto',
    cities: [],
    workingDraft: { mode: 'self_drive', route: { ordered_node_ids: ['a'] } }
  }), false);
});

test('shouldShowSelfDriveEditEntry follows intent including restored drafts', () => {
  assert.equal(W.shouldShowSelfDriveEditEntry({
    globalTransport: 'plane',
    cities: [],
    workingDraft: { mode: 'self_drive' }
  }), true);
  assert.equal(W.shouldShowSelfDriveEditEntry({
    globalTransport: 'auto',
    cities: [{ name: '北京', transport: 'auto' }]
  }), false);
});

test('canSwitchEditTool blocks when candidate exists', () => {
  assert.equal(W.canSwitchEditTool(null), true);
  assert.equal(W.canSwitchEditTool({ draft: {} }), false);
});

test('normalizeEditTool defaults to daily', () => {
  assert.equal(W.normalizeEditTool('driving'), 'driving');
  assert.equal(W.normalizeEditTool('daily'), 'daily');
  assert.equal(W.normalizeEditTool('other'), 'daily');
  assert.equal(W.normalizeEditTool(undefined), 'daily');
});

test('isDrivingTransport only matches driving', () => {
  assert.equal(W.isDrivingTransport('driving'), true);
  assert.equal(W.isDrivingTransport('auto'), false);
  assert.equal(W.isDrivingTransport('train'), false);
});

test('buildEditToolOptimizationRequest uses daily mode without mutating a self-drive draft', () => {
  const draft = {
    revision: 7,
    mode: 'self_drive',
    route: { ordered_node_ids: ['a', 'b'] }
  };

  const request = W.buildEditToolOptimizationRequest(draft, 'daily', 'day-2');

  assert.equal(request.base_revision, 7);
  assert.deepEqual(request.scope, { type: 'day', id: 'day-2' });
  assert.equal(request.draft.mode, 'itinerary');
  assert.deepEqual(request.draft.route, draft.route);
  assert.equal(draft.mode, 'self_drive');
});

test('buildEditToolOptimizationRequest uses trip scope for the driving tool', () => {
  const request = W.buildEditToolOptimizationRequest(
    { revision: 3, mode: 'itinerary', route: { ordered_node_ids: ['a', 'b'] } },
    'driving',
    'day-1'
  );

  assert.deepEqual(request.scope, { type: 'trip', id: null });
  assert.equal(request.draft.mode, 'self_drive');
});

test('isEditToolChange treats clicking the selected tool as a no-op', () => {
  assert.equal(W.isEditToolChange('daily', 'daily'), false);
  assert.equal(W.isEditToolChange('driving', 'driving'), false);
  assert.equal(W.isEditToolChange('daily', 'driving'), true);
  assert.equal(W.isEditToolChange('driving', 'daily'), true);
});

const sampleSettings = {
  cities: [
    { name: '北京', days: 2, plan_stay: true, transport: 'auto' },
    { name: '西安', days: 1, plan_stay: true, transport: 'train' }
  ],
  routeShape: 'one_way',
  budget: '舒适型',
  pace: '适中均衡',
  globalTransport: 'auto',
  interests: '',
  routeStrategy: 'balanced'
};

test('settingsSnapshot normalizes cities and prefs', () => {
  const snap = W.settingsSnapshot(sampleSettings);
  assert.deepEqual(snap.cities, [
    { name: '北京', days: 2, plan_stay: true, transport: 'auto' },
    { name: '西安', days: 1, plan_stay: true, transport: 'train' }
  ]);
  assert.equal(snap.routeShape, 'one_way');
  assert.equal(snap.budget, '舒适型');
  assert.equal(snap.pace, '适中均衡');
  assert.equal(snap.globalTransport, 'auto');
  assert.equal(snap.interests, '');
  assert.equal(snap.routeStrategy, 'balanced');
});

test('settingsSnapshot defaults missing interests and routeStrategy', () => {
  const snap = W.settingsSnapshot({
    cities: sampleSettings.cities,
    budget: '舒适型',
    pace: '适中均衡'
  });
  assert.equal(snap.interests, '');
  assert.equal(snap.routeStrategy, 'balanced');
  assert.equal(snap.globalTransport, 'auto');
});

test('settingsSnapshot trims interests and accepts strategy alias', () => {
  const snap = W.settingsSnapshot({
    cities: sampleSettings.cities,
    budget: sampleSettings.budget,
    pace: sampleSettings.pace,
    interests: '  博物馆优先  ',
    strategy: 'efficient'
  });
  assert.equal(snap.interests, '博物馆优先');
  assert.equal(snap.routeStrategy, 'efficient');
});

test('settingsSnapshot is stable when re-snapshotted', () => {
  const once = W.settingsSnapshot(sampleSettings);
  const twice = W.settingsSnapshot(once);
  assert.deepEqual(once, twice);
});

test('settingsChanged is false for identical settings', () => {
  assert.equal(W.settingsChanged(sampleSettings, { ...sampleSettings }), false);
  assert.equal(
    W.settingsChanged(W.settingsSnapshot(sampleSettings), W.settingsSnapshot(sampleSettings)),
    false
  );
});

test('settingsChanged detects day changes', () => {
  const next = {
    ...sampleSettings,
    cities: [
      { name: '北京', days: 3, plan_stay: true, transport: 'auto' },
      { name: '西安', days: 1, plan_stay: true, transport: 'train' }
    ]
  };
  assert.equal(W.settingsChanged(sampleSettings, next), true);
});

test('settingsChanged detects budget changes', () => {
  assert.equal(
    W.settingsChanged(sampleSettings, { ...sampleSettings, budget: '经济型' }),
    true
  );
});

test('settingsChanged detects city order changes', () => {
  const reordered = {
    ...sampleSettings,
    cities: [
      { name: '西安', days: 1, plan_stay: true, transport: 'train' },
      { name: '北京', days: 2, plan_stay: true, transport: 'auto' }
    ]
  };
  assert.equal(W.settingsChanged(sampleSettings, reordered), true);
});

test('settingsChanged detects routeShape changes', () => {
  assert.equal(
    W.settingsChanged(sampleSettings, { ...sampleSettings, routeShape: 'round_trip' }),
    true
  );
});

test('settingsChanged detects interests changes', () => {
  assert.equal(
    W.settingsChanged(sampleSettings, { ...sampleSettings, interests: '亲子友好' }),
    true
  );
});

test('settingsChanged detects routeStrategy changes', () => {
  assert.equal(
    W.settingsChanged(sampleSettings, { ...sampleSettings, routeStrategy: 'experience' }),
    true
  );
});

test('step3ChromeMode is workspace only on step 3 with a plan', () => {
  assert.equal(W.step3ChromeMode(3, true), 'workspace');
  assert.equal(W.step3ChromeMode(3, false), 'wizard');
  assert.equal(W.step3ChromeMode(1, true), 'wizard');
  assert.equal(W.step3ChromeMode(2, true), 'wizard');
});

test('buildSummaryDisplay collapses meta by default', () => {
  const withDate = { ...sampleSettings, departureDate: '2026-07-20' };
  const collapsed = W.buildSummaryDisplay(withDate, false);
  assert.equal(collapsed.route, '北京 → 西安');
  assert.match(collapsed.meta, /单程/);
  assert.match(collapsed.meta, /3 个游玩日/);
  assert.match(collapsed.meta, /7月20日出发/);
  assert.equal(collapsed.expanded, false);

  const expanded = W.buildSummaryDisplay(withDate, true);
  assert.match(expanded.meta, /适中均衡/);
  assert.match(expanded.meta, /智能交通/);
  assert.equal(expanded.expanded, true);
});

test('step1BlockReason surfaces empty-route message', () => {
  const blocked = W.step1BlockReason({ cities: [] });
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /出发地|目的地/);
  assert.equal(W.step1BlockReason({
    cities: [{ name: '北京', days: 2, plan_stay: true }]
  }).ok, true);
});

test('dayMapHintLabel counts mappable stops only', () => {
  const day = {
    items: [
      { lat: 39.9, lng: 116.4 },
      { lat: 0, lng: 0 },
      { lat: 34.2, lng: 108.9 },
      { title: '无坐标' }
    ]
  };
  assert.equal(W.countMappableStops(day), 2);
  assert.equal(W.dayMapHintLabel(day), '2 个点 · 可看地图');
  assert.equal(W.dayMapHintLabel({ items: [] }), '');
});
