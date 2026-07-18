const test = require("node:test");
const assert = require("node:assert/strict");
global.window = {};
require("../../static/js/planning/editor.js");

const escapeHtml = (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;");

test("wishlist rendering escapes untrusted names and exposes move controls", () => {
  const html = window.AeroTravelEditor.renderWishlist(
    [{ id: "n1", name: "<img onerror=alert(1)>", status: "wishlist", location: { status: "unresolved" }, constraints: { required: true }, city: "" }],
    escapeHtml
  );
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-action="schedule"/);
  assert.match(html, /data-action="edit-node"/);
  assert.match(html, /data-action="remove-node"/);
  assert.match(html, /待定位/);
});

test("wishlist renders empty state when no nodes", () => {
  const html = window.AeroTravelEditor.renderWishlist([], escapeHtml);
  assert.match(html, /想去清单为空/);
});

test("map place search normalizes resolved candidates and drops invalid duplicates", () => {
  const results = window.AeroTravelEditor.normalizePlaceSearchResults([
    {
      id: "poi-1",
      name: "大雁塔",
      cityname: "西安市",
      adname: "雁塔区",
      address: "雁塔路",
      rating: "4.8",
      lat: 34.218,
      lng: 108.964
    },
    {
      id: "poi-1",
      name: "重复地点",
      lat: 34.218,
      lng: 108.964
    },
    { name: "无坐标地点", lat: 0, lng: 0 }
  ], "西安");

  assert.equal(results.length, 1);
  assert.equal(results[0].provider_id, "poi-1");
  assert.equal(results[0].name, "大雁塔");
  assert.equal(results[0].city, "西安市");
  assert.equal(results[0].district, "雁塔区");
  assert.equal(results[0].lat, 34.218);
  assert.equal(results[0].lng, 108.964);
});

test("map place search rendering escapes provider content and exposes selection indexes", () => {
  const html = window.AeroTravelEditor.renderPlaceSearchResults([
    { name: "<img onerror=alert(1)>", city: "西安", district: "雁塔区", address: "雁塔路", rating: "4.8" }
  ], escapeHtml);

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  assert.match(html, /data-place-result-index="0"/);
  assert.match(html, /西安 · 雁塔区 · 雁塔路/);
  assert.match(html, /高德地图/);
});

test("day nodes rendering exposes move controls and constraint button", () => {
  const nodes = [
    { id: "n1", name: "西湖", schedule: { time_window: "09:00" }, source: "manual", constraints: { fixed_order: false, fixed_time: false } },
    { id: "n2", name: "灵隐寺", schedule: { time_window: null }, source: "ai", constraints: { fixed_order: true, fixed_time: false } }
  ];
  const html = window.AeroTravelEditor.renderDayNodes(nodes, escapeHtml);
  assert.match(html, /西湖/);
  assert.match(html, /09:00/);
  assert.match(html, /灵隐寺/);
  assert.match(html, /时间待安排/);
  assert.match(html, /data-action="constraints"/);
  assert.match(html, /data-action="edit-node"/);
  assert.match(html, /data-action="remove-node"/);
  assert.match(html, /data-action="move-up"/);
  assert.match(html, /data-action="move-down"/);
  assert.match(html, /data-action="move-day"/);
});

test("day nodes mark system nodes as non-draggable", () => {
  const nodes = [
    { id: "sys1", name: "住宿区域", schedule: {}, source: "system", constraints: { fixed_order: false, fixed_time: false } }
  ];
  const html = window.AeroTravelEditor.renderDayNodes(nodes, escapeHtml);
  assert.match(html, /draggable="false"/);
});

test("fixed-order and fixed-time nodes are non-draggable", () => {
  const nodes = [
    { id: "f1", name: "固定顺序", schedule: {}, source: "manual", constraints: { fixed_order: true, fixed_time: false } },
    { id: "f2", name: "固定时间", schedule: { time_window: "10:00" }, source: "manual", constraints: { fixed_order: false, fixed_time: true } }
  ];
  const html = window.AeroTravelEditor.renderDayNodes(nodes, escapeHtml);
  // Both should have draggable="false"
  const draggableMatches = html.match(/draggable="false"/g);
  assert.equal(draggableMatches.length, 2);
});

test("city ordering exposes keyboard-operable ordering controls", () => {
  const html = window.AeroTravelEditor.renderCityStops(
    [{ id: "hz", name: "杭州", days: 2, transport: "train" }, { id: "sh", name: "上海", days: 1, transport: "auto" }],
    escapeHtml
  );
  assert.match(html, /data-action="city-up"/);
  assert.match(html, /data-action="city-down"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /city-order-handle/);
});

test("city ordering uses clear Chinese route roles instead of internal transport enums", () => {
  const html = window.AeroTravelEditor.renderCityStops(
    [
      { id: "c1", name: "杭州", days: 2, plan_stay: true, transport: "auto" },
      { id: "c2", name: "上海", days: 1, plan_stay: true, transport: "train" },
      { id: "c3", name: "南京", days: 0, plan_stay: false, transport: "plane" },
      { id: "c4", name: "苏州", days: 1, plan_stay: true, transport: "driving" },
      { id: "c5", name: "无锡", days: 1, plan_stay: true, transport: "plane" },
      { id: "c6", name: "常州", days: 1, plan_stay: true, transport: "auto" }
    ],
    escapeHtml
  );

  assert.match(html, /2天 · 出发地/);
  assert.match(html, /1天 · 高铁优先/);
  assert.match(html, /0天 · 仅过境/);
  assert.match(html, /1天 · 自驾优先/);
  assert.match(html, /1天 · 飞机优先/);
  assert.match(html, /1天 · 智能推荐/);
  assert.doesNotMatch(html, />\s*(?:auto|train|plane|driving)\s*</);
});

test("day nodes surface drag affordance text for unlocked nodes", () => {
  const nodes = [
    { id: "n1", name: "西湖", schedule: { time_window: "09:00" }, source: "manual", constraints: { fixed_order: false, fixed_time: false } }
  ];
  const html = window.AeroTravelEditor.renderDayNodes(nodes, escapeHtml);
  assert.match(html, /draggable="true"/);
  assert.match(html, /可拖拽/);
});

test("constraint panel renders four constraint toggles", () => {
  const node = {
    id: "n1",
    name: "西湖",
    constraints: { required: true, fixed_day: false, fixed_time: false, fixed_order: false },
    schedule: { time_window: null }
  };
  const html = window.AeroTravelEditor.renderConstraintPanel(node, escapeHtml);
  assert.match(html, /data-constraint="required"/);
  assert.match(html, /data-constraint="fixed_day"/);
  assert.match(html, /data-constraint="fixed_time"/);
  assert.match(html, /data-constraint="fixed_order"/);
  assert.match(html, /必去/);
  assert.match(html, /固定日期/);
  assert.match(html, /固定时段/);
  assert.match(html, /固定顺序/);
});

test("constraint panel shows time input when fixed_time is true", () => {
  const node = {
    id: "n1",
    name: "定时点",
    constraints: { required: true, fixed_day: false, fixed_time: true, fixed_order: false },
    schedule: { time_window: "14:00-16:00" }
  };
  const html = window.AeroTravelEditor.renderConstraintPanel(node, escapeHtml);
  assert.match(html, /14:00-16:00/);
  assert.match(html, /data-action="save-constraints"/);
});
