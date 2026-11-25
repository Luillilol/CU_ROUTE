// Breadth-First Search (graph search).
// Optimal in NUMBER OF STEPS, not in cost. Goal test when a node is generated.

import { rootNode, childNode, newStats, solution, failure, MAX_EXPANSIONS } from './common.js';

export function* bfs(problem) {
  const stats = newStats();
  const root = rootNode(problem);
  if (problem.isGoal(root.state)) return solution(root, stats);

  const queue = [root];
  let head = 0;
  const reached = new Set([root.key]);

  while (head < queue.length) {
    const node = queue[head++];
    if (stats.expanded >= MAX_EXPANSIONS) return failure(stats, 'Expansion limit reached');
    stats.expanded++;

    const added = [];
    for (const succ of problem.neighbors(node.state)) {
      const child = childNode(problem, node, succ);
      if (reached.has(child.key)) continue;
      stats.generated++;
      if (problem.isGoal(child.state)) {
        yield { expanded: node.state, added: [child.state] };
        return solution(child, stats);
      }
      reached.add(child.key);
      queue.push(child);
      added.push(child.state);
    }
    stats.maxFrontier = Math.max(stats.maxFrontier, queue.length - head);
    yield { expanded: node.state, added };
  }
  return failure(stats);
}
