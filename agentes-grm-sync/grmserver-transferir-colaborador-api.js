#!/usr/bin/env node

/**
 * Transferência de colaborador entre supervisões (Programação > 3 ·
 * Transferências) aplicada direto no Graint via API.
 *
 * Fila: public.programacao_transferencias (status ACEITA + grm_status NA_FILA),
 * reivindicada com claim_next_programacao_transferencia(). O job em
 * grm_sync_jobs é criado pelo aceite do gestor de destino
 * (programacao_transferencia_responder) — agente sob demanda, sem intervalo.
 *
 * Fluxo replicado da tela de Funcionário do Graint (assets/Staff-*.js):
 * ao salvar um cadastro cujo olsCode/olcCode mudou e que tem
 * patrimonyCount>0 ou vehicleCount>0, a tela abre um modal perguntando se os
 * patrimônios vão junto e grava recordData.changeAssetSupervision = "S"/"N"
 * antes do staff/setRecord. Aqui a resposta vem de
 * programacao_transferencias.transferir_patrimonios, escolhida pelo gestor
 * de origem ao pedir a transferência.
 *
 *   1. user/login
 *   2. supervision/getForSelect {olsStatus:"A"} -> olsCode/olcCode do destino
 *   3. staff/getRecords {groupSearch: cpf} -> registro completo
 *   4. staffOFlowRules/getRecords {staCode} -> regras de Caixa Operacional
 *      atuais. O setRecord regrava as regras junto com o cadastro (o Graint
 *      recria as linhas a cada save), então elas são reenviadas intactas —
 *      mandar oFlowRules vazio apagaria as regras do colaborador.
 *   5. staff/setRecord com olsCode/olcCode do destino e
 *      changeAssetSupervision. Payload montado igual ao
 *      grmserver-liberacao-despesas-api.js (validado ao vivo em 02/09).
 *   6. Confere: staff/getRecords de novo (olsCode = destino, mesmas regras) e,
 *      se os patrimônios deveriam ir junto, patrimonies/getRecords (todos os
 *      patrimônios ativos do colaborador na supervisão de destino).
 *
 * Uso:
 *   node grmserver-transferir-colaborador-api.js            # processa a fila
 *   node grmserver-transferir-colaborador-api.js --dry-run  # só lê e mostra o que faria
 *   node grmserver-transferir-colaborador-api.js --dry-run --id=<uuid>  # dry-run de uma transferência (qualquer status)
 */

require('dotenv').config();
const https = require('https');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } },
);

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_TRANSFERIR_COLABORADOR_DRY_RUN || 'false').toLowerCase() === 'true';
const ONLY_ID = (process.argv.find((arg) => arg.startsWith('--id=')) || '').slice(5) || null;
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_TRANSFERIR_COLABORADOR_MAX_POR_EXECUCAO || 10));
const MAX_TENTATIVAS = 3;
const TIMEOUT_MIN = 10;

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

let watchdogCurrentId = null;

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function safe(data) { return Array.isArray(data) ? data : []; }

// Mesmo formatDateBR de grmserver-liberacao-despesas-api.js (formatHelper.js
// do Graint). Formato desconhecido falha alto em vez de apagar data de RH.
function formatDateBR(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, d, mo, y] = br;
    return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return `${d}/${mo}/${y}`;
  }
  const error = new Error(`Data em formato inesperado, não é seguro reenviar: "${value}".`);
  error.code = 'DATA_FORMATO_INESPERADO';
  throw error;
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
function authHeaders(token) { return { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }; }

async function grm(token, path, body) {
  const response = await postJson(`${GRM_BASE_URL}${path}`, body, authHeaders(token));
  if (!response.result) throw new Error(`${path} falhou: ${response.message || 'erro'}`);
  return response;
}

// Token em cache compartilhado (grm-token-cache.js): evita login a cada execução
// e o captcha_invalid que o GRM passou a devolver em 30/09/2026.
const { obterTokenGrm } = require('./grm-token-cache');
async function login() {
  return obterTokenGrm({ login: loginDireto });
}

async function loginDireto() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail,
    userPass,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

async function getStaffByCpf(token, cpf) {
  const response = await grm(token, 'staff/getRecords', {
    staName: '', staCPF: '', staEmail: '', staStatus: 'A', groupSearch: digits(cpf),
  });
  const rows = safe(response.searchData).filter((row) => digits(row.staCPF) === digits(cpf));
  if (rows.length !== 1) {
    const error = new Error(`Colaborador CPF ${cpf} não encontrado de forma única no GRM (${rows.length} resultado(s)).`);
    error.code = 'COLABORADOR_NAO_ENCONTRADO';
    throw error;
  }
  return rows[0];
}

