// RH > Folha e Holerite > aba "Ajuda de custo".
//
// O RH informa, por mês de referência, as ajudas de custo que a empresa fornece:
// Colaborador - Conta (iFood ou Flash) - Valor - Descrição. Isso aparece em
// Financeiro > Ajuda de Custo; quando o Financeiro gera as planilhas, a linha fica
// travada aqui (o banco também barra edição/exclusão — trigger rh_ajuda_custo_trava_lote).
//
// Usa as classes .hp-* (tabela, modal, grid) definidas pela página Folha e Holerite.
import { supabase } from './supabaseClient.js';
import { esc, colabAutocomplete, exportCsv, acoesHtml, bindAcoes } from './rhShared.js';
import { getColaboradores } from './colaboradoresCache.js';
import {
  CONTAS, dinheiro, soDigitos, arredonda, brDataIso,
  periodoStyle, periodoHtml, bindPeriodo, periodoAtual,
  competenciaIso, competenciaAnterior, rotuloCompetencia, dataPagamentoIso,
} from './ajudaCustoShared.js';

const state = {
  host: null, ctx: null, periodo: periodoAtual(),
  rows: [], lotes: new Map(), erro: null, busca: '', conta: '',
  colab: null,      // colaborador escolhido no painel de lançamento
  editRow: null,    // ajuda em edição no painel (null = lançando uma nova)
  salvando: false,
};

const semAcento = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const competencia = () => competenciaIso(state.periodo.ano, state.periodo.mes);
const $ = (sel) => state.host.querySelector(sel);

function pill(label, tom) {
  const cor = tom === 'ok' ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : ['#fde68a', 'rgba(245,158,11,.1)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function estilos() {
  return `<style>
    ${periodoStyle()}
    .ac-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
    .ac-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid rgba(148,163,184,.12);border-radius:999px;background:rgba(8,25,19,.72);color:#9fb7aa;font-size:12px}
    .ac-pill b{color:#eaf8f1}
    .ac-ref{font-size:12px;color:var(--muted);margin:0}
    .rh-filtros .ac-toggle,.ac-novo .btn{width:auto;margin-top:0}
    .ac-novo [hidden]{display:none}
    .rh-filtros .ac-toggle{min-width:48px;padding-left:0;padding-right:0;font-size:22px;font-weight:700;line-height:1}
    .ac-novo{margin:14px 0 4px;padding:16px;border:1px solid rgba(110,231,183,.16);border-radius:16px;background:rgba(5,24,18,.5)}
    .ac-novo-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
    .ac-novo .hp-grid.ac-novo-grid{grid-template-columns:minmax(220px,2fr) minmax(150px,1fr) minmax(120px,.8fr) minmax(220px,2fr) auto;align-items:end}
    .ac-novo-dica,.ac-novo-nota{font-size:12px;margin:8px 0 0}
    .ac-novo .hp-feedback{margin-top:6px}
    .ac-novo .hp-feedback.ok{color:#86efac}
    @media(max-width:1100px){.ac-novo .hp-grid.ac-novo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:640px){.ac-novo .hp-grid.ac-novo-grid{grid-template-columns:minmax(0,1fr)}}
  </style>`;
}

async function carregar() {
  const comp = competencia();
  const [{ data, error }, { data: lotes }] = await Promise.all([
    supabase.from('rh_ajuda_custo').select('*').eq('competencia', comp).order('colaborador_nome', { ascending: true }).limit(2000),
    supabase.from('rh_ajuda_custo_lotes').select('id,numero').eq('competencia', comp),
  ]);
  if (error) console.warn('[Ajuda de custo]', error);
  state.rows = data || [];
  state.erro = error ? error.message : null;
  state.lotes = new Map((lotes || []).map((l) => [l.id, l.numero]));
  renderResumo();
  renderTabela();
}

function filtradas() {
  const q = semAcento(state.busca);
  return state.rows.filter((r) => {
    if (state.conta && r.conta !== state.conta) return false;
    return !q || semAcento(`${r.colaborador_nome} ${r.descricao}`).includes(q);
  });
}

function renderResumo() {
  const box = $('#acrResumo');
  const soma = (lista) => arredonda(lista.reduce((acc, r) => acc + Number(r.valor || 0), 0));
  const porConta = (c) => state.rows.filter((r) => r.conta === c);
  const enviadas = state.rows.filter((r) => r.lote_id).length;
  box.innerHTML = `
    <span class="ac-pill"><b>${state.rows.length}</b> ajuda(s) · <b>${dinheiro(soma(state.rows))}</b></span>
    <span class="ac-pill">iFood <b>${porConta('ifood').length}</b> · ${dinheiro(soma(porConta('ifood')))}</span>
    <span class="ac-pill">Flash <b>${porConta('flash').length}</b> · ${dinheiro(soma(porConta('flash')))}</span>
    <span class="ac-pill">Enviadas ao Financeiro <b>${enviadas}</b> de ${state.rows.length}</span>`;
  const ref = `${rotuloCompetencia(competencia())} · pagamento em ${brDataIso(dataPagamentoIso(competencia()))}`;
  $('#acrRef').textContent = `Referência: ${ref}`;
  $('#acrNovoRef').textContent = `Lançando em ${ref}`;
}

function renderTabela() {
  const body = $('#acrBody');
  if (state.erro) {
    body.innerHTML = `<tr><td colspan="6" class="hp-empty">Não foi possível carregar as ajudas de custo: ${esc(state.erro)}</td></tr>`;
    return;
  }
  const rows = filtradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="hp-empty">${state.rows.length ? 'Nenhuma ajuda no filtro atual.' : `Nenhuma ajuda de custo em ${esc(rotuloCompetencia(competencia()))}. Clique no <b>+</b> ao lado de Exportar CSV ou em <b>Copiar do mês anterior</b>.`}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) => {
    const travada = Boolean(r.lote_id);
    const situacao = travada ? pill(`Enviada ao Financeiro · lote ${state.lotes.get(r.lote_id) ?? '?'}`, 'ok') : pill('Aguardando o Financeiro');
    return `<tr>
      <td><b>${esc(r.colaborador_nome)}</b></td>
      <td>${esc(CONTAS[r.conta] || r.conta)}</td>
      <td>${dinheiro(r.valor)}</td>
      <td>${esc(r.descricao)}</td>
      <td>${situacao}</td>
      <td>${travada ? '<span class="muted" title="Já enviada ao Financeiro: não pode mais ser alterada">🔒</span>' : acoesHtml(r.id)}</td>
    </tr>`;
  }).join('');
  bindAcoes(body, {
    table: 'rh_ajuda_custo',
    reload: carregar,
    descricao: 'esta ajuda de custo',
    onEdit: (id) => {
      const row = state.rows.find((r) => String(r.id) === String(id));
      if (row) editar(row);
    },
  });
}

