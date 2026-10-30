// Plantão (Início): controlador. Estado da tela, eventos, salvar e a janela da imagem.
// Camadas: regras (puras) > dados (Supabase) > html (puro) > imagem (canvas) > este arquivo. A dependência só desce.
import { openModal, closeModal, confirmar, toast } from '../../core/ui.js';
import { ESTILOS_PLANTAO } from './estilos.js?v=20261030-plantao1';
import * as dados from './dados.js?v=20261030-plantao1';
import {
  agruparPlantonistas, apelidoPadrao, assinatura, buscarColaboradores, coberturaSetor, copiarPlantonistas, formatarTelefone,
  horarioPadraoDoSetor, hojeISO, listarFinsDeSemana, montarModeloImagem, nomeArquivoImagem, normalizar, novoPlantonista,
  ordenarPeriodos, periodoData, periodoFimDeSemana, periodosExtras, resumoPeriodo, rotuloExtenso, sabadoDaVez, somarDias,
  validarPlantonista, chaveColaborador,
} from './regras.js?v=20261030-plantao1';
import {
  htmlShell, htmlAviso, htmlPeriodos, htmlSetor, htmlSugestoes, htmlBarra, htmlNovaData, htmlCopiarDe, htmlRepetir, htmlImagem, resumoContato,
} from './html.js?v=20261030-plantao1';
import {
  desenharImagem, FORMATOS, baixarImagem, copiarImagem, compartilharImagem, podeCopiarImagem, podeCompartilhar,
} from './imagem.js?v=20261030-plantao1';

const JANELA = 'pgJanela';

const state = {
  supabase: null, auth: null, container: null,
  hoje: '', semanas: 12,
  setores: [], colaboradores: [], contatos: [], escalas: [],
  fds: [], passados: [], manuais: [], periodos: [], fontes: [], periodoId: '',
  edicao: {}, base: {}, abertos: new Set(), erros: {}, focoSetor: '', salvando: false,
  img: null,
};

const el = (seletor) => state.container.querySelector(seletor);
const periodoAtual = () => state.periodos.find((p) => p.id === state.periodoId) || state.periodos[0];
const setorCfg = (setor) => state.setores.find((s) => s.setor === setor);
const erro = (e) => toast(e?.message || String(e), 'err', 7000);
const iso10 = (v) => String(v || '').slice(0, 10);

function garantirEstilos() {
  if (document.getElementById('pgEstilos')) return;
  const style = document.createElement('style');
  style.id = 'pgEstilos';
  style.textContent = ESTILOS_PLANTAO;
  document.head.appendChild(style);
}

// ── dados em memória ────────────────────────────────────────────────────────
function linhasDe(setor, periodo) {
  return state.escalas.filter((l) => l.setor === setor && periodo.dias.includes(iso10(l.data_plantao)));
}

function indices() {
  state.porKey = new Map(state.colaboradores.map((c) => [c.colaborador_key, c]));
  state.porNome = new Map(state.colaboradores.map((c) => [normalizar(c.nome), c]));
  state.contatoKey = new Map(state.contatos.map((c) => [c.colaborador_key, c]));
  state.contatoNome = new Map(state.contatos.map((c) => [normalizar(c.nome), c]));
  state.apelidoNome = new Map();
  for (const l of state.escalas) if (l.apelido) state.apelidoNome.set(normalizar(l.nome), l.apelido);
}

function contatoDe(colab) {
  const c = state.contatoKey.get(colab.colaborador_key) || state.contatoNome.get(normalizar(colab.nome)) || {};
  return {
    telefone: c.telefone || colab.telefone || '',
    email: c.email_corporativo || colab.email || '',
    apelido: state.apelidoNome.get(normalizar(colab.nome)) || '',
  };
}

// Chaves e nomes de quem já está na lista (a escala antiga usa chave por apelido; a base, CPF).
const quemJaEsta = (entradas) => new Set(entradas.flatMap((e) => [e.colaborador_key, normalizar(e.nome)]));