async function getOFlowRules(token, staCode) {
  const response = await grm(token, 'staffOFlowRules/getRecords', { staCode });
  return safe(response.searchData).filter((rule) => String(rule.sofrStatus || 'A') === 'A');
}

async function buildContext(token) {
  const [supervisoes, empresas] = await Promise.all([
    grm(token, 'supervision/getForSelect', { olsStatus: 'A' }),
    grm(token, 'sysCompany/getRecords', {}),
  ]);
  const supervisaoPorNome = new Map();
  for (const item of safe(supervisoes.searchData)) {
    if (item.olsName) supervisaoPorNome.set(norm(item.olsName), item);
  }
  return {
    supervisaoPorNome,
    moreThenOneCompany: safe(empresas.searchData).length > 1 ? 'S' : 'N',
  };
}

function rulesSignature(rules) {
  return safe(rules)
    .map((rule) => [rule.oexCode, rule.sofrShowOnMobile, Number(rule.sofrMaxValue || 0), rule.sofrAutoAccept, rule.sofrNeedLoadNHE, Number(rule.sofrMaxMovementsDay ?? 1)].join(':'))
    .sort()
    .join('|');
}

function buildPayload(staffRow, destino, oFlowRules, transferirPatrimonios, moreThenOneCompany) {
  const payload = { ...staffRow };
  payload.utipCode = payload.userType;
  payload.staInitDate = formatDateBR(payload.staInitDate);
  payload.staAdmissionDate = formatDateBR(payload.staAdmissionDate);
  payload.staResignationDate = formatDateBR(payload.staResignationDate);
  payload.staBirthDate = formatDateBR(payload.staBirthDate);
  // Nunca reenviar: é o aparelho do app mobile do colaborador.
  delete payload.staMobPhoneID;
  if (!Array.isArray(payload.staMobOlsCodes)) {
    payload.staMobOlsCodes = typeof payload.staMobOlsCodes === 'string' && payload.staMobOlsCodes.length > 0
      ? payload.staMobOlsCodes.split(',').map((v) => parseInt(v, 10))
      : [];
  }
  payload.olsCode = destino.olsCode;
  payload.olcCode = destino.olcCode;
  payload.olsName = destino.olsName;
  payload.olcName = destino.olcName;
  payload.oFlowRules = oFlowRules.map((rule) => ({
    sofrCode: rule.sofrCode,
    staCode: staffRow.staCode,
    oexCode: rule.oexCode,
    sofrShowOnMobile: rule.sofrShowOnMobile,
    sofrMaxValue: rule.sofrMaxValue,
    sofrAutoAccept: rule.sofrAutoAccept,
    sofrNeedLoadNHE: rule.sofrNeedLoadNHE,
    sofrMaxMovementsDay: rule.sofrMaxMovementsDay,
    sofrStatus: 'A',
  }));
  payload.moreThenOneCompany = moreThenOneCompany;
  payload.changeAssetSupervision = transferirPatrimonios ? 'S' : 'N';
  return payload;
}

async function patrimoniosDoColaborador(token, staffRow) {
  const response = await grm(token, 'patrimonies/getRecords', {});
  return safe(response.searchData).filter((row) => row.patStatus === 'A'
    && (row.staCode != null ? Number(row.staCode) === Number(staffRow.staCode) : norm(row.staName) === norm(staffRow.staName)));
}

