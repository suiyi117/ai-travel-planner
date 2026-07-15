# UI Visual Polish (Parchment + Composition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify AeroTravel’s static UI on the approved warm parchment system and finish Step 1/2 form density plus Step 3 timeline/meta composition so the product reads as a finished travel workbench—without changing API, wizard IA, or Phase 1/2 map/settings behavior.

**Architecture:** Design tokens live in `static/index.html` `:root`. Component and layout styles live in `static/styles.css` plus the Phase 3 style block already inlined in `index.html`. Timeline DOM is produced by `renderPlan()` in `static/app.js`. Contract tests in `tests/frontend/shell.test.js` lock tokens, fold/timeline hooks, and markup shape. No bundler; no backend changes.

**Tech Stack:** FastAPI static mount (unchanged), vanilla HTML/CSS/JS, Leaflet (unchanged), Node `node:test` for frontend string/DOM-contract tests, PowerShell `.\scripts\check.ps1`.

**Spec:** `docs/superpowers/specs/2026-07-15-ui-visual-polish-design.md`

---

## Global Constraints

- Branch: `feature/ui-phase3-visual-polish`
- Do **not** change backend routes, schemas, or prompts
- Do **not** introduce frameworks, bundlers, dark theme, or delivery long-image redesign
- Preserve: three-step wizard, map drawer on demand, `state` + `applyPlan()`, settings diff regen, `data-item` / `data-open-map-item`, fold ARIA/`data-open`
- Working tree may already contain partial Phase 3 WIP in `static/*` and `tests/frontend/shell.test.js`. **Treat the approved design tokens as source of truth**—if WIP drifted toward pure-white SaaS (`--surface: #ffffff`, `--accent: #c25432`), re-align to parchment values in Task 1
- Quality gate after Task 2, Task 5, and final: `.\scripts\check.ps1`
- Prefer small commits per task

---

## File Map

| File | Responsibility |
|---|---|
| `static/index.html` | `:root` tokens; fonts; fold styles; timeline layout block; page structure |
| `static/styles.css` | Buttons, fields, city cards, wizard shell, badges, empty/toast, form density |
| `static/app.js` | `renderPlan()` timeline markup (marker/time, card, meta); quiet chrome only if already present and in-scope |
| `tests/frontend/shell.test.js` | Static contracts: tokens, fold, timeline markup, workspace chrome |
| `docs/product/ui-visual-phase3-plan.md` | Product slice notes (optional commit if still untracked; do not contradict design spec) |

---

### Task 1: Lock parchment design tokens + shell contract tests

**Files:**
- Modify: `static/index.html` (`:root` block only for tokens; keep real Noto/JetBrains font links if present)
- Modify: `tests/frontend/shell.test.js`
- Spec reference: §4 Design Token

- [ ] **Step 1: Write failing token contract tests**

In `tests/frontend/shell.test.js`, add (or replace any weaker token checks with):

```js
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
```

Keep existing tests that still apply (`[hidden]`, fold/timeline hooks, workspace status, export menus, toast). If a prior WIP test required SaaS tokens, remove that conflict.

- [ ] **Step 2: Run tests to verify token tests fail (if WIP still has SaaS colors)**

Run:

```powershell
node --test tests/frontend/shell.test.js
```

Expected: FAIL on `parchment design tokens match visual polish spec` if `--surface: #ffffff` or wrong accent remain.

- [ ] **Step 3: Apply approved `:root` tokens in `static/index.html`**

Set (exact values):

```css
:root {
  --bg: #f5f4ed;
  --surface: #fffcf5;
  --surface-warm: #f0ebe3;
  --fg: #1a1916;
  --fg-2: #2e2d2a;
  --muted: #6b6862;
  --meta: #8a8680;
  --border: #e5e1d6;
  --border-soft: #efebe3;
  --accent: #c96442;
  --accent-on: #ffffff;
  --accent-hover: color-mix(in oklab, var(--accent), black 12%);
  --accent-active: color-mix(in oklab, var(--accent), black 18%);
  /* keep success/warn/danger; fonts; spacing; radius; elev; focus-ring; motion as already structured */
}
```

Update the surface comment to say parchment product personality (not “Linear-like SaaS”). Ensure Google Fonts preconnect + Noto/JetBrains stylesheet link remain.

Focus ring should reference warm accent:

```css
--focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px color-mix(in oklab, var(--accent), transparent 45%);
```

- [ ] **Step 4: Re-run shell tests**

```powershell
node --test tests/frontend/shell.test.js
```

Expected: PASS for new token tests and existing shell contracts.

- [ ] **Step 5: Commit**

```powershell
git add static/index.html tests/frontend/shell.test.js
git commit -m "feat(ui): lock parchment design tokens and shell contracts"
```

