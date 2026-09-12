#!/usr/bin/env node

/**
 * Abertura de O.S. no GRM via API direta (sem Puppeteer/navegador).
 *
 * STATUS (12/09/2026): escrito a partir do endpoint e payload capturados ao
 * vivo em grm-sync-abrir-os.js (CAPTURE_NET=true, O.S. 92511 real,
 * CARGILL/RS) — ver memória painel-web-abrir-os-endpoint-capturado. Validado
 * com --dry-run/--test-payload contra solicitações reais (inclusive já
 * CADASTRADAS, comparando o payload montado aqui com o que realmente foi
 * salvo) e agora é o script ligado em 'sync-abrir-os' no SCRIPT_MAP (worker/
 * grm-sync-job-worker.js), substituindo o Puppeteer. grm-sync-abrir-os.js
 * mantido no disco pra rollback — essa versão pula toda a validação
 * client-side do formulário do GRM, então um campo mal resolvido aqui pode
 * criar uma O.S. errada sem nenhum aviso visual como o navegador dava; se
 * aparecer, reverter o SCRIPT_MAP pro Puppeteer enquanto investiga.
 *
 * Vantagem real sobre o Puppeteer: a resposta do POST de criação já devolve
 * o número da O.S. direto (`recordCode`) — elimina de vez a classe de bugs
 * de "captura de número errado por colisão" que o Puppeteer tinha que
 * contornar lendo a grade (ver painel-web-abertura-os-numero-captura-errada-colisao
 * na memória).
 *
 * Cadeia de resolução (nem toda validada ao vivo — ver avisos no código):
 *   contratante_cliente -> clnCode (client/national/getForSelect)
 *   clnCode + (uf_embarque || filial_pagadora) -> clrCode (client/regional/getForSelect)
 *     [validado ao vivo 11/09: casa por sufixo de UF, ex. "CARGILL AGRICOLA -RS"]
 *   clrCode + filial_pagadora -> cliCode + dados denormalizados do cliente (client/last/getForSelect)
 *   armazem_embarque -> operacional_pontos_embarque (mesma lógica do Puppeteer)
 *     -> uf/cidade/tipo_local -> citCode (address/getCities) -> splCode (servicePlaces/getRecords)
 *     -> olsCode (supervision/getSupervisionByCitAndSPlaceType; fallback supervision/getForSelect x regional)
 *       [validado ao vivo 11/09: olsCode vem do par citCode+sptCode do EMBARQUE, não de
 *        casar solicitacao.regional por texto — mesmo quando os dois "parecem" preencher
 *        o mesmo campo no formulário]
 *   splCode -> pdcCode (servicePlaces/producer/getProducers, addNotDefined:true — pdcCode=0
 *     é literalmente a opção "Não Informado" devolvida pela própria API)
 *   servico -> serCode/serType (service/getForSelect)
 *   produto (+ tipo_produto quando não é classificação real) -> proCode (product/getForSelect)
 *   tipo_produto -> ptyCode (productType/getRecords, mesmo normTipoProduto do Puppeteer)
 *   proCode -> cItems[] (product/cItems/getRecords, usa os valores default do catálogo —
 *     o Puppeteer nunca edita esses campos, só aceita o que a cascata já preenche)
 *   local_destino (ou uf_destino/cidade_destino como fallback) -> citCode de destino (address/getCities)
 *   testes.opcoes -> flags sorAflatoxinTest/sorIntactaTest/sorSoyFreeTest/sorVomitoxinTest
 *     [NÃO VALIDADO AO VIVO — nenhuma captura real teve testes.opcoes não-vazio;
 *      mapeamento por inferência de nome, ver TESTES_API_MAP abaixo]
 */

require('dotenv').config();
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_USER = process.env.GRMSERVER_USER;
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD;

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const TABLE_SOLICITACOES = 'logistica_abertura_os';
const TABLE_EXECUCOES = 'grm_abertura_os_execucoes';
const MAX_TENTATIVAS = 3;

function log(level, msg) {
  console.log('[' + level + '] ' + new Date().toISOString() + ' - ' + msg);
}

var avisosCamposSuspeitos = [];
function avisarCampoSuspeito(msg) {
  log('WARN', msg);
  avisosCamposSuspeitos.push(msg);
}

