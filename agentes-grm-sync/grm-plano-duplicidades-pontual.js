'use strict';
// SOMENTE LEITURA: plano de duplicidades do Caixa Operacional (Café, Almoço, Janta, Pernoite, Diária).
// Um grupo = colaborador + despesa + DATA EFETIVA (a citada na observação; senão a do lançamento).
// Sobrevive 1 por grupo (valor padrão/salário; aprovado > direto na data > menor código). Os demais:
//   aprovado -> EXCLUIR ; pendente -> RECUSAR ; grupo sem lançamento no valor padrão -> REVISAR (nada é tocado).
require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const G = require('./grm-despesas-guardas');
const { obterTokenGrm } = require('./grm-token-cache');

const INICIO = process.argv[2]; // primeiro dia de LANÇAMENTO a tratar
const FIM = process.argv[3];    // hoje
const CONTEXTO_DE = G.addDias(INICIO, -45); // lançamentos anteriores servem de sobrevivente/contexto
const br = (iso) => iso.split('-').reverse().join('/');
const H = { accept: 'application/json', origin: 'https://www.grmserver.com.br', 'content-type': 'application/json' };
const PADRAO = { CAFE: 10, ALMOCO: 30, JANTA: 30, PERNOITE: 30 };
const digits = (v) => String(v || '').replace(/\D/g, '');

function grupoElegivel(r) {
  const c = G.norm(r.oexName);
  const v = Number(r.ofmValue);
  if (['CAFE', 'ALMOCO', 'JANTA', 'PERNOITE'].includes(c)) return c;
  if (c === 'SALARIO DE INTERMITENTE') return 'DIARIA';
  if (c === 'SERVICOS TERCEIRIZADOS') { if (v > 45) return 'DIARIA'; if (v === 30) return 'ALMOCO'; return null; }
  return null;
}
const diaDe = (r) => String(r.ofmDate).slice(0, 10);
// "REF - 14/09 15/09 16/09 ..." = lançamento que cobre vários dias: não é duplicata de um dia
function variosDias(r) {
  const t = String(r.ofmDescription || '').replace(/\((data corrigida|relan[cç]ado)[^)]*\)/gi, ' ');
  const datas = new Set([...t.matchAll(/(?<!\d)(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?!\d)/g)].filter((m) => Number(m[1]) <= 31 && Number(m[2]) <= 12).map((m) => `${Number(m[1])}/${Number(m[2])}`));
  return datas.size >= 2;
}
const efetivaDe = (r) => G.dateFromObs(r.ofmDescription, diaDe(r)) || diaDe(r);

