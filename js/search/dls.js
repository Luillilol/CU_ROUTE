// Depth-Limited Search (DLS) and Iterative Deepening DFS (IDDFS).
//
// DLS: DFS that never goes deeper than ℓ.
//   - ℓ smaller than the shallowest solution  -> no solution (cutoff)
//   - ℓ larger                                 -> may return a sub-optimal route
// IDDFS: runs DLS with ℓ = 0, 1, 2, ... -> finds the route with the FEWEST STEPS
//   using little memory, at the price of repeating work.
//
// To avoid exponential blow-up on graphs with cycles we remember the smallest
// depth at which each state was reached in the current iteration and skip
// re-visits at an equal or greater depth.

import { rootNode, childNode, newStats, solution, failure, MAX_EXPANSIONS } from './common.js';

/** Core DLS. Returns { result, cutoff }. Shares `stats` so IDDFS can accumulate. */
export function* depthLimited(problem, limit, stats) {
  const stack = [rootNode(problem)];
  const bestDepth = new Map();
  let cutoff = false;

  while (stack.length) {
    const node = stack.pop();
    const seen = bestDepth.get(node.key);
    if (seen !== undefined && seen <= node.depth) continue;
    bestDepth.set(node.key, node.depth);

    if (problem.isGoal(node.state)) return { result: solution(node, stats), cutoff };
    if (node.depth >= limit) {
      cutoff = true;
      continue;
    }
    if (stats.expanded >= MAX_EXPANSIONS) {
      return { result: failure(stats, 'Límite de expansiones'), cutoff, aborted: true };
    }
    stats.expanded++;

    const added = [];
    const succs = problem.neighbors(node.state);
    for (let i = succs.length - 1; i >= 0; i--) {
      const child = childNode(problem, node, succs[i]);
      const d = bestDepth.get(child.key);
      if (d !== undefined && d <= child.depth) continue;
      stats.generated++;
      stack.push(child);
      added.push(child.state);
    }
    stats.maxFrontier = Math.max(stats.maxFrontier, stack.length);
    yield { expanded: node.state, added };
  }
  return { result: failure(stats), cutoff };
}

export function* dls(problem, opts = {}) {
  const limit = opts.limit ?? 10;
  const stats = newStats();
  const { result, cutoff } = yield* depthLimited(problem, limit, stats);
  if (!result.found && cutoff) result.note = `Sin ruta con ℓ = ${limit} (corte por profundidad)`;
  result.depthLimit = limit;
  return result;
}

export function* iddfs(problem, opts = {}) {
  const maxDepth = opts.maxDepth ?? 500;
  const stats = newStats();
  for (let limit = 0; limit <= maxDepth; limit++) {
    yield { restart: true, depth: limit };
    const { result, cutoff, aborted } = yield* depthLimited(problem, limit, stats);
    if (result.found) {
      result.depthLimit = limit;
      return result;
    }
    if (aborted) return result;
    if (!cutoff) return failure(stats); // the whole graph was explored: no route
  }
  return failure(stats, 'Se alcanzó la profundidad máxima');
}
