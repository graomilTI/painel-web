// Financeiro > Ajuda de Custo.
//
// Mostra a relação do mês informada pelo RH (Folha e Holerite > Ajuda de custo): colaborador,
// conta (iFood/Flash/Flash BVGRAIN), valor e descrição. A partir do dia 15 do mês de referência:
//  - XLS baixa as planilhas PGTO_IFOOD / PGTO_FLASH / PGTO_FLASH_BVGRAIN (mesmo formato do
//    Financeiro > Adiantamentos; a Flash da BVGRAIN é outra conta, por isso outro arquivo) das
//    ajudas ainda não lançadas. Só baixa: não trava nada, pode ser repetido quantas vezes precisar.
//  - Lançar trava as linhas para o RH (lote) e dispara o agente que lança, no Caixa do GRM de cada
//    colaborador, um Adiantamento e um Comprovante com a descrição do RH e data 15/MM do mês.
// A trava do dia 15 e a geração do lote são aplicadas no banco (RPC ajuda_custo_gerar_lote).
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';
import {
  CONTAS, dinheiro, soDigitos, arredonda, brDataIso,
  periodoStyle, periodoHtml, bindPeriodo, periodoAtual,
  competenciaIso, rotuloCompetencia, dataPagamentoIso, pagamentoLiberado, hojeBrasiliaIso,
  arquivosPlanilha, mostrarDownloads, montarPlanilhas, assinaturaAjudas,
} from './ajudaCustoShared.js?v=20261015-ccvazio';

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const semAcento = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const state = {
  content: null, periodo: periodoAtual(),
  ajudas: [], lotes: [], fila: new Map(),
  busca: '', conta: '', erro: null, gerando: false, timer: null,
  inativos: new Set(),
  xls: null,        // último XLS baixado nesta tela (competência + impressão digital das ajudas ainda não lançadas)
};

const soma = (lista) => arredonda(lista.reduce((acc, a) => acc + Number(a.valor || 0), 0));

const competencia = () => competenciaIso(state.periodo.ano, state.periodo.mes);

function fmtCpf(v) {
  const d = soDigitos(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v || '-');
}

