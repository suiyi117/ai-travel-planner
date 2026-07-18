const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/js/delivery/trip-package.js");

const { buildTripPackage, generateShareToken } = window.AeroTravelTripPackage;

function samplePlan() {
  return {
    title: "京西双城",
    summary: "轻松节奏",
    days: [{
      day: 1,
      city: "北京",
      route: "故宫 → 景山",
      items: [
        {
          id: "d1-1",
          type: "spot",
          time: "09:30",
          title: "故宫",
          desc: "参观",
          duration: "2小时",
          address: "东城区",
          lat: 39.9163,
          lng: 116.3972
        },
        {
          id: "d1-2",
          type: "hotel",
          time: "20:00",
          title: "王府井住宿",
          duration: "过夜",
          lat: 39.91,
          lng: 116.41
        }
      ]
    }],
    transport_guide: [{
      segment: "北京 → 西安",
      tool: "train",
      source_label: "12306",
      advice: "上午出发",
      options: [{ id: "G1", time: "09:00-13:00", duration: "4小时", price: "¥500" }]
    }],
    budget: { transport: "¥500", total: "¥1800" },
    tips: ["提前预约", "带身份证"]
  };
}

test("generateShareToken returns high-entropy opaque path token", () => {
  const token = generateShareToken(20);
  assert.equal(token.length, 20);
  assert.match(token, /^[A-Za-z0-9]+$/);
  assert.notEqual(generateShareToken(20), token);
});

test("buildTripPackage creates single-source delivery snapshot", () => {
  const pkg = buildTripPackage(samplePlan(), {
    route: "北京 → 西安",
    totalDays: 2,
    budget: "舒适型",
    departureDate: "2026-08-01",
    addDays: (date, offset) => `${date}+${offset}`,
    weatherForDay: () => ({ dayweather: "晴", nighttemp: "22", daytemp: "31" }),
    transportDisplay: item => ({ time: item.time, extra: "" }),
    selectedOption: () => ({ id: "G1", time: "09:00-13:00", duration: "4小时", price: "¥500", from_station: "北京西", to_station: "西安北" }),
    selectedTransportTotal: 500,
    token: "TestToken1234567890"
  });

  assert.equal(pkg.schema_version, 1);
  assert.equal(pkg.id, "TestToken1234567890");
  assert.equal(pkg.path, "/t/TestToken1234567890");
  assert.equal(pkg.meta.noindex, true);
  assert.equal(pkg.meta.readonly, true);
  assert.equal(pkg.days.length, 1);
  assert.equal(pkg.days[0].weather, "晴 22~31℃");
  assert.equal(pkg.days[0].anchors.length, 2);
  assert.equal(pkg.days[0].anchors[0].order, 1);
  assert.equal(pkg.transport_guide[0].selected.id, "G1");
  assert.match(pkg.disclaimer, /证件号/);
  assert.equal(pkg.budget.selected_transport_total, 500);
});

test("buildTripPackage limits overview anchors and strips empty tips", () => {
  const plan = samplePlan();
  plan.days[0].items = Array.from({ length: 8 }, (_, i) => ({
    id: `x${i}`,
    type: "spot",
    title: `点${i}`,
    lat: 39.9 + i * 0.01,
    lng: 116.4 + i * 0.01
  }));
  plan.tips = ["有效", "", null, "另一条"];
  const pkg = buildTripPackage(plan, { totalDays: 1 });
  assert.equal(pkg.days[0].anchors.length, 5);
  assert.deepEqual(pkg.tips, ["有效", "另一条"]);
});

test("buildTripPackage passes share_url and valid_until", () => {
  const pkg = buildTripPackage(samplePlan(), {
    shareUrl: "https://trip.example/t/abc.html",
    validUntil: "2026-09-01",
    token: "ShareMetaToken123456"
  });
  assert.equal(pkg.share_url, "https://trip.example/t/abc.html");
  assert.equal(pkg.valid_until, "2026-09-01");
});

test("buildTripPackage builds estimate route_lines from anchors by default", () => {
  const pkg = buildTripPackage(samplePlan(), { totalDays: 1 });
  assert.ok(Array.isArray(pkg.route_lines));
  assert.ok(pkg.route_lines.length >= 1);
  assert.equal(pkg.route_lines[0].status, "estimate");
  assert.ok(pkg.route_lines[0].points.length >= 2);
});

