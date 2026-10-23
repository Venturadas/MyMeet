/** Bound upstream requests without dropping the caller's cancellation signal. */
export function withRequestTimeout(timeoutMs = 10_000, fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (input instanceof Request) signals.push(input.signal);
    if (init?.signal) signals.push(init.signal);
    const signal = AbortSignal.any(signals);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = new URL(input instanceof Request ? input.url : String(input));
    // Only idempotent Data API reads retry. Writes, RPC POSTs and Auth do not.
    // Disable PostgREST's outer retries at client creation so this shared deadline
    // includes every attempt and backoff instead of restarting for each attempt.
    const retryable = ["GET", "HEAD"].includes(method) && url.pathname.startsWith("/rest/v1/");
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      let response: Response | undefined;
      try {
        response = await fetcher(input, { ...init, signal });
        if (!retryable || attempt >= 2 || ![503, 520].includes(response.status)) return response;
      } catch (error) {
        if (!retryable || attempt >= 2 || signal.aborted) throw error;
      }
      const retryAfter = response?.headers.get("retry-after");
      const advisedDelay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
      // Respect long provider backoffs by returning the failure for later retry,
      // rather than sleeping beyond this request or retrying earlier than asked.
      if (response && (advisedDelay >= timeoutMs || (retryAfter && !/^\d+$/.test(retryAfter)))) return response;
      await response?.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, Math.max(advisedDelay, 100 * 2 ** attempt));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  };
}
