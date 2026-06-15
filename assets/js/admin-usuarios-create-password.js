const originalFetch = window.fetch.bind(window);

function isCreateUserRequest(input, init) {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = String(init?.method || input?.method || 'GET').toUpperCase();
  return method === 'POST' && /\/api\/admin\/users\/create(?:\?|$)/.test(url);
}

function responseError(message, status = 500) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createdUserId(data) {
  return data?.id
    || data?.user?.id
    || data?.item?.id
    || data?.usuario?.id
    || data?.profile?.id
    || data?.data?.id
    || null;
}

async function readPayload(input, init) {
  if (typeof init?.body === 'string') return JSON.parse(init.body);
  if (input instanceof Request) return input.clone().json();
  return null;
}

function requestHeaders(input, init) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  return headers;
}

async function findCreatedUserId(email, headers) {
  const response = await originalFetch('/api/admin/users/list', { headers });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const target = String(email || '').trim().toLowerCase();
  const user = (Array.isArray(data?.items) ? data.items : [])
    .find((item) => String(item?.email || '').trim().toLowerCase() === target);
  return user?.id || null;
}

window.fetch = async function fetchWithCreatePasswordFix(input, init = {}) {
  if (!isCreateUserRequest(input, init)) return originalFetch(input, init);

  let payload;
  try {
    payload = await readPayload(input, init);
  } catch {
    return originalFetch(input, init);
  }

  const createResponse = await originalFetch(input, init);
  if (!createResponse.ok || !payload?.password) return createResponse;

  const createData = await createResponse.clone().json().catch(() => null);
  const headers = requestHeaders(input, init);
  const id = createdUserId(createData) || await findCreatedUserId(payload.email, headers);

  if (!id) {
    return responseError('Usuário criado, mas não foi possível localizar o cadastro para registrar a senha.');
  }

  const updateResponse = await originalFetch('/api/admin/users/update', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, id }),
  });

  if (!updateResponse.ok) {
    const errorData = await updateResponse.json().catch(() => null);
    return responseError(
      errorData?.error || errorData?.message || 'Usuário criado, mas a senha inicial não pôde ser registrada.',
      updateResponse.status,
    );
  }

  return createResponse;
};