function safe(data) { return Array.isArray(data) ? data : []; }

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

// ---------------------------------------------------------------------
// HTTP cru contra o GRM (mesmo padrão de grmserver-aplicar-distribuicao-os-api.js)
// ---------------------------------------------------------------------
function requestJson(url, method, body, headers) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: method || 'GET',
      timeout: 30000,
      headers: Object.assign(
        { accept: 'application/json', 'content-type': 'application/json' },
        payload ? { 'content-length': Buffer.byteLength(payload) } : {},
        headers || {}
      ),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (e) { reject(new Error('GRM retornou conteúdo inválido (HTTP ' + response.statusCode + ').')); return; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('GRM respondeu HTTP ' + response.statusCode + ': ' + (data.message || 'erro')));
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

function postJson(url, body, token) {
  const headers = Object.assign({}, GRM_WEB_HEADERS, token ? { authorization: 'Bearer ' + token } : {});
  return requestJson(GRM_BASE_URL + url, 'POST', body, headers);
}

async function login() {
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson('user/login', {
    userEmail: GRM_USER,
    userPass: GRM_PASSWORD,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0', engine: 'Node.js',
      engineVersion: process.version, platform: process.platform, screenSize: '', windowSize: '',
    },
  }, null);
  if (!response.result || !response.token) throw new Error('Login GRM recusado: ' + (response.message || 'sem token'));
  return response.token;
}

// ---------------------------------------------------------------------
// Matching genérico (mesmas 2 prioridades usadas em selecionarOpcaoAberta
// do grm-sync-abrir-os.js: começa-com antes de contém-em-qualquer-lugar —
// substring puro é frágil demais pra valores curtos, ver comentário lá).
// ---------------------------------------------------------------------
function melhorCorrespondencia(lista, campo, alvo) {
  const alvoNorm = norm(alvo);
  if (!alvoNorm || !lista || !lista.length) return null;
  for (const item of lista) {
    if (norm(item[campo]).indexOf(alvoNorm) === 0) return item;
  }
  for (const item of lista) {
    const texto = norm(item[campo]);
    if (texto && (texto.indexOf(alvoNorm) !== -1 || alvoNorm.indexOf(texto) !== -1)) return item;
  }
  return null;
}

// Sufixo "-UF" (2 letras) — mesma lógica de selecionarOpcaoPorSufixoUf do
// Puppeteer, validada ao vivo 11/09 (Cliente Regional é "<cliente> - <UF>",
// filial_pagadora não bate por texto quando traz nome de região por extenso
// ou cidade).
function melhorCorrespondenciaPorSufixoUf(lista, campo, uf) {
  if (!uf) return null;
  const alvo = '-' + norm(uf).replace(/\s+/g, '');
  for (const item of lista) {
    if (norm(item[campo]).replace(/\s+/g, '').endsWith(alvo)) return item;
  }
  return null;
}

// ---------------------------------------------------------------------
// Portado 1:1 de grm-sync-abrir-os.js (lógica pura, sem Puppeteer)
// ---------------------------------------------------------------------
var TIPO_PRODUTO_GRM_VALIDOS = [
  'AFLATOXINA NEGATIVO', 'CONVENCIONAL', 'DECLARADO INTACTA', 'INTACTA NEGATIVO',
  'INTACTA POSITIVO', 'NAO DEFINIDO', 'PARTICIPANTE', 'TRANSGENICO'
];
var TIPO_PRODUTO_GRM_DISPLAY = {
  'AFLATOXINA NEGATIVO': 'Aflatoxina Negativo', 'CONVENCIONAL': 'Convencional',
  'DECLARADO INTACTA': 'Declarado Intacta', 'INTACTA NEGATIVO': 'Intacta Negativo',
  'INTACTA POSITIVO': 'Intacta Positivo', 'NAO DEFINIDO': 'Não Definido',
  'PARTICIPANTE': 'Participante', 'TRANSGENICO': 'Transgênico'
};
function normTipoProduto(s) {
  return norm(s).replace(/\bDECLARADA\b/g, 'DECLARADO').replace(/\bTRANSGENICA\b/g, 'TRANSGENICO');
}