function dataHora(v) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pill(label, tom) {
  const cores = { ok: ['#bbf7d0', 'rgba(22,101,52,.18)'], alerta: ['#fde68a', 'rgba(245,158,11,.1)'], erro: ['#fecaca', 'rgba(153,27,27,.18)'], neutro: ['#cbd5e1', 'rgba(148,163,184,.12)'] };
  const [cor, fundo] = cores[tom] || cores.neutro;
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor};background:${fundo};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    ${periodoStyle()}
    .fa-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .fa-table{width:100%;border-collapse:collapse;min-width:980px}
    .fa-table th,.fa-table td{padding:13px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .fa-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .fa-empty{text-align:center;color:var(--muted)}
    .fa-sub{display:block;font-size:12px;color:var(--muted);margin-top:2px}
    .fa-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
    .fa-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid rgba(148,163,184,.12);border-radius:999px;background:rgba(8,25,19,.72);color:#9fb7aa;font-size:12px}
    .fa-pill b{color:#eaf8f1}
    .fa-pag{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;font-size:13px}
    .fa-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .fa-bar input[type=search],.fa-bar select{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .fa-bar input[type=search]{flex:1;min-width:200px}
    .fa-mov{display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px;white-space:nowrap}
    .fa-mov.ok{color:#86efac}.fa-mov.espera{color:#fde68a}.fa-mov.erro{color:#fca5a5;cursor:help}.fa-mov.neutro{color:var(--muted)}
    .fa-lotes{display:grid;gap:8px;margin-top:8px}
    .fa-lote{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--line);border-radius:14px}
    .fa-feedback{display:block;font-weight:700;margin-top:8px}.fa-feedback.err{color:#fecaca}.fa-feedback.ok{color:#bbf7d0}
    .fa-small{padding:6px 10px;font-size:12px}
  </style>`;
}

async function carregar() {
  const comp = competencia();
  const [aj, lt, fl] = await Promise.all([
    supabase.from('rh_ajuda_custo').select('*').eq('competencia', comp).order('colaborador_nome', { ascending: true }).limit(2000),
    supabase.from('rh_ajuda_custo_lotes').select('*').eq('competencia', comp).order('numero', { ascending: true }),
    supabase.from('ajuda_custo_caixa_lancamentos').select('id,ajuda_id,lote_id,movimento,status,ultimo_erro,processado_em').eq('competencia', comp).limit(4000),
  ]);
  const erro = aj.error || lt.error || fl.error;
  if (erro) console.warn('[Ajuda de Custo]', erro);
  state.erro = erro ? erro.message : null;
  state.ajudas = aj.data || [];
  await atualizarInativos();
  state.lotes = lt.data || [];
  state.fila = new Map();
  (fl.data || []).forEach((l) => {
    if (!state.fila.has(l.ajuda_id)) state.fila.set(l.ajuda_id, {});
    state.fila.get(l.ajuda_id)[l.movimento] = l;
  });
  render();
  agendarAtualizacao();
}

// O RH só cadastra colaborador ativo, mas ele pode ser desligado entre o cadastro e o dia 15.
// Só avisa (não bloqueia): quem decide pagar ou não é o Financeiro.
async function atualizarInativos() {
  try {
    const todos = await getColaboradores();
    const ativos = new Set(todos.filter((c) => semAcento(c.situacao).trim() === 'ativo').map((c) => c.id));
    const conhecidos = new Set(todos.map((c) => c.id));
    state.inativos = new Set(state.ajudas.filter((a) => a.colaborador_id && conhecidos.has(a.colaborador_id) && !ativos.has(a.colaborador_id)).map((a) => a.id));
  } catch (e) {
    console.warn('[Ajuda de Custo] situação dos colaboradores', e);
    state.inativos = new Set();
  }
}

// Enquanto houver lançamento na fila do Caixa, atualiza sozinho (o agente roda em segundo plano).
function agendarAtualizacao() {
  clearTimeout(state.timer);
  const emAndamento = [...state.fila.values()].some((m) => Object.values(m).some((l) => l.status === 'PENDENTE' || l.status === 'PROCESSANDO'));
  if (!emAndamento) return;
  state.timer = setTimeout(() => { if (document.getElementById('faBody')) carregar(); }, 15000);
}

function filtradas() {
  const q = semAcento(state.busca);
  return state.ajudas.filter((a) => {
    if (state.conta && a.conta !== state.conta) return false;
    return !q || semAcento(`${a.colaborador_nome} ${a.descricao} ${a.colaborador_cpf}`).includes(q);
  });
}

function movimentoHtml(rotulo, l) {
  if (!l) return `<span class="fa-mov neutro">${rotulo} –</span>`;
  const mapa = {
    LANCADO: ['ok', '✓'], PENDENTE: ['espera', '⏳'], PROCESSANDO: ['espera', '⏳'], ERRO: ['erro', '✗'], CANCELADO: ['neutro', '–'],
  };
  const [classe, icone] = mapa[l.status] || ['neutro', '?'];
  const titulo = l.status === 'ERRO' && l.ultimo_erro ? ` title="${esc(l.ultimo_erro)}"` : '';
  return `<span class="fa-mov ${classe}"${titulo}>${rotulo} ${icone}</span>`;
}

function render() {
  const c = state.content;
  const comp = competencia();
  const liberado = pagamentoLiberado(comp);
  const pagamento = dataPagamentoIso(comp);
  const pendentes = state.ajudas.filter((a) => !a.lote_id);
  const doTipo = (t) => state.ajudas.filter((a) => a.conta === t);

  c.querySelector('#faPag').innerHTML = `
    <span>Pagamento em <b>${brDataIso(pagamento)}</b></span>
    ${liberado ? pill('Liberado para pagamento', 'ok') : pill(`Disponível a partir de ${brDataIso(pagamento)}`, 'alerta')}
    ${pendentes.length ? pill(`${pendentes.length} aguardando lançamento`, 'alerta') : (state.ajudas.length ? pill('Tudo lançado', 'ok') : '')}`;

  c.querySelector('#faResumo').innerHTML = `
    <span class="fa-pill"><b>${state.ajudas.length}</b> ajuda(s) · <b>${dinheiro(soma(state.ajudas))}</b></span>
    <span class="fa-pill">iFood <b>${doTipo('ifood').length}</b> · ${dinheiro(soma(doTipo('ifood')))}</span>
    <span class="fa-pill">Flash <b>${doTipo('flash').length}</b> · ${dinheiro(soma(doTipo('flash')))}</span>
    <span class="fa-pill">Flash BVGRAIN <b>${doTipo('flash_bvgrain').length}</b> · ${dinheiro(soma(doTipo('flash_bvgrain')))}</span>
    <span class="fa-pill">Aguardando lançamento <b>${pendentes.length}</b> · ${dinheiro(soma(pendentes))}</span>`;

  // Dois botões de propósitos diferentes: XLS só baixa (repetível, não trava nem lança nada);
  // Lançar trava as linhas para o RH e enfileira o Caixa do GRM.
  const semPendentes = pendentes.length === 0;
  const indisponivel = !liberado
    ? `Disponível a partir de ${brDataIso(pagamento)} (${rotuloCompetencia(comp)}).`
    : (semPendentes ? 'Não há ajuda de custo nova neste mês.' : '');
  const contagem = pendentes.length ? ` (${pendentes.length})` : '';
  const botaoXls = c.querySelector('#faXls');
  botaoXls.disabled = state.gerando || Boolean(indisponivel);
  botaoXls.title = indisponivel || 'Baixa PGTO_IFOOD / PGTO_FLASH / PGTO_FLASH_BVGRAIN das ajudas ainda não lançadas. Pode baixar quantas vezes precisar: não trava nem lança nada.';
  botaoXls.textContent = `XLS${contagem}`;
  const botaoLancar = c.querySelector('#faLancar');
  botaoLancar.disabled = state.gerando || Boolean(indisponivel);
  botaoLancar.title = indisponivel || 'Trava as linhas para o RH e lança o Adiantamento e o Comprovante de cada uma no Caixa do GRM.';
  botaoLancar.textContent = state.gerando ? 'Lançando...' : `Lançar${contagem}`;

  renderTabela();
  renderLotes();
}

function renderTabela() {
  const body = state.content.querySelector('#faBody');
  if (state.erro) {
    body.innerHTML = `<tr><td colspan="7" class="fa-empty">Não foi possível carregar: ${esc(state.erro)}</td></tr>`;
    return;
  }
  const rows = filtradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="fa-empty">${state.ajudas.length ? 'Nenhuma ajuda no filtro atual.' : `O RH ainda não informou ajudas de custo para ${esc(rotuloCompetencia(competencia()))}.`}</td></tr>`;
    return;
  }
  const numeroLote = new Map(state.lotes.map((l) => [l.id, l.numero]));
  body.innerHTML = rows.map((a) => {
    const mov = state.fila.get(a.id) || {};
    const planilha = a.lote_id ? pill(`Lote ${numeroLote.get(a.lote_id) ?? '?'}`, 'ok') : pill('Não lançada', 'alerta');
    return `<tr>
      <td><b>${esc(a.colaborador_nome)}</b>${state.inativos.has(a.id) ? '<span class="fa-sub" style="color:#fca5a5">⚠ não está mais ativo</span>' : ''}</td>
      <td>${esc(fmtCpf(a.colaborador_cpf))}</td>
      <td>${esc(CONTAS[a.conta] || a.conta)}</td>
      <td>${dinheiro(a.valor)}</td>
      <td>${esc(a.descricao)}</td>
      <td>${planilha}</td>
      <td>${a.lote_id ? `${movimentoHtml('Adiantamento', mov.ADIANTAMENTO)}${movimentoHtml('Comprovante', mov.COMPROVANTE)}` : '<span class="muted">–</span>'}</td>
    </tr>`;
  }).join('');
}

function renderLotes() {
  const box = state.content.querySelector('#faLotes');
  if (!state.lotes.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<h3 class="mt-16">Lotes lançados</h3><div class="fa-lotes">${state.lotes.map((l) => {
    const comErro = [...state.fila.values()].some((m) => Object.values(m).some((x) => x.lote_id === l.id && x.status === 'ERRO'));
    return `<div class="fa-lote">
      <div><b>Lote ${l.numero}</b> · ${l.total_linhas} linha(s) · ${dinheiro(l.total_valor)}
        <span class="fa-sub">iFood ${l.linhas_ifood} · Flash ${l.linhas_flash}${l.linhas_flash_bvgrain ? ` · Flash BVGRAIN ${l.linhas_flash_bvgrain}` : ''} · gerado em ${dataHora(l.gerado_em)}${l.gerado_por_nome ? ` por ${esc(l.gerado_por_nome)}` : ''}</span></div>
      <div class="fa-bar">
        <button class="btn btn-secondary fa-small" data-fa-baixar="${esc(l.id)}" type="button">Baixar XLS de novo</button>
        ${comErro ? `<button class="btn btn-secondary fa-small" data-fa-reenviar="${esc(l.id)}" type="button">Reenviar ao Caixa (com erro)</button>` : ''}
      </div></div>`;
  }).join('')}</div>`;
  box.querySelectorAll('[data-fa-baixar]').forEach((b) => { b.onclick = () => baixarLote(b.dataset.faBaixar); });
  box.querySelectorAll('[data-fa-reenviar]').forEach((b) => { b.onclick = () => reenviarCaixa(b.dataset.faReenviar); });
}

function aviso(msg, tipo = '') {
  const el = state.content.querySelector('#faAviso');
  if (!el) return;
  el.textContent = msg;
  el.className = `fa-feedback${tipo ? ` ${tipo}` : ''}`;
}

// Dado do cadastro que entra na planilha do iFood: a data de nascimento (o centro de custo vai em
// branco). Falha aqui não impede a planilha: a coluna só fica em branco (e o Financeiro é avisado
// de quem ficou sem data de nascimento).
async function cadastroPorCpf(rows) {
  const ids = [...new Set(rows.map((r) => r.colaborador_id).filter(Boolean))];
  const mapa = new Map();
  if (!ids.length) return mapa;
  const { data, error } = await supabase.from('colaboradores').select('id,cpf,data_nascimento').in('id', ids);
  if (error) { console.warn('[Ajuda de Custo] cadastro (nascimento)', error); return mapa; }
  (data || []).forEach((c) => mapa.set(soDigitos(c.cpf).padStart(11, '0').slice(0, 11), { nascimento: c.data_nascimento || '' }));
  return mapa;
}

async function planilhasDoLote(lote, sufixoData) {
  const { data, error } = await supabase.from('rh_ajuda_custo').select('*').eq('lote_id', lote.id);
  if (error) throw error;
  const cadastro = await cadastroPorCpf(data || []);
  const sufixo = `${sufixoData}${lote.numero > 1 ? `_L${lote.numero}` : ''}`;
  return arquivosPlanilha(data || [], cadastro, sufixo);
}

const compacta = (iso) => String(iso).slice(0, 10).replaceAll('-', '');

// A planilha do iFood leva a data de nascimento do cadastro; sem ela a coluna sai em branco.
function avisoSemNascimento(nomes) {
  if (!nomes?.length) return '';
  return ` ATENÇÃO: ${nomes.length} colaborador(es) do iFood sem data de nascimento no cadastro (coluna em branco na planilha): ${nomes.join(', ')}.`;
}

function avisoIgnoradas(ignoradas) {
  if (!ignoradas?.length) return '';
  return ` ATENÇÃO: ${ignoradas.length} linha(s) ficaram FORA da planilha por CPF inválido ou conta desconhecida (${ignoradas.map((r) => r.colaborador_nome).join(', ')}) — pague por fora.`;
}

// Ajudas ainda não lançadas, lidas do banco na hora (o RH pode ter mexido desde que a tela carregou).
async function pendentesDoBanco(comp) {
  const { data, error } = await supabase.from('rh_ajuda_custo').select('*')
    .eq('competencia', comp).is('lote_id', null)
    .order('colaborador_nome', { ascending: true }).limit(2000);
  if (error) throw error;
  return data || [];
}

// XLS: só baixa as planilhas das ajudas ainda não lançadas. Não cria lote, não trava nada e não
// mexe no Caixa — pode ser repetido quantas vezes for preciso (o RH ainda pode ajustar a lista).
async function baixarXls() {
  if (state.gerando) return;
  const comp = competencia();
  try {
    aviso('Montando as planilhas...');
    const pendentes = await pendentesDoBanco(comp);
    if (!pendentes.length) return aviso('Não há ajuda de custo nova para baixar neste mês.', 'err');
    const proximoLote = Math.max(0, ...state.lotes.map((l) => l.numero)) + 1;
    const cadastro = await cadastroPorCpf(pendentes);
    const sufixo = `${compacta(hojeBrasiliaIso())}${proximoLote > 1 ? `_L${proximoLote}` : ''}`;
    const { arquivos, semNascimento, ignoradas } = await arquivosPlanilha(pendentes, cadastro, sufixo);
    if (!arquivos.length) return aviso('Nenhuma linha tem CPF válido e conta conhecida.', 'err');
    state.xls = { comp, assinatura: assinaturaAjudas(pendentes), qtd: pendentes.length, total: soma(pendentes) };
    mostrarDownloads(arquivos, `Planilhas — ${rotuloCompetencia(comp)} (ainda não lançadas)`);
    aviso(`XLS baixado: ${pendentes.length} ajuda(s), ${dinheiro(state.xls.total)}. Nada foi lançado no Caixa: confira o pagamento e clique em Lançar.${avisoSemNascimento(semNascimento)}${avisoIgnoradas(ignoradas)}`, ignoradas.length || semNascimento.length ? 'err' : 'ok');
  } catch (e) {
    console.error('[Ajuda de Custo] xls', e);
    aviso(e.message || 'Erro ao montar as planilhas.', 'err');
  }
}

// Lançar: trava as ajudas para o RH (lote) e enfileira o Adiantamento + Comprovante de cada uma no
// Caixa do GRM. A regra do dia 15 e a geração do lote são aplicadas no banco (ajuda_custo_gerar_lote).
async function lancar() {
  if (state.gerando) return;
  const comp = competencia();
  let pendentes;
  try {
    pendentes = await pendentesDoBanco(comp);
  } catch (e) {
    return aviso(e.message || 'Erro ao ler as ajudas de custo.', 'err');
  }
  if (!pendentes.length) {
    aviso('Não há ajuda de custo nova para lançar neste mês.', 'err');
    return carregar();
  }
  const inativos = pendentes.filter((a) => state.inativos.has(a.id));
  const alertaInativos = inativos.length ? `\n\n⚠ ${inativos.length} colaborador(es) não estão mais ativos: ${inativos.map((a) => a.colaborador_nome).join(', ')}.` : '';
  const { ignoradas } = montarPlanilhas(pendentes);
  const alertaIgnoradas = ignoradas.length ? `\n\n⚠ ${ignoradas.length} linha(s) ficam FORA das planilhas por CPF inválido ou conta desconhecida (${ignoradas.map((r) => r.colaborador_nome).join(', ')}).` : '';
  const xls = state.xls?.comp === comp ? state.xls : null;
  let alertaXls = '';
  if (!xls) alertaXls = '\n\n⚠ Você ainda não baixou o XLS nesta tela.';
  else if (xls.assinatura !== assinaturaAjudas(pendentes)) alertaXls = `\n\n⚠ A lista mudou desde o último XLS baixado (eram ${xls.qtd} ajuda(s), ${dinheiro(xls.total)}). Se for pagar pela planilha, baixe o XLS de novo antes de lançar.`;
  if (!confirm(`Lançar as ajudas de custo de ${rotuloCompetencia(comp)} no Caixa do GRM?\n\n${pendentes.length} ajuda(s), ${dinheiro(soma(pendentes))}.${alertaXls}${alertaInativos}${alertaIgnoradas}\n\nAs linhas ficam travadas para o RH e o Adiantamento e o Comprovante de cada uma são lançados no Caixa do GRM com data ${brDataIso(dataPagamentoIso(comp))}. O XLS continua disponível depois, em "Baixar XLS de novo".`)) return;

  state.gerando = true;
  render();
  aviso('Lançando...');
  try {
    const { data: lote, error } = await supabase.rpc('ajuda_custo_gerar_lote', { p_competencia: comp });
    if (error) throw error;
    state.xls = null;
    const porConta = `iFood ${lote.linhas_ifood}, Flash ${lote.linhas_flash}${lote.linhas_flash_bvgrain ? `, Flash BVGRAIN ${lote.linhas_flash_bvgrain}` : ''}`;
    aviso(`Lote ${lote.numero} lançado: ${lote.total_linhas} ajuda(s), ${dinheiro(lote.total_valor)} (${porConta}). O lançamento no Caixa do GRM foi iniciado.`, 'ok');
  } catch (e) {
    console.error('[Ajuda de Custo] lançar', e);
    aviso(e.message || 'Erro ao lançar as ajudas de custo.', 'err');
  } finally {
    state.gerando = false;
    await carregar();
  }
}

async function baixarLote(loteId) {
  const lote = state.lotes.find((l) => l.id === loteId);
  if (!lote) return;
  try {
    aviso('Montando as planilhas...');
    const { arquivos, semNascimento, ignoradas } = await planilhasDoLote(lote, compacta(new Date(lote.gerado_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })));
    if (!arquivos.length) return aviso('Este lote não tem linhas com CPF válido e conta conhecida.', 'err');
    mostrarDownloads(arquivos, `Planilhas — lote ${lote.numero}`);
    aviso(`${avisoSemNascimento(semNascimento)}${avisoIgnoradas(ignoradas)}`.trim(), ignoradas.length || semNascimento.length ? 'err' : '');
  } catch (e) {
    aviso(e.message || 'Erro ao montar as planilhas.', 'err');
  }
}

async function reenviarCaixa(loteId) {
  if (!confirm('Reenviar ao Caixa do GRM os lançamentos deste lote que terminaram em erro?\n\nConfira antes, no cadastro do colaborador no GRM, se o movimento não foi criado mesmo assim, para não duplicar.')) return;
  const { data, error } = await supabase.rpc('ajuda_custo_reenviar_caixa', { p_lote_id: loteId });
  if (error) return aviso(error.message, 'err');
  aviso(`${data?.reenviados ?? 0} lançamento(s) reenviado(s) ao Caixa.`, 'ok');
  await carregar();
}

export async function renderContent(content) {
  state.content = content;
  clearTimeout(state.timer);
  content.innerHTML = `${styles()}
    <section class="hero-card"><div><div class="eyebrow">Financeiro</div><h2>Ajuda de Custo</h2><p>Ajudas de custo informadas pelo RH, planilhas de pagamento (iFood, Flash e Flash BVGRAIN) e lançamento no Caixa do GRM.</p></div><div class="hero-badge-wrap"><span class="hero-badge">$</span></div></section>
    <div id="faPeriodoBox">${periodoHtml('faPeriodo', state.periodo.ano, state.periodo.mes)}</div>
    <div class="fa-pag" id="faPag"></div>
    <div class="fa-summary" id="faResumo"></div>
    <div class="fa-bar">
      <input id="faBusca" type="search" placeholder="Filtrar por colaborador, CPF ou descrição..." autocomplete="off">
      <select id="faConta"><option value="">Todas as contas</option>${Object.entries(CONTAS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <button class="btn btn-secondary" id="faAtualizar" type="button">Atualizar</button>
      <button class="btn btn-secondary" id="faXls" type="button">XLS</button>
      <button class="btn btn-primary" id="faLancar" type="button">Lançar</button>
    </div>
    <span class="fa-feedback" id="faAviso"></span>
    <div class="fa-wrap mt-16"><table class="fa-table"><thead><tr><th>Colaborador</th><th>CPF</th><th>Conta</th><th>Valor</th><th>Descrição</th><th>Lote</th><th>Caixa no GRM</th></tr></thead><tbody id="faBody"><tr><td colspan="7" class="fa-empty">Carregando...</td></tr></tbody></table></div>
    <div id="faLotes"></div>`;

  const caixaPeriodo = content.querySelector('#faPeriodoBox');
  bindPeriodo(caixaPeriodo, state.periodo, async () => {
    caixaPeriodo.innerHTML = periodoHtml('faPeriodo', state.periodo.ano, state.periodo.mes);
    aviso('');
    await carregar();
  });
  content.querySelector('#faBusca').addEventListener('input', (e) => { state.busca = e.target.value; renderTabela(); });
  content.querySelector('#faConta').addEventListener('change', (e) => { state.conta = e.target.value; renderTabela(); });
  content.querySelector('#faAtualizar').onclick = carregar;
  content.querySelector('#faXls').onclick = baixarXls;
  content.querySelector('#faLancar').onclick = lancar;
  await carregar();
}

initProtectedPage('Ajuda de Custo', renderContent);
