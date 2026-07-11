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
