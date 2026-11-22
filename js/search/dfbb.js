// Depth-First Branch and Bound (DFBB).
//
// Depth-first exploration that keeps the cost of the best route found so far
// (the "bound"). Any branch whose optimistic estimate g + h already reaches the
// bound is pruned, so the final answer is OPTIMAL.
//   - Children are explored best-first (lowest g + h) so a good bound appears early.
//   - bestG remembers the cheapest cost seen per state, to avoid re-exploring
//     the same state through a more expensive path.

import { rootNode, childNode, newStats, solution, failure, MAX_EXPANSIONS } from './common.js';

export function* dfbb(problem) {
  const stats = newStats();
  const stack = [rootNode(problem)];
  const bestG = new Map();
  let bound = Infinity;
  let best = null;
  let improvements = 0;

  while (stack.length) {
    const node = stack.pop();
    if (node.g + problem.heuristic(node.state) >= bound) continue; // prune
    const seen = bestG.get(node.key);
    if (seen !== undefined && seen <= node.g) continue;
    bestG.set(node.key, node.g);

    if (problem.isGoal(node.state)) {
      bound = node.g; // new, tighter bound
      best = node;
      improvements++;
      yield { expanded: node.state, added: [], bound };
      continue;
    }

    if (stats.expanded >= MAX_EXPANSIONS) break;
    stats.expanded++;

    const children = problem
      .neighbors(node.state)
      .map((s) => childNode(problem, node, s))
      .map((c) => ({ c, f: c.g + problem.heuristic(c.state) }))
      .filter((x) => x.f < bound)
      .sort((a, b) => b.f - a.f); // worst first on the stack -> best popped first

    const added = [];
    for (const { c } of children) {
      stats.generated++;
      stack.push(c);
      added.push(c.state);
    }
    stats.maxFrontier = Math.max(stats.maxFrontier, stack.length);
    yield { expanded: node.state, added };
  }

  if (!best) return failure(stats);
  return solution(best, stats, { note: `Cota mejorada ${improvements} vez/veces` });
}
