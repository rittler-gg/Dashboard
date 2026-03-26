import { useEffect, useMemo, useState } from "react";
import { geoMercator } from "d3-geo";
import type { MapMarker } from "../types/dashboard";
import indiaGeoJsonRaw from "../assets/india-states.geojson?raw";

interface IndiaMapPanelProps {
  markers: MapMarker[];
}

interface ClusteredMarker {
  id: string;
  x: number;
  y: number;
  count: number;
  highlighted: boolean;
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

function clusterMarkers(markers: MapMarker[], project: Projector) {
  const clustered = new Map<string, ClusteredMarker>();
  const clusteringRadius = 30;

  markers.forEach((marker, index) => {
    const projectedPoint = getMarkerPoint(marker, project, index);

    if (!projectedPoint) {
      return;
    }

    const [x, y] = projectedPoint;

    if (marker.highlighted) {
      clustered.set(`highlighted:${marker.id}`, {
        id: marker.id,
        x,
        y,
        count: 1,
        highlighted: true,
        placement: marker.placement,
        edge: marker.edge,
      });
      return;
    }

    const bucketX = Math.round(x / clusteringRadius);
    const bucketY = Math.round(y / clusteringRadius);
    const key = `${marker.placement}:${marker.edge ?? "none"}:${bucketX}:${bucketY}`;
    const existing = clustered.get(key);

    if (!existing) {
      clustered.set(key, {
        id: key,
        x,
        y,
        count: 1,
        highlighted: false,
        placement: marker.placement,
        edge: marker.edge,
      });
      return;
    }

    clustered.set(key, {
      ...existing,
      x: (existing.x * existing.count + x) / (existing.count + 1),
      y: (existing.y * existing.count + y) / (existing.count + 1),
      count: existing.count + 1,
    });
  });

  return Array.from(clustered.values()).sort((left, right) => {
    if (left.highlighted !== right.highlighted) {
      return left.highlighted ? -1 : 1;
    }

    return right.count - left.count;
  });
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
  const clusteredMarkers = useMemo(() => clusterMarkers(markers, projection), [markers, projection]);
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
            <g className="india-geo-regions">
              {projectedRegions.map((region) =>
                region.path ? <path key={region.id} d={region.path} className="india-region" /> : null,
              )}
            </g>

            <g className="india-point-layer">
              {clusteredMarkers.map((marker, index) => {
                const markerClassName = [
                  "map-point",
                  marker.highlighted ? "highlighted" : "",
                  marker.placement === "outskirts" ? "outskirts" : "",
                  marker.placement === "unknown" ? "unknown" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <g
                    key={marker.id}
                    className="map-point-anchor"
                    transform={`translate(${marker.x}, ${marker.y})`}
                  >
                    <g className={markerClassName} style={{ animationDelay: `${index * 120}ms` }}>
                      <circle className="map-point-glow" r={marker.count > 1 ? 14 : 11} />
                      <circle className="map-point-outer" r={marker.count > 1 ? 8 : 6} />
                      <circle className="map-point-core" r="2.6" />
                      {marker.count > 1 ? (
                        <text className="map-point-count" textAnchor="middle" y="4">
                          +{marker.count}
                        </text>
                      ) : null}
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
