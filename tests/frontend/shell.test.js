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

test("fold triggers and timeline phase-3 visual hooks are present", () => {
  assert.match(indexHtml, /\.fold-trigger\s*\{[^}]*appearance:\s*none/s);
  assert.match(indexHtml, /\.timeline-marker/);
  assert.match(indexHtml, /grid-template-columns:\s*88px/);
  assert.match(appJs, /class="timeline-marker"/);
  assert.match(appJs, /class="item-time"/);
  assert.match(appJs, /data-open-map-item/);
  assert.match(appJs, /role="button"[^>]*data-item=/);
});

test("workspace chrome keeps a single trip status bar with edit actions", () => {
  assert.match(appJs, /topbarSummary\.hidden\s*=\s*true/);
  assert.match(appJs, /workspaceStatusRoute/);
  assert.match(indexHtml, /id="workspaceEditRouteBtn"/);
  assert.match(indexHtml, /id="workspaceEditPrefsBtn"/);
  assert.match(stylesCss, /data-wizard-step="1"\] \.wizard-shell/);
});

test("candidate optimization panel uses a stable wizard results mount", () => {
  assert.match(indexHtml, /id="candidateDiffPanel"/);
  assert.doesNotMatch(appJs, /\.results-pane \.pane-body/);
  // Reject the removed legacy module path, not names like trip-share-render.js.
  assert.doesNotMatch(indexHtml, /["'/]render\.js(?:\?|"|')/);
});

test("topbar uses compact accessible action menus", () => {
  assert.match(indexHtml, /id="exportMenuBtn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(indexHtml, /id="exportMenuPanel"[^>]*role="menu"[^>]*hidden/);
  assert.match(indexHtml, /id="mobileMoreBtn"[^>]*aria-label="更多操作"[^>]*aria-expanded="false"/);
  assert.match(indexHtml, /data-action="copy"/);
  assert.match(indexHtml, /data-action="export-image"/);
  assert.match(indexHtml, /data-action="export-overview"/);
  assert.match(indexHtml, /data-action="export-pdf"/);
  assert.match(indexHtml, /data-action="publish-trip"/);
  assert.match(indexHtml, /data-action="preview-trip"/);
  assert.match(indexHtml, /data-action="export-ics"/);
  assert.match(indexHtml, /trip-package\.js/);
  assert.match(indexHtml, /trip-publish\.js/);
  assert.match(indexHtml, /trip-share\.css/);
  assert.doesNotMatch(indexHtml, /id="(?:copyPlanBtn|exportLongImageBtn|exportIcsBtn)"/);
});

test("desktop toast is anchored away from the topbar", () => {
  assert.match(
    stylesCss,
    /\.toast\s*\{[^}]*top:\s*auto;[^}]*right:\s*24px;[^}]*bottom:\s*24px;/ms
  );
});

test("parchment design tokens match visual polish spec", () => {
  // Surfaces: warm cream, never pure white page/card base in :root
  assert.match(indexHtml, /--bg:\s*#f5f4ed/i);
  assert.match(indexHtml, /--surface:\s*#fffcf5/i);
  assert.match(indexHtml, /--surface-warm:\s*#f0ebe3/i);
  assert.match(indexHtml, /--fg:\s*#1a1916/i);
  assert.match(indexHtml, /--muted:\s*#6b6862/i);
  assert.match(indexHtml, /--meta:\s*#8a8680/i);
  assert.match(indexHtml, /--border:\s*#e5e1d6/i);
  assert.match(indexHtml, /--accent:\s*#c96442/i);
  assert.doesNotMatch(indexHtml, /--surface:\s*#ffffff/i);
  assert.doesNotMatch(indexHtml, /--accent:\s*#c25432/i);
});

test("display and mono font stacks are real webfonts", () => {
  assert.match(indexHtml, /Noto Serif SC/);
  assert.match(indexHtml, /Noto Sans SC/);
  assert.match(indexHtml, /JetBrains Mono/);
  assert.match(indexHtml, /--font-display:\s*[^;]*Noto Serif SC/i);
  assert.match(indexHtml, /--font-body:\s*[^;]*Noto Sans SC/i);
  assert.match(indexHtml, /--font-mono:\s*[^;]*JetBrains Mono/i);
});