// Quem costuma ficar no setor (agenda de plantonistas + escalas recentes), só colaboradores ainda ativos.
function rapidosDoSetor(setor, entradas) {
  const jaTem = quemJaEsta(entradas);
  const pontos = new Map();
  for (const c of state.contatos) {
    if (normalizar(c.setor_preferencial) === normalizar(setor)) pontos.set(normalizar(c.nome), (pontos.get(normalizar(c.nome)) || 0) + 1);
  }
  for (const l of state.escalas) {
    if (l.setor === setor) pontos.set(normalizar(l.nome), (pontos.get(normalizar(l.nome)) || 0) + 1);
  }
  return [...pontos.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nome]) => state.porNome.get(nome))
    .filter((c) => c && !jaTem.has(c.colaborador_key) && !jaTem.has(normalizar(c.nome)))
    .slice(0, 8);
}

function montarPeriodos() {
  const primeiro = state.fds[0].dias[0];
  const futuras = state.escalas.filter((l) => iso10(l.data_plantao) >= primeiro);
  const extras = periodosExtras(futuras, state.fds);
  const manuais = state.manuais.filter((m) => !extras.some((x) => x.id === m.id) && !state.fds.some((f) => f.dias.includes(m.id)));
  state.periodos = ordenarPeriodos([...state.fds, ...extras, ...manuais]);
  const todosExtras = periodosExtras(state.escalas, [...state.fds, ...state.passados]);
  state.fontes = ordenarPeriodos([...state.passados, ...state.periodos, ...todosExtras.filter((x) => !state.periodos.some((p) => p.id === x.id))]);
  if (!state.periodos.some((p) => p.id === state.periodoId)) state.periodoId = state.periodos[0].id;
}

async function recarregarEscalas() {
  const primeiro = state.fds[0].dias[0];
  const ultimo = state.fds[state.fds.length - 1].dias[1];
  state.escalas = await dados.carregarEscalas(state.supabase, somarDias(primeiro, -56), ultimo);
  indices();
  montarPeriodos();
}

function construirEdicao(somente = null) {
  const p = periodoAtual();
  for (const s of state.setores) {
    if (somente && !somente.includes(s.setor)) continue;
    const entradas = agruparPlantonistas(linhasDe(s.setor, p));
    state.edicao[s.setor] = entradas;
    state.base[s.setor] = assinatura(entradas);
  }
}

const setoresSujos = () => state.setores
  .filter((s) => s.podeEditar && assinatura(state.edicao[s.setor] || []) !== state.base[s.setor])
  .map((s) => s.setor);

// ── desenho ─────────────────────────────────────────────────────────────────
function resumos() {
  const mapa = new Map();
  const nomes = state.setores.map((s) => s.setor);
  for (const p of state.periodos) {
    const porSetor = {};
    for (const s of nomes) porSetor[s] = p.id === state.periodoId ? (state.edicao[s] || []) : agruparPlantonistas(linhasDe(s, p));
    mapa.set(p.id, resumoPeriodo(porSetor, nomes, p));
  }
  return mapa;
}

function renderAviso() {
  const semSetores = !state.setores.length;
  const semEdicao = !semSetores && !state.setores.some((s) => s.podeEditar);
  el('[data-pg-aviso]').innerHTML = htmlAviso({ semSetores, semEdicao, ehMaster: Boolean(state.auth?.user?.is_master) });
}

function renderPeriodos() {
  el('[data-pg-periodos]').innerHTML = htmlPeriodos({
    periodos: state.periodos, ativoId: state.periodoId, resumos: resumos(), sabadoDaVez: sabadoDaVez(state.hoje),
  });
  el('[data-pg-periodo-titulo]').textContent = rotuloExtenso(periodoAtual());
  // Só a faixa de períodos rola (a página não pode pular): deixa o período escolhido visível.
  const faixa = el('.pg-chips');
  const ativo = faixa?.querySelector('.pg-chip.ativo');
  if (faixa && ativo && (ativo.offsetLeft < faixa.scrollLeft || ativo.offsetLeft + ativo.offsetWidth > faixa.scrollLeft + faixa.clientWidth)) {
    faixa.scrollLeft = Math.max(0, ativo.offsetLeft - 16);
  }
}

