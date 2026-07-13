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
  valid_until: "2026-09-01",
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
  assert.match(html, /费用估算/);
  assert.match(html, /重要提示/);
  assert.match(html, /trip-side-card/);
  assert.match(html, /trip-weather-chip/);
  assert.match(html, /扫码打开/);
  assert.doesNotMatch(html, /关键数据/);
  assert.match(html, /道路数据/);
  assert.match(html, /估算连线/);
  assert.match(html, /建议保留至 2026-09-01/);
  assert.match(html, /data-inapp-banner/);
});

test("overview side budget rows use modular label/value classes", () => {
  const html = Render.renderOverviewDesktop({
    ...samplePkg,
    budget: {
      rows: [
        { label: "交通", value: "自驾油费+过路费约570元（按一车4人摊，人均约143元）" },
        { label: "合计", value: "人均约1753元" }
      ]
    }
  });
  assert.match(html, /trip-budget-label/);
  assert.match(html, /trip-budget-value/);
  assert.match(html, /is-total/);
  assert.match(html, /人均约1753元/);
});

test("daily sections use day badge and timeline item cards", () => {
  const html = Render.renderTripPage(samplePkg);
  assert.match(html, /trip-section-break/);
  assert.match(html, /每日行程/);
  assert.match(html, /trip-day-badge/);
  assert.match(html, /trip-item-rail/);
  assert.match(html, /trip-item-card/);
  assert.match(html, /trip-type-chip/);
  assert.match(html, /D1/);
});

test("printable day pages use modular header and item structure", () => {
  const html = Render.renderPrintableDocument(samplePkg);
  assert.match(html, /print-day-header/);
  assert.match(html, /print-item-list/);
  assert.match(html, /print-item-time/);
  assert.match(html, /trip-day-badge/);
  assert.doesNotMatch(html, /Day 1 · 北京/);
});

test("png sheet is vertical overview content", () => {
  const html = Render.renderOverviewPngSheet(samplePkg);
  assert.match(html, /trip-png-sheet/);
  assert.match(html, /扫码打开行程/);
  assert.match(html, /D1/);
});

test("png sheet day rows prefer attraction titles over city prose summary", () => {
  const html = Render.renderOverviewPngSheet({
    ...samplePkg,
    days: [{
      day: 1,
      city: "淮北",
      route: "全天在淮北市区游玩",
      summary: "全天在淮北市区游玩，当晚住淮北。",
      anchors: [
        { order: 1, title: "相山公园", type: "spot", lat: 33.9, lng: 116.7 },
        { order: 2, title: "隋唐运河古镇", type: "experience", lat: 33.91, lng: 116.71 },
        { order: 3, title: "风味美食：牛肉汤", type: "food", lat: 33.92, lng: 116.72 }
      ],
      items: []
    }]
  });
  assert.match(html, /相山公园/);
  assert.match(html, /隋唐运河古镇/);
  assert.doesNotMatch(html, /全天在淮北市区游玩/);
  assert.doesNotMatch(html, /牛肉汤/);
});

test("png sheet uses static_map image when ready", () => {
  const html = Render.renderOverviewPngSheet({
    ...samplePkg,
    static_map: {
      status: "ready",
      data_url: "data:image/png;base64,AAA",
      width: 640,
      height: 640
    }
  });
  assert.match(html, /png-static-map/);
  assert.match(html, /data:image\/png;base64,AAA/);
});

test("png sheet falls back when static_map unavailable", () => {
  const html = Render.renderOverviewPngSheet({
    ...samplePkg,
    static_map: { status: "unavailable", data_url: "" }
  });
  assert.match(html, /地图见专属链接|png-map-fallback/);
  assert.doesNotMatch(html, /png-static-map/);
});

test("printable document includes overview and daily sections", () => {
  const html = Render.renderPrintableDocument(samplePkg);
  assert.match(html, /trip-overview-desktop/);
  assert.match(html, /print-day/);
  assert.match(html, /费用与提示/);
});

test("printable document uses static_map when ready", () => {
  const html = Render.renderPrintableDocument({
    ...samplePkg,
    static_map: {
      status: "ready",
      data_url: "data:image/png;base64,BBB",
      width: 640,
      height: 640
    }
  });
  assert.match(html, /png-static-map|print-static-map/);
  assert.match(html, /data:image\/png;base64,BBB/);
});
