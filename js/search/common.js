// Shared pieces for every search algorithm.
//
// Every algorithm works on a "Problem" object with this interface:
//   initialState()          -> state
//   isGoal(state)           -> boolean
//   neighbors(state)        -> [{ state, cost, action }]
//   heuristic(state)        -> estimated remaining cost (never overestimates)
//   key(state)              -> string id (used for visited sets)
//   placeOf(state)          -> map node id (used only for drawing)
// Optional (needed by bidirectional search):
//   predecessors(state)     -> [{ state, cost, action }]  (reverse edges)
//   goalStates()            -> [state]
//
// Every algorithm is a generator function: it `yield`s one event per expansion
// (used by the animation) and `return`s a result object at the end.

/** Safety cap so a bad configuration never freezes the browser tab. */
export const MAX_EXPANSIONS = 300000;

export class SearchNode {
  constructor(state, key, parent = null, action = null, g = 0, depth = 0) {
    this.state = state;
    this.key = key;
    this.parent = parent;
    this.action = action; // action that led from parent to this node
    this.g = g; // path cost from the start
    this.depth = depth; // number of actions from the start
  }
}

export function rootNode(problem) {
  const s = problem.initialState();
  return new SearchNode(s, problem.key(s));
}

export function childNode(problem, parent, { state, cost, action }) {
  return new SearchNode(
    state,
    problem.key(state),
    parent,
    action,
    parent.g + cost,
    parent.depth + 1,
  );
}

export function newStats() {
  return { expanded: 0, generated: 0, maxFrontier: 0 };
}

/** Build the result object by following parent pointers back to the root. */
export function solution(node, stats, extra = {}) {
  const path = [];
  const actions = [];
  for (let n = node; n; n = n.parent) {
    path.push(n.state);
    if (n.action) actions.push(n.action);
  }
  path.reverse();
  actions.reverse();
  return { found: true, path, actions, cost: node.g, stats, note: '', ...extra };
}

export function failure(stats, note = 'No existe ruta') {
  return { found: false, path: [], actions: [], cost: Infinity, stats, note };
}