function htmlDoSetor(s) {
  const entradas = state.edicao[s.setor] || [];
  const erros = {};
  for (const e of entradas) if (state.erros[e.uid]) erros[e.uid] = state.erros[e.uid];
  return htmlSetor({
    setor: s.setor, entradas, periodo: periodoAtual(), podeEditar: s.podeEditar, abertos: state.abertos, erros,
    sujo: s.podeEditar && assinatura(entradas) !== state.base[s.setor], rapidos: s.podeEditar ? rapidosDoSetor(s.setor, entradas) : [],
  });
}

function renderSetores() {
  const editaveis = state.setores.filter((s) => s.podeEditar);
  const leitura = state.setores.filter((s) => !s.podeEditar);
  el('[data-pg-setores]').innerHTML = editaveis.map(htmlDoSetor).join('')
    + (leitura.length ? `${editaveis.length ? '<h4 class="pg-sub">Outros setores (somente leitura)</h4>' : ''}${leitura.map(htmlDoSetor).join('')}` : '');
  if (state.focoSetor) {
    state.container.querySelector(`[data-pg-setor="${CSS.escape(state.focoSetor)}"] [data-pg-busca]`)?.focus();
    state.focoSetor = '';
  }
}

function renderSetor(setor) {
  const atual = state.container.querySelector(`[data-pg-setor="${CSS.escape(setor)}"]`);
  const s = setorCfg(setor);
  if (!atual || !s) return renderSetores();
  atual.outerHTML = htmlDoSetor(s);
  if (state.focoSetor === setor) {
    state.container.querySelector(`[data-pg-setor="${CSS.escape(setor)}"] [data-pg-busca]`)?.focus();
    state.focoSetor = '';
  }
}

function renderBarra() {
  const sujos = setoresSujos();
  const barra = el('[data-pg-barra]');
  barra.hidden = !sujos.length && !state.salvando;
  if (!barra.hidden) barra.innerHTML = htmlBarra({ sujos, salvando: state.salvando });
  window.onbeforeunload = sujos.length ? () => 'Há alterações de plantão que ainda não foram salvas.' : null;
}

function renderTudo() {
  renderAviso();
  renderPeriodos();
  renderSetores();
  renderBarra();
}

// Depois de mexer num setor: atualiza só o que depende dele (cobertura dos pontos, destaque do cartão, barra de salvar).
function aoMudar(setor) {
  renderPeriodos();
  const s = setorCfg(setor);
  const card = state.container.querySelector(`[data-pg-setor="${CSS.escape(setor)}"]`);
  card?.classList.toggle('sujo', assinatura(state.edicao[setor] || []) !== state.base[setor]);
  if (s) renderBarra();
}

// ── período ─────────────────────────────────────────────────────────────────
async function trocarPeriodo(id) {
  if (id === state.periodoId) return;
  if (setoresSujos().length) {
    const ok = await confirmar({
      titulo: 'Descartar alterações?', mensagem: 'Você mexeu no plantão deste período e não salvou. Ao trocar de período, essas alterações serão perdidas.',
      confirmarLabel: 'Descartar e trocar', cancelarLabel: 'Voltar',
    });
    if (!ok) return;
  }
  state.periodoId = id;
  state.abertos.clear();
  state.erros = {};
  construirEdicao();
  renderTudo();
}

function abrirJanela(html, classe = '') {
  const overlay = openModal({ id: JANELA, conteudoHtml: html });
  overlay.classList.add('pg-overlay');
  if (classe) overlay.classList.add(classe);
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-pg-fechar]')) closeModal(JANELA); });
  return overlay;
}

function abrirNovaData() {
  const overlay = abrirJanela(htmlNovaData());
  overlay.querySelector('[data-pg-nd-data]').min = state.hoje;
  overlay.querySelector('[data-pg-nd-ok]').addEventListener('click', async () => {
    const data = overlay.querySelector('[data-pg-nd-data]').value;
    const titulo = overlay.querySelector('[data-pg-nd-titulo]').value.trim();
    if (!data) { toast('Escolha a data.', 'err'); return; }
    closeModal(JANELA);
    const existente = state.periodos.find((p) => p.dias.includes(data));
    if (existente) { await trocarPeriodo(existente.id); return; }
    state.manuais.push(periodoData(data, titulo));
    montarPeriodos();
    await trocarPeriodo(data);
  });
}

