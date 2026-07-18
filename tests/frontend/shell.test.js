const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "static/index.html"), "utf8");
const tokensCss = fs.readFileSync(path.join(repoRoot, "static/css/tokens.css"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "static/css/styles.css"), "utf8");
const workspaceCss = fs.readFileSync(path.join(repoRoot, "static/css/workspace.css"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "static/js/app.js"), "utf8");
const tripShareCss = fs.readFileSync(path.join(repoRoot, 'static/css/trip-share.css'), 'utf8');
const mapJs = fs.readFileSync(path.join(repoRoot, 'static/js/planning/map.js'), 'utf8');
const stateJs = fs.readFileSync(path.join(repoRoot, 'static/js/core/state.js'), 'utf8');
const tripShareBootJs = fs.readFileSync(path.join(repoRoot, 'static/js/delivery/trip-share-boot.js'), 'utf8');
const uiInteractionsJs = fs.readFileSync(
  path.join(repoRoot, "static/js/ui-interactions.js"),
  "utf8"
);

test("hidden elements stay out of layout even when component styles set display", () => {
  assert.match(
    stylesCss,
    /^\[hidden\]\s*\{[^}]*display:\s*none\s*!important;?[^}]*\}/ms
  );
});

test("fold triggers and timeline workspace visual hooks are present", () => {
  assert.match(workspaceCss, /\.fold-trigger\s*\{[^}]*appearance:\s*none/s);
  assert.match(workspaceCss, /\.timeline-marker/);
  assert.match(workspaceCss, /grid-template-columns:\s*88px/);
  assert.match(appJs, /class="timeline-marker"/);
  assert.match(appJs, /class="item-time"/);
  assert.match(appJs, /data-open-map-item/);
  assert.doesNotMatch(appJs, /role="button"[^>]*data-item=/);
  assert.match(appJs, /class="card-select-btn"/);
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

test("reference layout keeps all wizard steps on one measured desktop grid", () => {
  assert.match(tokensCss, /--container-max:\s*1536px/);
  assert.match(tokensCss, /--rail-width:\s*260px/);
  assert.match(tokensCss, /--content-max:\s*1224px/);
  assert.match(indexHtml, /id="routeOverview"[^>]*aria-label="当前路线总览"/);
  assert.match(indexHtml, /id="prefsSummaryRoute"/);
  assert.match(indexHtml, /id="resultsFooterRoute"/);
  assert.match(indexHtml, /id="openMapFooterBtn"/);
  assert.match(appJs, /class="city-list-head"/);
  assert.match(appJs, /class="day-city-group"/);
  assert.match(workspaceCss, /grid-template-columns:\s*var\(--rail-width\) minmax\(0, var\(--content-max\)\)/);
  assert.match(workspaceCss, /grid-template-areas:[\s\S]{0,120}'pace budget'/);
});

test("preference grid keeps transport and self-drive controls top aligned", () => {
  assert.match(
    workspaceCss,
    /#stepPrefs \.wizard-panel-body > \.stack > \.field\s*\{[^}]*align-content:\s*start;/s
  );
});

test("desktop city editor keeps every cell on one explicit grid row", () => {
  assert.match(
    workspaceCss,
    /\.city-card-body\s*\{[^}]*grid-template-areas:\s*'city role days transport actions';/s
  );
  for (const [selector, area] of [
    ["city-title-block", "city"],
    ["city-plan-stay", "role"],
    ["city-days-label", "days"],
    ["city-transport-label", "transport"],
    ["city-actions", "actions"],
  ]) {
    assert.match(
      workspaceCss,
      new RegExp(`\\.${selector}\\s*\\{[^}]*grid-area:\\s*${area};`, "s")
    );
  }
});

test("desktop city editor keeps compact controls clear of row dividers", () => {
  assert.match(
    workspaceCss,
    /\.city-card\s*\{[^}]*min-height:\s*54px;/s
  );
  assert.match(
    workspaceCss,
    /\.city-title-block\s*\{[^}]*min-height:\s*34px;[^}]*display:\s*flex;[^}]*align-items:\s*center;/s
  );
  assert.match(
    workspaceCss,
    /#stepRoute \.city-days-label \.select\s*\{[^}]*min-height:\s*34px;[^}]*height:\s*34px;/s
  );
  assert.match(
    workspaceCss,
    /#stepRoute \.city-transport-label\s*\{[^}]*min-height:\s*34px;[^}]*height:\s*34px;/s
  );
});

