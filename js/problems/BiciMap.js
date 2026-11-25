// BiciPuma map: an UNDIRECTED weighted graph of bike stations and bike-lane
// intersections. A and B must be stations (where bikes are taken/returned).
//
// State: node id (string).
// Criteria:
//   'time'     -> cost in minutes   (meters / bike speed)
//   'distance' -> cost in meters
// Heuristic: straight-line distance (converted to the same unit). Edge lengths
// are never shorter than the straight line, so h never overestimates (admissible
// and consistent) -> A*, UCS, DFBB and bidirectional are optimal.

import { haversine, kmhToMpm, fmt } from '../geo.js';

export class BiciMap {
  constructor(data) {
    this.data = data;
    this.nodes = new Map(data.nodes.map((n) => [n.id, n]));
    this.speed = kmhToMpm(data.speed_kmh ?? 12); // meters per minute
    const detour = data.detour_factor ?? 1;
    this.adj = new Map(data.nodes.map((n) => [n.id, []]));
    this.rev = new Map(data.nodes.map((n) => [n.id, []]));
    this.edges = [];

    for (const e of data.edges) {
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) throw new Error(`BiciPuma: la arista ${e.from} → ${e.to} usa un nodo inexistente`);
      const straight = haversine(a, b);
      const meters = Math.max(e.meters ?? straight * detour, straight);
      this.edges.push({ from: e.from, to: e.to, meters });
      this.adj.get(e.from).push({ to: e.to, meters });
      this.rev.get(e.to).push({ to: e.from, meters });
      if (!e.oneway) {
        this.adj.get(e.to).push({ to: e.from, meters });
        this.rev.get(e.from).push({ to: e.to, meters });
      }
    }
  }

  get label() {
    return 'BiciPuma';
  }

  get criteria() {
    return [
      { id: 'time', name: 'Más rápida (minutos)' },
      { id: 'distance', name: 'Más corta (metros)' },
    ];
  }

  name(id) {
    return this.nodes.get(id)?.name ?? id;
  }

  /** Places the user can choose as A or B. */
  places() {
    return this.data.nodes.filter((n) => n.station);
  }

  /** Geometry for the map. */
  drawNodes() {
    return this.data.nodes.map((n) => ({ ...n, selectable: !!n.station }));
  }

  drawSegments() {
    return this.edges.map((e) => ({
      coords: [this.nodes.get(e.from), this.nodes.get(e.to)].map((n) => [n.lat, n.lon]),
      color: '#6a994e',
      label: `${Math.round(e.meters)} m`,
    }));
  }

  coordsOf(id) {
    const n = this.nodes.get(id);
    return [n.lat, n.lon];
  }

  makeProblem(start, goal, criterion = 'time') {
    return new BiciProblem(this, start, goal, criterion);
  }
}

class BiciProblem {
  constructor(map, start, goal, criterion) {
    this.map = map;
    this.start = start;
    this.goal = goal;
    this.criterion = criterion;
    this.goalNode = map.nodes.get(goal);
  }

  _cost(meters) {
    return this.criterion === 'time' ? meters / this.map.speed : meters;
  }

  _action(from, to, meters) {
    return {
      type: 'bike',
      from,
      to,
      meters,
      minutes: meters / this.map.speed,
      text: `Pedalea de ${this.map.name(from)} a ${this.map.name(to)} (${Math.round(meters)} m)`,
    };
  }

  initialState() {
    return this.start;
  }

  isGoal(s) {
    return s === this.goal;
  }

  key(s) {
    return s;
  }

  placeOf(s) {
    return s;
  }

  neighbors(s) {
    return this.map.adj.get(s).map(({ to, meters }) => ({
      state: to,
      cost: this._cost(meters),
      action: this._action(s, to, meters),
    }));
  }

  predecessors(s) {
    return this.map.rev.get(s).map(({ to: from, meters }) => ({
      state: from,
      cost: this._cost(meters),
      action: this._action(from, s, meters),
    }));
  }

  goalStates() {
    return [this.goal];
  }

  heuristic(s) {
    return this._cost(haversine(this.map.nodes.get(s), this.goalNode));
  }

  /** Human-readable totals. */
  summarize(result) {
    const meters = result.actions.reduce((acc, a) => acc + a.meters, 0);
    const minutes = result.actions.reduce((acc, a) => acc + a.minutes, 0);
    return { minutes, meters, text: `${fmt(minutes)} min · ${Math.round(meters)} m` };
  }

  /** Itinerary: consecutive segments merged until reaching a station. */
  itinerary(result) {
    const lines = [];
    let seg = null;
    for (const a of result.actions) {
      if (!seg) seg = { from: a.from, to: a.to, meters: 0 };
      seg.to = a.to;
      seg.meters += a.meters;
      if (this.map.nodes.get(a.to)?.station) {
        lines.push(`Pedalea de ${this.map.name(seg.from)} a ${this.map.name(seg.to)} (${Math.round(seg.meters)} m)`);
        seg = null;
      }
    }
    if (seg) lines.push(`Pedalea de ${this.map.name(seg.from)} a ${this.map.name(seg.to)} (${Math.round(seg.meters)} m)`);
    if (result.actions.length) lines.push(`Deja la bici en ${this.map.name(this.goal)}`);
    return lines;
  }
}