// ── plantonistas ────────────────────────────────────────────────────────────
function entradaPorUid(uid) {
  for (const setor of Object.keys(state.edicao)) {
    const e = state.edicao[setor].find((x) => x.uid === uid);
    if (e) return { setor, e };
  }
  return { setor: '', e: null };
}

function adicionar(setor, entrada) {
  state.edicao[setor].push(entrada);
  state.focoSetor = setor;
  renderSetor(setor);
  aoMudar(setor);
}

function adicionarColaborador(setor, key) {
  const colab = state.porKey.get(key);
  if (!colab) return;
  const p = periodoAtual();
  adicionar(setor, novoPlantonista({
    colaborador: colab, contato: contatoDe(colab), horario: horarioPadraoDoSetor(setorCfg(setor)?.horario), dias: p.dias,
  }));
}

function adicionarManual(setor, nome) {
  const p = periodoAtual();
  const entrada = novoPlantonista({
    colaborador: { nome: nome.toUpperCase(), cpf: '' }, contato: { apelido: apelidoPadrao(nome) },
    horario: horarioPadraoDoSetor(setorCfg(setor)?.horario), dias: p.dias,
  });
  entrada.colaborador_key = chaveColaborador({ nome });
  state.abertos.add(entrada.uid);
  adicionar(setor, entrada);
}

function mostrarSugestoes(campo) {
  const card = campo.closest('[data-pg-setor]');
  const setor = card.dataset.pgSetor;
  const painel = card.querySelector('[data-pg-sugestoes]');
  const termo = campo.value;
  if (!termo.trim()) { painel.hidden = true; return; }
  const excluir = quemJaEsta(state.edicao[setor] || []);
  const preferidos = new Set(rapidosDoSetor(setor, []).map((c) => c.colaborador_key));
  painel.innerHTML = htmlSugestoes(buscarColaboradores(state.colaboradores, termo, { preferidos, excluir }), termo);
  painel.hidden = false;
}

// ── copiar entre períodos ───────────────────────────────────────────────────
function abrirCopiarDe(setor) {
  const p = periodoAtual();
  const opcoes = state.fontes
    .filter((f) => f.id !== p.id)
    .map((f) => ({ periodo: f, linhas: linhasDe(setor, f) }))
    .filter((o) => o.linhas.length)
    .sort((a, b) => b.periodo.dias[0].localeCompare(a.periodo.dias[0]))
    .slice(0, 16)
    .map((o) => ({ periodo: o.periodo, nomes: [...new Set(o.linhas.map((l) => l.apelido || String(l.nome).split(' ')[0]))] }));
  const overlay = abrirJanela(htmlCopiarDe({ setor, opcoes }));
  overlay.addEventListener('click', async (ev) => {
    const botao = ev.target.closest('[data-pg-fonte]');
    if (!botao) return;
    const fonte = state.fontes.find((f) => f.id === botao.dataset.pgFonte);
    if (!fonte) return;
    if ((state.edicao[setor] || []).length) {
      const ok = await confirmar({ titulo: 'Substituir o plantão atual?', mensagem: `Os plantonistas de ${setor} neste período serão trocados pelos de outro período. Nada é salvo até você clicar em Salvar plantão.`, confirmarLabel: 'Substituir' });
      if (!ok) return;
    }
    state.edicao[setor] = copiarPlantonistas(agruparPlantonistas(linhasDe(setor, fonte)), fonte.dias, p.dias);
    closeModal(JANELA);
    renderSetor(setor);
    aoMudar(setor);
  });
}