test("candidate optimization panel uses a stable wizard results mount", () => {
  assert.match(indexHtml, /id="candidateDiffPanel"/);
  assert.doesNotMatch(appJs, /\.results-pane \.pane-body/);
  // Reject the removed legacy module path, not names like trip-share-render.js.
  assert.doesNotMatch(indexHtml, /["'/]render\.js(?:\?|"|')/);
});

test("edit-mode day tabs stay in one aligned horizontal row", () => {
  assert.match(indexHtml, /class="draft-day-tabs"[^>]*id="draftDayTabs"/);
  assert.match(
    workspaceCss,
    /#resultsEditLayer \.draft-day-tabs\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s
  );
  assert.match(
    workspaceCss,
    /#resultsEditLayer \.draft-day-tabs \.day-tab\s*\{[^}]*flex:\s*0 0 auto;[^}]*display:\s*inline-grid;/s
  );
  assert.match(appJs, /data-draft-day="\$\{day\.day\}"[^>]*aria-pressed=/);
});

test("dedicated trip page avoids short-viewport overlays and clipped map details", () => {
  assert.match(
    tripShareCss,
    /\.trip-journey-actionbar\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*max\(14px, env\(safe-area-inset-bottom\)\);[^}]*transform:\s*translateX\(-50%\);/s
  );
  assert.match(tripShareCss, /\.trip-main\s*\{[^}]*padding:\s*14px 0 130px;/s);
  assert.match(
    tripShareCss,
    /\.trip-map-focus-card\s*\{[^}]*bottom:\s*52px;[^}]*max-height:\s*calc\(100% - 70px\);[^}]*overflow:\s*auto;/s
  );
  assert.doesNotMatch(
    tripShareCss,
    /\.trip-map-focus-card\s*\{[^}]*overflow:\s*hidden;/s
  );
});

test("dedicated trip timeline keeps wrapped headers outside the scroll height", () => {
  assert.match(
    tripShareCss,
    /\.trip-focus-day:not\(\[hidden\]\)\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s
  );
  assert.match(
    tripShareCss,
    /\.trip-focus-timeline\s*\{[^}]*position:\s*relative;[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s
  );
  assert.doesNotMatch(
    tripShareCss,
    /\.trip-focus-timeline\s*\{[^}]*height:\s*calc\(100% - 60px\)/s
  );
});

test("dedicated trip workspace keeps equal taller cards without clipping copy", () => {
  assert.match(tripShareCss, /--trip-focus-workspace-height:\s*540px/);
  assert.match(
    tripShareCss,
    /\.trip-focus-panel\s*\{[^}]*height:\s*var\(--trip-focus-workspace-height\)/s
  );
  assert.match(
    tripShareCss,
    /\.trip-focus-map-panel\s*\{[^}]*height:\s*var\(--trip-focus-workspace-height\)/s
  );
  assert.match(
    tripShareCss,
    /\.trip-focus-day-head p\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s
  );
  assert.match(
    tripShareCss,
    /\.trip-focus-copy > strong\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s
  );
  assert.match(
    tripShareCss,
    /\.trip-map-focus-card \[data-focus-desc\]\s*\{[^}]*display:\s*block;[^}]*overflow-wrap:\s*anywhere;/s
  );
  assert.doesNotMatch(
    tripShareCss,
    /\.trip-map-focus-card \[data-focus-desc\]\s*\{[^}]*-webkit-line-clamp:/s
  );
});

test("dedicated trip mobile controls keep 44px touch targets", () => {
  assert.match(
    tripShareCss,
    /\.trip-share-app \.leaflet-control-zoom a\s*\{[^}]*width:\s*44px !important;[^}]*height:\s*44px !important;/s
  );
  assert.match(
    tripShareCss,
    /\.trip-topbar-actions \.trip-btn\s*\{[^}]*min-height:\s*44px;/s
  );
  assert.match(
    tripShareCss,
    /\.trip-focus-actions \.trip-chip\s*\{[^}]*min-height:\s*44px;/s
  );
  assert.match(
    tripShareCss,
    /\.trip-action-buttons \.trip-btn\s*\{[^}]*min-height:\s*44px;/s
  );
});