function exportar() {
  exportCsv(`ajuda-custo-${competencia().slice(0, 7)}`, [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'colaborador_cpf', label: 'CPF' },
    { key: 'conta', label: 'Conta', fmt: (v) => CONTAS[v] || v },
    { key: 'valor', label: 'Valor', fmt: (v) => String(v).replace('.', ',') },
    { key: 'descricao', label: 'Descrição' },
    { key: 'lote_id', label: 'Situação', fmt: (v) => (v ? 'Enviada ao Financeiro' : 'Aguardando o Financeiro') },
  ], filtradas());
}

// ---------------------------------------------------------------------------
// Painel de lançamento (recolhível, abre pelo "+" da linha de filtros). Cada "Adicionar"
// grava a linha e deixa o painel aberto para o próximo; só o "×" fecha.

// Conta de pagamento do colaborador no cadastro do GRM: coluna "C. Banc. Despesas" do relatório
// de colaboradores (ex.: GRAOMIL IFOOD, GRAOMIL FLASH, BVGRAIN FLASH).
function contaDoTexto(texto) {
  const t = semAcento(texto);
  if (t.includes('ifood')) return 'ifood';
  if (t.includes('flash')) return 'flash';
  return '';
}

async function contaDoCadastro(colab) {
  const { data, error } = await supabase.from('colaboradores').select('conta_bancaria_despesas').eq('id', colab.id).maybeSingle();
  if (error) console.warn('[Ajuda de custo] conta do cadastro', error);
  const texto = String(data?.conta_bancaria_despesas || '').trim();
  return { conta: contaDoTexto(texto), texto };
}

function setFeedback(msg, tipo = '') {
  const fb = $('#acrFeedback');
  fb.textContent = msg;
  fb.classList.toggle('err', tipo === 'err');
  fb.classList.toggle('ok', tipo === 'ok');
}