---

### Task 2: Global controls — buttons, fields, badges, topbar

**Files:**
- Modify: `static/styles.css` (`.btn*`, inputs, `.badge*`, `.topbar`, `.brand`)
- Modify: `static/index.html` only if control styles currently live in the Phase 3 inline block and must stay consistent

- [ ] **Step 1: Align primary / secondary / ghost buttons**

In `static/styles.css`, ensure:

```css
.btn-primary,
.btn.primary {
  background: var(--accent);
  color: var(--accent-on);
  border: 1px solid color-mix(in oklab, var(--accent), black 6%);
  border-radius: var(--radius-sm);
  box-shadow: none;
}
.btn-primary:hover,
.btn.primary:hover {
  background: var(--accent-hover);
  color: var(--accent-on);
}
.btn-secondary,
.btn.secondary,
.btn-ghost,
.btn.ghost {
  background: var(--surface);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.btn-secondary:hover,
.btn.ghost:hover {
  background: var(--surface-warm);
  border-color: color-mix(in oklab, var(--border), var(--fg) 12%);
}
.btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

Use the **actual class names already in the file** (grep `.btn` first). Do not invent a second button system—restyle existing selectors.

- [ ] **Step 2: Align inputs / selects / textareas**

```css
input, select, textarea {
  background: var(--surface);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: color-mix(in oklab, var(--border), var(--fg) 20%);
  box-shadow: var(--focus-ring);
}
```

- [ ] **Step 3: Soften badges (no “badge wall” look as primary meta later)**

```css
.badge {
  background: var(--surface-warm);
  color: var(--muted);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
}
.badge-accent {
  background: color-mix(in oklab, var(--accent), transparent 90%);
  color: color-mix(in oklab, var(--accent), black 10%);
  border-color: color-mix(in oklab, var(--accent), transparent 70%);
}
```

- [ ] **Step 4: Topbar on parchment**

```css
.topbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: none;
}
.brand-mark {
  background: var(--fg);
  color: var(--accent-on);
  border-radius: 8px;
}
```

Remove any remaining glass/`backdrop-filter` on topbar summary if still present.

- [ ] **Step 5: Syntax + unit check**

```powershell
node --check static/app.js
node --test tests/frontend/shell.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add static/styles.css static/index.html
git commit -m "feat(ui): align buttons fields badges and topbar to parchment"
```

---

### Task 3: Step 1 / 2 form composition

**Files:**
- Modify: `static/styles.css` (`#stepRoute`, `#stepPrefs`, `.city-card*`, `.days-summary`, pane headers)
- Modify: `static/app.js` only if city card inner labels need small copy/class hooks (keep structure)
- Spec reference: §5

- [ ] **Step 1: Pane headers for setup steps**

Ensure kicker/title/subtitle rhythm:

```css
#stepRoute .pane-kicker,
#stepPrefs .pane-kicker {
  margin-bottom: 6px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
#stepRoute .pane-title,
#stepPrefs .pane-title {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
}
#stepRoute .pane-subtitle,
#stepPrefs .pane-subtitle {
  margin-top: 8px;
  max-width: 46ch;
  color: var(--muted);
  font-size: 13px;
}
#stepRoute .stack,
#stepPrefs .stack {
  gap: 16px;
  width: 100%;
}
```

- [ ] **Step 2: City card product density**

```css
.city-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--elev-ring);
}
.city-card-rail {
  width: 4px;
  border-radius: 2px;
  background: color-mix(in oklab, var(--accent), var(--border) 40%);
}
.days-summary {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-warm);
  padding: 8px 12px;
}
```

Tune existing city-card grid so name is primary and days/transport sit on a secondary row (use current markup classes; avoid large HTML rewrite). If `app.js` city renderer still packs four controls on one cramped row, adjust the city card HTML template minimally—preserve `data-index`, plan_stay checkbox, days input, segment select, drag handlers.

- [ ] **Step 3: Step footer CTAs**

Primary button red/terracotta, secondary outlined ivory; ensure step footer doesn’t fight topbar export actions (no new topbar generate button).

- [ ] **Step 4: Run frontend tests**

```powershell
node --test tests/frontend/wizard.test.js tests/frontend/shell.test.js
```

Expected: PASS (wizard pure helpers unchanged).

- [ ] **Step 5: Commit**

```powershell
git add static/styles.css static/app.js
git commit -m "feat(ui): polish Step 1-2 form density and city cards"
```

---

### Task 4: Step 3 timeline meta bar + card hierarchy

**Files:**
- Modify: `static/app.js` (`renderPlan` itinerary item template)
- Modify: `static/index.html` and/or `static/styles.css` (timeline + card styles)
- Modify: `tests/frontend/shell.test.js`
- Spec reference: §6