function abrirRepetir(setor) {
  const p = periodoAtual();
  const opcoes = state.periodos
    .filter((x) => x.id !== p.id && x.dias[0] > p.dias[0])
    .map((x) => ({ periodo: x, temPlantao: linhasDe(setor, x).length > 0 }));
  const overlay = abrirJanela(htmlRepetir({ setor, opcoes }));
  overlay.querySelector('[data-pg-repetir-ok]')?.addEventListener('click', async () => {
    const ids = [...overlay.querySelectorAll('[data-pg-alvo]:checked')].map((c) => c.dataset.pgAlvo);
    if (!ids.length) { toast('Marque ao menos um período.', 'err'); return; }
    if (!validarSetores([setor])) { closeModal(JANELA); return; }
    closeModal(JANELA);
    state.salvando = true; renderBarra();
    try {
      if (setoresSujos().includes(setor)) await dados.salvarSetor(state.supabase, { setor, periodo: p, entradas: state.edicao[setor] });
      for (const id of ids) {
        const alvo = state.periodos.find((x) => x.id === id);
        const copia = copiarPlantonistas(state.edicao[setor], p.dias, alvo.dias);
        if (copia.length) await dados.salvarSetor(state.supabase, { setor, periodo: alvo, entradas: copia });
      }
      toast(`Plantão de ${setor} repetido em ${ids.length} ${ids.length === 1 ? 'período' : 'períodos'}.`);
    } catch (e) { erro(e); }
    state.salvando = false;
    await recarregarEscalas();
    construirEdicao([setor]);
    renderTudo();
  });
}