function atualizarModoPainel() {
  const editando = Boolean(state.editRow);
  $('#acrNovoTitulo').textContent = editando ? 'Editar ajuda de custo' : 'Nova ajuda de custo';
  $('#acrSalvar').textContent = editando ? 'Salvar alteração' : 'Adicionar';
  $('#acrCancelarEdicao').hidden = !editando;
}

function limparFormulario() {
  state.colab = null;
  state.editRow = null;
  $('#acrColab').value = '';
  $('#acrColabSug').style.display = 'none';
  $('#acrConta').value = '';
  $('#acrValor').value = '';
  $('#acrDescricao').value = '';
  $('#acrContaDica').textContent = '';
  atualizarModoPainel();
}

function alternarPainel(aberto) {
  const botao = $('#acrToggle');
  $('#acrNovo').hidden = !aberto;
  botao.textContent = aberto ? '×' : '+';
  botao.title = aberto ? 'Fechar' : 'Adicionar ajuda de custo';
  botao.setAttribute('aria-label', botao.title);
  botao.setAttribute('aria-expanded', String(aberto));
  botao.classList.toggle('btn-primary', !aberto);
  botao.classList.toggle('btn-secondary', aberto);
  if (aberto) {
    $('#acrColab').focus();
  } else {
    limparFormulario();
    setFeedback('');
  }
}

