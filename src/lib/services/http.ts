const HTTP_RETRIES = 4;
const HTTP_BACKOFF_BASE_MS = 1000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= HTTP_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store'
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 180)}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < HTTP_RETRIES) {
        await sleep(HTTP_BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await requestWithRetry(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {})
    }
  });
  return (await response.json()) as T;
}

export async function getText(url: string, init?: RequestInit): Promise<string> {
  const response = await requestWithRetry(url, init);
  return response.text();
}
