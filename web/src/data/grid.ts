export type Decoder = (raw: number) => number | null;

export const decodeU8 =
  (min: number, max: number): Decoder =>
  (raw) =>
    raw === 255 ? null : min + (raw / 254) * (max - min);

export const decodeI16: Decoder = (raw) => (raw === -32768 ? null : raw);

const inUnit = (u: number, v: number): boolean => u >= 0 && u <= 1 && v >= 0 && v <= 1;

export class ValueGrid {
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly data: Int16Array | Uint8Array,
    private readonly decode: Decoder,
  ) {
    if (data.length !== width * height) throw new Error(`grid size ${data.length} != ${width}x${height}`);
  }

  private at(col: number, row: number): number | null {
    const raw = this.data[row * this.width + col];
    return raw === undefined ? null : this.decode(raw);
  }

  sample(u: number, v: number): number | null {
    if (!inUnit(u, v)) return null;
    const col = Math.min(this.width - 1, Math.floor(u * this.width));
    const row = Math.min(this.height - 1, Math.floor(v * this.height));
    return this.at(col, row);
  }

  bilinear(u: number, v: number): number | null {
    if (!inUnit(u, v)) return null;
    const fx = Math.min(Math.max(0, u * this.width - 0.5), this.width - 1);
    const fy = Math.min(Math.max(0, v * this.height - 0.5), this.height - 1);
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const c1 = Math.min(c0 + 1, this.width - 1);
    const r1 = Math.min(r0 + 1, this.height - 1);
    const q = [this.at(c0, r0), this.at(c1, r0), this.at(c0, r1), this.at(c1, r1)];
    if (q.some((x) => x === null)) return this.sample(u, v);
    const [a, b, c, d] = q as [number, number, number, number];
    const tx = fx - c0;
    const ty = fy - r0;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}
