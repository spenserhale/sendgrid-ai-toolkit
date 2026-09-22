export interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Resolve after this many ms (honours AbortSignal so timeouts can be tested). */
  delayMs?: number;
  /** Throw this instead of returning a response (simulates a network failure). */
  throwError?: unknown;
}

export interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface MockFetchHandle {
  calls: MockCall[];
  restore: () => void;
  /** Queue responses in order. */
  push: (...responses: MockResponseInit[]) => void;
  /** Route by URL substring + optional method; checked before the queue. */
  route: (match: string | RegExp, response: MockResponseInit, method?: string) => void;
}

const originalFetch = globalThis.fetch;

function abortable(delayMs: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Replace globalThis.fetch with a scripted stand-in. Call `restore()` in afterEach.
 */
export function mockFetch(...initial: MockResponseInit[]): MockFetchHandle {
  const queue: MockResponseInit[] = [...initial];
  const routes: Array<{ match: string | RegExp; method?: string; response: MockResponseInit }> = [];
  const calls: MockCall[] = [];

  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, headers, body });

    const routed = routes.find(
      (r) =>
        (r.method === undefined || r.method === method) &&
        (typeof r.match === "string" ? url.includes(r.match) : r.match.test(url)),
    );
    const next = routed?.response ?? queue.shift();
    if (!next) throw new Error(`mockFetch: no response for ${method} ${url}`);

    if (next.delayMs) await abortable(next.delayMs, init?.signal);
    if (next.throwError) throw next.throwError;

    const status = next.status ?? 200;
    const text =
      next.body === undefined
        ? ""
        : typeof next.body === "string"
          ? next.body
          : JSON.stringify(next.body);
    return new Response(status === 204 ? null : text, {
      status,
      headers: { "Content-Type": "application/json", ...next.headers },
    });
  };

  globalThis.fetch = impl as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    push: (...responses) => {
      queue.push(...responses);
    },
    route: (match, response, method) => {
      routes.push({ match, response, method });
    },
  };
}
