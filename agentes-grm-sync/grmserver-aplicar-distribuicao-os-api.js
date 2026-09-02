#!/usr/bin/env node

/**
 * Aplica a distribuição de OS do painel direto no Graint via API, substituindo
 * o fluxo Puppeteer/UI (grm-sync-aplicar-distribuicao-os.js) — mesmo tipo de
 * migração já feita em Colaboradores e Lista de O.S. (ver
 * grmserver-colaboradores-api-realtime.js, grmserver-lista-os-api-realtime.js).
 *
 * Formato de escrita descoberto e validado ao vivo em 01/09 (ver memória
 * painel-web-distribuicao-os-api-investigacao): não usa resetSession nem
 * finalizeSession (chamar resetSession sem parear com um finalize trava a
 * sessão de edição da supervisão pro usuário AUTOMACOES — não fazer isso).
 * O fluxo real é:
 *   1. user/login -> token
 *   2. serviceOrder/distribution/getDistributionData {olsCode, sodDate} ->
 *      {staffs, sOrders} — cada item de sOrders já vem com staCodes (quem
 *      está associado agora).
 *   3. edita em memória o staCodes da(s) O.S. que precisa mudar
 *   4. serviceOrder/distribution/setDistributionData manda de volta o pacote
 *      INTEIRO (staffs + sOrders completos, não um diff) -> {result:true,
 *      message:"updateSuccess"}.
 *
 * olsCode de cada supervisão vem de supervision/getForSelect {olsStatus:"A"}
 * (não é por O.S., é por supervisão — cacheado uma vez por execução).
 *
 * Fonte de verdade de "quem deve estar associado" (02/09): programacao_equipe
 * (confirmado=true), não mais operacional_os_colaboradores. Decisão do usuário:
 * a Programação é a única forma de decidir distribuição — a tela Distribuir O.S.
 * virou somente leitura (reflete o que a Programação decidiu, ver distribuir-os.js).
 * O.S. sem linha confirmada em programacao_equipe é limpa no Graint mesmo que
 * ainda tenha um vínculo antigo em operacional_os_colaboradores.
 */

require('dotenv').config();
const https = require('https');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } }
);

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = Number(process.env.GRM_DISTRIBUICAO_OS_LIMIT || (limitArg ? limitArg.split('=')[1] : 0)) || 0;
// Sem browser pra travar, o timeout pode ser bem mais curto que o da versão Puppeteer (120min).
const TIMEOUT_MIN = Number(process.env.GRM_DISTRIBUICAO_OS_TIMEOUT_MIN || 20) || 20;

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function dateKey(value) { return String(value || '').slice(0, 10); }
function toBrDate(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : null; }
function dataAceitaNoGraint(iso) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 3);
  const data = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(data.getTime()) && data >= hoje && data <= limite;
}
function coordOf(row) { return row.coordenacao || row.coordenacao_os || row.regional || row.supervisao || ''; }
function safe(data) { return Array.isArray(data) ? data : []; }