var PREFIXOS_GENERICOS_EMBARQUE = ['ARM', 'ARMAZEM', 'ARMAZÉM', 'SILO', 'FAZENDA', 'TERMINAL', 'PORTO', 'GALPAO', 'GALPÃO', 'SITIO', 'SÍTIO', 'ESTACAO', 'ESTAÇÃO'];
function palavrasSignificativasEmbarque(texto) {
  return norm(texto).split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && PREFIXOS_GENERICOS_EMBARQUE.indexOf(w) === -1);
}

async function resolverPontoEmbarque(valorArmazem, cidadeSolicitacao) {
  var texto = String(valorArmazem || '').trim();
  if (!texto) return null;
  var porNome = await supabase.from('operacional_pontos_embarque').select('tipo_local,uf,cidade,nome_local').ilike('nome_local', texto).limit(1);
  if (!porNome.error && porNome.data && porNome.data[0]) return porNome.data[0];
  var porLabel = await supabase.from('operacional_pontos_embarque').select('tipo_local,uf,cidade,nome_local').ilike('embarque_label', texto).limit(1);
  if (!porLabel.error && porLabel.data && porLabel.data[0]) return porLabel.data[0];
  var palavras = palavrasSignificativasEmbarque(texto);
  if (!palavras.length) return null;
  var query = supabase.from('operacional_pontos_embarque').select('tipo_local,uf,cidade,nome_local');
  palavras.forEach((p) => { query = query.ilike('nome_local', '%' + p + '%'); });
  if (cidadeSolicitacao) query = query.ilike('cidade', String(cidadeSolicitacao).trim());
  var porPalavras = await query.limit(5);
  if (!porPalavras.error && porPalavras.data && porPalavras.data.length === 1) return porPalavras.data[0];
  return null;
}

function extrairLocalPadrao(texto) {
  var m = String(texto || '').trim().match(/^([A-Za-z]{2})\s*-\s*([^(]+?)\s*\(([^)]+)\)\s*$/);
  if (!m) return null;
  return { uf: m[1].toUpperCase(), cidade: m[2].trim(), local: m[3].trim() };
}

// Inferido por semelhança de nome com proEnableXxxTest — NENHUMA captura
// real teve testes.opcoes não-vazio até agora, então isso nunca foi
// confirmado contra um payload de verdade. Revisar com CAPTURE_NET na
// próxima solicitação real que use algum desses testes antes de confiar
// cegamente.
var TESTES_API_MAP = {
  AFLATOXINA_QUALITATIVO: 'sorAflatoxinTest',
  AFLATOXINA_QUANTITATIVO: 'sorAflatoxinTest',
  AFLATOXINA_QUALI_QUANTI: 'sorAflatoxinTest',
  INTACTA: 'sorIntactaTest',
  GMO_FREE: 'sorSoyFreeTest',
  VOMITOXINA: 'sorVomitoxinTest',
};

// ---------------------------------------------------------------------
// Resolução de cada código GRM
// ---------------------------------------------------------------------
async function resolverClienteNacional(token, nomeCliente) {
  const res = await postJson('client/national/getForSelect', {}, token);
  const item = melhorCorrespondencia(safe(res.searchData), 'clnName', nomeCliente);
  if (!item) throw new Error('Cliente Nacional "' + nomeCliente + '" não encontrado no GRM.');
  return item;
}

async function resolverClienteRegional(token, clnCode, uf, filialPagadora) {
  const res = await postJson('client/regional/getForSelect', { clnCode, clrStatus: 'A' }, token);
  const lista = safe(res.searchData);
  let item = melhorCorrespondenciaPorSufixoUf(lista, 'clrName', uf);
  if (!item) {
    item = melhorCorrespondencia(lista, 'clrName', filialPagadora);
    if (item) avisarCampoSuspeito('Cliente Regional: nenhuma opção bateu com UF ("' + uf + '") — usando fuzzy match por filial_pagadora ("' + item.clrName + '").');
  }
  if (!item && lista[0]) {
    item = lista[0];
    avisarCampoSuspeito('Cliente Regional: nenhuma opção bateu com UF nem filial_pagadora — usando a 1ª disponível ("' + item.clrName + '") como fallback.');
  }
  if (!item) throw new Error('Cliente Regional não encontrado pro Cliente Nacional ' + clnCode + '.');
  return item;
}

