export type RouteName = "gallery" | "demo" | "not-found";

export interface Route {
  name: RouteName;
  id?: string;
  query: URLSearchParams;
  path: string;
}

export function parseRoute(rawHash: string): Route {
  const withoutHash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const raw = withoutHash.length > 0 ? withoutHash : "/";
  const queryIndex = raw.indexOf("?");
  const path = (queryIndex >= 0 ? raw.slice(0, queryIndex) : raw).replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : "");
  const demo = path.match(/^\/p\/([^/]+)$/);

  if (path === "/") return { name: "gallery", path, query };
  if (demo) {
    let id = demo[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      // Keep the raw id; the catalog lookup will report not-found.
    }
    return { name: "demo", id, path, query };
  }
  return { name: "not-found", path, query };
}

export interface Router {
  start(): void;
  stop(): void;
  current(): Route;
}

export function createRouter(onRoute: (route: Route) => void): Router {
  let active = true;

  const notify = (): void => {
    if (!active) return;
    onRoute(parseRoute(window.location.hash));
  };

  return {
    start(): void {
      window.addEventListener("hashchange", notify);
      notify();
    },
    stop(): void {
      active = false;
      window.removeEventListener("hashchange", notify);
    },
    current(): Route {
      return parseRoute(window.location.hash);
    }
  };
}

export function demoHref(id: string): string {
  return `#/p/${encodeURIComponent(id)}`;
}