function requestJson(url, method = 'GET', body = null, headers = {}) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          reject(new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`));
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timeout ao consultar o GRM.')));
    request.on('error', reject);
    request.end(payload || undefined);
  });
}
function postJson(url, body, headers = {}) { return requestJson(url, 'POST', body, headers); }

async function login() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail, userPass,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

async function carregarSupervisoes(token) {
  const response = await postJson(`${GRM_BASE_URL}supervision/getForSelect`, { olsStatus: 'A' }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!response.result) throw new Error(`Falha ao listar supervisões do Graint: ${response.message || 'erro'}`);
  const map = new Map();
  for (const item of safe(response.searchData)) {
    if (item.olsName) map.set(normalize(item.olsName), item.olsCode);
  }
  return map;
}

// --- Coleta e agrupamento das OS pendentes ---
// O agente processa TODAS as supervisões que tenham OS elegível, em dois sentidos:
//   - aplicar: colaborador confirmado na Programação, ainda não refletido no Graint;
//   - limpar: OS que já tinha sido aplicada (AJUSTADA) e não tem mais nenhum
//     colaborador confirmado na Programação — o Graint precisa refletir essa
//     remoção também, senão fica com gente associada que a Programação não indica mais.
// A flag supervisoes.distribuicao_os_automatica não é mais um gate.
async function carregarGruposPendentes() {
  const { data: osRows, error: osError } = await supabase
    .from('operacional_os')
    .select('*')
    .eq('status_gestor', 'ATENDER')
    .limit(3000);
  if (osError) throw new Error(`Falha ao consultar operacional_os: ${osError.message}`);

  const rows = safe(osRows);
  const ids = rows.map((r) => r.id).filter(Boolean);
  const programadas = [];
  const CHUNK = 200;
  // programacao_equipe acumula 1 linha por colaborador+dia (o os_id é reaproveitado
  // toda vez que o número de O.S. volta a ser programado, ver comentário no topo
  // do arquivo) — um chunk de 200 os_id pode facilmente somar mais de 1000 linhas
  // confirmadas no histórico inteiro. Sem paginação explícita, o limite padrão do
  // PostgREST (1000 linhas) truncava o resultado silenciosamente, fazendo O.S.
  // programadas HOJE sumirem do mapa (achado em produção 02/09: OS 90825/Alexandre
  // José da Silva, 767 linhas cortadas só no 1º chunk) e virarem candidatas erradas
  // a "limpar" no Graint.
  const PAGE_SIZE = 1000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('programacao_equipe')
        .select('os_id, colaborador_id, nome_colaborador')
        .eq('confirmado', true)
        .in('os_id', chunk)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Falha ao consultar programacao_equipe: ${error.message}`);
      const pagina = safe(data);
      programadas.push(...pagina);
      if (pagina.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  const programadosPorOs = new Map();
  for (const p of programadas) {
    const list = programadosPorOs.get(String(p.os_id)) || [];
    list.push(p);
    programadosPorOs.set(String(p.os_id), list);
  }

  // Data + supervisão é a unidade de processamento (um par getDistributionData
  // / setDistributionData por grupo, igual a tela real faz um SALVAR por vez).
  const grupos = new Map();
  let ignoradasSemSupervisao = 0;
  for (const row of rows) {
    const programados = programadosPorOs.get(String(row.id)) || [];
    const precisaAplicar = programados.length > 0 && row.status_conferencia !== 'AJUSTADA';
    const precisaLimpar = programados.length === 0 && row.status_conferencia === 'AJUSTADA';
    if (!precisaAplicar && !precisaLimpar) continue;

    // data_os é a data em que a O.S. está sendo atendida (o que o Graint precisa
    // saber); configurada_em é só "quando o gestor mexeu pela 1ª vez no status" e
    // fica travado em O.S. remanescentes reaproveitadas em vários dias seguidos —
    // priorizá-lo faria a janela de 3 dias excluir essas O.S. pra sempre.
    const data = dateKey(row.data_os || row.configurada_em);
    const coord = coordOf(row);
    if (!data || !dataAceitaNoGraint(data)) continue;
    if (!coord) {
      ignoradasSemSupervisao += 1;
      continue;
    }

    const key = `${data}|${normalize(coord)}`;
    if (!grupos.has(key)) grupos.set(key, { data, coordenacao: coord, atribuicoes: [], remocoes: [], osIds: new Set() });
    const grupo = grupos.get(key);

    if (precisaAplicar) {
      for (const p of programados) {
        const nome = p.nome_colaborador || '';
        if (!nome) continue;
        const duplicada = grupo.atribuicoes.some(
          (item) => item.os.id === row.id && normalize(item.colaborador_nome) === normalize(nome)
        );
        if (duplicada) continue;
        grupo.atribuicoes.push({ os: row, colaborador_nome: nome });
        grupo.osIds.add(row.id);
      }
    } else {
      grupo.remocoes.push({ os: row });
      grupo.osIds.add(row.id);
    }
  }

  if (ignoradasSemSupervisao > 0) {
    log('WARN', `${ignoradasSemSupervisao} O.S. ignorada(s) porque não possuem supervisão informada.`);
  }

  return [...grupos.values()]
    .filter((grupo) => grupo.atribuicoes.length > 0 || grupo.remocoes.length > 0)
    .map((grupo) => ({ ...grupo, osIds: [...grupo.osIds] }));
}

