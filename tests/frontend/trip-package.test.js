const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/trip-package.js");

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
    addDays: (date, offset) => {
      const base = new Date(`${date}T00:00:00`);
      base.setDate(base.getDate() + offset);
      return base.toISOString().slice(0, 10);
    }
  });
  assert.equal(value, "2026-09-01");
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
  assert.equal(req.width, 640);
  assert.equal(req.height, 640);
});
