// Pumabús map: a DIRECTED graph. Each line visits its stops in one direction
// (and loops back to the first stop if it is circular).
//
// State: { stop, line, pos }   (line = pos = null before boarding)
//   pos = position of the stop inside the route's sequence. It is needed because a
//   route may pass the same stop twice (e.g. Ruta 6 visits Pumitas twice).
// Actions:
//   board  : (stop, null)   -> (stop, L, p)      cost = average wait of L
//   ride   : (stop, L, p)   -> (next, L, p+1)    cost = travel time to the next stop
//   change : (stop, L, p)   -> (stop, L', p')    cost = wait of L' + transfer penalty
// Goal: any state whose stop is B.
// Criteria:
//   'time'      -> minutes
//   'transfers' -> minutes + a big weight per line change (fewest transfers first)
// Heuristic: straight-line distance / fastest bus speed (never overestimates).

import { haversine, kmhToMpm, fmt } from '../geo.js';

const TRANSFER_WEIGHT = 1000;

export class PumabusMap {
  constructor(data) {
    this.data = data;
    this.stops = new Map(data.stops.map((s) => [s.id, s]));
    this.penalty = data.transfer_penalty_min ?? 2;
    const detour = data.detour_factor ?? 1.3;

    this.lines = new Map();
    this.linesAt = new Map(data.stops.map((s) => [s.id, []])); // stop -> [{ line, pos }]
    this.next = new Map(); // "line|pos" -> { to, toPos, meters }
    this.prev = new Map(); // "line|pos" -> { from, fromPos, meters }
    this.maxSpeed = 0;

    for (const line of data.lines) {
      const speed = kmhToMpm(line.speed_kmh ?? data.speed_kmh ?? 15);
      this.maxSpeed = Math.max(this.maxSpeed, speed);
      const L = { ...line, speed, wait: line.wait_min ?? 5 };
      this.lines.set(line.id, L);

      const seq = [...line.stops];
      seq.forEach((id, pos) => {
        if (!this.stops.has(id)) throw new Error(`Pumabús: la ruta ${line.id} usa la parada inexistente ${id}`);
        this.linesAt.get(id).push({ line: line.id, pos });
      });

      const n = seq.length;
      const segments = line.circular ? n : n - 1;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % n;
        const from = seq[i];
        const to = seq[j];
        const straight = haversine(this.stops.get(from), this.stops.get(to));
        const given = line.segment_meters?.[i];
        const meters = Math.max(given ?? straight * detour, straight);
        this.next.set(`${line.id}|${i}`, { to, toPos: j, meters });
        this.prev.set(`${line.id}|${j}`, { from, fromPos: i, meters });
      }
    }
  }

  get label() {
    return 'Pumabús';
  }

  get criteria() {
    return [
      { id: 'time', name: 'Más rápida (minutos)' },
      { id: 'transfers', name: 'Menos transbordos' },
    ];
  }

  name(id) {
    return this.stops.get(id)?.name ?? id;
  }

  lineName(id) {
    return this.lines.get(id)?.name ?? id;
  }

  places() {
    return this.data.stops;
  }

  drawNodes() {
    return this.data.stops.map((s) => ({ ...s, selectable: true }));
  }

  drawSegments() {
    return [...this.lines.values()].map((L) => {
      const ids = L.circular ? [...L.stops, L.stops[0]] : L.stops;
      return {
        coords: ids.map((id) => [this.stops.get(id).lat, this.stops.get(id).lon]),
        color: L.color ?? '#457b9d',
        label: L.name,
      };
    });
  }

  coordsOf(id) {
    const s = this.stops.get(id);
    return [s.lat, s.lon];
  }

  makeProblem(start, goal, criterion = 'time') {
    return new PumabusProblem(this, start, goal, criterion);
  }
}

class PumabusProblem {
  constructor(map, start, goal, criterion) {
    this.map = map;
    this.start = start;
    this.goal = goal;
    this.criterion = criterion;
    this.goalStop = map.stops.get(goal);
  }

  // ---- action builders -------------------------------------------------
  _board(stop, lineId, pos) {
    const L = this.map.lines.get(lineId);
    return {
      state: { stop, line: lineId, pos },
      cost: L.wait,
      action: {
        type: 'board',
        line: lineId,
        minutes: L.wait,
        text: `Aborda ${L.name} en ${this.map.name(stop)} (espera ~${fmt(L.wait)} min)`,
      },
    };
  }

