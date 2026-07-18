# Frontend map

The static directory is a no-build browser application. Keep the two HTML entrypoints at this level and place implementation files by responsibility.

~~~text
static/
├── index.html              # Planner entrypoint and script order
├── trip-share.html         # Read-only customer itinerary entrypoint
├── css/
│   ├── tokens.css          # Design tokens; load first
│   ├── styles.css          # Shared controls, cards and wizard primitives
│   ├── workspace.css       # Planner/result composition and breakpoints
│   ├── delivery.css        # Export staging surfaces
│   └── trip-share.css      # Dedicated page, overview image and PDF layouts
└── js/
    ├── app.js              # Startup, event binding and state orchestration
    ├── ui-interactions.js  # DOM-only presentation/accessibility behavior
    ├── core/               # State, API, storage and pure shared utilities
    ├── planning/           # Wizard, map, draft, editor and optimization UI
    └── delivery/           # Customer package, preview, publish and exports
~~~

## Load-order contract

1. CSS: tokens.css → styles.css → delivery/share styles → workspace.css.
2. JavaScript boundaries load before js/app.js; js/ui-interactions.js loads last.
3. Modules expose window.AeroTravel* namespaces. There is no bundler or implicit import graph.
4. trip-share.html loads only the map and delivery modules required for a read-only itinerary.

When moving a file, update both HTML entrypoints, js/delivery/trip-publish.js (self-contained export assets), frontend tests, and scripts/check.ps1.
