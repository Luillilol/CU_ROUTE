// Best-first family: Uniform-Cost Search, Greedy Best-First and A*.
// They are the same loop with a different priority:
//   UCS     -> g(n)
//   Greedy  -> h(n)
//   A*      -> f(n) = g(n) + h(n)
// Uses a priority queue with "lazy deletion": outdated entries are skipped when popped.

import { PriorityQueue } from './PriorityQueue.js';
import { rootNode, childNode, newStats, solution, failure, MAX_EXPANSIONS } from './common.js';

function* bestFirst(problem, priorityOf) {
  const stats = newStats();
  const root = rootNode(problem);
  const pq = new PriorityQueue();
  pq.push(root, priorityOf(root));
  const bestG = new Map([[root.key, 0]]);
  const closed = new Set();

  while (pq.size) {
    const node = pq.pop();
    if (closed.has(node.key)) continue; // outdated entry
    if (problem.isGoal(node.state)) return solution(node, stats);
    closed.add(node.key);

    if (stats.expanded >= MAX_EXPANSIONS) return failure(stats, 'Límite de expansiones');
    stats.expanded++;

    const added = [];
    for (const succ of problem.neighbors(node.state)) {
      const child = childNode(problem, node, succ);
      if (closed.has(child.key)) continue;
      const old = bestG.get(child.key);
      if (old !== undefined && old <= child.g) continue;
      bestG.set(child.key, child.g);
      stats.generated++;
      pq.push(child, priorityOf(child));
      added.push(child.state);
    }
    stats.maxFrontier = Math.max(stats.maxFrontier, pq.size);
    yield { expanded: node.state, added };
  }
  return failure(stats);
}

export function* ucs(problem) {
  return yield* bestFirst(problem, (n) => n.g);
}

export function* greedy(problem) {
  return yield* bestFirst(problem, (n) => problem.heuristic(n.state));
}

export function* astar(problem) {
  return yield* bestFirst(problem, (n) => n.g + problem.heuristic(n.state));
}
