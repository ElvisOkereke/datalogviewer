/** Append-only Float64Array that doubles its capacity as needed. */
export class GrowableF64 {
  private buf = new Float64Array(1024);
  length = 0;

  push(v: number): void {
    if (this.length === this.buf.length) {
      const next = new Float64Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = v;
  }

  /** Exact-length copy, so its buffer can be transferred without dragging spare capacity along. */
  toArray(): Float64Array {
    return this.buf.slice(0, this.length);
  }
}
