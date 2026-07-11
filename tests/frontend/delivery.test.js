const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/delivery.js");

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

function deliveryContext() {
  return {
    route: "北京 → 西安",
    totalDays: 2,
    budget: "舒适型",
    departureDate: "2026-07-20",
    addDays: (date, offset) => `${date}+${offset}`,
    weatherForDay: () => ({ dayweather: "晴", nighttemp: "22", daytemp: "31" }),
    normalizeType: type => type === "spot" ? "景点" : type,
    transportDisplay: item => ({ time: item.time, extra: "" }),
    selectedOption: () => ({ id: "G1", time: "09:00", duration: "4小时", price: "¥500" }),
    selectedTransportTotal: 500,
    escapeHtml,
  };
}

test("delivery text keeps customer-facing itinerary sections", () => {
  const text = window.AeroTravelDelivery.buildDeliveryText({
    title: "双城行程",
    summary: "轻松游览",
    days: [{
      day: 1,
      city: "北京",
      route: "故宫 → 景山",
      items: [{ type: "spot", time: "09:00", duration: "2小时", title: "故宫", desc: "参观", address: "东城区" }],
    }],
    transport_guide: [{ segment: "北京 → 西安", source_label: "12306", options: [{}] }],
    budget: { transport: "¥500", total: "¥1800" },
    tips: ["提前预约"],
  }, deliveryContext());

  assert.match(text, /【行程概览】北京 → 西安 · 2天 · 舒适型/);
  assert.match(text, /【城际交通】/);
  assert.match(text, /已选交通参考合计：约 ¥500/);
  assert.match(text, /【温馨说明】/);
});

test("delivery sheet escapes untrusted itinerary fields", () => {
  const html = window.AeroTravelDelivery.buildDeliverySheetHtml({
    title: "<img src=x onerror=alert(1)>",
    summary: "<script>alert(1)</script>",
    days: [{
      day: "<iframe src=x>",
      city: "北京",
      route: "<b>路线</b>",
      items: [{ type: "spot", time: "09:00", duration: "2小时", title: "<svg onload=alert(1)>", desc: "说明", address: "地址" }],
    }],
    transport_guide: [],
    budget: {},
    tips: ["<em>提示</em>"],
  }, deliveryContext());

  assert.doesNotMatch(html, /<img|<script|<svg|<iframe|<em>提示/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /Day &lt;iframe src=x&gt;/);
  assert.match(html, /&lt;em&gt;提示&lt;\/em&gt;/);
});
