// Registry of the 9 algorithms + a helper to run one to completion.

import { bfs } from './bfs.js';
import { dfs } from './dfs.js';
import { dls, iddfs } from './dls.js';
import { dfbb } from './dfbb.js';
import { bidirectional } from './bidirectional.js';
import { ucs, greedy, astar } from './bestFirst.js';

export const ALGORITHMS = [
  { id: 'bfs', name: 'BFS (breadth-first)', fn: bfs, optimal: false },
  { id: 'dfs', name: 'DFS (depth-first)', fn: dfs, optimal: false },
  { id: 'dls', name: 'DLS (depth-limited)', fn: dls, optimal: false, usesLimit: true },
  { id: 'iddfs', name: 'IDDFS (iterative deepening)', fn: iddfs, optimal: false },
  { id: 'dfbb', name: 'DFBB (branch and bound)', fn: dfbb, optimal: true },
  { id: 'bidir', name: 'Bidirectional', fn: bidirectional, optimal: true },
  { id: 'ucs', name: 'Uniform cost (UCS)', fn: ucs, optimal: true },
  { id: 'greedy', name: 'Greedy Best-First', fn: greedy, optimal: false },
  { id: 'astar', name: 'A*', fn: astar, optimal: true },
];

export const algorithmById = (id) => ALGORITHMS.find((a) => a.id === id);

/**
 * Run an algorithm without animation.
 * Returns { result, ms, explored } where `explored` is the set of map places expanded.
 */
export function runSearch(problem, algo, opts = {}) {
  const explored = new Set();
  const gen = algo.fn(problem, opts);
  const t0 = performance.now();
  let step = gen.next();
  while (!step.done) {
    const ev = step.value;
    if (ev.restart) explored.clear();
    else if (ev.expanded !== undefined) explored.add(problem.placeOf(ev.expanded));
    step = gen.next();
  }
  const ms = performance.now() - t0;
  return { result: step.value, ms, explored };
}