async function transferir(token, ctx, item) {
  const destino = ctx.supervisaoPorNome.get(norm(item.supervisao_destino));
  if (!destino) {
    const error = new Error(`Supervisão "${item.supervisao_destino}" não existe (ativa) no GRM.`);
    error.code = 'SUPERVISAO_NAO_ENCONTRADA';
    throw error;
  }

  const staffRow = await getStaffByCpf(token, item.colaborador_cpf);
  const antes = {
    olsCode: staffRow.olsCode, olsName: staffRow.olsName,
    olcCode: staffRow.olcCode, olcName: staffRow.olcName,
    patrimonyCount: staffRow.patrimonyCount, vehicleCount: staffRow.vehicleCount,
  };
  const oFlowRules = await getOFlowRules(token, staffRow.staCode);
  const jaNoDestino = Number(staffRow.olsCode) === Number(destino.olsCode);
  const temAtivos = Number(staffRow.patrimonyCount || 0) > 0 || Number(staffRow.vehicleCount || 0) > 0;

  log('INFO', `${item.colaborador_nome} (staCode ${staffRow.staCode}): ${staffRow.olsName} -> ${destino.olsName}, patrimônios=${item.transferir_patrimonios ? 'S' : 'N'}, ativos no GRM=${staffRow.patrimonyCount || 0} patr./${staffRow.vehicleCount || 0} veíc., regras caixa=${oFlowRules.length}.`);

  if (norm(staffRow.olsName) !== norm(item.supervisao_origem) && !jaNoDestino) {
    // Alguém mexeu no cadastro entre o pedido e o aceite — não sobrescreve às cegas.
    const error = new Error(`No GRM o colaborador está em "${staffRow.olsName}", não em "${item.supervisao_origem}" (origem do pedido). Confira o cadastro e reenvie.`);
    error.code = 'ORIGEM_DIVERGENTE';
    throw error;
  }

  const resultado = { antes, destino: { olsCode: destino.olsCode, olsName: destino.olsName, olcCode: destino.olcCode, olcName: destino.olcName }, via: 'api' };

  if (jaNoDestino) {
    // Retentativa depois de um save que já tinha passado: o Graint só move
    // patrimônios na troca de supervisão, então não há o que reaplicar.
    log('WARN', `${item.colaborador_nome} já está em ${destino.olsName} no GRM; só conferindo.`);
    resultado.ja_estava_no_destino = true;
  } else {
    const payload = buildPayload(staffRow, destino, oFlowRules, item.transferir_patrimonios && temAtivos, ctx.moreThenOneCompany);
    if (DRY_RUN) {
      log('INFO', 'DRY_RUN: staff/setRecord NÃO enviado. Campos que mudariam:', {
        olsCode: [staffRow.olsCode, payload.olsCode],
        olcCode: [staffRow.olcCode, payload.olcCode],
        changeAssetSupervision: payload.changeAssetSupervision,
        oFlowRules: payload.oFlowRules.length,
        moreThenOneCompany: payload.moreThenOneCompany,
      });
      return { ...resultado, dry_run: true };
    }
    await grm(token, 'staff/setRecord', payload);
  }

  const depois = await getStaffByCpf(token, item.colaborador_cpf);
  const regrasDepois = await getOFlowRules(token, depois.staCode);
  resultado.depois = {
    olsCode: depois.olsCode, olsName: depois.olsName,
    olcCode: depois.olcCode, olcName: depois.olcName,
    patrimonyCount: depois.patrimonyCount, vehicleCount: depois.vehicleCount,
  };

  if (Number(depois.olsCode) !== Number(destino.olsCode)) {
    const error = new Error(`GRM não confirmou a troca: colaborador continua em "${depois.olsName}".`);
    error.code = 'DIVERGENTE';
    error.resultado = resultado;
    throw error;
  }
  if (rulesSignature(regrasDepois) !== rulesSignature(oFlowRules)) {
    // Supervisão já trocou; só registra — as regras são reaplicadas pelo
    // agente de liberação de despesas no próximo ciclo dele.
    log('WARN', `Regras de Caixa Operacional mudaram no save (${oFlowRules.length} -> ${regrasDepois.length}).`);
    resultado.aviso_regras_caixa = { antes: oFlowRules.length, depois: regrasDepois.length };
  }

  if (item.transferir_patrimonios && temAtivos) {
    const patrimonios = await patrimoniosDoColaborador(token, depois);
    const foraDoDestino = patrimonios.filter((row) => norm(row.olsName) !== norm(destino.olsName));
    resultado.patrimonios_grm = patrimonios.map((row) => ({ numero: row.patNumber, nome: row.patName, supervisao: row.olsName }));
    if (foraDoDestino.length) {
      const error = new Error(`Colaborador transferido, mas ${foraDoDestino.length} patrimônio(s) continuam fora de ${destino.olsName} no GRM (${foraDoDestino.map((row) => row.patNumber).join(', ')}). Ajuste esses patrimônios manualmente no GRM.`);
      error.code = 'PATRIMONIOS_NAO_MOVIDOS';
      error.resultado = resultado;
      throw error;
    }
  }

  return resultado;
}

async function atualizarCadastroLocal(item, resultado) {
  // O realtime de colaboradores atualiza em segundos, mas já deixa o painel
  // coerente (Programação/Sem O.S.) sem esperar o próximo ciclo.
  const { error } = await supabase
    .from('colaboradores')
    .update({ supervisao: resultado.destino.olsName, coordenacao: resultado.destino.olcName })
    .eq('cpf', item.colaborador_cpf);
  if (error) log('WARN', `Não atualizou colaboradores localmente: ${error.message}`);
}

async function updateItem(id, patch) {
  const { error } = await supabase.from('programacao_transferencias').update(patch).eq('id', id);
  if (error) throw error;
}

async function claimNext() {
  const { data, error } = await supabase.rpc('claim_next_programacao_transferencia');
  if (error) throw error;
  return data && data.id ? data : null;
}

