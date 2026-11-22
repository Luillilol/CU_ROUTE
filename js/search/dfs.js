// Depth-First Search (graph search with an explored set, so it never loops).
// Complete on finite graphs, NOT optimal: it returns the first route it stumbles on.

import { rootNode, childNode, newStats, solution, failure, MAX_EXPANSIONS } from './common.js';

export function* dfs(problem) {
  const stats = newStats();
  const stack = [rootNode(problem)];
  const explored = new Set();

  while (stack.length) {
    const node = stack.pop();
    if (explored.has(node.key)) continue;
    if (problem.isGoal(node.state)) return solution(node, stats);
    explored.add(node.key);

    if (stats.expanded >= MAX_EXPANSIONS) return failure(stats, 'Límite de expansiones');
    stats.expanded++;

    const added = [];
    const succs = problem.neighbors(node.state);
    // Push in reverse so the first neighbor is explored first.
    for (let i = succs.length - 1; i >= 0; i--) {
      const child = childNode(problem, node, succs[i]);
      if (explored.has(child.key)) continue;
      stats.generated++;
      stack.push(child);
      added.push(child.state);
    }
    stats.maxFrontier = Math.max(stats.maxFrontier, stack.length);
    yield { expanded: node.state, added };
  }
  return failure(stats);
}
