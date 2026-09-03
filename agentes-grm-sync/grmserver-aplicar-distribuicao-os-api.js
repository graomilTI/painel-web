#!/usr/bin/env node

/**
 * Aplica a distribuição de OS do painel direto no Graint via API.
 *
 * Fonte de verdade: Programação do DIA da OS.
 * - operacional_os.data_os define a data que será enviada ao Graint;
 * - programacao_equipe_ultima + programacao_dia_ultima definem exatamente quem
 *   está confirmado para aquela OS naquela data;
 * - histórico de programacao_equipe de outras datas NÃO participa da distribuição.
 *
 * A escrita é uma reconciliação exata: para cada OS gerenciada, staCodes passa a
 * ser exatamente o conjunto esperado na Programação. Assim o agente adiciona
 * faltantes e remove vínculos antigos/indevidos de forma idempotente.
 *
 * Segurança da API Graint:
 * - não usar resetSession/finalizeSession;
 * - getDistributionData retorna staffs + sOrders completos;
 * - setDistributionData recebe o pacote inteiro da supervisão/data.
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
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function dateKey(value) { return String(value || '').slice(0, 10); }
function toBrDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : null;
}
function safe(data) { return Array.isArray(data) ? data : []; }
function coordOf(row) { return row.coordenacao || row.coordenacao_os || row.regional || row.supervisao || ''; }

function isoLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function janelaDatas() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 3);
  return { inicio: isoLocalDate(inicio), fim: isoLocalDate(fim) };
}

function dataAceitaNoGraint(iso) {
  const { inicio, fim } = janelaDatas();
  const data = dateKey(iso);
  return Boolean(data && data >= inicio && data <= fim);
}

function uniqueByNormalizedName(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const nome = String(row.nome_colaborador || '').trim();
    const key = normalize(nome);
    if (!nome || !key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...row, nome_colaborador: nome });
  }
  return result;
}

function codeKey(value) { return String(value); }

function sameCodeSet(atual, esperado) {
  const a = new Set(safe(atual).map(codeKey));
  const b = new Set(safe(esperado).map(codeKey));
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

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
    userEmail,
    userPass,
    loginInfo: {
      ip: '',
      browser: 'GRM API Agent',
      browserVersion: '1.0',
      engine: 'Node.js',
      engineVersion: process.version,
      platform: process.platform,
      screenSize: '',
      windowSize: '',
    },
  }, GRM_WEB_HEADERS);

  if (!response.result || !response.token) {
    throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  }
  return response.token;
}

async function carregarSupervisoes(token) {
  const response = await postJson(
    `${GRM_BASE_URL}supervision/getForSelect`,
    { olsStatus: 'A' },
    { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }
  );
  if (!response.result) throw new Error(`Falha ao listar supervisões do Graint: ${response.message || 'erro'}`);

  const map = new Map();
  for (const item of safe(response.searchData)) {
    if (item.olsName) map.set(normalize(item.olsName), item.olsCode);
  }
  return map;
}

async function carregarPaginado(factory, contexto) {
  const PAGE_SIZE = 1000;
  const result = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await factory(offset, PAGE_SIZE);
    if (error) throw new Error(`${contexto}: ${error.message}`);
    const pagina = safe(data);
    result.push(...pagina);
    if (pagina.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return result;
}

// Coleta a programação vigente por (OS, data), não por operacional_os.data_os.
// programacao_equipe_ultima elimina versões antigas de programacao_dia e o mapa
// programacao_id -> data_referencia impede que uma OS reaproveitada misture dias.
// Importante: uma mesma OS pode ter programação confirmada em MAIS DE UMA data
// dentro da janela (ex.: reaproveitada de um dia pro outro), e operacional_os.data_os
// pode ficar desatualizado (ex.: ainda no dia anterior) mesmo com a OS continuando
// ATENDER. Se a busca e o agrupamento dependessem só da data_os atual da OS, a data
// mais antiga escondia a mais nova por dois motivos: (1) a query de operacional_os
// nem trazia a OS pra dentro da janela de busca, e (2) o agrupamento só olhava uma
// data por OS. O agente reconciliava contra o dia errado e dava "já está correto"
// sem nunca ver a programação do dia certo. Corrigido buscando a equipe por
// programacao_id (não por os_id vindo de um filtro de data_os) e agrupando por
// todo par (OS, data) com programação confirmada na janela.
async function carregarGruposPendentes() {
  const { inicio, fim } = janelaDatas();

  // OS "de vitrine" da janela: usadas como base e, principalmente, pra pegar
  // OS sem NENHUMA programação confirmada (caso de limpeza de vínculo residual).
  const osPorDataOs = await carregarPaginado(
    (offset, pageSize) => supabase
      .from('operacional_os')
      .select('*')
      .eq('status_gestor', 'ATENDER')
      .gte('data_os', inicio)
      .lte('data_os', fim)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1),
    'Falha ao consultar operacional_os'
  );

  const programacoesDia = await carregarPaginado(
    (offset, pageSize) => supabase
      .from('programacao_dia_ultima')
      .select('id, data_referencia, supervisao')
      .gte('data_referencia', inicio)
      .lte('data_referencia', fim)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1),
    'Falha ao consultar programacao_dia_ultima'
  );

  const dataPorProgramacaoId = new Map();
  const idsProgramacaoDia = [];
  for (const p of programacoesDia) {
    if (p.id && p.data_referencia) {
      dataPorProgramacaoId.set(String(p.id), dateKey(p.data_referencia));
      idsProgramacaoDia.push(p.id);
    }
  }

  // Busca a equipe confirmada por programacao_id (já delimitado à janela acima),
  // não por os_id vindo de osPorDataOs — assim uma OS com programação confirmada
  // na janela é encontrada mesmo que operacional_os.data_os esteja desatualizado
  // (ex.: ainda no dia anterior) e por isso ficasse fora do filtro de data acima.
  const CHUNK = 200;
  const equipeVigente = [];
  for (let i = 0; i < idsProgramacaoDia.length; i += CHUNK) {
    const chunk = idsProgramacaoDia.slice(i, i + CHUNK);
    const linhas = await carregarPaginado(
      (offset, pageSize) => supabase
        .from('programacao_equipe_ultima')
        .select('id, programacao_id, os_id, colaborador_id, nome_colaborador, confirmado')
        .eq('confirmado', true)
        .in('programacao_id', chunk)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
      'Falha ao consultar programacao_equipe_ultima'
    );
    equipeVigente.push(...linhas);
  }

  const programadosPorOsData = new Map();
  const osIdsComProgramacao = new Set();
  for (const p of equipeVigente) {
    const data = dataPorProgramacaoId.get(String(p.programacao_id));
    if (!data || !p.os_id) continue;
    osIdsComProgramacao.add(String(p.os_id));
    const key = `${String(p.os_id)}|${data}`;
    const list = programadosPorOsData.get(key) || [];
    list.push(p);
    programadosPorOsData.set(key, list);
  }

  // Completa com as OS que têm programação confirmada na janela mas cujo
  // data_os ficou de fora do filtro acima (mesmo caso descrito no comentário).
  const idsJaCarregados = new Set(osPorDataOs.map((row) => String(row.id)));
  const idsFaltantes = [...osIdsComProgramacao].filter((id) => !idsJaCarregados.has(id));
  const osExtras = [];
  for (let i = 0; i < idsFaltantes.length; i += CHUNK) {
    const chunk = idsFaltantes.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('operacional_os')
      .select('*')
      .eq('status_gestor', 'ATENDER')
      .in('id', chunk);
    if (error) throw new Error(`Falha ao consultar operacional_os por id: ${error.message}`);
    osExtras.push(...safe(data));
  }

  const osRows = [...osPorDataOs, ...osExtras];
  const osById = new Map(osRows.map((row) => [String(row.id), row]));

  // Todo par (os_id, data) com programação confirmada participa — mesmo que a
  // OS também tenha uma outra data com programação (ver comentário acima).
  // O data_os atual da OS entra como fallback, só pra continuar cobrindo o caso
  // de OS sem NENHUMA programação confirmada (limpeza de vínculo residual).
  const paresOsData = new Set(programadosPorOsData.keys());
  for (const row of osRows) {
    const data = dateKey(row.data_os || row.configurada_em);
    if (data) paresOsData.add(`${String(row.id)}|${data}`);
  }

  const grupos = new Map();
  let ignoradasSemSupervisao = 0;

  for (const par of paresOsData) {
    const [osId, data] = par.split('|');
    const row = osById.get(osId);
    if (!row) continue; // programação aponta pra OS que não está mais ATENDER na janela
    if (!data || !dataAceitaNoGraint(data)) continue;

    const coord = coordOf(row);
    if (!coord) {
      ignoradasSemSupervisao += 1;
      continue;
    }

    // Programação é a fonte de verdade: toda OS ATENDER na janela é reconciliada.
    // Se não houver colaborador confirmado nessa data, o conjunto esperado é vazio
    // e qualquer vínculo residual no Graint será removido. Isso também corrige OS
    // PENDENTE que possam ter sido parcialmente alteradas por execuções anteriores.
    const programados = uniqueByNormalizedName(programadosPorOsData.get(par) || []);

    const key = `${data}|${normalize(coord)}`;
    if (!grupos.has(key)) grupos.set(key, { data, coordenacao: coord, itens: [] });
    grupos.get(key).itens.push({ os: row, programados });
  }

  if (ignoradasSemSupervisao > 0) {
    log('WARN', `${ignoradasSemSupervisao} O.S. ignorada(s) porque não possuem supervisão informada.`);
  }

  return [...grupos.values()].filter((grupo) => grupo.itens.length > 0);
}

function nomeAtualDoCodigo(code, nomePorStaCode) {
  return nomePorStaCode.get(codeKey(code)) || `STA#${code}`;
}

async function processarSupervisao(token, olsCode, grupo) {
  const sodDate = toBrDate(grupo.data);
  const totalEsperadas = grupo.itens.reduce((soma, item) => soma + item.programados.length, 0);
  const totalSemProgramacao = grupo.itens.filter((item) => item.programados.length === 0).length;

  log(
    'INFO',
    `Supervisão ${grupo.data} · ${grupo.coordenacao} · ${grupo.itens.length} OS para reconciliar `
      + `(${totalEsperadas} associação(ões) esperada(s), ${totalSemProgramacao} OS sem programação)`
  );

  const dist = await getDistributionData(token, olsCode, sodDate);
  const { staffs, sOrders } = dist;

  const staCodePorNome = new Map();
  const nomePorStaCode = new Map();
  for (const s of safe(staffs)) {
    if (s.staName && s.staCode != null) {
      staCodePorNome.set(normalize(s.staName), s.staCode);
      nomePorStaCode.set(codeKey(s.staCode), s.staName);
    }
  }

  const ordemPorNumero = new Map();
  for (const o of safe(sOrders)) {
    if (o.sorCode != null) ordemPorNumero.set(String(o.sorCode), o);
  }

  const idsComSucesso = new Set();
  const itensPorId = new Map(grupo.itens.map((item) => [String(item.os.id), item]));
  const falhas = [];
  let associacoesAdicionar = 0;
  let associacoesRemover = 0;
  let osComMudanca = 0;
  let osSemMudanca = 0;

  for (const item of grupo.itens) {
    const numeroOs = String(item.os.numero_os);
    try {
      const ordem = ordemPorNumero.get(numeroOs);
      if (!ordem) {
        throw new Error(`OS ${numeroOs} não encontrada na Distribuição de OS do Graint para essa Supervisão/Data.`);
      }

      const faltantesNoCadastro = [];
      const esperadosComCodigo = [];
      const vistos = new Set();
      for (const p of item.programados) {
        const nome = String(p.nome_colaborador || '').trim();
        const normalized = normalize(nome);
        if (!normalized || vistos.has(normalized)) continue;
        vistos.add(normalized);
        const staCode = staCodePorNome.get(normalized);
        if (staCode == null) {
          faltantesNoCadastro.push(nome);
        } else {
          esperadosComCodigo.push({ nome, staCode });
        }
      }

      // Nunca faz reconciliação parcial: se alguém esperado não existe no Graint
      // dessa supervisão, deixa a OS intacta e mantém pendência para investigação.
      if (faltantesNoCadastro.length) {
        throw new Error(
          `${faltantesNoCadastro.length} colaborador(es) esperado(s) não encontrado(s) no Graint: ${faltantesNoCadastro.join(', ')}`
        );
      }

      const codigosEsperados = [...new Map(
        esperadosComCodigo.map((x) => [codeKey(x.staCode), x.staCode])
      ).values()];
      const codigosAtuais = safe(ordem.staCodes);
      const setAtual = new Set(codigosAtuais.map(codeKey));
      const setEsperado = new Set(codigosEsperados.map(codeKey));

      const adicionar = codigosEsperados.filter((code) => !setAtual.has(codeKey(code)));
      const remover = codigosAtuais.filter((code) => !setEsperado.has(codeKey(code)));

      if (!sameCodeSet(codigosAtuais, codigosEsperados)) {
        ordem.staCodes = codigosEsperados;
        osComMudanca += 1;
        associacoesAdicionar += adicionar.length;
        associacoesRemover += remover.length;

        const nomesAdicionar = adicionar.map((c) => nomeAtualDoCodigo(c, nomePorStaCode));
        const nomesRemover = remover.map((c) => nomeAtualDoCodigo(c, nomePorStaCode));
        log(
          DRY_RUN ? 'INFO' : 'INFO',
          `${DRY_RUN ? '[DRY-RUN] ' : ''}OS ${numeroOs}: +[${nomesAdicionar.join(', ')}] -[${nomesRemover.join(', ')}] `
            + `=> esperado [${item.programados.map((p) => p.nome_colaborador).join(', ')}]`
        );
      } else {
        osSemMudanca += 1;
      }

      idsComSucesso.add(String(item.os.id));
    } catch (error) {
      const detalhe = `OS ${numeroOs}: ${error.message}`;
      falhas.push(detalhe);
      log('ERROR', detalhe);
    }
  }

  if (!idsComSucesso.size) {
    throw new Error(`Nenhuma OS reconciliável nesta supervisão (${falhas.length} falha(s)): ${falhas.join(' | ')}`);
  }

  if (DRY_RUN) {
    log(
      falhas.length ? 'WARN' : 'INFO',
      `[DRY-RUN] Supervisão conferida: ${idsComSucesso.size}/${grupo.itens.length} OS válidas; `
        + `${osComMudanca} OS mudariam; ${osSemMudanca} já corretas; `
        + `+${associacoesAdicionar}/-${associacoesRemover} associação(ões); `
        + 'setDistributionData e updates no Supabase pulados.'
    );
    return;
  }

  if (osComMudanca > 0) {
    await setDistributionData(token, staffs, sOrders, sodDate);
  } else {
    log('INFO', 'Todas as OS reconciliáveis já estavam corretas no Graint; setDistributionData não necessário.');
  }

  const idsComProgramacao = [];
  const idsSemProgramacao = [];
  for (const id of idsComSucesso) {
    const item = itensPorId.get(id);
    if (!item) continue;
    if (item.programados.length > 0) idsComProgramacao.push(id);
    else idsSemProgramacao.push(id);
  }

  const now = new Date().toISOString();
  if (idsComProgramacao.length) {
    const { error } = await supabase
      .from('operacional_os')
      .update({ status_conferencia: 'AJUSTADA', conferido_por: null, conferido_em: now, updated_at: now })
      .in('id', idsComProgramacao);
    if (error) throw new Error(`Graint atualizado, mas falhou ao marcar AJUSTADA no Supabase: ${error.message}`);
  }

  if (idsSemProgramacao.length) {
    const { error } = await supabase
      .from('operacional_os')
      .update({ status_conferencia: 'PENDENTE', conferido_por: null, conferido_em: now, updated_at: now })
      .in('id', idsSemProgramacao);
    if (error) throw new Error(`Graint limpo, mas falhou ao voltar status para PENDENTE no Supabase: ${error.message}`);
  }

  log(
    falhas.length ? 'WARN' : 'SUCCESS',
    `Supervisão reconciliada: ${idsComSucesso.size}/${grupo.itens.length} OS; `
      + `${osComMudanca} alterada(s), ${osSemMudanca} já correta(s); `
      + `+${associacoesAdicionar}/-${associacoesRemover} associação(ões)`
      + (falhas.length ? `; ${falhas.length} pendência(s): ${falhas.join(' | ')}` : '') + '.'
  );
}

// Marca em programacao_distribuicao_agendada como processada(s) só a(s) pendência(s)
// da MESMA supervisão+data que este grupo acabou de reconciliar de fato no Graint.
// Antes disso era o cron das 02h que marcava processado=true na hora de enfileirar
// o job, sem esperar ele rodar — então um job travado/rodando por outro motivo já
// "consumia" a pendência sem nunca ter reconciliado aquela supervisão/data.
async function marcarAgendamentoReconciliado(grupo) {
  const { data: pendentes, error } = await supabase
    .from('programacao_distribuicao_agendada')
    .select('id, supervisao')
    .eq('data_referencia', grupo.data)
    .eq('processado', false);

  if (error) {
    log('WARN', `Falha ao consultar programacao_distribuicao_agendada (${grupo.data}/${grupo.coordenacao}): ${error.message}`);
    return;
  }

  const idsParaMarcar = safe(pendentes)
    .filter((p) => normalize(p.supervisao) === normalize(grupo.coordenacao))
    .map((p) => p.id);
  if (!idsParaMarcar.length) return;

  const { error: updateError } = await supabase
    .from('programacao_distribuicao_agendada')
    .update({ processado: true, processado_em: new Date().toISOString() })
    .in('id', idsParaMarcar);

  if (updateError) {
    log('WARN', `Falha ao marcar programacao_distribuicao_agendada como processado (${grupo.data}/${grupo.coordenacao}): ${updateError.message}`);
    return;
  }

  log('INFO', `programacao_distribuicao_agendada: ${idsParaMarcar.length} pendência(s) confirmada(s) para ${grupo.coordenacao}/${grupo.data}.`);
}

async function getDistributionData(token, olsCode, sodDate) {
  const response = await postJson(
    `${GRM_BASE_URL}serviceOrder/distribution/getDistributionData`,
    { olsCode, sodDate },
    { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }
  );
  if (!response.result) throw new Error(`getDistributionData falhou: ${response.message || 'erro'}`);
  return response;
}

async function setDistributionData(token, staffs, sOrders, sodDate) {
  const response = await postJson(
    `${GRM_BASE_URL}serviceOrder/distribution/setDistributionData`,
    { staffs, sOrders, sodDate },
    { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }
  );
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
    const totalOs = grupos.reduce((soma, g) => soma + g.itens.length, 0);
    const totalEsperadas = grupos.reduce(
      (soma, g) => soma + g.itens.reduce((s, item) => s + item.programados.length, 0),
      0
    );
    const totalSemProgramacao = grupos.reduce(
      (soma, g) => soma + g.itens.filter((item) => item.programados.length === 0).length,
      0
    );

    log(
      'INFO',
      `${grupos.length} supervisão(ões)/data para reconciliar: ${totalOs} OS, `
        + `${totalEsperadas} associação(ões) esperada(s), ${totalSemProgramacao} OS a limpar se necessário.`
    );

    if (LIMIT > 0 && grupos.length > LIMIT) {
      grupos = grupos.slice(0, LIMIT);
      log('INFO', `LIMIT de teste=${LIMIT} — processando somente ${grupos.length} supervisão(ões)/data.`);
    }

    if (!grupos.length) {
      log('SUCCESS', 'Nada a fazer.');
      return;
    }

    const token = await login();
    const supervisoes = await carregarSupervisoes(token);

    for (const grupo of grupos) {
      try {
        const olsCode = supervisoes.get(normalize(grupo.coordenacao));
        if (olsCode == null) {
          throw new Error(`Supervisão "${grupo.coordenacao}" não encontrada no Graint (supervision/getForSelect).`);
        }
        await processarSupervisao(token, olsCode, grupo);
        if (!DRY_RUN) await marcarAgendamentoReconciliado(grupo);
        ok += 1;
      } catch (error) {
        falhas += 1;
        log('ERROR', `Supervisão ${grupo.data} · ${grupo.coordenacao} falhou: ${error.message}`);
      }
    }

    log('SUCCESS', `Concluído: ${ok} supervisão(ões)/data reconciliada(s), ${falhas} falha(s).`);
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