**Current target markup shape** (keep `data-item` / `data-open-map-item`):

```html
<article class="timeline-item">
  <div class="timeline-marker" aria-hidden="true">
    <span class="timeline-dot"></span>
    <span class="item-time">09:30</span>
  </div>
  <div class="itinerary-card-shell">
    <div class="itinerary-card" role="button" tabindex="0" data-item="…" aria-label="…">
      <div class="card-top">
        <div class="card-heading">
          <div class="card-kicker">…badges type/conflict…</div>
          <h3 class="item-title">…</h3>
        </div>
        <!-- map button only if coords -->
        <button class="card-map-btn" type="button" data-open-map-item="…">看位置</button>
      </div>
      <p class="item-desc">…</p>
      <!-- optional poi address -->
      <div class="card-meta" aria-label="行程信息">
        <span>北京</span><span class="card-meta-sep" aria-hidden="true">·</span><span>2.5 小时</span>
        <!-- rating / transport extra as light spans if present -->
      </div>
    </div>
  </div>
</article>
```

- [ ] **Step 1: Extend shell contract for meta bar**

```js
test("timeline cards use marker time and card-meta footer", () => {
  assert.match(appJs, /class="timeline-marker"/);
  assert.match(appJs, /class="item-time"/);
  assert.match(appJs, /class="card-meta"/);
  assert.doesNotMatch(
    appJs,
    /itinerary-card[\s\S]{0,200}class="item-time"/
  );
});
```

(Adjust negative assertion carefully if structure nests differently—goal: time not inside `.itinerary-card`.)

- [ ] **Step 2: Run test — expect FAIL until markup updated**

```powershell
node --test tests/frontend/shell.test.js
```

- [ ] **Step 3: Update `renderPlan` template**

Replace the badge-row wall with a compact meta footer. Example helper fragment inside the map callback:

```js
const metaParts = [
  item.city ? `<span>${escapeHtml(item.city)}</span>` : "",
  item.duration ? `<span>${escapeHtml(item.duration)}</span>` : "",
  // optional: rating via existing renderRatingBadge but prefer plain text if badge-heavy
  display.extra ? `<span class="card-meta-extra">${escapeHtml(display.extra)}</span>` : "",
].filter(Boolean);
const metaHtml = metaParts.length
  ? `<div class="card-meta" aria-label="行程信息">${metaParts.join(
      '<span class="card-meta-sep" aria-hidden="true">·</span>'
    )}</div>`
  : "";
```

Keep conflict badge in kicker, not meta. Preserve map button `stopPropagation` handlers already wired.

- [ ] **Step 4: Style marker, active state, title, meta**

In the Phase 3 block (`index.html`) or `styles.css`:

```css
.timeline-item {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  padding: 0 0 var(--space-6);
}
.timeline-item .item-time {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  color: var(--muted);
}
.timeline-item.is-active .item-time { color: var(--fg); font-weight: 700; }
.timeline-item.is-active .timeline-dot {
  background: var(--fg);
  border-color: var(--fg);
}
.itinerary-card .item-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--fg);
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding-top: 8px;
  margin-top: 2px;
  border-top: 1px solid var(--border-soft);
  color: var(--meta);
  font-size: var(--text-xs);
  line-height: 1.4;
}
.card-meta-sep { color: var(--border); }
.itinerary-card.is-active {
  border-color: var(--fg);
  box-shadow: 0 0 0 1px var(--fg), 0 8px 24px rgba(26, 25, 22, 0.08);
}
```

Narrow screens (`max-width: 720px`): reduce marker column to ~64px or stack time under dot; no horizontal overflow.

- [ ] **Step 5: Run tests**

```powershell
node --check static/app.js
node --test tests/frontend/shell.test.js tests/frontend/app-utils-focus.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add static/app.js static/index.html static/styles.css tests/frontend/shell.test.js
git commit -m "feat(ui): timeline marker time and card-meta footer"
```

---

### Task 5: Fold sections + secondary controls

**Files:**
- Modify: `static/index.html` (`.fold-*` block)
- Modify: `static/styles.css` (`.card-map-btn`, `.day-map-hint-btn`, workspace status if needed)
- Spec reference: §6.3, §7

- [ ] **Step 1: Confirm fold contract still holds**

```powershell
node --test tests/frontend/shell.test.js
```

Must still match `appearance: none` on `.fold-trigger`.

- [ ] **Step 2: Polish fold to parchment (no browser chrome)**

Ensure:

