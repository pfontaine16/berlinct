# Berlin, Connecticut — Flyover

A 3D drone-style flyover of Berlin, CT, built from public data and rendered in the browser with three.js.

## Run it

Requires [Node.js](https://nodejs.org).

```
node server.mjs
```

Then open http://localhost:8765 (on Windows, double-click `Fly Over Berlin.bat`).

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Fly |
| `E` / `Q` | Up / down |
| Mouse drag, arrow keys | Look |
| `Shift`, mouse wheel | Faster / set speed |
| `T` | Guided tour |
| `P` | Places menu |
| `L` | Time of day |
| `F` | Summer / autumn |
| `N` | Place names on/off |
| `B` | Town line on/off |

## Layout

- `app/` — the viewer (`index.html`, `main.js`) and its processed data (`app/data/`)
- `build/` — scripts that download and process the source data
  (`download.mjs`, `height.mjs`, `osm.mjs`, `pyramid.mjs`, `trees.mjs`); run `npm i sharp three` in `build/` first
- `server.mjs` — small static file server

## Data sources

- Aerial imagery: USDA NAIP, via the USGS National Map
- Elevation: USGS 3DEP, via Mapzen/AWS terrain tiles
- Buildings, water, roads, place names: © OpenStreetMap contributors (ODbL)
