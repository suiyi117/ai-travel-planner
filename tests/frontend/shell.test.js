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

test("timeline cards use marker time and card-meta footer", () => {
  assert.match(appJs, /class="timeline-marker"/);
  assert.match(appJs, /class="item-time"/);
  assert.match(appJs, /class="card-meta"/);
  // Time lives in the marker column only — not inside the itinerary-card body.
  assert.doesNotMatch(
    appJs,
    /itinerary-card[\s\S]{0,200}class="item-time"/
  );
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

test("step1 route editor keeps sticky actions, map drawer, and a11y hooks", () => {
  assert.match(indexHtml, /id="cityInput"/);
  assert.match(indexHtml, /for="cityInput"[^>]*>\s*城市路线\s*</);
  assert.match(indexHtml, /id="cityInputError"[^>]*aria-live="polite"/);
  assert.match(indexHtml, /id="routeShapeGroup"/);
  assert.match(indexHtml, /role="radiogroup"/);
  assert.match(indexHtml, /id="departureDate"/);
  assert.match(indexHtml, /id="wizardNextBtn"/);
  assert.match(indexHtml, /id="stepRouteActions"/);
  assert.match(indexHtml, /wizard-sticky-actions/);
  assert.match(indexHtml, /id="wizardNextReason"/);
  assert.match(indexHtml, /id="stickyRouteLine"/);
  assert.match(indexHtml, /id="mapDrawer"/);
  assert.match(stylesCss, /wizard-sticky-actions/);
  assert.match(stylesCss, /position:\s*sticky/);
  assert.match(stylesCss, /safe-area-inset-bottom/);
  assert.match(stylesCss, /\.city-actions \.btn-icon\s*\{[^}]*min-width:\s*44px/ms);
  // Map remains on-demand drawer, not a permanent Step 1 pane.
  assert.match(stylesCss, /\.map-drawer\s*\{[^}]*position:\s*fixed/ms);
  assert.match(appJs, /canAddCity/);
  assert.match(appJs, /removeCityWithUndo/);
  assert.match(appJs, /syncStep1NextButton/);
  assert.match(indexHtml, /app\.js/);
  // Boundary modules load before app.js orchestration.
  const wizardIdx = indexHtml.indexOf("wizard.js");
  const appIdx = indexHtml.indexOf("app.js");
  assert.ok(wizardIdx > -1 && appIdx > wizardIdx);
});

test("step1 route settings stay staged until regeneration", () => {
  assert.match(
    indexHtml,
    /id="routeShapeHelp"[^>]*>\s*单程将在最后一站结束。\s*</
  );
  assert.doesNotMatch(
    indexHtml,
    /id="routeShapeHelp"[^>]*>[^<]*从最后一站返回出发地/
  );
  assert.match(appJs, /Wizard\.isSetupWizardStep\?\.\(state\.wizardStep\)/);
  assert.match(
    appJs,
    /departureDate\.addEventListener\('change',[\s\S]{0,180}updateGenerateCta\(\)/
  );
  assert.match(
    appJs,
    /departureDate\.addEventListener\('input',[\s\S]{0,180}updateGenerateCta\(\)/
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
