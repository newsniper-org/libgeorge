export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private q: T[] = [];
  private waiter?: (r: IteratorResult<T>) => void;
  private ended = false;

  constructor(private maxBuffered: number = 10_000) {}

  push(x: T): void {
    if (this.ended) throw new Error("queue already ended");
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = undefined;
      w({ value: x, done: false });
      return;
    }
    if (this.q.length >= this.maxBuffered) {
      throw new Error(`queue overflow (maxBuffered=${this.maxBuffered})`);
    }
    this.q.push(x);
  }

  end(): void {
    this.ended = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = undefined;
      w({ value: undefined as any, done: true });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.q.length) return { value: this.q.shift()!, done: false };
    if (this.ended) return { value: undefined as any, done: true };
    return await new Promise((resolve) => (this.waiter = resolve));
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: () => this.next() };
  }
}
