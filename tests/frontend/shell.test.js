const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "static/index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "static/styles.css"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "static/app.js"), "utf8");

test("hidden elements stay out of layout even when component styles set display", () => {
  assert.match(
    stylesCss,
    /^\[hidden\]\s*\{[^}]*display:\s*none\s*!important;?[^}]*\}/ms
  );
});

test("candidate optimization panel uses a stable wizard results mount", () => {
  assert.match(indexHtml, /id="candidateDiffPanel"/);
  assert.doesNotMatch(appJs, /\.results-pane \.pane-body/);
  assert.doesNotMatch(indexHtml, /render\.js/);
});

test("topbar uses compact accessible action menus", () => {
  assert.match(indexHtml, /id="exportMenuBtn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(indexHtml, /id="exportMenuPanel"[^>]*role="menu"[^>]*hidden/);
  assert.match(indexHtml, /id="mobileMoreBtn"[^>]*aria-label="更多操作"[^>]*aria-expanded="false"/);
  assert.match(indexHtml, /data-action="copy"/);
  assert.match(indexHtml, /data-action="export-image"/);
  assert.match(indexHtml, /data-action="export-ics"/);
  assert.doesNotMatch(indexHtml, /id="(?:copyPlanBtn|exportLongImageBtn|exportIcsBtn)"/);
});

test("desktop toast is anchored away from the topbar", () => {
  assert.match(
    stylesCss,
    /\.toast\s*\{[^}]*top:\s*auto;[^}]*right:\s*24px;[^}]*bottom:\s*24px;/ms
  );
});
