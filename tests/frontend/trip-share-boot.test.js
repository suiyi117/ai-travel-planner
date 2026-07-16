const test = require("node:test");
const assert = require("node:assert/strict");

const previewPackage = { id: "preview-1", title: "Preview trip", days: [] };

global.window = {};
global.document = {
  readyState: "loading",
  addEventListener() {}
};
global.sessionStorage = {
  getItem() {
    return null;
  }
};
global.localStorage = {
  getItem(key) {
    return key === "aerotravel:trip-share-preview"
      ? JSON.stringify(previewPackage)
      : null;
  }
};
global.location = { search: "?preview=1" };

require("../../static/trip-share-boot.js");

test("preview pages can load the package saved by the opener tab", () => {
  assert.deepEqual(window.AeroTravelTripShareBoot.loadPackage(), previewPackage);
});
