import { supabase } from './supabaseClient.js';

const functionsClient = supabase.functions;
const originalInvoke = functionsClient.invoke.bind(functionsClient);

function detailFromPayload(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload !== 'object') return String(payload);

  const providerMessage = payload?.detalhe?.error?.message
    || payload?.detalhe?.message
    || payload?.detalhe?.error
    || payload?.message;
  const main = payload?.error || providerMessage || '';
  const code = payload?.code ? ` [${payload.code}]` : '';
  const request = payload?.request_id ? ` · ID ${payload.request_id}` : '';
  const provider = providerMessage && providerMessage !== main ? ` Detalhe: ${providerMessage}` : '';

  return `${main}${code}${provider}${request}`.trim();
}

async function readErrorResponse(response) {
  if (!(response instanceof Response)) return '';
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    try { payload = await response.clone().text(); } catch { payload = null; }
  }
  const detail = detailFromPayload(payload);
  return detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}: falha na Edge Function.`;
}

functionsClient.invoke = async function invokeWithDetails(functionName, options) {
  const result = await originalInvoke(functionName, options);
  if (!result?.error) return result;

  const detailed = await readErrorResponse(result.error.context);
  if (!detailed) return result;

  try {
    result.error.message = detailed;
  } catch {
    result.error = Object.assign(new Error(detailed), result.error, { message: detailed });
  }
  return result;
};