(async () => {
  const token = await obterTokenGrm({ login: async () => { throw new Error('sem token'); } });
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });
  const post = async (path, body) => (await fetch('https://www.grmserver.com.br/api/' + path, { method: 'POST', headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).json();

  const staff = (await post('staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' })).searchData || [];
  const cpfPorSta = new Map(staff.map((s) => [Number(s.staCode), digits(s.staCPF)]));
  const salarioPorCpf = new Map();
  const contratoPorCpf = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('colaborador_cruzamento').select('cpf,salario,tipo_contrato').order('colaborador_id').range(from, from + 999);
    if (error) throw error;
    data.forEach((c) => { salarioPorCpf.set(digits(c.cpf), Number(c.salario) || 0); contratoPorCpf.set(digits(c.cpf), G.norm(c.tipo_contrato)); });
    if (data.length < 1000) break;
  }

  const rows = [];
  for (let d = CONTEXTO_DE; d <= FIM; d = G.addDias(d, 1)) {
    const j = await post('reports/finance/operatingFlow', { ofmDateFrom: br(d), ofmDateTo: br(d), ofmStatusReport: ['P', 'A'], reportType: 'flowList' });
    (j.searchData || []).forEach((r) => { if (r.ofmType === 'D') rows.push(r); });
    await new Promise((res) => setTimeout(res, 100));
  }

  const ADMIN_TIPOS = new Set(['COMERCIAL CLIENTE', 'COMPRA DO ALOJAMENTO', 'MATERIAL DE EXPEDIENTE']);
  const admin = new Set();
  for (const r of rows) {
    if (ADMIN_TIPOS.has(G.norm(r.oexName))) admin.add(Number(r.staCode));
    const cpf = cpfPorSta.get(Number(r.staCode));
    if (contratoPorCpf.get(cpf) === 'DIARISTA' && !(salarioPorCpf.get(cpf) > 0)) admin.add(Number(r.staCode)); // diarista sem salário = perfil de gestão
  }
  const elegiveis = []; const fora = { divergente: 0, naoRepete: 0, semGrupo: 0, futura: 0, variosDias: 0, diariaSemVinculo: 0 };
  for (const r of rows) {
    if (!['P', 'A'].includes(r.ofmStatus)) continue;
    const g = grupoElegivel(r);
    if (!g) { fora.semGrupo += 1; continue; }
    if (g === 'DIARIA') {
      const cpf = cpfPorSta.get(Number(r.staCode));
      if (!['INTERMITENTE', 'DIARISTA'].includes(contratoPorCpf.get(cpf)) || Number(r.ofmValue) > 500) { fora.diariaSemVinculo += 1; continue; }
    }
    if (variosDias(r)) { fora.variosDias += 1; continue; }
    if (G.categoriaDivergente(r)) { fora.divergente += 1; continue; }
    if (G.observacaoNaoRepete(r)) { fora.naoRepete += 1; continue; }
    const ef = efetivaDe(r);
    if (ef > FIM) { fora.futura += 1; continue; }
    elegiveis.push({ r, g, ef });
  }
  const grupos = new Map();
  for (const m of elegiveis) {
    const k = `${m.r.staCode}|${m.g}|${m.ef}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  const resumo = (m) => ({ ofm: m.r.ofmCode, status: m.r.ofmStatus, valor: Number(m.r.ofmValue), tipo: String(m.r.oexName).trim(), dataLanc: diaDe(m.r), obs: String(m.r.ofmDescription || '').replace(/\s+/g, ' ').slice(0, 100), por: String(m.r.ofmUpdateUserName || '') });
  const plano = []; const revisar = []; let gruposDup = 0;
  for (const [k, ms] of grupos) {
    if (ms.length < 2) continue;
    gruposDup += 1;
    const [sta, g, ef] = k.split('|');
    const nome = String(ms[0].r.staName).trim();
    const E = g === 'DIARIA' ? (salarioPorCpf.get(cpfPorSta.get(Number(sta))) || 0) : PADRAO[g];
    const base = { sta: Number(sta), nome, cpf: cpfPorSta.get(Number(sta)) || '', grupo: g, dataEfetiva: ef, valorPadrao: E, membros: ms.map(resumo) };
    if (!ms.some((m) => diaDe(m.r) >= INICIO)) continue; // grupo inteiro anterior ao período pedido
    if (admin.has(Number(sta))) { revisar.push({ ...base, motivo: 'colaborador_com_perfil_administrativo' }); continue; }
    if (!(E > 0)) { revisar.push({ ...base, motivo: 'sem_salario_no_cadastro' }); continue; }
    const certos = ms.filter((m) => Math.abs(Number(m.r.ofmValue) - E) < 0.005);
    if (!certos.length) { revisar.push({ ...base, motivo: 'nenhum_lancamento_com_valor_padrao' }); continue; }
    const relancado = (m) => /relan[cç]ado; original/i.test(String(m.r.ofmDescription || ''));
    const rank = (m) => [m.r.ofmStatus === 'A' ? 0 : 1, relancado(m) ? 1 : 0, diaDe(m.r) === ef ? 0 : 1, Number(m.r.ofmCode)];
    certos.sort((a, b) => { const x = rank(a); const y = rank(b); for (let i = 0; i < 4; i += 1) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    const sobrev = certos[0];
    const outros = ms.filter((m) => m !== sobrev);
    // nunca exclui aprovado quando o que sobra é pendente (a pessoa ficaria sem nada aprovado)
    if (sobrev.r.ofmStatus === 'P' && outros.some((m) => m.r.ofmStatus === 'A')) { revisar.push({ ...base, motivo: 'sobrevivente_pendente_com_aprovado_a_excluir' }); continue; }
    // o que sobra tem que ser o padrão e nada que vai embora pode valer mais que o padrão (lump, valor atípico)
    if (outros.some((m) => Number(m.r.ofmValue) > E + 0.005)) { revisar.push({ ...base, motivo: 'candidato_com_valor_maior_que_o_padrao' }); continue; }
    const aRemover = outros.filter((m) => diaDe(m.r) >= INICIO);
    if (aRemover.length >= 2 && aRemover.some((m) => String(m.r.ofmUpdateUserName || '') !== 'AUTOMACOES') && aRemover.length === outros.length && aRemover.length >= 3) {
      revisar.push({ ...base, motivo: 'varios_lancamentos_iguais_no_mesmo_dia' }); continue;
    }
    for (const m of outros) {
      if (diaDe(m.r) < INICIO) continue; // lançado antes do período pedido: fica como está
      plano.push({
        acao: m.r.ofmStatus === 'A' ? 'EXCLUIR' : 'RECUSAR', ofm: m.r.ofmCode, sta: Number(sta), nome, cpf: base.cpf, grupo: g, dataEfetiva: ef,
        valorPadrao: E, ...resumo(m), motivo: diaDe(m.r) === ef ? 'duplicado_no_mesmo_dia' : 'duplicata_data_da_observacao', sobrevivente: resumo(sobrev),
      });
    }
  }
  fs.writeFileSync('/tmp/plano_dup.json', JSON.stringify({ geradoEm: new Date().toISOString(), inicio: INICIO, fim: FIM, plano, revisar, fora, linhas: rows.length, elegiveis: elegiveis.length, gruposDup }));
  const por = {}; plano.forEach((p) => { const k = `${p.acao}|${p.grupo}`; por[k] = (por[k] || 0) + 1; });
  console.log('linhas lidas:', rows.length, '| elegiveis:', elegiveis.length, '| fora (obs de outra despesa/pessoa/extra, sem grupo):', JSON.stringify(fora));
  console.log('grupos com >=2 lançamentos:', gruposDup, '| a tratar:', plano.length, '| grupos para REVISAR:', revisar.length);
  console.log('plano por ação/despesa:', JSON.stringify(por));
  console.log('pessoas:', new Set(plano.map((p) => p.sta)).size, '| valor total R$', plano.reduce((s, p) => s + p.valor, 0).toFixed(2));
  const mot = {}; revisar.forEach((x) => { mot[x.motivo] = (mot[x.motivo] || 0) + 1; }); console.log('revisar por motivo:', JSON.stringify(mot));
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
