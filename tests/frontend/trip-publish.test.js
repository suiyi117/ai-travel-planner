const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {
  AeroTravelTripShareRender: {
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  },
  AeroTravelTripPackage: {
    generateShareToken: () => "GeneratedToken123456"
  }
};
require("../../static/trip-publish.js");

const { buildSelfContainedHtml } = window.AeroTravelTripPublish;

test("self-contained html embeds package, noindex and inlined runtime", () => {
  const html = buildSelfContainedHtml({
    id: "Tok123",
    title: "测试行程<script>",
    days: []
  }, {
    css: ".trip-share-app{color:red}",
    scripts: {
      nav: "window.AeroTravelTripNav = {};",
      render: "window.AeroTravelTripShareRender = window.AeroTravelTripShareRender || {};",
      boot: "window.AeroTravelTripShareBoot = {};"
    }
  });

  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /window\.__TRIP_PACKAGE__/);
  assert.match(html, /Tok123/);
  assert.match(html, /\\u003cscript\\u003e|测试行程&lt;script&gt;/);
  assert.match(html, /\.trip-share-app\{color:red\}/);
  assert.match(html, /AeroTravelTripNav/);
  assert.doesNotMatch(html, /window\.__TRIP_PACKAGE__ = .*<script>/);
});
