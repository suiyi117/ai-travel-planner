// tests/frontend/api.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/api.js');

const Api = window.AeroTravelApi;

test('resolveApiUrl keeps same-origin path on port 8000', () => {
  const url = Api.resolveApiUrl('/api/plan', {
    protocol: 'http:',
    port: '8000',
    host: 'localhost:8000'
  });
  assert.equal(url, '/api/plan');
});

test('resolveApiUrl rewrites file: protocol to localhost:8000', () => {
  const url = Api.resolveApiUrl('/api/plan', {
    protocol: 'file:',
    port: '',
    host: ''
  });
  assert.equal(url, 'http://localhost:8000/api/plan');
});

test('resolveApiUrl rewrites non-8000 ports to localhost:8000', () => {
  const url = Api.resolveApiUrl('/api/health', {
    protocol: 'http:',
    port: '5500',
    host: 'localhost:5500'
  });
  assert.equal(url, 'http://localhost:8000/api/health');
});

test('resolveApiUrl leaves non-api urls untouched', () => {
  const url = Api.resolveApiUrl('/static/index.html', {
    protocol: 'file:',
    port: '',
    host: ''
  });
  assert.equal(url, '/static/index.html');
});

test('classifyFetchError maps Failed to fetch as network', () => {
  const classified = Api.classifyFetchError(new TypeError('Failed to fetch'));
  assert.equal(classified.kind, 'network');
  assert.match(classified.message, /localhost:8000/);
  assert.match(classified.message, /python server\.py/);
});

test('classifyFetchError maps http kind errors', () => {
  const err = new Error('所有目的地均未获取到高德景点数据，请检查高德地图 Key');
  err.kind = 'http';
  err.status = 400;
  const classified = Api.classifyFetchError(err);
  assert.equal(classified.kind, 'http');
  assert.equal(classified.status, 400);
  assert.match(classified.message, /高德/);
});

test('formatPlanError network branch mentions demo fallback and open URL', () => {
  const message = Api.formatPlanError(new TypeError('Failed to fetch'));
  assert.match(message, /无法连接后端/);
  assert.match(message, /本地演示规划/);
  assert.match(message, /localhost:8000/);
});

test('formatPlanError http 400 poi detail is surfaced without AI prefix', () => {
  const err = new Error('所有目的地均未获取到高德景点数据，请检查高德地图 Key');
  err.kind = 'http';
  err.status = 400;
  const message = Api.formatPlanError(err);
  assert.match(message, /高德景点数据/);
  assert.match(message, /本地演示规划/);
  assert.doesNotMatch(message, /^AI 规划失败/);
});

test('formatPlanError other http uses AI failure wording', () => {
  const err = new Error('AI 请求超时，请稍后重试');
  err.kind = 'http';
  err.status = 500;
  const message = Api.formatPlanError(err);
  assert.match(message, /AI 规划失败/);
  assert.match(message, /超时/);
  assert.match(message, /本地演示规划/);
});

test('isNetworkFetchError is true for Failed to fetch TypeError', () => {
  assert.equal(Api.isNetworkFetchError(new TypeError('Failed to fetch')), true);
});

test('isNetworkFetchError is false for AbortError', () => {
  const err = new Error('aborted');
  err.name = 'AbortError';
  assert.equal(Api.isNetworkFetchError(err), false);
});