test("move-day dialog restores focus after the editor rerenders", () => {
  assert.match(
    indexHtml,
    /id="itineraryEditor"[^>]*tabindex="-1"[^>]*aria-label="行程编辑区"/
  );
  assert.match(appJs, /function closeMoveDayDialog\(fallbackFocus\)/);
  assert.match(appJs, /targetDayTab[\s\S]{0,160}closeMoveDayDialog\(targetDayTab \|\| el\.itineraryEditor\)/);
});

test("add-place dialog exposes an explicit close control", () => {
  assert.match(
    indexHtml,
    /id="closeAddPlaceDialogBtn"[^>]*aria-label="关闭添加想去地点"[^>]*>×<\/button>/
  );
  assert.match(indexHtml, /id="addPlaceQuery"[^>]*autofocus/);
  assert.match(
    appJs,
    /closeAddPlaceDialogBtn\.addEventListener\('click',[\s\S]{0,100}addPlaceDialog\.close\(\)/
  );
  assert.match(stylesCss, /\.editor-dialog-header\s*\{[^}]*display:\s*flex;/s);
});

test("add-place dialog searches map-backed suggestions before adding a place", () => {
  assert.match(
    indexHtml,
    /id="addPlaceQuery"[^>]*aria-controls="addPlaceResults"[^>]*autocomplete="off"/
  );
  assert.match(indexHtml, /id="addPlaceResults"[^>]*aria-live="polite"/);
  assert.match(indexHtml, /id="usePlaceNameBtn"[^>]*>按名称选点<\/button>/);
  assert.match(
    appJs,
    /function searchPlacesByName\(rawQuery\)[\s\S]*?\/api\/search_pois\?city=[\s\S]*?&count=8/
  );
  assert.match(appJs, /addPlaceQuery\.addEventListener\('input', schedulePlaceSearch\)/);
  assert.match(
    appJs,
    /addPlaceResults\.addEventListener\('click',[\s\S]*?data-place-result-index[\s\S]*?addPlaceFromAmapResult/
  );
  assert.doesNotMatch(appJs, /function addPlaceByName\(/);
  assert.match(stylesCss, /#addPlaceResults \.place-search-result\s*\{[^}]*min-height:\s*58px;/s);
});

test("topbar uses compact accessible action menus", () => {
  assert.match(indexHtml, /id="exportMenuBtn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(indexHtml, /id="exportMenuPanel"[^>]*role="menu"[^>]*hidden/);
  assert.match(indexHtml, /id="savedTripsPanel"[^>]*role="region"[^>]*tabindex="-1"[^>]*hidden/);
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
  assert.match(appJs, /function closeCompetingTopbarPanels\(exceptPanel\)/);
  assert.match(appJs, /if \(isOpen\) closeCompetingTopbarPanels\(panel\)/);
  assert.match(appJs, /setSavedTripsPanelOpen\(true, true, returnFocus \|\| el\.savedTripsBtn\)/);
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
  assert.match(tokensCss, /--bg:\s*#f5f4ed/i);
  assert.match(tokensCss, /--surface:\s*#fffcf5/i);
  assert.match(tokensCss, /--surface-warm:\s*#f0ebe3/i);
  assert.match(tokensCss, /--fg:\s*#1a1916/i);
  assert.match(tokensCss, /--muted:\s*#6b6862/i);
  assert.match(tokensCss, /--meta:\s*#77736d/i);
  assert.match(tokensCss, /--border:\s*#e5e1d6/i);
  assert.match(tokensCss, /--accent:\s*#c96442/i);
  assert.doesNotMatch(tokensCss, /--surface:\s*#ffffff/i);
  assert.doesNotMatch(tokensCss, /--accent:\s*#c25432/i);
});

test("display and mono font stacks are real webfonts", () => {
  assert.match(indexHtml, /Noto\+Serif\+SC/);
  assert.match(indexHtml, /Noto\+Sans\+SC/);
  assert.match(indexHtml, /JetBrains\+Mono/);
  assert.match(tokensCss, /--font-display:\s*[^;]*Noto Serif SC/i);
  assert.match(tokensCss, /--font-body:\s*[^;]*Noto Sans SC/i);
  assert.match(tokensCss, /--font-mono:\s*[^;]*JetBrains Mono/i);
});

test("frontend shell keeps tokens, workspace, and interactions in explicit modules", () => {
  const tokensIndex = indexHtml.indexOf("tokens.css");
  const baseIndex = indexHtml.indexOf("styles.css");
  const workspaceIndex = indexHtml.indexOf("workspace.css");
  const appIndex = indexHtml.indexOf("app.js");
  const interactionsIndex = indexHtml.indexOf("ui-interactions.js");

  assert.ok(tokensIndex > -1 && baseIndex > tokensIndex && workspaceIndex > baseIndex);
  assert.ok(appIndex > -1 && interactionsIndex > appIndex);
  assert.doesNotMatch(indexHtml, /<style(?:\s|>)/i);
  assert.doesNotMatch(indexHtml, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(indexHtml, /\sstyle="/i);
  assert.match(uiInteractionsJs, /AeroTravelInteractions/);
  assert.match(uiInteractionsJs, /nextSegmentIndex/);
});

test('map drawer keeps lazy picker and accessible map controls usable', () => {
  assert.match(
    indexHtml,
    /id="map"[^>]*role="region"[^>]*aria-label="行程路线地图/
  );
  assert.match(mapJs, /zoomInTitle:\s*'放大地图'/);
  assert.match(mapJs, /zoomOutTitle:\s*'缩小地图'/);
  assert.match(
    appJs,
    /pickPlaceOnMapBtn\.addEventListener\('click',[\s\S]{0,500}openMapDrawer\(\)[\s\S]{0,500}enablePointPicker\(map/
  );
  assert.match(
    appJs,
    /function closeMapDrawer\(\)\s*\{\s*state\.cancelPointPicker\?\.\(\);\s*state\.cancelPointPicker = null/
  );
  assert.match(appJs, /alt:\s*`行程节点 \$\{index \+ 1\}：\$\{item\.title\}`/);
  assert.match(tripShareBootJs, /title:\s*anchor\.title/);
  assert.match(stateJs, /Fallback data follows the same GCJ-02 contract as Amap responses/);
});

test('customer exports keep map framing, touch targets, and final A4 print cascade', () => {
  assert.match(appJs, /width:\s*1024,\s*\n\s*height:\s*704/);
  assert.match(tripShareCss, /\.trip-btn,\s*\n\.trip-chip\s*\{[^}]*min-height:\s*44px/s);
  assert.match(tripShareCss, /\.trip-topbar-actions \.trip-btn\s*\{[^}]*min-height:\s*44px/s);

  const printIndex = tripShareCss.lastIndexOf('@media print');
  assert.ok(printIndex > tripShareCss.indexOf('2026 Journey Edition'));
  const finalPrintCss = tripShareCss.slice(printIndex);
  assert.match(finalPrintCss, /@page\s*\{[^}]*size:\s*A4 portrait/s);
  assert.match(finalPrintCss, /\.trip-print-cover\s*\{[\s\S]{0,300}break-after:\s*page/);
  assert.match(finalPrintCss, /\.trip-print-overview-grid\s*\{[\s\S]{0,180}grid-template-columns:\s*minmax\(0, 1\.58fr\) minmax\(48mm, 0\.72fr\)/);
  assert.match(finalPrintCss, /\.print-day-layout\s*\{[\s\S]{0,220}grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(48mm, 0\.7fr\)/);
  assert.match(finalPrintCss, /\.trip-print-doc\s*\{[\s\S]{0,220}padding:\s*0 !important/);
  assert.doesNotMatch(finalPrintCss, /22%\s+56%\s+22%/);
});

test('timeline labels and setup actions use collision-free aligned layouts', () => {
  assert.match(
    workspaceCss,
    /\.timeline-marker\s*\{[^}]*grid-template-columns:\s*10px minmax\(0, 1fr\)/s
  );
  assert.match(
    workspaceCss,
    /\.timeline-item:not\(:last-child\) \.timeline-marker::after\s*\{[^}]*left:\s*4px;[^}]*transform:\s*none/s
  );
  assert.match(
    workspaceCss,
    /#stepRoute \.wizard-sticky-actions\s*\{[^}]*grid-template-areas:[^}]*"summary buttons"/s
  );
  assert.match(
    workspaceCss,
    /#stepRoute \.workspace-edit-hint,\s*#stepPrefs \.workspace-edit-hint\s*\{[^}]*max-width:\s*none/s
  );
  assert.match(
    workspaceCss,
    /#stepResults \.wizard-panel-toolbar\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s
  );
  assert.match(
    workspaceCss,
    /#stepRoute \.wizard-sticky-summary::before\s*\{[^}]*display:\s*none/s
  );
  assert.match(
    workspaceCss,
    /body\[data-wizard-step='1'\] \.toast\s*\{[^}]*bottom:\s*calc\(126px \+ env\(safe-area-inset-bottom, 0px\)\)/s
  );
  assert.match(
    workspaceCss,
    /#stepResults \.itinerary-card \.card-heading\s*\{[^}]*grid-template-columns:\s*128px minmax\(0, 1fr\)/s
  );
  assert.match(
    workspaceCss,
    /#stepResults \.itinerary-card \.card-kicker\s*\{[^}]*flex-wrap:\s*nowrap/s
  );
  assert.match(
    workspaceCss,
    /#stepResults \.itinerary-card \.card-kicker \.badge\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap/s
  );
});

test('published desktop overview does not stretch the map below its content', () => {
  assert.match(
    tripShareCss,
    /@media screen and \(min-width: 900px\)[\s\S]*?\.trip-overview-map-wrap\s*\{[^}]*grid-row:\s*1;[^}]*align-self:\s*start/s
  );
  assert.match(
    tripShareCss,
    /\.trip-overview-days\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;/s
  );
  assert.match(
    tripShareCss,
    /\.trip-overview-side\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1 \/ span 2;/s
  );
});

test('QA polish keeps decision bars sticky and mobile targets readable', () => {
  assert.match(workspaceCss, /body\[data-wizard-step='3'\] #stepResults \.wizard-panel-actions\s*\{[^}]*position:\s*sticky/s);
  assert.match(workspaceCss, /#stepResults \.day-map-hint-btn\s*\{[^}]*min-height:\s*40px/s);
  assert.match(workspaceCss, /\.card-select-btn\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*36px/s);
  assert.match(
    workspaceCss,
    /#stepResults \.card-map-btn,\s*#stepResults \.card-select-btn,[\s\S]{0,180}min-height:\s*44px/s
  );
  assert.match(
    workspaceCss,
    /@media screen and \(min-width: 901px\) and \(max-width: 1260px\)[\s\S]*?\.wizard-action-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*'route'[^}]*'meta'/s
  );
  assert.match(
    workspaceCss,
    /@media screen and \(min-width: 901px\) and \(max-width: 1260px\)[\s\S]*?\.wizard-action-summary > span:last-child\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
  );
  assert.match(workspaceCss, /body\[data-chrome='workspace'\] \.workspace-status\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(workspaceCss, /\.city-actions \.btn-icon\s*\{[^}]*min-height:\s*44px/s);
});

test('saving an edited itinerary resets the draft history baseline', () => {
  assert.match(
    appJs,
    /saveDraftBtn\.addEventListener\('click',[\s\S]*?state\.draftHistory\s*=\s*window\.AeroTravelHistory\.createHistory\(state\.workingDraft,\s*50\);[\s\S]*?state\.appliedUndo\s*=\s*null;[\s\S]*?state\.candidatePlan\s*=\s*null;[\s\S]*?state\.editMode\s*=\s*false;/s
  );
});

test('draft history buttons reflect available undo and redo entries', () => {
  assert.match(
    appJs,
    /const pastCount\s*=\s*state\.draftHistory[\s\S]*?const futureCount\s*=\s*state\.draftHistory[\s\S]*?undoDraftBtn\.disabled\s*=\s*pastCount\s*===\s*0;[\s\S]*?redoDraftBtn\.disabled\s*=\s*futureCount\s*===\s*0;/s
  );
});

test('mobile map toolbar buttons keep full touch targets', () => {
  assert.match(
    stylesCss,
    /@media \(max-width:\s*767px\)[\s\S]*?\.map-toolbar-actions \.btn\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*var\(--touch-target\);/s
  );
});