// ── salvar ──────────────────────────────────────────────────────────────────
function validarSetores(lista) {
  state.erros = {};
  let primeiro = null;
  for (const setor of lista) {
    for (const e of state.edicao[setor] || []) {
      const erros = validarPlantonista(e);
      if (!erros.length) continue;
      state.erros[e.uid] = erros;
      state.abertos.add(e.uid);
      primeiro = primeiro || e.uid;
    }
  }
  if (!primeiro) return true;
  renderSetores();
  state.container.querySelector(`[data-pg-uid="${CSS.escape(primeiro)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast('Corrija os campos destacados em vermelho.', 'err', 5000);
  return false;
}

async function salvarTudo() {
  const sujos = setoresSujos();
  if (!sujos.length) return true;
  if (!validarSetores(sujos)) return false;
  const p = periodoAtual();
  state.salvando = true;
  renderBarra();
  const salvos = [];
  let falhou = null;
  for (const setor of sujos) {
    try {
      await dados.salvarSetor(state.supabase, { setor, periodo: p, entradas: state.edicao[setor] });
      salvos.push(setor);
    } catch (e) { falhou = e; break; }
  }
  try { await recarregarEscalas(); } catch (e) { falhou = falhou || e; }
  construirEdicao(salvos);
  state.salvando = false;
  renderTudo();
  if (salvos.length) toast(`Plantão salvo: ${salvos.join(', ')}.`);
  if (falhou) { erro(falhou); return false; }
  return true;
}

async function descartar() {
  const ok = await confirmar({ titulo: 'Descartar alterações?', mensagem: 'O plantão volta para o que está salvo.', confirmarLabel: 'Descartar', cancelarLabel: 'Voltar' });
  if (!ok) return;
  state.erros = {};
  construirEdicao();
  renderTudo();
}

// ── imagem ──────────────────────────────────────────────────────────────────
async function abrirImagem() {
  if (setoresSujos().length) {
    const ok = await confirmar({
      titulo: 'Salvar antes de gerar a imagem?', mensagem: 'Há alterações que ainda não foram salvas. A imagem é gerada com o plantão salvo.',
      confirmarLabel: 'Salvar e gerar imagem', cancelarLabel: 'Voltar',
    });
    if (!ok || !(await salvarTudo())) return;
  }
  const comDados = state.setores.filter((s) => (state.edicao[s.setor] || []).length).map((s) => s.setor);
  state.img = { formato: 'horizontal', selecionados: new Set(comDados), tel: true, email: true };
  const overlay = abrirJanela('', 'larga');
  overlay.addEventListener('click', onClickImagem);
  overlay.addEventListener('change', onChangeImagem);
  await renderImagem();
}

async function renderImagem() {
  const overlay = document.getElementById(JANELA);
  if (!overlay) return;
  const p = periodoAtual();
  const { formato, selecionados, tel, email } = state.img;
  const faltas = state.setores
    .filter((s) => selecionados.has(s.setor))
    .map((s) => ({ setor: s.setor, dias: coberturaSetor(state.edicao[s.setor] || [], p).faltam }))
    .filter((f) => f.dias.length);
  overlay.querySelector('.ds-modal-card').innerHTML = htmlImagem({
    periodo: p, formatos: FORMATOS, formato, selecionados, mostrarTelefone: tel, mostrarEmail: email, faltas,
    setores: state.setores.map((s) => ({ setor: s.setor, temDados: (state.edicao[s.setor] || []).length > 0 })),
    podeCopiar: podeCopiarImagem(),
    podeCompartilhar: podeCompartilhar(new File([''], 'a.png', { type: 'image/png' })),
  });
  const modelo = montarModeloImagem({
    periodo: p, mostrarTelefone: tel, mostrarEmail: email,
    setores: state.setores.filter((s) => selecionados.has(s.setor)).map((s) => ({ setor: s.setor, entradas: state.edicao[s.setor] || [] })),
  });
  await desenharImagem(overlay.querySelector('[data-pg-canvas]'), modelo, { formato });
}

function onChangeImagem(ev) {
  const alvo = ev.target;
  if (alvo.matches('[data-pg-img-setor]')) {
    if (alvo.checked) state.img.selecionados.add(alvo.dataset.pgImgSetor); else state.img.selecionados.delete(alvo.dataset.pgImgSetor);
  } else if (alvo.matches('[data-pg-img-tel]')) state.img.tel = alvo.checked;
  else if (alvo.matches('[data-pg-img-email]')) state.img.email = alvo.checked;
  else return;
  renderImagem();
}

async function onClickImagem(ev) {
  const formato = ev.target.closest('[data-pg-formato]');
  if (formato) { state.img.formato = formato.dataset.pgFormato; renderImagem(); return; }
  const canvas = document.querySelector(`#${JANELA} [data-pg-canvas]`);
  const p = periodoAtual();
  const nome = nomeArquivoImagem(p, state.img.formato);
  try {
    if (ev.target.closest('[data-pg-baixar]')) { await baixarImagem(canvas, nome); toast('Imagem baixada.'); }
    else if (ev.target.closest('[data-pg-copiar]')) { await copiarImagem(canvas); toast('Imagem copiada. É só colar no WhatsApp.'); }
    else if (ev.target.closest('[data-pg-compartilhar]')) await compartilharImagem(canvas, nome, `Plantão ${rotuloExtenso(p)}`);
  } catch (e) {
    if (e?.name !== 'AbortError') erro(e);
  }
}

// ── eventos da página ───────────────────────────────────────────────────────
function aoClicar(ev) {
  const alvo = ev.target;
  const periodo = alvo.closest('[data-pg-periodo]');
  if (periodo) { trocarPeriodo(periodo.dataset.pgPeriodo); return; }
  if (alvo.closest('[data-pg-nova-data]')) { abrirNovaData(); return; }
  if (alvo.closest('[data-pg-mais-semanas]')) { maisSemanas(); return; }
  if (alvo.closest('[data-pg-imagem]')) { abrirImagem(); return; }
  if (alvo.closest('[data-pg-salvar]')) { salvarTudo(); return; }
  if (alvo.closest('[data-pg-descartar]')) { descartar(); return; }

  const card = alvo.closest('[data-pg-setor]');
  if (!card) return;
  const setor = card.dataset.pgSetor;

  const rapido = alvo.closest('[data-pg-rapido]');
  if (rapido) { adicionarColaborador(setor, rapido.dataset.pgRapido); return; }
  const escolhido = alvo.closest('[data-pg-escolher]');
  if (escolhido) { adicionarColaborador(setor, escolhido.dataset.pgEscolher); return; }
  const manual = alvo.closest('[data-pg-manual]');
  if (manual) { adicionarManual(setor, manual.dataset.pgManual); return; }

  const acao = alvo.closest('[data-pg-acao]')?.dataset.pgAcao;
  if (acao === 'copiar-de') { abrirCopiarDe(setor); return; }
  if (acao === 'repetir') { abrirRepetir(setor); return; }

  const linha = alvo.closest('[data-pg-uid]');
  if (!linha) return;
  const { e } = entradaPorUid(linha.dataset.pgUid);
  if (!e) return;
  const dia = alvo.closest('[data-pg-dia]')?.dataset.pgDia;
  if (dia) {
    e.dias = e.dias.includes(dia) ? e.dias.filter((d) => d !== dia) : [...e.dias, dia];
    delete state.erros[e.uid];
    renderSetor(setor);
    aoMudar(setor);
  } else if (acao === 'detalhes') {
    if (state.abertos.has(e.uid)) state.abertos.delete(e.uid); else state.abertos.add(e.uid);
    renderSetor(setor);
  } else if (acao === 'remover') {
    state.edicao[setor] = state.edicao[setor].filter((x) => x.uid !== e.uid);
    state.abertos.delete(e.uid);
    delete state.erros[e.uid];
    renderSetor(setor);
    aoMudar(setor);
  }
}

function aoDigitar(ev) {
  const alvo = ev.target;
  if (alvo.matches('[data-pg-busca]')) { mostrarSugestoes(alvo); return; }
  const campo = alvo.dataset?.pgCampo;
  if (!campo) return;
  const linha = alvo.closest('[data-pg-uid]');
  const { setor, e } = entradaPorUid(linha?.dataset.pgUid);
  if (!e) return;
  e[campo] = alvo.value;
  if (state.erros[e.uid]) {
    delete state.erros[e.uid];
    linha.classList.remove('erro');
    linha.querySelector('.pg-erros')?.remove();
  }
  linha.querySelector('[data-pg-resumo]').textContent = resumoContato(e);
  aoMudar(setor);
}

function aoSair(ev) {
  const alvo = ev.target;
  if (alvo.dataset?.pgCampo === 'telefone') {
    alvo.value = formatarTelefone(alvo.value);
    const { e } = entradaPorUid(alvo.closest('[data-pg-uid]')?.dataset.pgUid);
    if (e) e.telefone = alvo.value;
  }
}

function aoTeclar(ev) {
  if (!ev.target.matches('[data-pg-busca]')) return;
  const painel = ev.target.closest('[data-pg-setor]').querySelector('[data-pg-sugestoes]');
  if (ev.key === 'Escape') { painel.hidden = true; return; }
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  painel.querySelector('[data-pg-escolher],[data-pg-manual]')?.click();
}

function aoPerderFoco(ev) {
  if (!ev.target.matches?.('[data-pg-busca]')) return;
  const painel = ev.target.closest('[data-pg-setor]')?.querySelector('[data-pg-sugestoes]');
  setTimeout(() => { if (painel) painel.hidden = true; }, 180);
}

async function maisSemanas() {
  state.semanas += 12;
  state.fds = listarFinsDeSemana(state.hoje, state.semanas);
  try {
    await recarregarEscalas();
    renderPeriodos();
  } catch (e) { erro(e); }
}

// ── entrada ─────────────────────────────────────────────────────────────────
export async function abrirPlantao(container, { supabase, auth }) {
  state.supabase = supabase;
  state.auth = auth;
  state.container = container;
  garantirEstilos();
  container.innerHTML = htmlShell();
  container.addEventListener('click', aoClicar);
  container.addEventListener('input', aoDigitar);
  container.addEventListener('focusout', (ev) => { aoSair(ev); aoPerderFoco(ev); });
  container.addEventListener('keydown', aoTeclar);
  el('[data-pg-periodos]').innerHTML = '<div class="pg-vazio">Carregando…</div>';
  try {
    state.hoje = hojeISO();
    state.fds = listarFinsDeSemana(state.hoje, state.semanas);
    const primeiro = state.fds[0].dias[0];
    state.passados = Array.from({ length: 8 }, (_, i) => periodoFimDeSemana(somarDias(primeiro, -7 * (8 - i))));
    const [setores, colaboradores, contatos] = await Promise.all([
      dados.carregarSetores(supabase), dados.carregarColaboradores(supabase), dados.carregarContatos(supabase),
    ]);
    state.setores = setores;
    state.colaboradores = colaboradores;
    state.contatos = contatos;
    await recarregarEscalas();
    state.periodoId = state.fds[0].id;
    construirEdicao();
    renderTudo();
  } catch (e) {
    console.error(e);
    el('[data-pg-periodos]').innerHTML = `<div class="pg-aviso warn">Não foi possível carregar o Plantão: ${String(e?.message || e)}</div>`;
  }
}
