# ADR-002: Vector basemap with raster fallback

## Context

The interactive workbench previously used 256 px Amap raster tiles in Leaflet. On high-density displays there is no setting that can make the baked-in labels both large and sharp: Leaflet retina mode makes the raster sharper by shrinking the complete tile, including its text, while native-size rendering keeps labels readable but upscales the image.

The configured `AMAP_KEY` is a backend Web Service key. It must not be exposed to the browser, and AeroTravel does not require a separate Amap JavaScript API key.

## Decision

- Keep Leaflet as the interaction and overlay API.
- Use MapLibre GL Leaflet with the OpenFreeMap Bright vector style as the preferred basemap.
- Keep CJK labels rendered with local system fonts so text follows the device pixel ratio.
- Rewrite named symbol layers after the vector style loads to prefer `name:zh-Hans`, `name:zh`, `name:nonlatin`, then the local `name`. Do not concatenate Latin transliterations with Chinese labels.
- Convert Amap/GCJ-02 itinerary coordinates to WGS84 only at the map display boundary. Convert picked WGS84 positions back to GCJ-02 before sending them to existing backend APIs.
- Load the original Amap raster layer first and retain it whenever the vector runtime, style, or first render is unavailable.
- Keep the shared-trip boot script able to construct the Amap raster map without `map.js`, so a stale cached publisher cannot produce a blank published page.
- Do not expose `AMAP_KEY` or require `EXPOSE_CLIENT_CONFIG=true`.

## Alternatives considered

- Leaflet `detectRetina=true`: sharp roads but approximately half-size baked-in labels.
- Native-size Amap raster tiles: readable labels but blurred pixels on high-density displays.
- Amap JavaScript API 2.0: high-quality vector rendering, but requires a separate browser key and security configuration.
- Static-map overlays: high-resolution still images but poor pan/zoom behavior and increased API usage.

## Consequences

- Interactive and shared-trip maps can show large, sharp labels on high-density displays.
- Map display now depends on MapLibre GL JS, MapLibre GL Leaflet, and OpenFreeMap; a raster fallback preserves core map use during CDN or vector-service failures.
- Basemap data comes from OpenStreetMap/OpenMapTiles while POI planning data still comes from Amap, so display-boundary coordinate conversion must remain covered by tests.
- OpenFreeMap attribution must remain visible.
