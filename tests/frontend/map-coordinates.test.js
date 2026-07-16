const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/map.js");

const MapUtils = window.AeroTravelMap;

test("GCJ-02 display coordinates round-trip through WGS84", () => {
  const gcj = [34.2655, 108.9531];
  const wgs = MapUtils.gcj02ToWgs84(gcj);
  const roundTrip = MapUtils.wgs84ToGcj02(wgs);

  assert.ok(Math.abs(gcj[0] - wgs[0]) > 0.001);
  assert.ok(Math.abs(gcj[1] - wgs[1]) > 0.001);
  assert.ok(Math.abs(gcj[0] - roundTrip[0]) < 1e-6);
  assert.ok(Math.abs(gcj[1] - roundTrip[1]) < 1e-6);
});

test("coordinates outside China remain unchanged", () => {
  const london = [51.5074, -0.1278];
  assert.deepEqual(MapUtils.gcj02ToWgs84(london), london);
  assert.deepEqual(MapUtils.wgs84ToGcj02(london), london);
});

test("vector labels replace bilingual names with Chinese-priority fields", () => {
  const updates = [];
  MapUtils.applyChineseLabels({
    getStyle() {
      return {
        layers: [
          { id: "city", type: "symbol", layout: { "text-field": ["concat", ["get", "name:latin"], ["get", "name:nonlatin"]] } },
          { id: "road-shield", type: "symbol", layout: { "text-field": ["get", "ref"] } },
          { id: "road", type: "line", layout: {} }
        ]
      };
    },
    setLayoutProperty(id, property, value) {
      updates.push({ id, property, value });
    }
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "city");
  assert.equal(updates[0].property, "text-field");
  assert.deepEqual(updates[0].value, [
    "coalesce",
    ["get", "name:zh-Hans"],
    ["get", "name:zh"],
    ["get", "name:nonlatin"],
    ["get", "name"]
  ]);
});
