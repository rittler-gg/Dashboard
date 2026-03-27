import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { geoMercator } from "d3-geo";
import type { MapMarker } from "../types/dashboard";
import indiaGeoJsonRaw from "../assets/india-states.geojson?raw";

interface IndiaMapPanelProps {
  markers: MapMarker[];
}

interface ProjectedMarker {
  id: string;
  x: number;
  y: number;
  highlighted: boolean;
  overlapCount: number;
  placement: MapMarker["placement"];
  edge?: MapMarker["edge"];
}

type ProjectedPoint = [number, number];
type GeoRing = number[][];
type GeoPolygonCoordinates = GeoRing[];
type GeoMultiPolygonCoordinates = GeoPolygonCoordinates[];
type Projector = (point: ProjectedPoint) => ProjectedPoint | null;

const MAP_VIEWBOX = {
  width: 960,
  height: 720,
};

// Adjust these values to change the safe projector padding around the India map.
const PROJECTOR_SAFE_PADDING = {
  left: 96,
  right: 96,
  top: 20,
  bottom: 28,
};

// Update this epoch value directly in code to change the map countdown target.
const COUNTDOWN_TARGET_EPOCH_MS = 1774981799000;

const indiaGeoJson = JSON.parse(indiaGeoJsonRaw) as {
  features: Array<{
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: GeoPolygonCoordinates | GeoMultiPolygonCoordinates;
    };
    properties?: { ST_NM?: string };
  }>;
};

function projectRing(ring: GeoRing, project: Projector) {
  const points = ring
    .map((pair) => project([pair[0], pair[1]]))
    .filter((point): point is ProjectedPoint => Boolean(point));

  if (points.length < 2) {
    return "";
  }

  return (
    points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ") + " Z"
  );
}

function buildFeaturePath(
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: GeoPolygonCoordinates | GeoMultiPolygonCoordinates;
  },
  project: Projector,
) {
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as GeoPolygonCoordinates)
      .map((ring) => projectRing(ring, project))
      .filter(Boolean)
      .join(" ");
  }

  return (geometry.coordinates as GeoMultiPolygonCoordinates)
    .flatMap((polygon) => polygon.map((ring) => projectRing(ring, project)))
    .filter(Boolean)
    .join(" ");
}

function createIndiaProjector(features: typeof indiaGeoJson.features): Projector {
  const rawProjection = geoMercator().center([82.8, 22.5]).scale(1).translate([0, 0]);

  return (point: ProjectedPoint) => {
    const projected = rawProjection(point);
    return projected ? [projected[0], projected[1]] : null;
  };
}

