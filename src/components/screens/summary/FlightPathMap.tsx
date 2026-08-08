// The boarding pass's world map: the journey's stops numbered in round order,
// stamped rounds filled accent, missed rounds neutral. Rendered live with
// d3-geo (Natural Earth projection) over the world-atlas countries-110m
// TopoJSON, served as a same-origin static asset (public/countries-110m.json)
// — the app deliberately loads nothing from third-party CDNs at runtime.
// Reference implementation: design package map-render.html.
import { useEffect, useMemo, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Airport } from '../../../types';

export interface MapStop {
  airport: Airport;
  correct: boolean;
}

interface Props {
  /** The batch's answers in round order — home stays off the map (it's on the route line below). */
  stops: MapStop[];
}

const W = 760;
const H = 400;

type WorldTopo = Topology<{ countries: GeometryCollection }>;

let landCache: Promise<FeatureCollection<Geometry> | null> | null = null;

/** Fetches (once) and converts the TopoJSON to GeoJSON land features. */
function loadLand(): Promise<FeatureCollection<Geometry> | null> {
  if (!landCache) {
    landCache = fetch('/countries-110m.json')
      .then((res) => (res.ok ? (res.json() as Promise<WorldTopo>) : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((topo) => feature(topo, topo.objects.countries) as FeatureCollection<Geometry>)
      .catch(() => null); // the map degrades to stops on a bare graticule
  }
  return landCache;
}

export default function FlightPathMap({ stops }: Props) {
  const [land, setLand] = useState<FeatureCollection<Geometry> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLand().then((l) => {
      if (alive) setLand(l);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { path, projection } = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
    return { path: geoPath(projection), projection };
  }, []);

  const spherePath = useMemo(() => path({ type: 'Sphere' }) ?? undefined, [path]);
  const graticulePath = useMemo(() => path(geoGraticule10()) ?? undefined, [path]);
  const landPath = useMemo(() => (land ? (path(land) ?? undefined) : undefined), [land, path]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--radius-md)' }}
      role="img"
      aria-label={`World map of this journey's ${stops.length} stops`}
    >
      {/* Ocean and landmass shades are map artwork (see the gauges' note) —
          sampled from the design reference, not the Nocturne ramp. */}
      <path d={spherePath} fill="#1b1d2e" stroke="var(--color-neutral-800)" strokeWidth="1" />
      <path d={graticulePath} fill="none" stroke="var(--color-neutral-900)" strokeWidth="0.5" />
      {landPath && <path d={landPath} fill="#2b2d3c" stroke="var(--color-neutral-800)" strokeWidth="0.5" />}
      {stops.map((stop, i) => {
        const pos = projection([stop.airport.longitude, stop.airport.latitude]);
        if (!pos) return null;
        const [x, y] = pos;
        const ok = stop.correct;
        // Stamped stops carry a bright accent fill under a near-white ring;
        // missed ones are hollow with a dashed ring — two shapes you can tell
        // apart at a glance on the dark ocean, not two shades of dim.
        return (
          <g key={`${stop.airport.iata}-${i}`}>
            <circle
              cx={x}
              cy={y}
              r="10"
              fill={ok ? 'var(--color-accent-600)' : '#14151d'}
              stroke={ok ? 'var(--color-accent-100)' : 'var(--color-neutral-400)'}
              strokeWidth={ok ? 2 : 1.6}
              strokeDasharray={ok ? undefined : '3 2.5'}
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              fill={ok ? 'var(--color-accent-100)' : 'var(--color-neutral-300)'}
              fontFamily="var(--font-body)"
              fontSize="10.5"
              fontWeight="700"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