async function resolverClienteFinal(token, clrCode, filialPagadora) {
  const res = await postJson('client/last/getForSelect', { clrCode, cliStatus: 'A' }, token);
  const lista = safe(res.searchData);
  let item = melhorCorrespondencia(lista, 'cliName', filialPagadora);
  if (!item && lista[0]) {
    item = lista[0];
    avisarCampoSuspeito('Cliente Final ("' + filialPagadora + '") não bateu com nenhuma opção — usando a 1ª disponível ("' + item.cliName + '") como fallback.');
  }
  if (!item) throw new Error('Cliente Final não encontrado pro Cliente Regional ' + clrCode + '.');
  return item;
}

async function resolverServico(token, nomeServico) {
  const res = await postJson('service/getForSelect', {}, token);
  const item = melhorCorrespondencia(safe(res.searchData), 'serName', nomeServico);
  if (!item) throw new Error('Serviço "' + nomeServico + '" não encontrado no GRM.');
  return item;
}

async function resolverProduto(token, nomeProduto, tipoProduto) {
  const res = await postJson('product/getForSelect', {}, token);
  const lista = safe(res.searchData);
  // Mesma regra do Puppeteer: quando tipo_produto não é uma classificação
  // real (ex. "Exportação"), ele na verdade indica qual VARIANTE de Produto
  // escolher ("Milho Exportação" em vez de só "Milho") — validado ao vivo
  // 11/09. Tenta a combinação primeiro, cai pro nome puro se não bater.
  let item = null;
  if (tipoProduto && TIPO_PRODUTO_GRM_VALIDOS.indexOf(normTipoProduto(tipoProduto)) === -1) {
    item = melhorCorrespondencia(lista, 'proName', nomeProduto + ' ' + tipoProduto);
  }
  if (!item) item = melhorCorrespondencia(lista, 'proName', nomeProduto);
  if (!item) throw new Error('Produto "' + nomeProduto + '" não encontrado no GRM.');
  return item;
}

async function resolverTipoProduto(token, valor) {
  const res = await postJson('productType/getRecords', { ptyStatus: 'A', ptyShowOnServiceOrder: 'S' }, token);
  const lista = safe(res.searchData);
  const alvoNorm = normTipoProduto(valor);
  const idx = TIPO_PRODUTO_GRM_VALIDOS.indexOf(alvoNorm);
  if (idx === -1) {
    avisarCampoSuspeito('Tipo do Produto "' + valor + '" não é uma opção válida do GRM — usando "Não Definido".');
    return melhorCorrespondencia(lista, 'ptyName', 'Não Definido') || lista[0];
  }
  const nomeCanonico = TIPO_PRODUTO_GRM_DISPLAY[TIPO_PRODUTO_GRM_VALIDOS[idx]];
  const item = melhorCorrespondencia(lista, 'ptyName', nomeCanonico);
  if (!item) throw new Error('Tipo do Produto "' + nomeCanonico + '" não encontrado no GRM.');
  return item;
}

async function resolverCItems(token, proCode) {
  const res = await postJson('product/cItems/getRecords', { proCode, pciStatus: 'A' }, token);
  return safe(res.searchData).map((item) => ({
    sciCode: 0,
    pciCode: item.pciCode,
    sciChecked: 'S',
    proCode,
    sciValue: item.pciValue,
    sciPFPBValue: item.pciPFPBValue,
    sciAcceptedValue: item.pciAcceptedValue,
    pciAcceptedValue: item.pciAcceptedValue,
    pciMaxValue: item.pciMaxValue,
    pciName: item.pciName,
    pciRequired: item.pciRequired,
  }));
}

async function resolverProdutor(token, splCode, nomeProdutor) {
  const res = await postJson('servicePlaces/producer/getProducers', { splCode, addNotDefined: true, pdcStatus: 'A' }, token);
  const lista = safe(res.searchData);
  if (nomeProdutor) {
    const item = melhorCorrespondencia(lista, 'pdcName', nomeProdutor);
    if (item) return item;
    avisarCampoSuspeito('Produtor "' + nomeProdutor + '" não bateu com nenhuma opção do GRM — usando "Não Informado".');
  }
  return lista.find((i) => i.pdcCode === 0) || lista[0] || { pdcCode: 0 };
}