function editar(row) {
  limparFormulario();
  state.editRow = row;
  state.colab = { id: row.colaborador_id, nome: row.colaborador_nome, cpf: row.colaborador_cpf };
  $('#acrColab').value = row.colaborador_nome;
  $('#acrConta').value = row.conta;
  $('#acrValor').value = row.valor;
  $('#acrDescricao').value = row.descricao;
  atualizarModoPainel();
  setFeedback('');
  alternarPainel(true);
  $('#acrNovo').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Escolheu (ou voltou a digitar, c = null) o colaborador: a conta vem do cadastro dele.
async function aoEscolherColaborador(c) {
  state.colab = c;
  const dica = $('#acrContaDica');
  if (!c) { dica.textContent = ''; return; }
  dica.textContent = 'Buscando a conta de pagamento no cadastro...';
  const { conta, texto } = await contaDoCadastro(c);
  if (state.colab !== c) return; // trocou de colaborador enquanto buscava
  // Sempre sobrescreve: a conta de quem foi lançado antes não pode "sobrar" para este.
  $('#acrConta').value = conta;
  dica.textContent = conta
    ? `Conta preenchida pelo cadastro do colaborador (${texto}).`
    : (texto
      ? `A conta cadastrada (${texto}) não é iFood nem Flash: escolha a conta de pagamento.`
      : 'Colaborador sem conta iFood/Flash no cadastro: escolha a conta de pagamento.');
  const foco = document.activeElement;
  if (foco === $('#acrColab') || foco === document.body) (conta ? $('#acrValor') : $('#acrConta')).focus();
}

async function salvar() {
  if (state.salvando) return;
  setFeedback('');
  const erro = (msg) => setFeedback(msg, 'err');
  const row = state.editRow;
  const selecionado = state.colab;
  const editando = Boolean(row);

  const conta = $('#acrConta').value;
  const valor = arredonda($('#acrValor').value);
  const descricao = $('#acrDescricao').value.trim();
  const cpf = soDigitos(selecionado?.cpf);

  if (!selecionado?.id) return erro('Selecione o colaborador na lista de sugestões.');
  if (cpf.length !== 11) return erro('Este colaborador está sem CPF válido no cadastro; não dá pra gerar a planilha de pagamento.');
  if (!conta) return erro('Selecione a conta de pagamento (iFood ou Flash).');
  if (!(valor > 0)) return erro('Informe um valor maior que zero.');
  if (!descricao) return erro('Informe a descrição.');

  const repetida = state.rows.some((r) => r.id !== row?.id && r.colaborador_id === selecionado.id
    && r.conta === conta && semAcento(r.descricao).trim() === semAcento(descricao));
  if (repetida && !confirm('Este colaborador já tem uma ajuda com a mesma conta e descrição neste mês. Cadastrar mesmo assim?')) return;

  const botao = $('#acrSalvar');
  state.salvando = true;
  botao.disabled = true;
  try {
    const payload = {
      competencia: editando ? row.competencia : competencia(),
      colaborador_id: selecionado.id,
      colaborador_nome: selecionado.nome,
      colaborador_cpf: cpf,
      conta,
      valor,
      descricao,
      updated_at: new Date().toISOString(),
    };
    const { error } = editando
      ? await supabase.from('rh_ajuda_custo').update(payload).eq('id', row.id)
      : await supabase.from('rh_ajuda_custo').insert({ ...payload, created_by: state.ctx?.user?.id || null });
    if (error) throw error;
    limparFormulario();
    setFeedback(`${editando ? 'Alteração salva' : 'Ajuda adicionada'}: ${payload.colaborador_nome} · ${CONTAS[conta]} · ${dinheiro(valor)}`, 'ok');
    await carregar();
    $('#acrColab').focus();
  } catch (e) {
    erro(e.message);
  } finally {
    state.salvando = false;
    botao.disabled = false;
  }
}

// Repete no mês aberto as ajudas do mês anterior (o mais comum é ser a mesma lista todo mês).
// Pula quem não está mais Ativo e o que já foi cadastrado neste mês.
async function copiarMesAnterior() {
  const fb = state.host.querySelector('#acrAviso');
  const aviso = (msg, erro = false) => { fb.textContent = msg; fb.classList.toggle('err', erro); };
  aviso('');
  const anterior = competenciaAnterior(competencia());
  const { data: antigas, error } = await supabase.from('rh_ajuda_custo').select('*').eq('competencia', anterior);
  if (error) return aviso(`Não foi possível ler o mês anterior: ${error.message}`, true);
  if (!antigas?.length) return aviso(`Não há ajudas de custo em ${rotuloCompetencia(anterior)} para copiar.`, true);

  const ativos = new Set((await getColaboradores()).filter((c) => semAcento(c.situacao).trim() === 'ativo').map((c) => c.id));
  const chave = (r) => `${r.colaborador_id}|${r.conta}|${semAcento(r.descricao).trim()}`;
  const jaTem = new Set(state.rows.map(chave));
  const inativos = antigas.filter((r) => !r.colaborador_id || !ativos.has(r.colaborador_id));
  const novas = antigas.filter((r) => r.colaborador_id && ativos.has(r.colaborador_id) && !jaTem.has(chave(r)));
  const repetidas = antigas.length - inativos.length - novas.length;

  if (!novas.length) return aviso(`Nada a copiar: ${repetidas} já existem neste mês e ${inativos.length} são de colaborador inativo.`, true);
  const detalhes = [repetidas ? `${repetidas} já existem neste mês` : '', inativos.length ? `${inativos.length} de colaborador inativo ficam de fora` : ''].filter(Boolean).join('; ');
  if (!confirm(`Copiar ${novas.length} ajuda(s) de ${rotuloCompetencia(anterior)} para ${rotuloCompetencia(competencia())}?${detalhes ? `\n(${detalhes})` : ''}`)) return;

  const userId = state.ctx?.user?.id || null;
  const { error: insertError } = await supabase.from('rh_ajuda_custo').insert(novas.map((r) => ({
    competencia: competencia(), colaborador_id: r.colaborador_id, colaborador_nome: r.colaborador_nome,
    colaborador_cpf: r.colaborador_cpf, conta: r.conta, valor: r.valor, descricao: r.descricao, created_by: userId,
  })));
  if (insertError) return aviso(`Erro ao copiar: ${insertError.message}`, true);
  aviso(`${novas.length} ajuda(s) copiada(s) de ${rotuloCompetencia(anterior)}.`);
  await carregar();
}

export async function renderAjudaCustoRh(host, userContext) {
  state.host = host;
  state.ctx = userContext;
  state.colab = null;
  state.editRow = null;
  state.salvando = false;
  host.innerHTML = `${estilos()}
    <div class="section-head mt-16"><div><h3>Ajuda de custo</h3><p class="muted">Informe por mês: colaborador, conta de pagamento (iFood ou Flash), valor e descrição. A relação aparece para o Financeiro, que gera as planilhas a partir do dia 15.</p></div>
      <div class="hp-actions"><button class="btn btn-secondary" id="acrCopiar" type="button">Copiar do mês anterior</button></div></div>
    <div id="acrPeriodo">${periodoHtml('acrPeriodoBar', state.periodo.ano, state.periodo.mes)}</div>
    <p class="ac-ref" id="acrRef"></p>
    <div class="ac-summary mt-8" id="acrResumo"></div>
    <div class="rh-filtros">
      <input id="acrBusca" type="search" placeholder="Filtrar por colaborador ou descrição..." autocomplete="off">
      <select id="acrFiltroConta"><option value="">Todas as contas</option>${Object.entries(CONTAS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <button class="btn btn-secondary" id="acrLimpar" type="button">Limpar</button>
      <button class="btn btn-secondary" id="acrExportar" type="button">⬇ Exportar CSV</button>
      <button class="btn btn-primary ac-toggle" id="acrToggle" type="button" title="Adicionar ajuda de custo" aria-label="Adicionar ajuda de custo" aria-expanded="false" aria-controls="acrNovo">+</button>
    </div>
    <div class="ac-novo" id="acrNovo" hidden>
      <div class="ac-novo-head"><b id="acrNovoTitulo">Nova ajuda de custo</b><span class="ac-ref" id="acrNovoRef"></span></div>
      <div class="hp-grid ac-novo-grid">
        <div style="position:relative">
          <label>Colaborador *<input id="acrColab" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
          <div id="acrColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
        </div>
        <label>Conta de pagamento *<select id="acrConta"><option value="">Selecione...</option>${Object.entries(CONTAS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label>Valor (R$) *<input id="acrValor" type="number" step="0.01" min="0.01"></label>
        <label>Descrição *<input id="acrDescricao" type="text" maxlength="200" placeholder="Ex.: Auxílio moradia" autocomplete="off"></label>
        <div class="hp-actions"><button class="btn btn-primary" id="acrSalvar" type="button">Adicionar</button><button class="btn btn-secondary" id="acrCancelarEdicao" type="button" hidden>Cancelar edição</button></div>
      </div>
      <p class="muted ac-novo-dica" id="acrContaDica"></p>
      <span class="hp-feedback" id="acrFeedback"></span>
      <p class="muted ac-novo-nota">A descrição vai igual para o lançamento no Caixa do GRM (Adiantamento e Comprovante), acrescida do mês de referência.</p>
    </div>
    <span class="hp-feedback mt-8" id="acrAviso"></span>
    <div class="hp-table-wrap mt-16"><table class="hp-table"><thead><tr><th>Colaborador</th><th>Conta</th><th>Valor</th><th>Descrição</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="acrBody"><tr><td colspan="6" class="hp-empty">Carregando...</td></tr></tbody></table></div>
`;

  bindPeriodo(host.querySelector('#acrPeriodo'), state.periodo, async () => {
    host.querySelector('#acrPeriodo').innerHTML = periodoHtml('acrPeriodoBar', state.periodo.ano, state.periodo.mes);
    host.querySelector('#acrAviso').textContent = '';
    // Uma ajuda em edição é de outro mês: sai do modo edição (o painel continua aberto para lançar no mês novo).
    if (state.editRow) { limparFormulario(); setFeedback(''); }
    await carregar();
  });
  host.querySelector('#acrToggle').onclick = () => alternarPainel($('#acrNovo').hidden);
  host.querySelector('#acrCancelarEdicao').onclick = () => { limparFormulario(); setFeedback(''); $('#acrColab').focus(); };
  host.querySelector('#acrSalvar').onclick = salvar;
  ['#acrValor', '#acrDescricao'].forEach((sel) => host.querySelector(sel).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); salvar(); }
  }));
  colabAutocomplete(host.querySelector('#acrNovo'), '#acrColab', '#acrColabSug', aoEscolherColaborador, { somenteAtivos: true });
  host.querySelector('#acrCopiar').onclick = copiarMesAnterior;
  host.querySelector('#acrExportar').onclick = exportar;
  host.querySelector('#acrBusca').addEventListener('input', (e) => { state.busca = e.target.value; renderTabela(); });
  host.querySelector('#acrFiltroConta').addEventListener('change', (e) => { state.conta = e.target.value; renderTabela(); });
  host.querySelector('#acrLimpar').onclick = () => {
    state.busca = '';
    state.conta = '';
    host.querySelector('#acrBusca').value = '';
    host.querySelector('#acrFiltroConta').value = '';
    renderTabela();
  };
  await carregar();
}
