// Convert a geojson.io export into the JSON files the app uses.
//
// Usage:
//   node tools/geojson-to-data.js pumabus  pumabus.geojson  > data/pumabus.json
//   node tools/geojson-to-data.js bicipuma bicipuma.geojson > data/bicipuma.json
//
// How to draw in https://geojson.io
//   POINTS (stops / stations): add a property  name  (required).
//     Optional: id. For BiciPuma, add  station = false  for lane intersections.
//   LINES (LineString):
//     Pumabús  -> one line per Pumabús route, drawn IN THE DIRECTION THE BUS GOES,
//                 clicking exactly on each stop it serves (in order).
//                 Properties: id, name, color, wait_min. If the line ends on the
//                 same stop where it started, it is marked as circular.
//     BiciPuma -> draw each bike lane passing over the stations/intersections
//                 it connects. Every pair of consecutive points on the lane becomes
//                 an edge, with its real length measured along the drawn line.
//   A vertex counts as "on" a point if it is closer than SNAP_METERS (default 30).

import { readFileSync } from 'node:fs';
import { haversine } from '../js/geo.js';

const [mode, file] = process.argv.slice(2);
if (!['pumabus', 'bicipuma'].includes(mode) || !file) {
  console.error('Uso: node tools/geojson-to-data.js <pumabus|bicipuma> <archivo.geojson>');
  process.exit(1);
}
const SNAP = Number(process.env.SNAP_METERS ?? 30);
const gj = JSON.parse(readFileSync(file, 'utf8'));
const features = gj.type === 'FeatureCollection' ? gj.features : [gj];

const prefix = mode === 'pumabus' ? 'P' : 'N';
let auto = 1;
const points = features
  .filter((f) => f.geometry?.type === 'Point')
  .map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties ?? {};
    if (!p.name) console.error(`⚠ Punto sin "name" en ${lat},${lon}`);
    return {
      id: String(p.id ?? `${prefix}${String(auto++).padStart(2, '0')}`),
      name: p.name ?? `Punto ${auto}`,
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      ...(mode === 'bicipuma' ? { station: p.station !== false && p.station !== 'false' } : {}),
    };
  });

const lines = features.filter((f) => f.geometry?.type === 'LineString');

/** Walk a LineString, returning [{ id, metersFromPrev }] for vertices that snap to a point. */
function snapLine(coords) {
  const out = [];
  let acc = 0;
  let prev = null;
  for (const [lon, lat] of coords) {
    const v = { lat, lon };
    if (prev) acc += haversine(prev, v);
    prev = v;
    let best = null;
    let bestD = Infinity;
    for (const p of points) {
      const d = haversine(p, v);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && bestD <= SNAP) {
      if (out.length && out[out.length - 1].id === best.id) continue;
      out.push({ id: best.id, meters: out.length ? acc : 0 });
      acc = 0;
    }
  }
  return out;
}

let result;
if (mode === 'pumabus') {
  const outLines = lines.map((f, i) => {
    const p = f.properties ?? {};
    const snapped = snapLine(f.geometry.coordinates);
    let circular = false;
    if (snapped.length > 2 && snapped[0].id === snapped[snapped.length - 1].id) {
      circular = true;
    }
    const stops = snapped.map((s) => s.id);
    const segment_meters = snapped.slice(1).map((s) => Math.round(s.meters));
    if (circular) stops.pop(); // last stop == first stop
    if (stops.length < 2) console.error(`⚠ La ruta ${p.name ?? i + 1} toca menos de 2 paradas`);
    return {
      id: String(p.id ?? `R${i + 1}`),
      name: p.name ?? `Ruta ${i + 1}`,
      color: p.color ?? p.stroke ?? '#457b9d',
      wait_min: Number(p.wait_min ?? 8),
      circular,
      stops,
      segment_meters,
    };
  });
  result = { speed_kmh: 15, transfer_penalty_min: 2, detour_factor: 1.3, stops: points, lines: outLines };
} else {
  const edges = [];
  const seen = new Set();
  for (const f of lines) {
    const snapped = snapLine(f.geometry.coordinates);
    for (let i = 1; i < snapped.length; i++) {
      const a = snapped[i - 1].id;
      const b = snapped[i].id;
      const k = [a, b].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      const e = { from: a, to: b, meters: Math.round(snapped[i].meters) };
      if (f.properties?.oneway) e.oneway = true;
      edges.push(e);
    }
  }
  const used = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const p of points) if (!used.has(p.id)) console.error(`⚠ "${p.name}" no está conectado a ninguna ciclovía`);
  result = { speed_kmh: 12, detour_factor: 1, nodes: points, edges };
}

console.error(`✓ ${points.length} puntos, ${lines.length} líneas`);
console.log(JSON.stringify(result, null, 2));