async function resolverEmbarque(token, solicitacao) {
  const ponto = await resolverPontoEmbarque(solicitacao.armazem_embarque, solicitacao.cidade_embarque);
  let uf = solicitacao.uf_embarque, cidade = solicitacao.cidade_embarque, tipoLocalNome = null;
  if (ponto) {
    uf = ponto.uf; cidade = ponto.cidade; tipoLocalNome = ponto.tipo_local;
    log('INFO', 'Local de embarque "' + solicitacao.armazem_embarque + '" resolvido em operacional_pontos_embarque: ' + ponto.tipo_local + ' / ' + ponto.uf + ' / ' + ponto.cidade + ' / ' + ponto.nome_local);
  } else {
    avisarCampoSuspeito('Local de embarque "' + solicitacao.armazem_embarque + '" não encontrado em operacional_pontos_embarque — tipo do local não pode ser inferido.');
  }

  const tiposRes = await postJson('servicePlacesType/getRecords', {}, token);
  const tipoLocal = tipoLocalNome
    ? melhorCorrespondencia(safe(tiposRes.searchData), 'sptName', tipoLocalNome)
    : null;
  if (!tipoLocal) throw new Error('Tipo do Local de embarque não resolvido (ponto "' + solicitacao.armazem_embarque + '" sem tipo_local válido).');

  const citiesRes = await postJson('address/getCities', { staAbreviation: uf }, token);
  const cidadeItem = melhorCorrespondencia(safe(citiesRes.searchData), 'citName', cidade);
  if (!cidadeItem) throw new Error('Cidade de embarque "' + cidade + '" (UF ' + uf + ') não encontrada no GRM.');

  const locaisRes = await postJson('servicePlaces/getRecords', { citCode: cidadeItem.citCode, sptCode: tipoLocal.sptCode, splStatus: 'A', limit: 1000 }, token);
  const localItem = melhorCorrespondencia(safe(locaisRes.searchData), 'splName', ponto ? ponto.nome_local : solicitacao.armazem_embarque);
  if (!localItem) throw new Error('Local do Serviço "' + solicitacao.armazem_embarque + '" não encontrado em ' + cidade + '/' + uf + '.');

  // olsCode vem do PAR citCode+sptCode do embarque — validado ao vivo 11/09
  // contra a O.S. 92511 real (searchData da API é o olsCode cru, não uma
  // lista). Só cai pro fallback de casar solicitacao.regional por texto
  // quando essa consulta não acha nada.
  let olsCode = null;
  const supRes = await postJson('supervision/getSupervisionByCitAndSPlaceType', { citCode: cidadeItem.citCode, sptCode: tipoLocal.sptCode }, token);
  if (supRes.result && typeof supRes.searchData === 'number') {
    olsCode = supRes.searchData;
  } else {
    avisarCampoSuspeito('Supervisão não resolvida por cidade+tipo de local — tentando casar "' + solicitacao.regional + '" pelo nome.');
    const todasRes = await postJson('supervision/getForSelect', { olsStatus: 'A' }, token);
    const sup = melhorCorrespondencia(safe(todasRes.searchData), 'olsName', solicitacao.regional);
    if (sup) olsCode = sup.olsCode;
  }
  if (olsCode == null) throw new Error('Supervisão (olsCode) não resolvida pro embarque "' + solicitacao.armazem_embarque + '".');

  return { sptCode: tipoLocal.sptCode, staAbreviation: uf, citCode: cidadeItem.citCode, splCode: localItem.splCode, olsCode, splName: localItem.splName };
}

async function resolverDestino(token, solicitacao) {
  const parsed = extrairLocalPadrao(solicitacao.local_destino);
  let uf, cidadeNome, textoDestino;
  if (parsed) {
    uf = parsed.uf; cidadeNome = parsed.cidade; textoDestino = solicitacao.local_destino;
  } else {
    avisarCampoSuspeito('local_destino "' + solicitacao.local_destino + '" não bate no formato "UF - CIDADE (LOCAL)" — usando uf_destino/cidade_destino da solicitação como fallback.');
    uf = solicitacao.uf_destino; cidadeNome = solicitacao.cidade_destino; textoDestino = solicitacao.local_destino;
  }
  const citiesRes = await postJson('address/getCities', { staAbreviationDestination: uf }, token);
  const cidadeItem = melhorCorrespondencia(safe(citiesRes.searchData), 'citName', cidadeNome);
  if (!cidadeItem) throw new Error('Cidade de destino "' + cidadeNome + '" (UF ' + uf + ') não encontrada no GRM.');
  return {
    sodCode: 0, sodUnique: Date.now(), sodStatus: 'A', sorCode: 0,
    citCode: cidadeItem.citCode, sodDestination: textoDestino,
    sorMainDestination: 'S', citName: cidadeItem.citName, citUF: uf,
  };
}

