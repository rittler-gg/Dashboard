import { useMemo } from "react";
import { geoMercator } from "d3-geo";
import type { LocationHealth, MapMarker } from "../types/dashboard";
import indiaGeoJsonRaw from "../assets/india-states.geojson?raw";

interface IndiaMapPanelProps {
  markers: MapMarker[];
  locationHealth: LocationHealth;
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

const MAP_PADDING = {
  left: 72,
  right: 72,
  top: 14,
  bottom: 20,
};

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

  const availableWidth = MAP_VIEWBOX.width - MAP_PADDING.left - MAP_PADDING.right;
  const availableHeight = MAP_VIEWBOX.height - MAP_PADDING.top - MAP_PADDING.bottom;
  const scale = Math.min(
    availableWidth / (maxX - minX),
    availableHeight / (maxY - minY),
  );
  const projectedWidth = (maxX - minX) * scale;
  const projectedHeight = (maxY - minY) * scale;
  const offsetX = MAP_PADDING.left + (availableWidth - projectedWidth) / 2;
  const offsetY = MAP_PADDING.top + (availableHeight - projectedHeight) / 2;

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

export function IndiaMapPanel({ markers, locationHealth }: IndiaMapPanelProps) {
  const projection = useMemo(() => createFittedProjector(indiaGeoJson.features), []);
  const projectedRegions = useMemo(
    () =>
      indiaGeoJson.features.map((feature, index) => ({
        id: `${feature.properties?.ST_NM ?? "state"}-${index}`,
        path: buildFeaturePath(feature.geometry, projection),
      })),
    [projection],
  );

  return (
    <section className="panel map-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order geography</p>
          <h2>India live order map</h2>
        </div>
        <div className="map-status-stack">
          {locationHealth.outOfIndiaCount > 0 ? (
            <span className="map-meta-pill">Outside India {locationHealth.outOfIndiaCount}</span>
          ) : null}
          {locationHealth.invalidCount > 0 ? (
            <span className="map-meta-pill">Fallbacks {locationHealth.invalidCount}</span>
          ) : null}
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
              {markers.map((marker, index) => {
                const projectedPoint = getMarkerPoint(marker, projection, index);

                if (!projectedPoint) {
                  return null;
                }

                const [x, y] = projectedPoint;
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
                    transform={`translate(${x}, ${y})`}
                  >
                    <g className={markerClassName} style={{ animationDelay: `${index * 120}ms` }}>
                      <circle className="map-point-glow" r="14" />
                      <circle className="map-point-outer" r="7.5" />
                      <circle className="map-point-core" r="3.2" />
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