  _ride(from, to, lineId, toPos, meters) {
    const L = this.map.lines.get(lineId);
    const minutes = meters / L.speed;
    return {
      state: { stop: to, line: lineId, pos: toPos },
      cost: minutes,
      action: { type: 'ride', line: lineId, from, to, meters, minutes, text: `${L.name}: ${this.map.name(from)} → ${this.map.name(to)}` },
    };
  }

  _change(stop, fromLine, toLine, toPos) {
    const L = this.map.lines.get(toLine);
    const minutes = L.wait + this.map.penalty;
    const cost = this.criterion === 'transfers' ? minutes + TRANSFER_WEIGHT : minutes;
    return {
      state: { stop, line: toLine, pos: toPos },
      cost,
      action: {
        type: 'change',
        line: toLine,
        minutes,
        text: `Transborda de ${this.map.lineName(fromLine)} a ${L.name} en ${this.map.name(stop)} (~${fmt(minutes)} min)`,
      },
    };
  }

  // ---- Problem interface -----------------------------------------------
  initialState() {
    return { stop: this.start, line: null, pos: null };
  }

  isGoal(s) {
    return s.stop === this.goal;
  }

  key(s) {
    return s.line === null ? `${s.stop}|-` : `${s.stop}|${s.line}|${s.pos}`;
  }

  placeOf(s) {
    return s.stop;
  }

  neighbors(s) {
    const out = [];
    if (s.line === null) {
      for (const { line, pos } of this.map.linesAt.get(s.stop)) out.push(this._board(s.stop, line, pos));
      return out;
    }
    const nx = this.map.next.get(`${s.line}|${s.pos}`);
    if (nx) out.push(this._ride(s.stop, nx.to, s.line, nx.toPos, nx.meters));
    for (const { line, pos } of this.map.linesAt.get(s.stop)) {
      if (line !== s.line) out.push(this._change(s.stop, s.line, line, pos));
    }
    return out;
  }

  /** Reverse edges (used by bidirectional search). */
  predecessors(s) {
    if (s.line === null) return []; // only the start state has line = null
    const out = [];
    const pv = this.map.prev.get(`${s.line}|${s.pos}`);
    if (pv) {
      const r = this._ride(pv.from, s.stop, s.line, s.pos, pv.meters);
      out.push({ state: { stop: pv.from, line: s.line, pos: pv.fromPos }, cost: r.cost, action: r.action });
    }
    const b = this._board(s.stop, s.line, s.pos);
    out.push({ state: { stop: s.stop, line: null, pos: null }, cost: b.cost, action: b.action });
    for (const { line, pos } of this.map.linesAt.get(s.stop)) {
      if (line === s.line) continue;
      const c = this._change(s.stop, line, s.line, s.pos);
      out.push({ state: { stop: s.stop, line, pos }, cost: c.cost, action: c.action });
    }
    return out;
  }

  goalStates() {
    return [
      { stop: this.goal, line: null, pos: null },
      ...this.map.linesAt.get(this.goal).map(({ line, pos }) => ({ stop: this.goal, line, pos })),
    ];
  }

  heuristic(s) {
    return haversine(this.map.stops.get(s.stop), this.goalStop) / this.map.maxSpeed;
  }

  summarize(result) {
    const minutes = result.actions.reduce((acc, a) => acc + a.minutes, 0);
    const changes = result.actions.filter((a) => a.type === 'change').length;
    return { minutes, changes, text: `${fmt(minutes)} min · ${changes} transbordo(s)` };
  }

  /** Itinerary: consecutive rides on the same line merged into one line of text. */
  itinerary(result) {
    const merged = [];
    for (const a of result.actions) {
      const last = merged[merged.length - 1];
      if (a.type === 'ride' && last?.type === 'ride' && last.line === a.line) {
        last.to = a.to;
        last.stops++;
        last.minutes += a.minutes;
      } else {
        merged.push({ ...a, stops: a.type === 'ride' ? 1 : 0 });
      }
    }
    const lines = merged.map((a) =>
      a.type === 'ride'
        ? `${this.map.lineName(a.line)}: ${this.map.name(a.from)} → ${this.map.name(a.to)} (${a.stops} parada(s), ~${fmt(a.minutes)} min)`
        : a.text,
    );
    if (result.actions.length) lines.push(`Baja en ${this.map.name(this.goal)}`);
    return lines;
  }
}