function createFittedProjector(features: typeof indiaGeoJson.features): Projector {
  const projectToPlane = createIndiaProjector(features);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const visit = (coords: GeoRing | GeoPolygonCoordinates | GeoMultiPolygonCoordinates) => {
    if (typeof coords[0][0] === "number") {
      for (const pair of coords as GeoRing) {
        const projected = projectToPlane([pair[0], pair[1]]);

        if (!projected) {
          continue;
        }

        const [x, y] = projected;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return;
    }

    for (const child of coords as GeoPolygonCoordinates | GeoMultiPolygonCoordinates) {
      visit(child);
    }
  };

  for (const feature of features) {
    visit(feature.geometry.coordinates);
  }

  const availableWidth =
    MAP_VIEWBOX.width - PROJECTOR_SAFE_PADDING.left - PROJECTOR_SAFE_PADDING.right;
  const availableHeight =
    MAP_VIEWBOX.height - PROJECTOR_SAFE_PADDING.top - PROJECTOR_SAFE_PADDING.bottom;
  const scale = Math.min(
    availableWidth / (maxX - minX),
    availableHeight / (maxY - minY),
  );
  const projectedWidth = (maxX - minX) * scale;
  const projectedHeight = (maxY - minY) * scale;
  const offsetX = PROJECTOR_SAFE_PADDING.left + (availableWidth - projectedWidth) / 2;
  const offsetY = PROJECTOR_SAFE_PADDING.top + (availableHeight - projectedHeight) / 2;

  return (point: ProjectedPoint) => {
    const projected = projectToPlane(point);

    if (!projected) {
      return null;
    }

    const [x, y] = projected;
    return [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale];
  };
}

function getOutskirtsPoint(marker: MapMarker, index: number): ProjectedPoint {
  const offset = (index % 4) * 24;

  switch (marker.edge) {
    case "north":
      return [MAP_VIEWBOX.width * 0.52 + offset, 72];
    case "south":
      return [MAP_VIEWBOX.width * 0.48 - offset, MAP_VIEWBOX.height - 64];
    case "west":
      return [96, MAP_VIEWBOX.height * 0.48 - offset];
    case "east":
    default:
      return [MAP_VIEWBOX.width - 94, MAP_VIEWBOX.height * 0.42 + offset];
  }
}

function getMarkerPoint(marker: MapMarker, project: Projector, index: number) {
  if (marker.placement === "outskirts") {
    return getOutskirtsPoint(marker, index);
  }

  if (marker.placement === "unknown" || marker.lat === null || marker.lng === null) {
    return [110, MAP_VIEWBOX.height - 92] as ProjectedPoint;
  }

  return project([marker.lng, marker.lat]);
}

function formatCountdown(targetEpochMs: number, nowMs: number) {
  const remainingMs = Math.max(targetEpochMs - nowMs, 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`;
  }

  return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
}

function getTightScatterOffset(slot: number) {
  if (slot <= 0) {
    return { x: 0, y: 0 };
  }

  const clumpOffsets = [
    { x: 2, y: -1 },
    { x: -2, y: 1 },
    { x: 1, y: 2 },
    { x: -1, y: -2 },
    { x: 3, y: 1 },
    { x: -3, y: -1 },
    { x: 2, y: 3 },
    { x: -2, y: -3 },
    { x: 4, y: -2 },
    { x: -4, y: 2 },
    { x: 0, y: 4 },
    { x: 0, y: -4 },
  ];

  const baseOffset = clumpOffsets[(slot - 1) % clumpOffsets.length];
  const ring = Math.floor((slot - 1) / clumpOffsets.length);
  const spread = 1 + ring * 0.75;

  return {
    x: baseOffset.x * spread,
    y: baseOffset.y * spread,
  };
}

function clusterProjectedMarkers(markers: ProjectedMarker[]) {
  const buckets = new Map<string, ProjectedMarker[]>();

  for (const marker of markers) {
    const key = `${marker.placement}:${marker.edge ?? "none"}:${Math.round(marker.x)}:${Math.round(marker.y)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(marker);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values()).flatMap((bucket) => {
    const highlightedMarkers = bucket.filter((marker) => marker.highlighted);
    const ordinaryMarkers = bucket.filter((marker) => !marker.highlighted);
    const orderedBucket = [...highlightedMarkers, ...ordinaryMarkers];

    return orderedBucket.map((marker, index) => {
      const offset =
        marker.placement === "india" ? getTightScatterOffset(index) : { x: 0, y: 0 };

      return {
        ...marker,
        x: marker.x + offset.x,
        y: marker.y + offset.y,
        overlapCount: orderedBucket.length,
      };
    });
  });
}

function projectMarkers(markers: MapMarker[], project: Projector) {
  const projectedMarkers: ProjectedMarker[] = [];

  markers.forEach((marker, index) => {
    const projectedPoint = getMarkerPoint(marker, project, index);

    if (!projectedPoint) {
      return;
    }

    const [x, y] = projectedPoint;
    projectedMarkers.push({
      id: marker.id,
      x,
      y,
      highlighted: marker.highlighted,
      overlapCount: 1,
      placement: marker.placement,
      edge: marker.edge,
    });
  });

  const sortedMarkers = projectedMarkers.sort((left, right) => {
      if (left.highlighted !== right.highlighted) {
        return left.highlighted ? -1 : 1;
      }

      return 0;
    });

  return clusterProjectedMarkers(sortedMarkers);
}

export function IndiaMapPanel({ markers }: IndiaMapPanelProps) {
  const projection = useMemo(() => createFittedProjector(indiaGeoJson.features), []);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const projectedRegions = useMemo(
    () =>
      indiaGeoJson.features.map((feature, index) => ({
        id: `${feature.properties?.ST_NM ?? "state"}-${index}`,
        path: buildFeaturePath(feature.geometry, projection),
      })),
    [projection],
  );
  const projectedMarkers = useMemo(() => projectMarkers(markers, projection), [markers, projection]);
  const countdownLabel = formatCountdown(COUNTDOWN_TARGET_EPOCH_MS, nowMs);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel map-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order geography</p>
          <h2>India live order map</h2>
        </div>
        <div className="map-countdown">
          <span>Countdown</span>
          <strong>{countdownLabel}</strong>
        </div>
      </div>

      <div className="map-frame">
        <div className="map-grid" aria-hidden="true" />
        <div className="map-canvas">
          <svg
            className="india-geo-map"
            viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="map-halo-gradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#009245" stopOpacity="0.32" />
                <stop offset="55%" stopColor="#009245" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#009245" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="india-geo-regions">
              {projectedRegions.map((region) =>
                region.path ? <path key={region.id} d={region.path} className="india-region" /> : null,
              )}
            </g>

            <g className="india-point-layer">
              {projectedMarkers.map((marker, index) => {
                const markerClassName = [
                  "map-point",
                  marker.highlighted ? "highlighted" : "",
                  marker.overlapCount > 1 ? "overlap" : "",
                  marker.placement === "outskirts" ? "outskirts" : "",
                  marker.placement === "unknown" ? "unknown" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const overlapIntensity = Math.min(marker.overlapCount, 10);
                const markerStyle = {
                  animationDelay: `${index * 140}ms`,
                  "--glow-duration": `${Math.max(2.4, 3.8 - overlapIntensity * 0.12)}s`,
                  "--glow-scale": `${1.08 + overlapIntensity * 0.03}`,
                  "--glow-opacity": `${Math.min(0.26, 0.12 + overlapIntensity * 0.018)}`,
                  "--ripple-duration": `${Math.max(1.6, 2.5 - overlapIntensity * 0.08)}s`,
                  "--ripple-scale": `${2.2 + overlapIntensity * 0.08}`,
                  "--ripple-opacity": `${Math.min(0.4, 0.24 + overlapIntensity * 0.014)}`,
                } as CSSProperties;

                return (
                    <g
                      key={marker.id}
                      className="map-point-anchor"
                      transform={`translate(${marker.x}, ${marker.y})`}
                    >
                      <g className={markerClassName} style={markerStyle}>
                        <circle className="map-point-glow" r={marker.overlapCount > 1 ? 25 : 11.5} />
                        <circle className="map-point-ripple" r={marker.overlapCount > 1 ? 25 : 11.5} />
                        <circle className="map-point-outer" r={5} />
                        <circle className="map-point-core" r="1.3" />
                      </g>
                    </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
