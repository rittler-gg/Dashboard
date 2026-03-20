# Econic Dashboard MVP

Desktop-first React + Vite dashboard prototype with:

- live India order map with projected `lat`/`lng` pins
- real-time KPI sidebar
- transient livestream-style order comments overlay
- breakdown view for brand, channel, and platform splits
- mock streaming data, ready to be replaced later with Metabase-backed queries

## Tech Stack

- React 18
- TypeScript
- Vite
- `d3-geo` for map projection

## Local Run

### Requirements

- Node.js 20+ recommended
- npm 10+ recommended

### Install

```bash
npm install
```

### Start dev server

```bash
npm run dev
```

Open the local Vite URL shown in the terminal.

### Production build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Project Structure

```text
src/
  components/     UI building blocks
  data/           mock real-time dashboard stream
  pages/          overview and breakdown routes
  assets/         India state boundary asset
  utils/          formatting helpers
```

## Notes

- The dashboard currently uses mock streaming data from `src/data/mockDashboard.ts`.
- The India backdrop uses a simplified state-boundary GeoJSON in `src/assets/india-states.geojson`.
- No `.env` values are required for this frontend dashboard to run locally.