```css
.fold-trigger {
  appearance: none;
  -webkit-appearance: none;
  min-height: 48px; /* ≥44px */
  background: color-mix(in oklab, var(--surface), var(--bg) 8%);
  border: 0;
  cursor: pointer;
}
.fold-section {
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background: color-mix(in oklab, var(--surface), var(--bg) 18%);
  box-shadow: var(--elev-ring);
}
.fold-trigger:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.fold-section[data-open="true"] .fold-chevron {
  /* rotated; if prefers-reduced-motion: reduce to 0ms transition */
}
@media (prefers-reduced-motion: reduce) {
  .fold-chevron { transition: none; }
}
```

**Do not** change fold JS, IDs (`#transportFoldBtn`, `#insightsFoldBtn`), or `data-open` toggle logic.

- [ ] **Step 3: Align card-map / day-map-hint / workspace status buttons**

```css
.card-map-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 600;
}
.card-map-btn:hover,
.card-map-btn:focus-visible {
  background: var(--surface-warm);
  box-shadow: var(--focus-ring);
  outline: none;
}
.day-map-hint-btn {
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.day-map-hint-btn:hover { color: var(--fg); }
```

Workspace status bar: ivory surface, warm ring, compact edit buttons (secondary style).

- [ ] **Step 4: Metric strip / kicker noise reduction (optional light pass)**

If stats strip is still loud on workspace chrome, keep existing hide rules under `body[data-chrome="workspace"]` or lighten borders—do not remove useful Day tabs.

- [ ] **Step 5: Check gate**

```powershell
.\scripts\check.ps1
```

Expected: all green (compileall, ruff/mypy if installed, unittest, node --check, frontend tests).

- [ ] **Step 6: Commit**

```powershell
git add static/index.html static/styles.css
git commit -m "feat(ui): parchment fold triggers and secondary controls"
```

---

### Task 6: Empty states, focus sweep, narrow viewport, final regression

**Files:**
- Modify: `static/styles.css` (`.empty-state`, `.toast`, residual pure-white hardcodes)
- Grep-driven cleanup across `static/`

- [ ] **Step 1: Grep for residual anti-patterns**

```powershell
rg -n "#ffffff|#fff\b|backdrop-filter|appearance:\s*auto" static/styles.css static/index.html
```

Replace unjustified pure white backgrounds with `var(--surface)` or `var(--bg)`. Keep map tile containers / leaflet if they require white.

- [ ] **Step 2: Empty + toast**

```css
.empty-state {
  padding: var(--space-6);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-warm);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}
.toast {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--fg);
  box-shadow: var(--elev-raised);
}
```

- [ ] **Step 3: Narrow viewport sanity (CSS only)**

Confirm `@media (max-width: 720px)` timeline columns and card padding prevent horizontal scroll. No mobile gesture work.

- [ ] **Step 4: Full quality gate**

```powershell
.\scripts\check.ps1
```

Expected: PASS.

- [ ] **Step 5: Browser smoke (manual; document result in commit body or PR notes)**

1. Open `http://localhost:8000` (run `python server.py` if needed)
2. Step 1: add city, change days → Next
3. Step 2: set prefs → Generate → Step 3
4. Scan timeline times; click card active ring; 看位置 opens map; close map
5. Toggle transport / insights folds
6. Workspace edit route with no change returns quietly; with change can regen
7. Resize narrow: no horizontal overflow; console clean

- [ ] **Step 6: Commit**

```powershell
git add static/styles.css static/index.html
git commit -m "feat(ui): empty states focus sweep and viewport polish"
```

- [ ] **Step 7: Optional docs hygiene**

If `docs/product/ui-visual-phase3-plan.md` is still untracked, either:

- Commit it with a note that design spec supersedes conflicting “SaaS white” wording, **or**
- Leave untracked

Do **not** commit `.superpowers/` brainstorm sessions (gitignored) or `.env`.

---

## Spec Coverage Checklist

| Spec section | Tasks |
|---|---|
| §2 Goals / success | 1–6 |
| §3 Non-goals | Constraints (all tasks) |
| §4 Tokens | Task 1 |
| §5 Step 1/2 forms | Task 3 |
| §6 Timeline + cards + fold | Tasks 4–5 |
| §7 Interaction states | Tasks 2, 5, 6 |
| §8 Implementation order | Task order 1→6 |
| §9 Browser smoke | Task 6 Step 5 |
| §10 Tests / check.ps1 | Tasks 1, 4, 5, 6 |

## Placeholder / consistency self-review

- No TBD steps; token hex values match design spec exactly  
- Markup classes: `timeline-marker`, `item-time`, `card-meta`, `card-map-btn`, `data-item`, `data-open-map-item` consistent across tasks  
- WIP SaaS white explicitly overridden in Task 1  
- Behavior preservation called out for fold JS and map focus helpers  

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-ui-visual-polish.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — same session with executing-plans, batch with checkpoints  

Which approach?
