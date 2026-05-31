const HTTP_RETRIES = 4;
const HTTP_BACKOFF_BASE_MS = 1000;
const HTTP_LOG_PREVIEW = 400;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toPreview(value: string): string {
  return value.length > HTTP_LOG_PREVIEW ? `${value.slice(0, HTTP_LOG_PREVIEW)}...` : value;
}

function methodOf(init?: RequestInit): string {
  return (init?.method ?? 'GET').toUpperCase();
}

async function requestTextWithRetry(url: string, init?: RequestInit): Promise<string> {
  let lastError: unknown = null;
  const method = methodOf(init);

  for (let attempt = 1; attempt <= HTTP_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store'
      });
      const body = await response.text();
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        console.warn('[http] non-ok response', {
          method,
          url,
          attempt,
          status: response.status,
          durationMs,
          bodyPreview: toPreview(body)
        });
        throw new Error(`HTTP ${response.status} for ${url}: ${toPreview(body)}`);
      }

      console.log('[http] ok response', {
        method,
        url,
        attempt,
        status: response.status,
        durationMs,
        bodyPreview: toPreview(body)
      });
      return body;
    } catch (error) {
      lastError = error;
      console.warn('[http] request failed', {
        method,
        url,
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < HTTP_RETRIES) {
        const backoffMs = HTTP_BACKOFF_BASE_MS * 2 ** (attempt - 1);
        console.warn('[http] retry backoff', { method, url, attempt, backoffMs });
        await sleep(backoffMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const body = await requestTextWithRetry(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {})
    }
  });
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    console.error('[http] json parse failed', {
      method: methodOf(init),
      url,
      error: error instanceof Error ? error.message : String(error),
      bodyPreview: toPreview(body)
    });
    throw error;
  }
}

export async function getText(url: string, init?: RequestInit): Promise<string> {
  return requestTextWithRetry(url, init);
}
