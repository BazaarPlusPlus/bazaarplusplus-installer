export interface IdentityTransportResponse {
  status: number;
  body: string;
}

export async function readJsonOrError<T>(
  response: IdentityTransportResponse
): Promise<T> {
  const body = ((): { error?: string } | T | null => {
    try {
      return (JSON.parse(response.body || 'null') as { error?: string } | T | null) ?? null;
    } catch {
      return null;
    }
  })();

  if (response.status < 200 || response.status >= 300) {
    const errorCode =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error ?? 'identity_request_failed')
        : 'identity_request_failed';
    throw new Error(errorCode);
  }

  return body as T;
}

export async function postJsonWithFetch(input: {
  url: string;
  body: string;
  authorization?: string;
}): Promise<IdentityTransportResponse> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.authorization
        ? { authorization: `Bearer ${input.authorization}` }
        : {})
    },
    body: input.body
  });

  return {
    status: response.status,
    body: await response.text()
  };
}
