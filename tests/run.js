// Run with:  node tests/run.js
//
// 1. A small Metro graph (inspired by the class example Tlatelolco -> Allende):
//    every optimal algorithm must match a brute-force optimum.
// 2. Every pair of places in data/pumabus.json and data/bicipuma.json, with every
//    criterion: optimal algorithms must agree, IDDFS must match BFS in steps, and
//    the heuristic must never overestimate.

import { readFileSync } from 'node:fs';
import { ALGORITHMS, runSearch, algorithmById } from '../js/search/index.js';
import { PumabusMap } from '../js/problems/PumabusMap.js';
import { BiciMap } from '../js/problems/BiciMap.js';

let failures = 0;
const EPS = 1e-9;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.error('  ✗ ' + msg);
  }
};

// ---------------------------------------------------------------------------
// 1. Metro graph test (undirected, weights = minutes). Adjust the weights to
//    match the slide if you want the exact class example.
// ---------------------------------------------------------------------------
class GraphProblem {
  constructor(edges, start, goal) {
    this.adj = new Map();
    for (const [a, b, w] of edges) {
      if (!this.adj.has(a)) this.adj.set(a, []);
      if (!this.adj.has(b)) this.adj.set(b, []);
      this.adj.get(a).push({ to: b, w });
      this.adj.get(b).push({ to: a, w });
    }
    this.start = start;
    this.goal = goal;
  }
  initialState() { return this.start; }
  isGoal(s) { return s === this.goal; }
  key(s) { return s; }
  placeOf(s) { return s; }
  heuristic() { return 0; } // no coordinates -> h = 0 (A* behaves like UCS)
  neighbors(s) { return this.adj.get(s).map(({ to, w }) => ({ state: to, cost: w, action: { text: `${s}→${to}` } })); }
  predecessors(s) { return this.neighbors(s); }
  goalStates() { return [this.goal]; }
}

const metroEdges = [
  ['Tlatelolco', 'Guerrero', 3],
  ['Guerrero', 'Hidalgo', 3],
  ['Guerrero', 'Garibaldi', 2],
  ['Hidalgo', 'Juárez', 2],
  ['Hidalgo', 'Bellas Artes', 5],
  ['Garibaldi', 'Bellas Artes', 6],
  ['Juárez', 'Balderas', 4],
  ['Bellas Artes', 'Allende', 2],
  ['Balderas', 'Salto del Agua', 2],
  ['Salto del Agua', 'San Juan de Letrán', 2],
  ['San Juan de Letrán', 'Bellas Artes', 2],
];

function bruteForceOptimum(problem) {
  let best = Infinity;
  const visit = (s, g, seen) => {
    if (g >= best) return;
    if (problem.isGoal(s)) { best = g; return; }
    for (const { state, cost } of problem.neighbors(s)) {
      if (seen.has(state)) continue;
      seen.add(state);
      visit(state, g + cost, seen);
      seen.delete(state);
    }
  };
  visit(problem.initialState(), 0, new Set([problem.initialState()]));
  return best;
}

console.log('1) Grafo del Metro (Tlatelolco → Allende)');
{
  const p = new GraphProblem(metroEdges, 'Tlatelolco', 'Allende');
  const optimum = bruteForceOptimum(p);
  console.log(`   Óptimo por fuerza bruta: ${optimum}`);
  for (const algo of ALGORITHMS) {
    const { result } = runSearch(new GraphProblem(metroEdges, 'Tlatelolco', 'Allende'), algo, { limit: 10 });
    const route = result.found ? result.path.join(' → ') : result.note;
    console.log(`   ${algo.name.padEnd(36)} costo=${String(result.cost).padEnd(4)} ${route}`);
    check(result.found, `${algo.name} no encontró ruta en el grafo del Metro`);
    if (algo.optimal) check(Math.abs(result.cost - optimum) < EPS, `${algo.name} no es óptimo (${result.cost} vs ${optimum})`);
  }
}

// ---------------------------------------------------------------------------
// 2. Real data files: all pairs, all criteria.
// ---------------------------------------------------------------------------
const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const maps = [new PumabusMap(load('pumabus.json')), new BiciMap(load('bicipuma.json'))];
const bfsAlgo = algorithmById('bfs');
const iddfsAlgo = algorithmById('iddfs');
const ucsAlgo = algorithmById('ucs');

for (const map of maps) {
  for (const crit of map.criteria) {
    let pairs = 0;
    for (const a of map.places()) {
      for (const b of map.places()) {
        pairs++;
        const mk = () => map.makeProblem(a.id, b.id, crit.id);
        const ref = runSearch(mk(), ucsAlgo).result;
        const tag = `${map.label}/${crit.id} ${a.id}→${b.id}`;

        // Heuristic never overestimates the true optimal cost from the start.
        if (ref.found) check(mk().heuristic(mk().initialState()) <= ref.cost + EPS, `${tag}: h sobreestima`);

        for (const algo of ALGORITHMS) {
          const { result } = runSearch(mk(), algo, { limit: 50 });
          check(result.found === ref.found, `${tag}: ${algo.name} found=${result.found}, UCS found=${ref.found}`);
          if (algo.optimal && ref.found) {
            check(Math.abs(result.cost - ref.cost) < 1e-6, `${tag}: ${algo.name} costo ${result.cost} ≠ ${ref.cost}`);
          }
          if (result.found) {
            // Path must be consistent: starts at A, ends at B, actions = steps.
            check(mk().placeOf(result.path[0]) === a.id, `${tag}: ${algo.name} no inicia en A`);
            check(mk().placeOf(result.path.at(-1)) === b.id, `${tag}: ${algo.name} no termina en B`);
            check(result.actions.length === result.path.length - 1, `${tag}: ${algo.name} acciones/pasos inconsistentes`);
          }
        }
        // IDDFS finds the same number of steps as BFS (both minimize steps).
        const rb = runSearch(mk(), bfsAlgo).result;
        const ri = runSearch(mk(), iddfsAlgo).result;
        if (rb.found) check(rb.actions.length === ri.actions.length, `${tag}: IDDFS pasos ${ri.actions.length} ≠ BFS ${rb.actions.length}`);
      }
    }
    console.log(`2) ${map.label} / ${crit.name}: ${pairs} pares probados`);
  }
}

console.log(failures ? `\n${failures} fallo(s)` : '\nTodas las pruebas pasaron ✓');
process.exit(failures ? 1 : 0);
