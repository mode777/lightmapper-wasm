export type Rgb = [number, number, number];

/** Stable chart colors used by the Atlas view. Display-only, not a bake input. */
export function chartColor(index: number): Rgb {
  const hue = (index * 0.618033988749895) % 1;
  const h = hue * 6;
  const sector = Math.floor(h);
  const f = h - sector;
  const q = 1 - f;
  switch (sector % 6) {
    case 0: return [1, f, 0];
    case 1: return [q, 1, 0];
    case 2: return [0, 1, f];
    case 3: return [0, q, 1];
    case 4: return [f, 0, 1];
    default: return [1, 0, q];
  }
}

export function chartColors(count: number): Rgb[] {
  return Array.from({ length: count }, (_, index) => chartColor(index));
}