// ---------------------------------------------------------------------
// Monta o payload final de POST /api/serviceOrder/setRecord
// ---------------------------------------------------------------------
async function montarPayload(token, solicitacao) {
  const clienteNacional = await resolverClienteNacional(token, solicitacao.contratante_cliente);
  const clienteRegional = await resolverClienteRegional(token, clienteNacional.clnCode, solicitacao.uf_embarque, solicitacao.filial_pagadora);
  const clienteFinal = await resolverClienteFinal(token, clienteRegional.clrCode, solicitacao.filial_pagadora);
  const embarque = await resolverEmbarque(token, solicitacao);
  const produtor = await resolverProdutor(token, embarque.splCode, solicitacao.produtor);
  const servico = await resolverServico(token, solicitacao.servico);
  const produto = await resolverProduto(token, solicitacao.produto, solicitacao.tipo_produto);
  const tipoProduto = await resolverTipoProduto(token, solicitacao.tipo_produto);
  const cItems = await resolverCItems(token, produto.proCode);
  const destino = await resolverDestino(token, solicitacao);

  const testesFlags = { sorAflatoxinTest: 'N', sorIntactaTest: 'N', sorSoyFreeTest: 'N', sorVomitoxinTest: 'N', sorFallingNumberTest: 'N' };
  const opcoesTestes = (solicitacao.testes && Array.isArray(solicitacao.testes.opcoes)) ? solicitacao.testes.opcoes : [];
  opcoesTestes.forEach((key) => {
    const campo = TESTES_API_MAP[key];
    if (!campo) { avisarCampoSuspeito('Teste "' + key + '" sem mapeamento pro payload da API — ignorado.'); return; }
    avisarCampoSuspeito('Teste "' + key + '" -> ' + campo + '="S" (mapeamento NÃO validado ao vivo, conferir a O.S. criada).');
    testesFlags[campo] = 'S';
  });

  return {
    clnCode: clienteNacional.clnCode,
    clrCode: clienteRegional.clrCode,
    cliCode: clienteFinal.cliCode,
    sptCode: embarque.sptCode,
    staAbreviation: embarque.staAbreviation,
    citCode: embarque.citCode,
    splCode: embarque.splCode,
    olsCode: embarque.olsCode,
    sorDate: new Date().toLocaleDateString('pt-BR'),
    serCode: servico.serCode,
    sorLotSize: Number(solicitacao.volume_inicial) || 0,
    serType: servico.serType,
    serTypeService: servico.serType,
    sorTransportType: 'C', // Caminhão — mesmo default fixo do Puppeteer (ver comentário original em grm-sync-abrir-os.js sobre "Vagão" só quando o contrato indica saída de vagão; não usado aqui ainda)
    sorContract: solicitacao.numero_contrato || '',
    sorLotNumber: '',
    sorOCC: 'N',
    sorModIntegra: 'N',
    sorModIntegraFiles: null,
    lftCode: null,
    sorNeedTruckDetails: 'N',
    sorBlockOnFullLot: 'S',
    proCode: produto.proCode,
    proCodeOriginal: '',
    ptyCode: tipoProduto.ptyCode,
    ptyNeedIntactaTest: tipoProduto.ptyNeedIntactaTest || 'N', // vem do TIPO DO PRODUTO escolhido (productType/getRecords), não do produto — achado comparando com o payload real capturado (O.S. 92511: "N" pra Declarado Intacta, eu tinha derivado errado de proEnableIntactaTest)
    sorPermitChangeProductType: 'S',
    sorAflatoxinTest: testesFlags.sorAflatoxinTest,
    sorIntactaTest: testesFlags.sorIntactaTest,
    sorSoyFreeTest: testesFlags.sorSoyFreeTest,
    sorVomitoxinTest: testesFlags.sorVomitoxinTest,
    sorFallingNumberTest: testesFlags.sorFallingNumberTest,
    sorFallingNumberLimit: 250,
    ptyCodeProduct: 0,
    proEnableAflatoxinsTest: produto.proEnableAflatoxinsTest || '',
    proEnableIntactaTest: produto.proEnableIntactaTest || '',
    proEnableSoyFreeTest: produto.proEnableSoyFreeTest || '',
    proEnableVomitoxinTest: produto.proEnableVomitoxinTest || '',
    proEnableFallingNumberTest: produto.proEnableFallingNumberTest || '',
    sorAllowLiveInsects: produto.proAllowLiveInsects || 'N',
    sorAllowDeadInsects: produto.proAllowDeadInsects || 'N',
    sorAllowStrangeSmell: produto.proAllowStrangeSmell || 'N',
    sorAllowToxicSeeds: produto.proAllowToxicSeeds || 'N',
    totalLoadsWeight: '0',
    destinations: [destino],
    cItems,
    cItemsOriginal: [],
    isCItemsLoading: 'N',
    sorIsVectorIntegration: 'N',
    sorDisableLaudoMaxDistance: 'N',
    isTrizyIntegration: 'N',
    sorEnableTrizyIntegration: 'N',
    isLaudoMaxDistanceEnabled: 'S',
    splHasIssueHistory: 'N',
    conCode: [],
    cliDocument: clienteFinal.cliDocument || '',
    cliIE: clienteFinal.cliIE || '',
    cliContact: clienteFinal.cliContact || null,
    cliPhone: clienteFinal.cliPhoneMain || '',
    cliEmail: clienteFinal.cliEmail || '',
    cliCity: (clienteFinal.cliCitUF || '') + ' - ' + (clienteFinal.cliCitName || ''),
    cliAddress: clienteFinal.cliAddress || '',
    cliCEP: clienteFinal.cliCEP || '',
    pdcCode: produtor.pdcCode,
    staAbreviationDestination: '',
    citCodeDestination: '',
    sorDestination: '',
    sorOtherInfos: solicitacao.troca_notas ? ('Troca de notas: ' + solicitacao.troca_notas) : '',
  };
}