async function processarSupervisao(token, olsCode, grupo) {
  const sodDate = toBrDate(grupo.data);
  const numerosOsAplicar = [...new Set(grupo.atribuicoes.map((item) => String(item.os.numero_os)))];
  const numerosOsLimpar = [...new Set(grupo.remocoes.map((item) => String(item.os.numero_os)))];
  log(
    'INFO',
    `Supervisão ${grupo.data} · ${grupo.coordenacao} · ${numerosOsAplicar.length} OS a aplicar `
      + `(${grupo.atribuicoes.length} associação(ões)) · ${numerosOsLimpar.length} OS a limpar`,
  );

  const dist = await getDistributionData(token, olsCode, sodDate);
  const { staffs, sOrders } = dist;

  const staCodePorNome = new Map();
  for (const s of safe(staffs)) {
    if (s.staName) staCodePorNome.set(normalize(s.staName), s.staCode);
  }
  const ordemPorNumero = new Map();
  for (const o of safe(sOrders)) {
    if (o.sorCode != null) ordemPorNumero.set(String(o.sorCode), o);
  }

  const idsComSucesso = new Set();
  const idsComFalha = new Set();
  const falhas = [];
  let mudancasAplicadas = 0;

  for (const atribuicao of grupo.atribuicoes) {
    try {
      const ordem = ordemPorNumero.get(String(atribuicao.os.numero_os));
      if (!ordem) throw new Error(`OS ${atribuicao.os.numero_os} não encontrada na Distribuição de OS do Graint para essa Supervisão/Data.`);
      const staCode = staCodePorNome.get(normalize(atribuicao.colaborador_nome));
      if (staCode == null) throw new Error(`Colaborador "${atribuicao.colaborador_nome}" não encontrado no Graint pra essa supervisão.`);
      if (!Array.isArray(ordem.staCodes)) ordem.staCodes = [];
      if (!ordem.staCodes.includes(staCode)) {
        ordem.staCodes.push(staCode);
        mudancasAplicadas += 1;
      }
      idsComSucesso.add(atribuicao.os.id);
    } catch (error) {
      idsComFalha.add(atribuicao.os.id);
      falhas.push(`OS ${atribuicao.os.numero_os} / associar ${atribuicao.colaborador_nome}: ${error.message}`);
      log('ERROR', `Associação OS ${atribuicao.os.numero_os} / ${atribuicao.colaborador_nome} falhou: ${error.message}`);
    }
  }

  const idsLimpezaComSucesso = new Set();
  const idsLimpezaComFalha = new Set();
  for (const remocao of grupo.remocoes) {
    try {
      const ordem = ordemPorNumero.get(String(remocao.os.numero_os));
      if (!ordem) throw new Error(`OS ${remocao.os.numero_os} não encontrada na Distribuição de OS do Graint para essa Supervisão/Data.`);
      if (Array.isArray(ordem.staCodes) && ordem.staCodes.length) {
        ordem.staCodes = [];
        mudancasAplicadas += 1;
      }
      idsLimpezaComSucesso.add(remocao.os.id);
    } catch (error) {
      idsLimpezaComFalha.add(remocao.os.id);
      falhas.push(`OS ${remocao.os.numero_os} / limpar: ${error.message}`);
      log('ERROR', `Limpeza OS ${remocao.os.numero_os} falhou: ${error.message}`);
    }
  }

  const idsConfirmados = new Set([...idsComSucesso].filter((id) => !idsComFalha.has(id)));
  const idsLimpezaConfirmados = new Set([...idsLimpezaComSucesso].filter((id) => !idsLimpezaComFalha.has(id)));
  if (!idsConfirmados.size && !idsLimpezaConfirmados.size) {
    throw new Error(`Nenhuma alteração aplicada nesta supervisão (${falhas.length} falha(s)): ${falhas.join(' | ')}`);
  }

  if (DRY_RUN) {
    log(
      'INFO',
      `[DRY-RUN] Supervisão conferida (${idsConfirmados.size} de ${numerosOsAplicar.length} OS aplicada(s), `
        + `${idsLimpezaConfirmados.size} de ${numerosOsLimpar.length} OS limpa(s), ${mudancasAplicadas} mudança(s)) `
        + '— setDistributionData e update no Supabase pulados.',
    );
    return;
  }

  if (mudancasAplicadas > 0) {
    await setDistributionData(token, staffs, sOrders, sodDate);
  } else {
    log('INFO', 'Todas as OS já estavam corretas no Graint; setDistributionData não necessário.');
  }

  const now = new Date().toISOString();
  if (idsConfirmados.size) {
    const { error } = await supabase
      .from('operacional_os')
      .update({ status_conferencia: 'AJUSTADA', conferido_por: null, conferido_em: now, updated_at: now })
      .in('id', [...idsConfirmados]);
    if (error) throw new Error(`Graint atualizado, mas falhou ao marcar AJUSTADA no Supabase: ${error.message}`);
  }
  if (idsLimpezaConfirmados.size) {
    const { error } = await supabase
      .from('operacional_os')
      .update({ status_conferencia: 'PENDENTE', conferido_por: null, conferido_em: now, updated_at: now })
      .in('id', [...idsLimpezaConfirmados]);
    if (error) throw new Error(`Graint limpo, mas falhou ao voltar status para PENDENTE no Supabase: ${error.message}`);
  }

  log(
    falhas.length ? 'WARN' : 'SUCCESS',
    `Supervisão processada: ${idsConfirmados.size} de ${numerosOsAplicar.length} OS aplicada(s), `
      + `${idsLimpezaConfirmados.size} de ${numerosOsLimpar.length} OS limpa(s)`
      + (falhas.length ? `; ${falhas.length} pendência(s) pro próximo ciclo: ${falhas.join(' | ')}` : '') + '.',
  );
}

