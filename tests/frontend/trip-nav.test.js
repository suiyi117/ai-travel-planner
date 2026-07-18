const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../../static/js/delivery/trip-nav.js");

const {
  amapPoiUrl,
  amapRouteUrl,
  nextStop,
  buildItemActions,
  dayPlainText,
  isInAppBrowser,
  isMobileDevice,
  resolveActionLink,
  xhsAppUrl,
  dianpingAppUrl,
  inAppBrowserHint
} = window.AeroTravelTripNav;

test("amap poi url prefers gaode https marker link", () => {
  const url = amapPoiUrl("故宫", 39.9, 116.4, "东城区");
  assert.match(url, /^https:\/\/uri\.amap\.com\/marker\?/);
  assert.match(url, /position=116\.4,39\.9/);
  assert.match(url, /callnative=1/);
});

test("amap route url uses navigation endpoint with at most two points", () => {
  const url = amapRouteUrl(
    { name: "故宫", lat: 39.9, lng: 116.4 },
    { name: "景山", lat: 39.92, lng: 116.39 },
    "walk"
  );
  assert.match(url, /^https:\/\/uri\.amap\.com\/navigation\?/);
  assert.match(url, /mode=walk/);
  assert.match(url, /from=116\.4,39\.9/);
  assert.match(url, /to=116\.39,39\.92/);
});

test("nextStop skips transport items", () => {
  const items = [
    { type: "transport", title: "转场" },
    { type: "spot", title: "A" },
    { type: "transport", title: "地铁" },
    { type: "spot", title: "B" }
  ];
  assert.equal(nextStop(items, 1).item.title, "B");
  assert.equal(nextStop(items, 3), null);
});

test("buildItemActions exposes copy and external fallbacks", () => {
  const actions = buildItemActions(
    { title: "故宫", city: "北京", address: "东城区", lat: 39.9, lng: 116.4 },
    { title: "景山", lat: 39.92, lng: 116.39 }
  );
  const ids = actions.map(action => action.id);
  assert.ok(ids.includes("amap-open"));
  assert.ok(ids.includes("next-route"));
  assert.ok(ids.includes("copy-address"));
  assert.ok(ids.includes("xhs-search"));
  assert.ok(ids.includes("web-search"));
});

test("dayPlainText keeps executable day summary", () => {
  const text = dayPlainText({
    day: 1,
    date: "2026-08-01",
    city: "北京",
    weather: "晴",
    items: [{ time: "09:30", duration: "2小时", title: "故宫", address: "东城区" }]
  });
  assert.match(text, /Day 1 · 2026-08-01 · 北京/);
  assert.match(text, /故宫/);
  assert.match(text, /地址：东城区/);
});

test("isInAppBrowser detects wechat and qq containers", () => {
  assert.equal(isInAppBrowser("Mozilla/5.0 MicroMessenger/8.0.0"), true);
  assert.equal(isInAppBrowser("Mozilla/5.0 QQ/9.0.0"), true);
  assert.equal(isInAppBrowser("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36"), false);
  assert.match(inAppBrowserHint(), /系统浏览器/);
});

test("mobile content links prefer native apps and keep web fallbacks", () => {
  const actions = buildItemActions({ title: "故宫", city: "北京" });
  const xhs = actions.find(action => action.id === "xhs-search");
  const dianping = actions.find(action => action.id === "dianping-search");

  assert.match(xhsAppUrl("故宫", "北京"), /^xhsdiscover:\/\/search\/result\?/);
  assert.match(dianpingAppUrl("故宫", "北京"), /^dianping:\/\/searchshoplist\?/);
  assert.match(xhs.fallbackHref, /^https:\/\/www\.xiaohongshu\.com\//);
  assert.match(dianping.fallbackHref, /^https:\/\/www\.dianping\.com\//);
  assert.equal(isMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile"), true);
  assert.equal(isMobileDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140"), false);

  const mobile = resolveActionLink(xhs, "Mozilla/5.0 (Linux; Android 16) Mobile");
  assert.equal(mobile.attemptsApp, true);
  assert.equal(mobile.href, xhs.appHref);
  assert.equal(mobile.fallbackHref, xhs.fallbackHref);

  const desktop = resolveActionLink(xhs, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
  assert.equal(desktop.attemptsApp, false);
  assert.equal(desktop.href, xhs.fallbackHref);
});