test("buildTripPackage prefers driving route provider polylines", () => {
  const pkg = buildTripPackage(samplePlan(), {
    totalDays: 1,
    drivingRoute: {
      status: "provider",
      polyline: [
        [39.9, 116.4],
        [39.91, 116.41],
        [39.92, 116.42]
      ]
    }
  });
  assert.equal(pkg.route_lines.length, 1);
  assert.equal(pkg.route_lines[0].status, "provider");
  assert.equal(pkg.route_lines[0].day, null);
  assert.equal(pkg.route_lines[0].points.length, 3);
});

test("defaultValidUntil adds retention after trip end", () => {
  const { defaultValidUntil } = window.AeroTravelTripPackage;
  const value = defaultValidUntil("2026-08-01", 3, {
    keepDays: 30,
    // Use UTC calendar math so CI (UTC) and local TZ agree.
    addDays: (date, offset) => {
      const [y, m, d] = String(date).split("-").map(Number);
      const base = new Date(Date.UTC(y, m - 1, d));
      base.setUTCDate(base.getUTCDate() + offset);
      const year = base.getUTCFullYear();
      const month = String(base.getUTCMonth() + 1).padStart(2, "0");
      const day = String(base.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  });
  // 2026-08-01 + (3-1) + 30 = +32 days => 2026-09-02
  assert.equal(value, "2026-09-02");
});

test("normalizeRefs keeps max 3 https urls and drops invalid", () => {
  const { normalizeRefs } = window.AeroTravelTripPackage;
  const refs = normalizeRefs([
    { label: "笔记", url: "https://xhslink.com/a", kind: "xhs" },
    { label: "坏", url: "javascript:alert(1)" },
    { url: "http://example.com/b" },
    { label: "四", url: "https://example.com/c" },
    { label: "五", url: "https://example.com/d" }
  ]);
  assert.equal(refs.length, 3);
  assert.equal(refs[0].kind, "xhs");
  assert.equal(refs[1].url, "http://example.com/b");
  assert.equal(refs[2].url, "https://example.com/c");
});

test("buildTripPackage attaches static_map when provided", () => {
  const pkg = buildTripPackage(samplePlan(), {
    token: "StaticMapToken1234567",
    staticMap: {
      data_url: "data:image/png;base64,AAA",
      status: "ready",
      width: 640,
      height: 640,
      note: "道路数据"
    }
  });
  assert.equal(pkg.static_map.status, "ready");
  assert.match(pkg.static_map.data_url, /^data:image\/png;base64,/);
});

test("buildStaticMapRequest caps markers at 10 and prefers overview route line", () => {
  const { buildStaticMapRequest } = window.AeroTravelTripPackage;
  const anchors = Array.from({ length: 12 }, (_, i) => ({
    order: i + 1,
    day: Math.floor(i / 3) + 1,
    type: "spot",
    title: `P${i}`,
    lat: 39.9 + i * 0.01,
    lng: 116.4 + i * 0.01
  }));
  const req = buildStaticMapRequest({
    map_anchors: anchors,
    route_lines: [{
      day: null,
      status: "provider",
      points: [[39.9, 116.4], [39.91, 116.41], [39.92, 116.42]]
    }]
  });
  assert.equal(req.markers.length, 10);
  assert.equal(req.path.length, 3);
  assert.equal(req.width, 1024);
  assert.equal(req.height, 1024);
});

test("buildDaySummary prefers attraction titles over city-level day.route", () => {
  const { buildDaySummary } = window.AeroTravelTripPackage;
  const summary = buildDaySummary("全天在淮北市区游玩", [
    { title: "相山公园", type: "spot" },
    { title: "隋唐运河古镇", type: "experience" },
    { title: "风味美食：牛肉汤", type: "food" }
  ]);
  assert.equal(summary, "相山公园 · 隋唐运河古镇");
});

test("buildDaySummary falls back to route when no anchors", () => {
  const { buildDaySummary } = window.AeroTravelTripPackage;
  assert.equal(buildDaySummary("全天在淮北市区游玩", []), "全天在淮北市区游玩");
});

test("selectDayAnchors prefers spots over synthetic food/hotel", () => {
  const { selectDayAnchors } = window.AeroTravelTripPackage;
  const anchors = selectDayAnchors([
    { id: "f", type: "food", title: "风味美食：牛肉汤", lat: 33.95, lng: 116.79 },
    { id: "h", type: "hotel", title: "住宿区域：淮北市区", lat: 33.94, lng: 116.80 },
    { id: "s1", type: "experience", title: "相山公园", lat: 33.96, lng: 116.78 },
    { id: "s2", type: "spot", title: "隋唐运河古镇", lat: 33.97, lng: 116.77 }
  ], 1, 5);
  assert.equal(anchors[0].title, "相山公园");
  assert.equal(anchors[1].title, "隋唐运河古镇");
  assert.ok(anchors.some(a => a.title === "住宿区域：淮北市区"));
});

test("selectOverviewMarkers diversifies across days under cap 10", () => {
  const { selectOverviewMarkers } = window.AeroTravelTripPackage;
  const anchors = [];
  for (let day = 1; day <= 4; day += 1) {
    for (let i = 0; i < 5; i += 1) {
      anchors.push({
        day,
        order: i + 1,
        type: "spot",
        title: `D${day}-P${i}`,
        lat: 30 + day + i * 0.01,
        lng: 110 + day + i * 0.01
      });
    }
  }
  const selected = selectOverviewMarkers(anchors, 10);
  assert.equal(selected.length, 10);
  const days = new Set(selected.map(a => a.day));
  assert.equal(days.size, 4);
  assert.ok([...days].every(d => selected.filter(a => a.day === d).length >= 2));
});

test("buildStaticMapRequest diversifies multi-day markers", () => {
  const { buildStaticMapRequest } = window.AeroTravelTripPackage;
  const anchors = [];
  for (let day = 1; day <= 3; day += 1) {
    for (let i = 0; i < 5; i += 1) {
      anchors.push({
        day,
        order: i + 1,
        type: "spot",
        title: `D${day}-P${i}`,
        lat: 30 + day,
        lng: 110 + day + i * 0.01
      });
    }
  }
  const req = buildStaticMapRequest({ map_anchors: anchors, route_lines: [] });
  assert.equal(req.markers.length, 10);
  const lats = new Set(req.markers.map(m => m.lat));
  assert.ok(lats.size >= 3);
});

test("buildTripPackage summary uses attraction titles not city prose", () => {
  const plan = {
    title: "皖鄂自驾",
    days: [{
      day: 1,
      city: "淮北",
      route: "全天在淮北市区游玩，当晚住淮北。",
      items: [
        { id: "a", type: "experience", title: "相山公园", lat: 33.96, lng: 116.78 },
        { id: "b", type: "spot", title: "隋唐运河古镇", lat: 33.97, lng: 116.77 },
        { id: "c", type: "food", title: "风味美食：牛肉汤", lat: 33.95, lng: 116.79 }
      ]
    }],
    tips: []
  };
  const pkg = buildTripPackage(plan, { totalDays: 1 });
  assert.equal(pkg.days[0].summary, "相山公园 · 隋唐运河古镇");
  assert.match(pkg.days[0].route, /淮北市区/);
});

test("estimate overview uses one representative point per day", () => {
  const { estimateRouteLinesFromDays } = window.AeroTravelTripPackage;
  const packageDays = [
    {
      day: 1,
      anchors: [
        { type: "spot", title: "A1", order: 1, lat: 33.9, lng: 116.7 },
        { type: "spot", title: "A2", order: 2, lat: 33.91, lng: 116.71 }
      ]
    },
    {
      day: 2,
      anchors: [
        { type: "spot", title: "B1", order: 1, lat: 31.8, lng: 117.2 },
        { type: "hotel", title: "B-hotel", order: 2, lat: 31.81, lng: 117.21 }
      ]
    },
    {
      day: 3,
      anchors: [
        { type: "experience", title: "C1", order: 1, lat: 30.5, lng: 117.5 }
      ]
    }
  ];
  const lines = estimateRouteLinesFromDays(packageDays);
  const overview = lines.find(l => l.day == null);
  assert.ok(overview);
  assert.equal(overview.status, "estimate");
  assert.equal(overview.points.length, 3);
});

test("simplifyPath keeps endpoints and reduces long polylines", () => {
  const { simplifyPath } = window.AeroTravelTripPackage;
  const points = Array.from({ length: 200 }, (_, i) => [30 + i * 0.01, 110 + Math.sin(i / 8) * 0.2]);
  const simplified = simplifyPath(points, 40);
  assert.ok(simplified.length <= 40);
  assert.ok(simplified.length >= 2);
  assert.deepEqual(simplified[0], points[0]);
  assert.deepEqual(simplified[simplified.length - 1], points[points.length - 1]);
});