async function getDistributionData(token, olsCode, sodDate) {
  const response = await postJson(`${GRM_BASE_URL}serviceOrder/distribution/getDistributionData`, { olsCode, sodDate }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!response.result) throw new Error(`getDistributionData falhou: ${response.message || 'erro'}`);
  return response;
}

async function setDistributionData(token, staffs, sOrders, sodDate) {
  const response = await postJson(`${GRM_BASE_URL}serviceOrder/distribution/setDistributionData`, { staffs, sOrders, sodDate }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!response.result) throw new Error(`setDistributionData falhou: ${response.message || 'erro'}`);
  return response;
}

async function main() {
  let ok = 0;
  let falhas = 0;
  try {
    log('INFO', `=== Aplicar Distribuição de OS no Graint via API${DRY_RUN ? ' (DRY-RUN)' : ''} ===`);
    log('INFO', `Watchdog global configurado para ${TIMEOUT_MIN} minuto(s).`);

    let grupos = await carregarGruposPendentes();
    const totalAplicar = grupos.reduce((soma, g) => soma + g.atribuicoes.length, 0);
    const totalLimpar = grupos.reduce((soma, g) => soma + g.remocoes.length, 0);
    log(
      'INFO',
      `${grupos.length} supervisão(ões)/data pendente(s): ${totalAplicar} associação(ões) a aplicar, `
        + `${totalLimpar} OS a limpar — todas as regionais, sem filtro de habilitação por supervisão.`,
    );

    if (LIMIT > 0 && grupos.length > LIMIT) {
      grupos = grupos.slice(0, LIMIT);
      log('INFO', `GRM_DISTRIBUICAO_OS_LIMIT/LIMIT de teste=${LIMIT} — processando só as primeiras ${grupos.length} supervisão(ões)/data.`);
    }
    if (!grupos.length) { log('SUCCESS', 'Nada a fazer.'); return; }

    const token = await login();
    const supervisoes = await carregarSupervisoes(token);

    for (const grupo of grupos) {
      try {
        const olsCode = supervisoes.get(normalize(grupo.coordenacao));
        if (olsCode == null) throw new Error(`Supervisão "${grupo.coordenacao}" não encontrada no Graint (supervision/getForSelect).`);
        await processarSupervisao(token, olsCode, grupo);
        ok += 1;
      } catch (error) {
        falhas += 1;
        log('ERROR', `Supervisão ${grupo.data} · ${grupo.coordenacao} falhou: ${error.message}`);
      }
    }

    log('SUCCESS', `Concluído: ${ok} supervisão(ões)/data aplicada(s), ${falhas} falha(s).`);
    if (falhas > 0 && ok === 0) throw new Error('Todas as supervisões falharam.');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => {
  log('ERROR', `Watchdog global atingiu ${TIMEOUT_MIN} minuto(s); encerrando o agente para não bloquear a fila indefinidamente.`);
  process.exit(1);
}, TIMEOUT_MIN * 60 * 1000);
