type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  className?: string;
  textContent?: string;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  [key: string]: unknown;
}

/**
 * Small DOM helper used across the showcase. Unknown props become attributes,
 * `on*` functions become listeners, and known element properties are assigned.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      continue;
    }
    if (key === "className") {
      node.className = String(value);
      continue;
    }
    if (key === "dataset") {
      Object.assign(node.dataset, value as Record<string, string>);
      continue;
    }
    if (key === "style") {
      Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
      continue;
    }
    if (key in node) {
      (node as unknown as Record<string, unknown>)[key] = value;
      continue;
    }
    node.setAttribute(key, String(value));
  }

  appendChildren(node, children);
  return node;
}

export function appendChildren(node: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(
      typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child
    );
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 10_000 || abs < 0.001)) return value.toExponential(2);
  return value.toFixed(digits);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
