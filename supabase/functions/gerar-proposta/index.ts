import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_MODELO_DOC_ID = '1oXtCy8kAs9hfivR62JYKknjw7s0VKGeLvRkhSCN0Vzg';
const DEFAULT_PASTA_DESTINO_ID = '13oHU_dFWBVe9h-YRk-ZmPTb1VoEWx0Pt';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
].join(' ');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function base64Url(input: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(payload: Record<string, unknown>, privateKey: string) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

function getServiceAccount() {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (raw) {
    const parsed = JSON.parse(raw);
    return {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
    };
  }
  return {
    client_email: Deno.env.get('GOOGLE_CLIENT_EMAIL'),
    private_key: String(Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n'),
  };
}

async function getGoogleAccessToken() {
  const account = getServiceAccount();
  if (!account.client_email || !account.private_key) {
    throw new Error('Credenciais Google não configuradas. Defina GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY.');
  }
  const now = Math.floor(Date.now() / 1000);
  const claim: Record<string, unknown> = {
    iss: account.client_email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const subject = Deno.env.get('GOOGLE_IMPERSONATE_EMAIL');
  if (subject) claim.sub = subject;

  const assertion = await signJwt(claim, account.private_key);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description || data?.error || 'Falha ao autenticar no Google.');
  return data.access_token as string;
}

function cleanFileName(value: string) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeDriveQuery(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function googleFetch(token: string, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error_description || message;
    } catch {
      message = await response.text();
    }
    throw new Error(`Google Drive/Docs: ${message}`);
  }
  return response;
}

async function uniqueName(token: string, folderId: string, baseName: string, extension: string) {
  const base = cleanFileName(baseName);
  for (let i = 1; i <= 999; i++) {
    const name = i === 1 ? `${base}${extension}` : `${base} (${i})${extension}`;
    const q = `'${escapeDriveQuery(folderId)}' in parents and name = '${escapeDriveQuery(name)}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const response = await googleFetch(token, url);
    const data = await response.json();
    if (!Array.isArray(data.files) || data.files.length === 0) return name;
  }
  return `${base} (${Date.now()})${extension}`;
}

function brDate(value: string | null | undefined) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function addReplacement(map: Map<string, string>, key: string, value: unknown) {
  const cleanKey = String(key || '').trim();
  const text = value == null ? '' : String(value);
  if (!cleanKey) return;
  const variants = new Set([
    cleanKey,
    cleanKey.toUpperCase(),
    cleanKey.toLowerCase(),
    ` ${cleanKey}`,
    `${cleanKey} `,
    ` ${cleanKey} `,
    ` ${cleanKey.toUpperCase()}`,
    `${cleanKey.toUpperCase()} `,
    ` ${cleanKey.toUpperCase()} `,
  ]);
  variants.forEach((variant) => map.set(`{{${variant}}}`, text));
}

function buildReplacements(proposta: Record<string, unknown>) {
  const map = new Map<string, string>();
  const campos = (proposta.campos && typeof proposta.campos === 'object') ? proposta.campos as Record<string, unknown> : {};
  const pairs: Record<string, unknown> = {
    'Nº': proposta.numero,
    'N°': proposta.numero,
    'NUMERO': proposta.numero,
    'CLIENTE': proposta.cliente,
    'ESTADOS': proposta.estados,
    'DATA': brDate(proposta.data_proposta as string),
    'PRAZO INICIAL': brDate(proposta.prazo_inicial as string),
    'PRAZO FINAL': brDate(proposta.prazo_final as string),
    'PRAZO FATURA': proposta.prazo_fatura,
    'PRAZO PGTO': proposta.prazo_pgto,
    'SOLICITANTE': proposta.solicitante,
    'CARGO': proposta.cargo,
    'TELEFONE': proposta.telefone,
    'EMAIL': proposta.email,
    'TN': proposta.tn,
    'CAD': proposta.cad,
    'AUD': proposta.aud,
    'QUALITY': proposta.quality,
    'INTACTA': proposta.intacta,
    'LACRAR': proposta.lacrar,
    'CIF': proposta.cif,
    'FOB': proposta.fob,
    'M.8H': proposta.m_8h,
    'M.12H': proposta.m_12h,
    'ADD SUP': proposta.add_sup,
    'ADD CLAF': proposta.add_claf,
    'T-GMOS': proposta.t_gmos,
    'T-GMOC': proposta.t_gmoc,
    'T-AFLAS': proposta.t_aflas,
    'T-AFLAC': proposta.t_aflac,
    'T-DON': proposta.t_don,
    ...campos,
  };
  Object.entries(pairs).forEach(([key, value]) => addReplacement(map, key, value));
  return [...map.entries()].map(([containsText, replaceText]) => ({
    replaceAllText: {
      containsText: { text: containsText, matchCase: true },
      replaceText,
    },
  }));
}

async function copyTemplate(token: string, modelId: string, folderId: string, name: string) {
  const response = await googleFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${modelId}/copy?supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
  );
  return response.json();
}

async function replaceMarkers(token: string, docId: string, requests: unknown[]) {
  if (!requests.length) return;
  await googleFetch(token, `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
}

async function uploadPdf(token: string, folderId: string, name: string, pdfBlob: Blob) {
  const boundary = `-------grao1000-${crypto.randomUUID()}`;
  const metadata = { name, parents: [folderId], mimeType: 'application/pdf' };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    pdfBlob,
    `\r\n--${boundary}--`,
  ]);
  const response = await googleFetch(
    token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return response.json();
}

async function trashFile(token: string, fileId: string) {
  await googleFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Variáveis Supabase não configuradas.');

    const authHeader = req.headers.get('authorization') || '';
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse({ error: 'Usuário não autenticado.' }, 401);

    const { proposta_id, formato = 'PDF' } = await req.json();
    if (!proposta_id) return jsonResponse({ error: 'Informe proposta_id.' }, 400);
    const outputFormat = String(formato).toUpperCase() === 'DOC' ? 'DOC' : 'PDF';

    const db = createClient(supabaseUrl, serviceKey);
    const { data: proposta, error: propostaError } = await db
      .from('propostas_comerciais')
      .select('*')
      .eq('id', proposta_id)
      .single();
    if (propostaError) throw propostaError;
    if (!proposta) throw new Error('Proposta não encontrada.');
    if (!proposta.numero || !proposta.cliente) throw new Error('Proposta sem número ou cliente.');

    const token = await getGoogleAccessToken();
    const folderId = proposta.pasta_destino_id || DEFAULT_PASTA_DESTINO_ID;
    const modelId = proposta.modelo_doc_id || DEFAULT_MODELO_DOC_ID;
    const baseName = `Proposta de Serviços Grão Mil #${proposta.numero} ${cleanFileName(proposta.cliente)}`;
    const finalName = await uniqueName(token, folderId, baseName, outputFormat === 'PDF' ? '.pdf' : '');
    const copyName = outputFormat === 'DOC' ? finalName : `Temp - ${baseName} - ${Date.now()}`;

    const copied = await copyTemplate(token, modelId, folderId, copyName);
    await replaceMarkers(token, copied.id, buildReplacements(proposta));

    let finalFile = copied;
    if (outputFormat === 'PDF') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pdfResponse = await googleFetch(
        token,
        `https://www.googleapis.com/drive/v3/files/${copied.id}/export?mimeType=${encodeURIComponent('application/pdf')}`,
      );
      const pdfBlob = await pdfResponse.blob();
      finalFile = await uploadPdf(token, folderId, finalName, pdfBlob);
      await trashFile(token, copied.id);
    }

    const { error: updateError } = await db
      .from('propostas_comerciais')
      .update({
        status: proposta.status === 'rascunho' ? 'gerada' : proposta.status,
        link_proposta: finalFile.webViewLink || finalFile.webContentLink || proposta.link_proposta,
        arquivo_drive_id: finalFile.id,
        arquivo_drive_nome: finalFile.name || finalName,
        formato_ultima_geracao: outputFormat,
        gerada_em: new Date().toISOString(),
      })
      .eq('id', proposta_id);
    if (updateError) throw updateError;

    return jsonResponse({
      ok: true,
      formato: outputFormat,
      arquivo_drive_id: finalFile.id,
      arquivo_drive_nome: finalFile.name || finalName,
      link_proposta: finalFile.webViewLink || finalFile.webContentLink || '',
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Erro ao gerar proposta.';
    return jsonResponse({ error: message }, 500);
  }
});
