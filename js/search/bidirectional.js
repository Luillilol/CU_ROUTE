// Bidirectional search (uniform-cost version, so it works with weighted edges).
//
// Two simultaneous searches: forward from the start, backward from the goal(s),
// using the REVERSED edges (problem.predecessors). This matters on directed graphs
// such as Pumabús lines, which run in only one direction.
//
// mu = cost of the best complete route found where both searches met.
// Stop when  top(forward) + top(backward) >= mu  -> mu is optimal.
// Each step expands the side with the smaller frontier.

import { PriorityQueue } from './PriorityQueue.js';
import { SearchNode, rootNode, newStats, solution, failure, MAX_EXPANSIONS } from './common.js';

export function* bidirectional(problem) {
  const stats = newStats();
  if (typeof problem.predecessors !== 'function' || typeof problem.goalStates !== 'function') {
    return failure(stats, 'Este problema no define aristas inversas');
  }

  const makeSide = (name) => ({ name, pq: new PriorityQueue(), best: new Map(), closed: new Set() });
  const F = makeSide('forward');
  const B = makeSide('backward');

  const root = rootNode(problem);
  F.best.set(root.key, root);
  F.pq.push(root, 0);
  for (const gs of problem.goalStates()) {
    const n = new SearchNode(gs, problem.key(gs));
    B.best.set(n.key, n);
    B.pq.push(n, 0);
  }

  let mu = Infinity;
  let meetKey = null;
  const checkMeet = (key) => {
    const f = F.best.get(key);
    const b = B.best.get(key);
    if (f && b && f.g + b.g < mu) {
      mu = f.g + b.g;
      meetKey = key;
    }
  };
  checkMeet(root.key); // start may already be a goal

  while (F.pq.size && B.pq.size) {
    if (F.pq.peekPriority() + B.pq.peekPriority() >= mu) break;

    const S = F.pq.size <= B.pq.size ? F : B;
    const node = S.pq.pop();
    if (S.closed.has(node.key)) continue;
    S.closed.add(node.key);

    if (stats.expanded >= MAX_EXPANSIONS) break;
    stats.expanded++;

    const succs = S === F ? problem.neighbors(node.state) : problem.predecessors(node.state);
    const added = [];
    for (const { state, cost, action } of succs) {
      const key = problem.key(state);
      if (S.closed.has(key)) continue;
      const g = node.g + cost;
      const old = S.best.get(key);
      if (old && old.g <= g) continue;
      // In the backward side, `parent` points one step CLOSER TO THE GOAL.
      const child = new SearchNode(state, key, node, action, g, node.depth + 1);
      S.best.set(key, child);
      S.pq.push(child, g);
      stats.generated++;
      added.push(state);
      checkMeet(key);
    }
    stats.maxFrontier = Math.max(stats.maxFrontier, F.pq.size + B.pq.size);
    yield { expanded: node.state, added, side: S.name };
  }

  if (meetKey === null) return failure(stats);

  // Forward half: start -> meeting point.
  const f = F.best.get(meetKey);
  const b = B.best.get(meetKey);
  const result = solution(f, stats);
  // Backward half: meeting point -> goal.
  for (let n = b; n.parent; n = n.parent) {
    result.actions.push(n.action);
    result.path.push(n.parent.state);
  }
  result.cost = f.g + b.g;
  return result;
}
