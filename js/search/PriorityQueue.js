// Binary min-heap priority queue.
// Ties are broken by insertion order (FIFO), so results are deterministic.

export class PriorityQueue {
  constructor() {
    this.heap = [];
    this.counter = 0;
  }

  get size() {
    return this.heap.length;
  }

  push(item, priority) {
    this.heap.push({ item, priority, order: this.counter++ });
    this._up(this.heap.length - 1);
  }

  /** Priority of the top element (Infinity if empty). */
  peekPriority() {
    return this.heap.length ? this.heap[0].priority : Infinity;
  }

  pop() {
    const h = this.heap;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      this._down(0);
    }
    return top.item;
  }

  _less(i, j) {
    const a = this.heap[i];
    const b = this.heap[j];
    return a.priority < b.priority || (a.priority === b.priority && a.order < b.order);
  }

  _swap(i, j) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this._less(i, p)) break;
      this._swap(i, p);
      i = p;
    }
  }

  _down(i) {
    const n = this.heap.length;
    for (;;) {
      let m = i;
      const l = 2 * i + 1;
      const r = l + 1;
      if (l < n && this._less(l, m)) m = l;
      if (r < n && this._less(r, m)) m = r;
      if (m === i) break;
      this._swap(i, m);
      i = m;
    }
  }
}
