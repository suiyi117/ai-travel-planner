const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/trip-nav.js");
require("../../static/trip-share-render.js");

const Render = window.AeroTravelTripShareRender;

const samplePkg = {
  id: "Ab12Cd34Ef56Gh78Ij90",
  title: "<script>alert(1)</script>双城",
  summary: "摘要",
  route: "北京 → 西安",
  cities: ["北京", "西安"],
  total_days: 2,
  budget_label: "舒适型",
  departure_date: "2026-08-01",
  updated_at: "2026-07-12T10:00:00.000Z",
  share_url: "https://trip.example/t/Ab12Cd34Ef56Gh78Ij90",
  days: [{
    day: 1,
    date: "2026-08-01",
    city: "北京",
    route: "故宫路线",
    weather: "晴 22~31℃",
    color: "#c96442",
    summary: "故宫 · 景山",
    anchors: [{ order: 1, title: "故宫", lat: 39.9, lng: 116.4, color: "#c96442" }],
    items: [{
      id: "i1",
      type: "spot",
      time: "09:30",
      title: "<img src=x onerror=alert(1)>",
      desc: "说明",
      duration: "2小时",
      address: "东城区",
      lat: 39.9,
      lng: 116.4
    }]
  }],
  transport_guide: [{
    segment: "北京 → 西安",
    source_label: "12306",
    selected: { id: "G1", time: "09:00", duration: "4小时", price: "¥500" }
  }],
  budget: { rows: [{ label: "合计", value: "¥1800" }], selected_transport_total: 500 },
  tips: ["<em>提示</em>", "带证件"],
  overview_notes: ["带证件"],
  disclaimer: "参考规划",
  map_anchors: [{ order: 1, title: "故宫", lat: 39.9, lng: 116.4, color: "#c96442" }]
};

test("trip page escapes untrusted package fields", () => {
  const html = Render.renderTripPage(samplePkg);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /<em>提示<\/em>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /noindex|专属行程|data-action="download-pdf"/);
  assert.match(html, /高德打开|复制地点|下一站路线|小红书参考/);
});

test("overview desktop keeps map-first three column structure markers", () => {
  const html = Render.renderOverviewDesktop(samplePkg);
  assert.match(html, /trip-overview-grid/);
  assert.match(html, /每日摘要/);
  assert.match(html, /data-trip-map="overview"/);
  assert.match(html, /关键数据/);
  assert.match(html, /道路数据/);
  assert.match(html, /估算连线/);
});

test("png sheet is vertical overview content", () => {
  const html = Render.renderOverviewPngSheet(samplePkg);
  assert.match(html, /trip-png-sheet/);
  assert.match(html, /扫码打开行程/);
  assert.match(html, /D1/);
});

test("printable document includes overview and daily sections", () => {
  const html = Render.renderPrintableDocument(samplePkg);
  assert.match(html, /trip-overview-desktop/);
  assert.match(html, /print-day/);
  assert.match(html, /费用与提示/);
});
