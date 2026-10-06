// Geocodifica o CEP dos colaboradores de O.S. ativas (geocode_cache) pra roteirização.
// Falha do provedor (HTTP 403/429/5xx, timeout) NÃO é "CEP não encontrado": não grava 'erro'
// em geocode_cache (o cache de erro esconde o CEP por 7 dias) e devolve o motivo. Se o Nominatim
// barrar o IP do Supabase (403, 06/10/2026), o CEP cai pro ponto da cidade via Photon — o mesmo
// nível que já era gravado quando o CEP não existia no Nominatim (ver _shared/geocode-localidade.ts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { criarGeocodificador, embaralhar } from '../_shared/geocode-localidade.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100; // política de uso do Nominatim: máx. 1 req/s
const ERRO_RETRY_DIAS = 7;
// O front (frotas-roteirizacao.js) e o pg_cron esperam resposta rápida: o que sobrar fica pra próxima.
const PRAZO_PADRAO_MS = 40_000;
const PRAZO_FOLGA_MS = 10_000; // o item em andamento quando o prazo vence ainda pode terminar

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCep(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const limite = Math.max(1, Math.min(50, Number((body as any)?.limite) || 20));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) OS ativas (não finalizadas/devolvidas)
    const { data: osRows, error: osErr } = await supabase
      .from('operacional_os')
      .select('id')
      .eq('situacao', 'Ativo')
      .or('status_logistica.is.null,status_logistica.not.in.(FINALIZADA,DEVOLVIDA)');
    if (osErr) throw osErr;
    const osAtivasIds = new Set((osRows || []).map((r) => r.id));

    // 2) Vínculos colaborador <-> OS
    const { data: vinculosRaw, error: vincErr } = await supabase
      .from('operacional_os_colaboradores')
      .select('os_id,colaborador_key,created_at')
      .limit(2000);
    if (vincErr) throw vincErr;

    const vinculosOrdenados = (vinculosRaw || [])
      .filter((v) => osAtivasIds.has(v.os_id))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const colaboradorKeys = new Map<string, string>(); // normalize(nome) -> colaborador_key original
    for (const v of vinculosOrdenados) {
      const key = normalize(v.colaborador_key);
      if (!key || colaboradorKeys.has(key)) continue;
      colaboradorKeys.set(key, cleanStr(v.colaborador_key));
    }

    // 3) Endereços dos colaboradores (situação Ativo)
    const { data: colabsRaw, error: colabErr } = await supabase
      .from('colaboradores')
      .select('nome,cep,cidade,estado')
      .eq('situacao', 'Ativo')
      .limit(3000);
    if (colabErr) throw colabErr;

    const colabPorNome = new Map<string, { cep: string; cidade: string; estado: string }>();
    for (const c of (colabsRaw || [])) {
      colabPorNome.set(normalize(c.nome), { cep: cleanStr(c.cep), cidade: cleanStr(c.cidade), estado: cleanStr(c.estado) });
    }

    // 4) CEPs distintos a geocodificar
    const cepInfo = new Map<string, { cidade: string; estado: string }>();
    for (const nomeKey of colaboradorKeys.keys()) {
      const colab = colabPorNome.get(nomeKey);
      if (!colab) continue;
      const cep = normalizeCep(colab.cep);
      if (cep.length !== 8) continue;
      if (!cepInfo.has(cep)) cepInfo.set(cep, { cidade: colab.cidade, estado: colab.estado });
    }

    const todosCeps = [...cepInfo.keys()];

    // 5) O que já está no cache (ok, ou erro recente)
    const { data: cacheRaw, error: cacheErr } = await supabase
      .from('geocode_cache')
      .select('chave,status,atualizado_em')
      .in('chave', todosCeps.length ? todosCeps : ['__none__']);
    if (cacheErr) throw cacheErr;

    const limiteRetryErro = Date.now() - ERRO_RETRY_DIAS * 24 * 60 * 60 * 1000;
    const jaResolvidos = new Set<string>();
    for (const c of (cacheRaw || [])) {
      if (c.status === 'ok') { jaResolvidos.add(c.chave); continue; }
      const atualizadoEm = c.atualizado_em ? new Date(c.atualizado_em).getTime() : 0;
      if (atualizadoEm > limiteRetryErro) jaResolvidos.add(c.chave);
    }

    const pendentes = todosCeps.filter((cep) => !jaResolvidos.has(cep));

    // 6) Geocodificar até `limite` CEPs pendentes (1 req/s, política do Nominatim)
    const prazoMs = Math.max(5_000, Math.min(120_000, Number((body as any)?.prazo_ms) || PRAZO_PADRAO_MS));
    const inicio = Date.now();
    const geo = criarGeocodificador({ userAgent: NOMINATIM_USER_AGENT, delayMs: NOMINATIM_DELAY_MS, prazoAte: inicio + prazoMs + PRAZO_FOLGA_MS });

    const lote = embaralhar(pendentes).slice(0, limite);
    let ok = 0;
    let erro = 0;
    let transitorios = 0;
    const porProvedor = { nominatim: 0, photon: 0 };
    const motivos = new Set<string>();

    for (const cep of lote) {
      if (Date.now() - inicio > prazoMs) break; // o resto fica pra próxima execução
      const info = cepInfo.get(cep)!;
      const r = await geo.cep({ cep, cidade: info.cidade, uf: info.estado });

      // Falha do provedor (bloqueio/timeout) não é "CEP inexistente": não grava no cache.
      if (!r.ponto && !r.conclusivo) {
        transitorios++;
        if (r.motivo) motivos.add(r.motivo);
        continue;
      }

      const agora = new Date().toISOString();
      const row = r.ponto
        ? { chave: cep, tipo: r.tipo, latitude: r.ponto.lat, longitude: r.ponto.lng, endereco_resolvido: r.ponto.display, status: 'ok', atualizado_em: agora }
        : { chave: cep, tipo: 'cep', latitude: null, longitude: null, endereco_resolvido: null, status: 'erro', atualizado_em: agora };

      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;

      if (r.ponto) { ok++; porProvedor[r.ponto.provider]++; } else erro++;
    }

    // `processados` só conta o que foi resolvido ou recusado de vez: o front repete a chamada
    // enquanto houver processados, então um lote todo transitório (provedor fora) encerra o laço.
    const processados = ok + erro;
    return json({
      processados,
      ok,
      erro,
      transitorios,
      por_provedor: porProvedor,
      motivos_transitorios: [...motivos].slice(0, 5),
      restantes: Math.max(0, pendentes.length - processados), // inclui os transitórios
      total_ceps: todosCeps.length,
    });
  } catch (err) {
    console.error('[geocode-colaboradores]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
