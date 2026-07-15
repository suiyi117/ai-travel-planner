// tests/frontend/wizard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/wizard.js');

const W = window.AeroTravelWizard;

test('validateStep1 rejects empty cities', () => {
  const result = W.validateStep1({ cities: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /城市/);
});

test('validateStep1 accepts one city with days 1-7', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 2, transport: 'auto' }]
  });
  assert.equal(result.ok, true);
});

test('validateStep1 rejects days out of range', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 0, transport: 'auto' }]
  });
  assert.equal(result.ok, false);
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
  assert.match(result.message, /城市名称不能为空/);
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
    globalTransport: 'auto'
  });
  assert.equal(summary.route, '北京 → 西安');
  assert.equal(summary.totalDays, 3);
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
  globalTransport: 'auto'
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

test('step3ChromeMode is workspace only on step 3 with a plan', () => {
  assert.equal(W.step3ChromeMode(3, true), 'workspace');
  assert.equal(W.step3ChromeMode(3, false), 'wizard');
  assert.equal(W.step3ChromeMode(1, true), 'wizard');
  assert.equal(W.step3ChromeMode(2, true), 'wizard');
});

test('buildSummaryDisplay collapses meta by default', () => {
  const collapsed = W.buildSummaryDisplay(sampleSettings, false);
  assert.equal(collapsed.route, '北京 → 西安');
  assert.equal(collapsed.meta, '3 天 · 舒适型');
  assert.equal(collapsed.expanded, false);

  const expanded = W.buildSummaryDisplay(sampleSettings, true);
  assert.match(expanded.meta, /适中均衡/);
  assert.match(expanded.meta, /智能交通/);
  assert.equal(expanded.expanded, true);
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
