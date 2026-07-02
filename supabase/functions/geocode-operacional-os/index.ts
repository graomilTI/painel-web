// Preenche operacional_os.ponto1_latitude/longitude para O.S. cujo embarque
// (texto "UF - Cidade (Local)" vindo do agente grm_lista_os_importacoes) nunca
// teve coordenada resolvida, ou só tem a versão aproximada (fallback de cidade
// via Nominatim, veja abaixo).
//
// Ordem de resolução, do mais preciso pro menos preciso:
//   1) operacional_pontos_embarque casado por embarque_label EXATO (coluna gerada
//      "UF - Cidade (Local)", igual ao formato de operacional_os.embarque) — é o
//      armazém/fazenda real, mesmo local exato citado na O.S. Confirmado batendo
//      98% das O.S. depois de importar a planilha "Locais de Serviço" completa
//      (2026-07-02): a tabela só tinha 992 locais antes (sincronizados aos poucos
//      pelo agente), a planilha trouxe 4339 de uma vez.
//   2) operacional_pontos_embarque casado só por UF+Cidade — quando o nome exato
//      do local não bate mas a cidade tem outro ponto cadastrado, ainda é melhor
//      que um centro de cidade genérico.
//   3) Nominatim (OpenStreetMap), tentando local+cidade primeiro — nome informal
//      de fazenda/armazém quase nunca resolve — e caindo pra só cidade/UF quando
//      falha. Marcado como aproximado (operacional.js detecta pelo formato do
//      ponto1_nome: sem "·" = aproximado, com "·" = local real).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100; // politica de uso do Nominatim: max. 1 req/s
const ERRO_RETRY_DIAS = 7;
const PREFIXO_CHAVE = 'os_embarque:';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function normKey(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

type Embarque = { uf: string; cidade: string; local: string };

function splitEmbarque(t: string): Embarque | null {
  const m = String(t || '').match(/^([A-Za-z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/);
  if (!m) return null;
  const uf = m[1].toUpperCase();
  const cidade = m[2].trim();
  if (!uf || !cidade) return null;
  return { uf, cidade, local: (m[3] || '').trim() };
}

type GeoResult = { lat: number; lng: number; display: string } | null;

async function nominatimSearch(params: Record<string, string>): Promise<GeoResult> {
  try {
    const qs = new URLSearchParams({ ...params, format: 'jsonv2', limit: '1', countrycodes: 'br' });
    const res = await fetch(`${NOMINATIM_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display: String(item.display_name || '').trim() };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const limite = Math.max(1, Math.min(50, Number((body as any)?.limite) || 25));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) O.S. com embarque parseável e sem local REAL ainda — inclui as sem coordenada nenhuma
    // e as que só têm a versão aproximada (ponto1_nome sem "·"), pra tentar melhorar com o passo 2.
    const { data: todasRaw, error: todasErr } = await supabase
      .from('operacional_os')
      .select('embarque,ponto1_latitude,ponto1_nome')
      .not('embarque', 'is', null);
    if (todasErr) throw todasErr;

    const porEmbarque = new Map<string, Embarque>();
    (todasRaw || []).forEach((r: any) => {
      const jaTemLocalReal = r.ponto1_latitude != null && typeof r.ponto1_nome === 'string' && r.ponto1_nome.includes('·');
      if (jaTemLocalReal) return;
      const texto = String(r.embarque || '').trim();
      if (!texto || porEmbarque.has(texto)) return;
      const parsed = splitEmbarque(texto);
      if (parsed) porEmbarque.set(texto, parsed);
    });

    if (!porEmbarque.size) {
      return json({ pendentes: 0, via_label_exato: 0, via_uf_cidade: 0, geocodificados_nominatim: 0, atualizadas: 0 });
    }

    const chaves = [...porEmbarque.keys()].map((texto) => ({ texto, chave: `${PREFIXO_CHAVE}${normKey(texto)}` }));

    // 2) operacional_pontos_embarque (relatório "Locais de Embarque") — sem limite de taxa,
    // é leitura local. Prioridade sobre Nominatim: é cadastro real da própria operação, não
    // um centro genérico geocodificado. Casa primeiro pelo embarque_label exato (local certo);
    // UF+Cidade fica só como segundo fallback quando o local exato não está cadastrado.
    const { data: pontosEmbarque, error: peErr } = await supabase
      .from('operacional_pontos_embarque')
      .select('uf,cidade,nome_local,latitude,longitude,embarque_label')
      .not('latitude', 'is', null);
    if (peErr) throw peErr;
    const pontosPorLabel = new Map<string, { nome_local: string; lat: number; lng: number }>();
    const pontosPorUfCidade = new Map<string, { nome_local: string; lat: number; lng: number }>();
    (pontosEmbarque || []).forEach((p: any) => {
      const ponto = { nome_local: p.nome_local, lat: Number(p.latitude), lng: Number(p.longitude) };
      const labelKey = String(p.embarque_label || '').trim();
      if (labelKey && !pontosPorLabel.has(labelKey)) pontosPorLabel.set(labelKey, ponto);
      const ufCidadeKey = `${normKey(p.uf)}|${normKey(p.cidade)}`;
      if (!pontosPorUfCidade.has(ufCidadeKey)) pontosPorUfCidade.set(ufCidadeKey, ponto);
    });

    // 3) Cache existente (Nominatim) — evita regeocodificar o mesmo local pra cada O.S. que o usa.
    const chaveList = chaves.map((c) => c.chave);
    const { data: cacheRaw, error: cacheErr } = await supabase
      .from('geocode_cache')
      .select('chave,latitude,longitude,endereco_resolvido,status,atualizado_em')
      .in('chave', chaveList.length ? chaveList : ['__none__']);
    if (cacheErr) throw cacheErr;

    const limiteRetryErro = Date.now() - ERRO_RETRY_DIAS * 24 * 60 * 60 * 1000;
    const cacheOk = new Map<string, { lat: number; lng: number; display: string }>();
    const cacheErroRecente = new Set<string>();
    (cacheRaw || []).forEach((c: any) => {
      if (c.status === 'ok' && c.latitude != null && c.longitude != null) {
        cacheOk.set(c.chave, { lat: Number(c.latitude), lng: Number(c.longitude), display: c.endereco_resolvido || '' });
      } else if (c.status === 'erro') {
        const atualizadoEm = c.atualizado_em ? new Date(c.atualizado_em).getTime() : 0;
        if (atualizadoEm > limiteRetryErro) cacheErroRecente.add(c.chave);
      }
    });

    // 4) Resolve via pontos_embarque primeiro (grátis, sem limite de taxa) — formata o nome no
    // mesmo padrão "NOME · CIDADE/UF" do backfill original, pra não ficar marcado como aproximado.
    // Label exato (local certo) antes de UF+Cidade (aproximação por cidade).
    let viaLabelExato = 0;
    let viaUfCidade = 0;
    const aindaPendentes: typeof chaves = [];
    for (const item of chaves) {
      if (cacheOk.has(item.chave)) continue;
      const parsed = porEmbarque.get(item.texto)!;
      const pontoExato = pontosPorLabel.get(item.texto);
      const pontoReal = pontoExato || pontosPorUfCidade.get(`${normKey(parsed.uf)}|${normKey(parsed.cidade)}`);
      if (!pontoReal) { aindaPendentes.push(item); continue; }
      const display = `${pontoReal.nome_local} · ${parsed.cidade}/${parsed.uf}`;
      const row = { chave: item.chave, tipo: 'cidade', latitude: pontoReal.lat, longitude: pontoReal.lng, endereco_resolvido: display, status: 'ok', atualizado_em: new Date().toISOString() };
      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;
      cacheOk.set(item.chave, { lat: pontoReal.lat, lng: pontoReal.lng, display });
      if (pontoExato) viaLabelExato++; else viaUfCidade++;
    }

    // 5) Nominatim pro que sobrou (até `limite` locais novos, 1 req/s): tenta local+cidade
    // primeiro e cai pra só cidade/UF quando falha — melhor um ponto na cidade certa do que nada.
    const pendentesGeo = aindaPendentes.filter((c) => !cacheErroRecente.has(c.chave));
    let lastCallAt = 0;
    async function throttledSearch(params: Record<string, string>): Promise<GeoResult> {
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return nominatimSearch(params);
    }

    const lote = pendentesGeo.slice(0, limite);
    let geocodificadosNominatim = 0;
    for (const { texto, chave } of lote) {
      const parsed = porEmbarque.get(texto)!;
      let resultado: GeoResult = null;
      if (parsed.local) {
        resultado = await throttledSearch({ q: `${parsed.local}, ${parsed.cidade}, ${parsed.uf}, Brasil` });
      }
      if (!resultado) {
        resultado = await throttledSearch({ city: parsed.cidade, state: parsed.uf });
      }
      const row = resultado
        ? { chave, tipo: 'cidade', latitude: resultado.lat, longitude: resultado.lng, endereco_resolvido: resultado.display, status: 'ok', atualizado_em: new Date().toISOString() }
        : { chave, tipo: 'cidade', latitude: null, longitude: null, endereco_resolvido: null, status: 'erro', atualizado_em: new Date().toISOString() };
      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;
      if (resultado) { cacheOk.set(chave, resultado); geocodificadosNominatim++; }
    }

    // 6) Grava operacional_os pra todo embarque já resolvido (cache antigo + pontos_embarque +
    // o que acabou de ser geocodificado agora), não só o lote desta execução.
    let atualizadas = 0;
    const falhas: { texto: string; erro: string }[] = [];
    for (const { texto, chave } of chaves) {
      const geo = cacheOk.get(chave);
      if (!geo) continue;
      const { error: updErr, count } = await supabase
        .from('operacional_os')
        .update(
          { ponto1_latitude: geo.lat, ponto1_longitude: geo.lng, ponto1_nome: geo.display || texto, updated_at: new Date().toISOString() },
          { count: 'exact' }
        )
        .eq('embarque', texto);
      if (updErr) { falhas.push({ texto, erro: updErr.message }); continue; }
      atualizadas += count || 0;
    }

    return json({
      pendentes: porEmbarque.size,
      via_label_exato: viaLabelExato,
      via_uf_cidade: viaUfCidade,
      chaves_pendentes_nominatim_antes: pendentesGeo.length,
      geocodificados_nominatim: geocodificadosNominatim,
      atualizadas,
      falhas_gravacao: falhas.length,
      falhas_detalhe: falhas.slice(0, 10),
      restantes_nominatim: Math.max(0, pendentesGeo.length - lote.length),
    });
  } catch (err) {
    console.error('[geocode-operacional-os]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