// ---------------------------------------------------------------------
// Persistência — mesmo contrato de grm-sync-abrir-os.js (logistica_abertura_os
// + grm_abertura_os_execucoes), pra poder substituir um pelo outro sem
// mudar mais nada no resto do sistema.
// ---------------------------------------------------------------------
async function marcarProcessando(id, tentativa) {
  const result = await supabase.from(TABLE_SOLICITACOES)
    .update({ status: 'PROCESSANDO', tentativas_agente: tentativa, processamento_iniciado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'APROVADO').select('id');
  if (result.error) throw new Error('Falha ao marcar PROCESSANDO: ' + result.error.message);
  return !!(result.data && result.data.length);
}

async function marcarErro(id, mensagem) {
  if (avisosCamposSuspeitos.length) mensagem += ' Possível(is) causa(s): ' + avisosCamposSuspeitos.join(' | ');
  const result = await supabase.from(TABLE_SOLICITACOES).update({ status: 'ERRO', erro_agente: String(mensagem || '').slice(0, 2000), processamento_finalizado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  if (result.error) log('WARN', 'Falha ao marcar ERRO em ' + id + ': ' + result.error.message);
}

async function marcarCadastrada(id, numeroOs) {
  const result = await supabase.from(TABLE_SOLICITACOES).update({ status: 'CADASTRADO', numero_os_cadastrada: String(numeroOs), processamento_finalizado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  if (result.error) throw new Error('O.S. ' + numeroOs + ' criada no GRM, mas falhou ao marcar CADASTRADO: ' + result.error.message);
}

async function criarExecucao(aberturaOsId, dryRun) {
  const result = await supabase.from(TABLE_EXECUCOES).insert({ abertura_os_id: aberturaOsId, status: 'PROCESSANDO', dry_run: !!dryRun }).select('id').single();
  if (result.error) { log('WARN', 'Não consegui criar execução: ' + result.error.message); return null; }
  return result.data.id;
}

async function finalizarExecucao(execucaoId, patch) {
  if (!execucaoId) return;
  const result = await supabase.from(TABLE_EXECUCOES).update(Object.assign({ finalizado_em: new Date().toISOString() }, patch)).eq('id', execucaoId);
  if (result.error) log('WARN', 'Falha ao finalizar execução: ' + result.error.message);
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--id') out.id = argv[++i];
    else if (argv[i] === '--test-payload') out.testPayload = argv[++i];
  }
  return out;
}

// Calibração: monta o payload pra uma solicitação já CADASTRADA (ou
// qualquer status) e só imprime — não toca em status/tentativas/execuções.
// Serve pra comparar com o payload real capturado via CAPTURE_NET antes de
// confiar na cadeia de resolução pra uma solicitação nova de verdade.
async function testarPayload(token, id) {
  const { data, error } = await supabase.from(TABLE_SOLICITACOES).select('*').eq('id', id).single();
  if (error) throw new Error('Solicitação não encontrada: ' + error.message);
  avisosCamposSuspeitos = [];
  const payload = await montarPayload(token, data);
  log('INFO', 'Payload montado pra ' + id + ':');
  console.log(JSON.stringify(payload, null, 2));
  if (avisosCamposSuspeitos.length) log('WARN', 'Avisos: ' + avisosCamposSuspeitos.join(' | '));
}

async function processarSolicitacao(token, solicitacao, dryRun) {
  const id = solicitacao.id;
  const tentativa = Number(solicitacao.tentativas_agente || 0) + 1;
  if (tentativa > MAX_TENTATIVAS) {
    await marcarErro(id, 'Número máximo de tentativas (' + MAX_TENTATIVAS + ') excedido — revise manualmente e reenvie.');
    return;
  }
  const podeProcessar = await marcarProcessando(id, tentativa);
  if (!podeProcessar) { log('WARN', 'Solicitação ' + id + ' não está mais em APROVADO — pulando.'); return; }

  const execucaoId = await criarExecucao(id, dryRun);
  avisosCamposSuspeitos = [];
  log('INFO', 'Processando solicitação ' + id + ' via API (tentativa ' + tentativa + '/' + MAX_TENTATIVAS + ')...');

  try {
    const payload = await montarPayload(token, solicitacao);
    log('INFO', 'Payload montado: ' + JSON.stringify(payload));

    if (dryRun) {
      log('INFO', 'DRY-RUN: payload montado, não enviado ao GRM.');
      await finalizarExecucao(execucaoId, { status: 'DRY_RUN_OK', mensagem: 'Payload montado (dry-run).' });
      await supabase.from(TABLE_SOLICITACOES).update({ status: 'APROVADO', processamento_iniciado_em: null, updated_at: new Date().toISOString() }).eq('id', id);
      return;
    }

    const resultado = await postJson('serviceOrder/setRecord', payload, token);
    if (!resultado.result || !resultado.recordCode) {
      throw new Error('GRM recusou a criação: ' + (resultado.message || resultado.error || 'sem detalhes'));
    }
    await marcarCadastrada(id, resultado.recordCode);
    await finalizarExecucao(execucaoId, { status: 'SUCESSO', numero_os: resultado.recordCode });
    log('SUCCESS', 'Solicitação ' + id + ': O.S. ' + resultado.recordCode + ' cadastrada no GRM via API.');
  } catch (error) {
    let msg = String(error.message || error);
    if (avisosCamposSuspeitos.length) msg += ' Possível(is) causa(s): ' + avisosCamposSuspeitos.join(' | ');
    log('ERROR', 'Solicitação ' + id + ': ' + msg);
    await marcarErro(id, msg);
    await finalizarExecucao(execucaoId, { status: 'ERRO', mensagem: msg.slice(0, 2000) });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = await login();
  log('SUCCESS', 'Login realizado.');

  if (args.testPayload) { await testarPayload(token, args.testPayload); return; }

  let query = supabase.from(TABLE_SOLICITACOES).select('*').order('created_at', { ascending: true });
  query = args.id ? query.eq('id', args.id) : query.eq('status', 'APROVADO');
  const { data, error } = await query;
  if (error) throw new Error('Falha ao buscar solicitações: ' + error.message);

  const solicitacoes = safe(data);
  log('INFO', solicitacoes.length + ' solicitação(ões) pra processar.');
  for (const solicitacao of solicitacoes) {
    await processarSolicitacao(token, solicitacao, args.dryRun);
  }
}

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exit(1);
});