async function processar(token, ctx) {
  let processed = 0;
  let errors = 0;
  for (let index = 0; index < MAX_PER_RUN; index += 1) {
    const item = await claimNext();
    if (!item) break;
    processed += 1;
    watchdogCurrentId = item.id;
    try {
      const resultado = await transferir(token, ctx, item);
      await updateItem(item.id, {
        grm_status: 'APLICADA', grm_locked_at: null, grm_aplicado_em: new Date().toISOString(),
        grm_erro: null, grm_resultado: resultado,
      });
      await atualizarCadastroLocal(item, resultado);
      log('SUCCESS', `${item.colaborador_nome} transferido para ${item.supervisao_destino} no GRM.`);
    } catch (error) {
      errors += 1;
      // Divergência de dados não se resolve sozinha: vai direto pra ERRO.
      // Falha de rede/GRM volta pra fila até MAX_TENTATIVAS.
      const definitivo = ['COLABORADOR_NAO_ENCONTRADO', 'SUPERVISAO_NAO_ENCONTRADA', 'ORIGEM_DIVERGENTE', 'PATRIMONIOS_NAO_MOVIDOS', 'DATA_FORMATO_INESPERADO'].includes(error.code);
      const esgotou = definitivo || Number(item.grm_tentativas || 0) >= MAX_TENTATIVAS;
      await updateItem(item.id, {
        grm_status: esgotou ? 'ERRO' : 'NA_FILA',
        grm_locked_at: null,
        grm_erro: error.message,
        grm_resultado: { code: error.code || null, ...(error.resultado || {}), stack: String(error.stack || '').slice(0, 4000) },
      });
      log('ERROR', `${item.colaborador_nome}: ${error.message}`);
    } finally {
      watchdogCurrentId = null;
    }
  }
  return { processed, errors };
}

async function dryRun(token, ctx) {
  let query = supabase.from('programacao_transferencias').select('*');
  query = ONLY_ID ? query.eq('id', ONLY_ID) : query.eq('status', 'ACEITA').in('grm_status', ['NA_FILA', 'ERRO']);
  const { data, error } = await query.limit(MAX_PER_RUN);
  if (error) throw error;
  if (!data?.length) log('INFO', 'DRY_RUN: nenhuma transferência para validar.');
  for (const item of data || []) {
    try {
      await transferir(token, ctx, item);
    } catch (err) {
      log('ERROR', `DRY_RUN ${item.colaborador_nome}: ${err.message}`);
    }
  }
  return { processed: data?.length || 0, errors: 0 };
}

// Simula uma transferência sem linha na fila: --dry-run --cpf=... --destino="..." [--patrimonios]
async function dryRunAvulso(token, ctx) {
  const cpf = (process.argv.find((arg) => arg.startsWith('--cpf=')) || '').slice(6);
  const destinoNome = (process.argv.find((arg) => arg.startsWith('--destino=')) || '').slice(10);
  const staffRow = await getStaffByCpf(token, cpf);
  await transferir(token, ctx, {
    colaborador_cpf: cpf,
    colaborador_nome: staffRow.staName,
    supervisao_origem: staffRow.olsName,
    supervisao_destino: destinoNome,
    transferir_patrimonios: process.argv.includes('--patrimonios'),
  });
  return { processed: 1, errors: 0 };
}

async function main() {
  log('INFO', `Iniciando agente de transferência de colaborador (dry_run=${DRY_RUN}).`);
  const token = await login();
  const ctx = await buildContext(token);
  log('INFO', `Contexto: ${ctx.supervisaoPorNome.size} supervisão(ões) ativas, moreThenOneCompany=${ctx.moreThenOneCompany}.`);
  let result;
  if (DRY_RUN && process.argv.some((arg) => arg.startsWith('--cpf='))) result = await dryRunAvulso(token, ctx);
  else result = DRY_RUN ? await dryRun(token, ctx) : await processar(token, ctx);
  log(result.errors ? 'ERROR' : 'SUCCESS', 'Agente concluído.', result);
  if (result.errors) process.exitCode = 1;
}

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    log('ERROR', `Erro fatal: ${error.message}`, { stack: error.stack });
    process.exit(1);
  });
  setTimeout(() => {
    log('ERROR', `Watchdog atingiu ${TIMEOUT_MIN} minuto(s); encerrando.`);
    if (!watchdogCurrentId) { process.exit(1); return; }
    Promise.race([
      updateItem(watchdogCurrentId, { grm_status: 'NA_FILA', grm_locked_at: null, grm_erro: 'Watchdog: execução interrompida, volta pra fila.' }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).finally(() => process.exit(1));
  }, TIMEOUT_MIN * 60 * 1000).unref();
}

module.exports = { transferir, buildPayload };
