// Frotas · Sinistros: controlador. Estado da tela, carga, lista e ficha; as ações gravam pelo módulo de dados.
// Camadas: regras (puras) > dados (Supabase) > html (puro) > este arquivo. A dependência só desce.
import { openModal, closeModal, confirmar, toast } from '../core/ui.js';
import { ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261030-frotas-aprovar2';
import { ESTILOS_SINISTROS } from './frotas-sinistros-estilos.js?v=20261030-frotas-aprovar2';
import * as dados from './frotas-sinistros-dados.js?v=20261030-frotas-aprovar2';
import { enviarArquivoAoDrive } from './frotas-sinistros-drive.js?v=20261030-frotas-aprovar2';
import {
  encerrado, hojeISO, prazoSituacao, resumoChecklist, itensChecklist, filtrarSinistros, ordenarSinistros, contarPorFiltro,
  deInputDataHora, podeOperarSinistros, etapaInfo, pastaDriveSinistro, nomeArquivoDrive,
} from './frotas-sinistros-regras.js?v=20261030-frotas-aprovar2';
import {
  htmlShell, htmlKpis, htmlLinhas, htmlNovo, htmlFicha, htmlAbas, htmlDocumentos, htmlDados, htmlTerceiros, htmlAcompanhamento, htmlItensTerceiro,
} from './frotas-sinistros-html.js?v=20261030-frotas-aprovar2';

const MODAL = 'snFicha';
const MODAL_NOVO = 'snNovo';

const state = {
  supabase: null, auth: null, podeEditar: false, container: null,
  dados: { sinistros: [], terceiros: [], marcas: [], anexos: [], modelo: [] },
  veiculos: [], colaboradores: [], filtro: 'todos', busca: '',
  fichaId: null, aba: 'docs', historico: [], ocupado: false,
};

const nomeUsuario = () => state.auth?.user?.nome || state.auth?.user?.name || state.auth?.user?.email || null;
const sinistroAtual = () => state.dados.sinistros.find((s) => s.id === state.fichaId) || null;
const veiculoDe = (s) => state.veiculos.find((v) => v.id === s?.veiculo_id) || null;
const erro = (e) => toast(e?.message || String(e), 'err', 6000);

function garantirEstilos() {
  if (document.getElementById('snEstilos')) return;
  const el = document.createElement('style');
  el.id = 'snEstilos';
  el.textContent = ESTILOS_SINISTROS;
  document.head.appendChild(el);
}

// ── dados em memória ────────────────────────────────────────────────────────
function enriquecer() {
  const porId = new Map(state.veiculos.map((v) => [v.id, v]));
  const hoje = hojeISO();
  const { modelo, terceiros, marcas, anexos } = state.dados;
  return state.dados.sinistros.map((s) => ({
    ...s, __veiculo: porId.get(s.veiculo_id) || null, __prazo: prazoSituacao(s, hoje), __resumo: resumoChecklist({ modelo, sinistro: s, terceiros, marcas, anexos }),
  }));
}

function resumoDe(s) {
  const { modelo, terceiros, marcas, anexos } = state.dados;
  return resumoChecklist({ modelo, sinistro: s, terceiros, marcas, anexos });
}

async function recarregarSinistro(id) {
  const r = await dados.carregarUm(state.supabase, id);
  const d = state.dados;
  d.sinistros = r.sinistro ? [r.sinistro, ...d.sinistros.filter((s) => s.id !== id)] : d.sinistros.filter((s) => s.id !== id);
  d.terceiros = [...d.terceiros.filter((t) => t.sinistro_id !== id), ...r.terceiros];
  d.marcas = [...d.marcas.filter((m) => m.sinistro_id !== id), ...r.marcas];
  d.anexos = [...d.anexos.filter((a) => a.sinistro_id !== id), ...r.anexos];
}

// Única porta para gravar: trava contra clique duplo, avisa o erro e recarrega o sinistro aberto.
async function executar(fn, { sucesso = '', id = state.fichaId, historico = false } = {}) {
  if (state.ocupado) return false;
  state.ocupado = true;
  try {
    await fn();
    if (id) await recarregarSinistro(id);
    if (historico && state.fichaId) state.historico = await dados.carregarHistorico(state.supabase, state.fichaId);
    if (sucesso) toast(sucesso);
    return true;
  } catch (e) {
    erro(e);
    return false;
  } finally {
    state.ocupado = false;
    renderLista();
    if (state.fichaId) renderFicha();
  }
}

// ── lista ──────────────────────────────────────────────────────────────────
function renderLista() {
  const c = state.container;
  if (!c) return;
  const todas = enriquecer();
  const linhas = ordenarSinistros(filtrarSinistros(todas, state.filtro, state.busca));
  c.querySelector('[data-sn-kpis]').innerHTML = htmlKpis(contarPorFiltro(todas), state.filtro);
  c.querySelector('[data-sn-linhas]').innerHTML = htmlLinhas(linhas);
  c.querySelector('[data-sn-contagem]').textContent = `${linhas.length} de ${todas.length} sinistro(s)`;
  sincronizarCards(c, state.filtro);
}

async function carregar() {
  const c = state.container;
  c.querySelector('[data-sn-linhas]').innerHTML = '<tr><td colspan="7" class="fm-empty">Carregando sinistros...</td></tr>';
  try {
    const [d, veiculos] = await Promise.all([dados.carregarTudo(state.supabase), dados.carregarVeiculos(state.supabase)]);
    state.dados = d;
    state.veiculos = veiculos;
  } catch (e) {
    c.querySelector('[data-sn-linhas]').innerHTML = `<tr><td colspan="7" class="fm-empty">${(e?.message || 'Erro ao carregar os sinistros.').replace(/</g, '&lt;')}</td></tr>`;
    return;
  }
  renderLista();
  if (state.fichaId) renderFicha();
}

// ── novo sinistro ───────────────────────────────────────────────────────────
async function abrirNovo() {
  if (!state.colaboradores.length) dados.carregarColaboradores(state.supabase).then((n) => { state.colaboradores = n; }).catch(() => {});
  const overlay = openModal({ id: MODAL_NOVO, conteudoHtml: htmlNovo({ veiculos: state.veiculos, colaboradores: state.colaboradores }) });
  overlay.classList.add('sn-overlay', 'sn-estreito');
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-sn-fechar]')) closeModal(MODAL_NOVO); });
  const form = overlay.querySelector('[data-sn-form-novo]');
  const veiculoInput = form.querySelector('[name="veiculo"]');
  veiculoInput.addEventListener('change', () => {
    const v = achaVeiculo(veiculoInput.value);
    const condutor = form.querySelector('[name="condutor_nome"]');
    if (v?.motorista_atual && !condutor.value) condutor.value = v.motorista_atual;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('[data-sn-erro]');
    const v = achaVeiculo(veiculoInput.value);
    if (!v) { msg.textContent = 'Escolha a placa de um veículo cadastrado.'; return; }
    const val = (n) => String(form.querySelector(`[name="${n}"]`)?.value || '').trim() || null;
    const marcado = (n) => !!form.querySelector(`[name="${n}"]`)?.checked;
    const botao = form.querySelector('[data-sn-criar]');
    botao.disabled = true;
    try {
      const novo = await dados.criarSinistro(state.supabase, {
        veiculo_id: v.id, placa: v.placa, condutor_nome: val('condutor_nome'), ocorrido_em: deInputDataHora(form.querySelector('[name="ocorrido_em"]').value),
        local_texto: val('local_texto'), relato: val('relato'), houve_terceiro: marcado('houve_terceiro'), houve_ferido: marcado('houve_ferido'), guincho: marcado('guincho'),
        apolice: v.apolice_seguro || null,
      });
      closeModal(MODAL_NOVO);
      state.dados.sinistros = [novo, ...state.dados.sinistros];
      renderLista();
      toast('Sinistro registrado. Agora reúna os documentos.');
      abrirFicha(novo.id, 'docs');
    } catch (err) {
      msg.textContent = err?.message || 'Erro ao registrar o sinistro.';
      botao.disabled = false;
    }
  });
  veiculoInput.focus();
}

function achaVeiculo(texto) {
  const q = String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return q ? state.veiculos.find((v) => String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === q) || null : null;
}

// ── ficha ──────────────────────────────────────────────────────────────────
async function abrirFicha(id, aba = null) {
  const s = state.dados.sinistros.find((x) => x.id === id);
  if (!s) return;
  state.fichaId = id;
  // Abre no que mais interessa: o checklist enquanto falta documento; depois, o acompanhamento.
  state.aba = aba || (!encerrado(s.etapa) && (s.etapa === 'preparando' || resumoDe(s).faltam.length) ? 'docs' : 'acomp');
  state.historico = [];
  if (!state.colaboradores.length) dados.carregarColaboradores(state.supabase).then((n) => { state.colaboradores = n; }).catch(() => {});
  const overlay = openModal({ id: MODAL, conteudoHtml: '', aoFechar: fecharFicha });
  overlay.classList.add('sn-overlay');
  ligarFicha(overlay);
  renderFicha();
  dados.carregarHistorico(state.supabase, id).then((h) => { if (state.fichaId === id) { state.historico = h; if (state.aba === 'acomp') renderCorpo(); } }).catch(erro);
}

function fecharFicha() {
  state.fichaId = null;
  closeModal(MODAL);
}

function renderFicha() {
  const overlay = document.getElementById(MODAL);
  const s = sinistroAtual();
  if (!overlay || !s) { if (overlay && !s) fecharFicha(); return; }
  const card = overlay.querySelector('.ds-modal-card');
  card.innerHTML = htmlFicha({
    s, veiculo: veiculoDe(s), resumo: resumoDe(s), aba: state.aba,
    qtdTerceiros: state.dados.terceiros.filter((t) => t.sinistro_id === s.id).length, podeEditar: state.podeEditar,
  });
  renderCorpo();
}

function renderCorpo() {
  const overlay = document.getElementById(MODAL);
  const s = sinistroAtual();
  const corpo = overlay?.querySelector('[data-sn-corpo]');
  if (!corpo || !s) return;
  const { modelo, marcas, anexos, terceiros } = state.dados;
  const podeEditar = state.podeEditar;
  const topo = corpo.scrollTop;
  if (state.aba === 'docs') corpo.innerHTML = htmlDocumentos({ s, modelo, marcas, anexos, resumo: resumoDe(s), podeEditar });
  else if (state.aba === 'dados') corpo.innerHTML = htmlDados({ s, colaboradores: state.colaboradores, podeEditar });
  else if (state.aba === 'terceiros') corpo.innerHTML = htmlTerceiros({ s, terceiros, modelo, marcas, anexos, podeEditar });
  else corpo.innerHTML = htmlAcompanhamento({ historico: state.historico, podeEditar });
  corpo.scrollTop = topo;
}

function atualizarAbas() {
  const overlay = document.getElementById(MODAL);
  const s = sinistroAtual();
  if (!overlay || !s) return;
  const atual = overlay.querySelector('.sn-abas');
  if (atual) atual.outerHTML = htmlAbas({ aba: state.aba, resumo: resumoDe(s), qtdTerceiros: state.dados.terceiros.filter((t) => t.sinistro_id === s.id).length });
}

const valorCampo = (form, nome) => {
  const el = form.querySelector(`[name="${nome}"]`);
  if (!el) return undefined;
  if (el.type === 'checkbox') return el.checked;
  const v = String(el.value ?? '').trim();
  return v === '' ? null : v;
};

// Quem trocou de etapa: o trigger do banco carimba a data e escreve a linha do tempo.
async function trocarEtapa(para) {
  const s = sinistroAtual();
  if (!s) return;
  if (para === 'concluido') {
    const r = resumoDe(s);
    const ok = await confirmar({ titulo: 'Concluir sinistro', mensagem: `O sinistro ${s.placa} será encerrado (veículo entregue).${r.faltam.length ? ` Ainda há ${r.faltam.length} item(ns) obrigatório(s) pendente(s) no checklist.` : ''}`, confirmarLabel: 'Concluir' });
    if (!ok) return;
  }
  if (para === 'preparando' && s.etapa === 'solicitado') {
    const ok = await confirmar({ titulo: 'Voltar etapa', mensagem: 'Voltar o sinistro para "Preparando documentos"?', confirmarLabel: 'Voltar' });
    if (!ok) return;
  }
  await executar(() => dados.mudarEtapa(state.supabase, s.id, para), { sucesso: `Etapa: ${etapaInfo(para).label}.`, historico: true });
}

async function cancelarSinistro() {
  const s = sinistroAtual();
  if (!s) return;
  const motivo = await confirmar({ titulo: 'Cancelar sinistro', mensagem: `O sinistro ${s.placa} sairá do acompanhamento. Os documentos continuam guardados.`, confirmarLabel: 'Cancelar sinistro', cancelarLabel: 'Voltar', justificativa: true, justificativaPlaceholder: 'Por que foi cancelado? (ex.: aberto em duplicidade, condutor desistiu)' });
  if (!motivo) return;
  await executar(() => dados.mudarEtapa(state.supabase, s.id, 'cancelado', { motivo_status: motivo }), { sucesso: 'Sinistro cancelado.', historico: true });
}

async function salvarFaixa(overlay) {
  const s = sinistroAtual();
  const faixa = overlay.querySelector('[data-sn-faixa]');
  if (!s || !faixa) return;
  const campos = Object.fromEntries(['protocolo', 'proxima_acao', 'proxima_acao_em', 'previsao_entrega'].map((n) => [n, valorCampo(faixa, n)]));
  await executar(() => dados.atualizarSinistro(state.supabase, s.id, campos), { sucesso: 'Salvo.' });
}

async function salvarDados(form) {
  const s = sinistroAtual();
  if (!s) return;
  const texto = ['local_texto', 'relato', 'bo_numero', 'guincho_obs', 'condutor_nome', 'condutor_telefone', 'seguradora', 'corretora', 'apolice', 'oficina_nome', 'oficina_contato', 'observacoes'];
  const campos = Object.fromEntries(texto.map((n) => [n, valorCampo(form, n)]));
  campos.ocorrido_em = deInputDataHora(valorCampo(form, 'ocorrido_em') || '');
  for (const n of ['houve_terceiro', 'houve_ferido', 'guincho']) campos[n] = valorCampo(form, n);
  await executar(() => dados.atualizarSinistro(state.supabase, s.id, campos), { sucesso: 'Dados salvos.' });
}

// Terceiro: salva sozinho ao sair do campo e atualiza só os itens do cartão (sem perder o foco de quem está digitando).
async function salvarTerceiroDoCartao(cartao) {
  const s = sinistroAtual();
  if (!s) return;
  const id = cartao.dataset.snTerceiro;
  const seguro = valorCampo(cartao, 'tem_seguro');
  const campos = { id, sinistro_id: s.id, tem_seguro: seguro === 'sim' ? true : seguro === 'nao' ? false : null };
  for (const n of ['nome', 'telefone', 'email', 'placa', 'veiculo_modelo', 'seguradora', 'oficina_preferencia']) campos[n] = valorCampo(cartao, n);
  try {
    const salvo = await dados.salvarTerceiro(state.supabase, campos);
    state.dados.terceiros = state.dados.terceiros.map((t) => (t.id === id ? salvo : t));
    const itens = itensChecklist({ modelo: state.dados.modelo, sinistro: s, terceiro: salvo, marcas: state.dados.marcas, anexos: state.dados.anexos });
    cartao.querySelector('[data-sn-itens]').innerHTML = htmlItensTerceiro(itens, id, state.podeEditar);
    cartao.querySelector('.sn-terc-head h4').firstChild.textContent = `Terceiro ${[...cartao.parentElement.querySelectorAll('.sn-terc')].indexOf(cartao) + 1}${salvo.nome ? ' · ' + salvo.nome : ''}`;
    atualizarAbas();
    renderLista();
  } catch (e) { erro(e); }
}

async function adicionarTerceiro() {
  const s = sinistroAtual();
  if (!s) return;
  await executar(async () => {
    await dados.salvarTerceiro(state.supabase, { sinistro_id: s.id });
    if (!s.houve_terceiro) await dados.atualizarSinistro(state.supabase, s.id, { houve_terceiro: true });
  });
}

async function removerTerceiro(id) {
  const t = state.dados.terceiros.find((x) => x.id === id);
  if (!t) return;
  const ok = await confirmar({ titulo: 'Remover terceiro', mensagem: `Remover ${t.nome || 'este terceiro'} e os arquivos dele? Não dá para desfazer.`, confirmarLabel: 'Remover' });
  if (!ok) return;
  await executar(() => dados.removerTerceiro(state.supabase, id), { sucesso: 'Terceiro removido.' });
}

async function marcarItem(botao) {
  const s = sinistroAtual();
  if (!s) return;
  await executar(() => dados.marcarItem(state.supabase, {
    sinistro_id: s.id, terceiro_id: botao.dataset.terceiro || null, codigo: botao.dataset.codigo, status: botao.dataset.snMarca || null, por_nome: nomeUsuario(),
  }));
}

// Copia arquivos para o Drive e registra no painel. Nunca lança: o arquivo já está guardado no painel e o botão "Enviar ao Drive"
// tenta de novo. Para no primeiro erro (se o Apps Script não está pronto, os outros falhariam igual, devagar).
async function enviarAoDrive(s, itens) {
  const { modelo } = state.dados;
  const terceiros = state.dados.terceiros.filter((t) => t.sinistro_id === s.id);
  let enviados = 0;
  for (const { anexo, blob } of itens) {
    try {
      const info = await enviarArquivoAoDrive({
        pasta: pastaDriveSinistro(s), nomeArquivo: nomeArquivoDrive({ anexo, modelo, terceiros }),
        blob: blob || await dados.baixarAnexo(state.supabase, anexo), mimeType: anexo.mime_type, substituirId: anexo.drive_file_id,
      });
      await dados.registrarDriveAnexo(state.supabase, anexo.id, info);
      if (info.folderId && info.folderId !== s.drive_pasta_id) {
        await dados.registrarPastaDrive(state.supabase, s.id, info);
        s.drive_pasta_id = info.folderId;
      }
      enviados += 1;
    } catch (e) {
      console.warn('[sinistros] envio ao Drive falhou:', e);
      return { enviados, falhas: itens.length - enviados, motivo: e?.message || String(e) };
    }
  }
  return { enviados, falhas: 0, motivo: '' };
}

const avisoDrive = (r) => { if (r.falhas) toast(`Salvo no painel, mas ${r.falhas} arquivo(s) não foram ao Drive: ${r.motivo}`, 'warn', 9000); };

async function enviarPendentesAoDrive() {
  const s = sinistroAtual();
  if (!s) return;
  const itens = state.dados.anexos.filter((a) => a.sinistro_id === s.id && !a.drive_file_id).map((anexo) => ({ anexo }));
  if (!itens.length) return;
  await executar(async () => {
    const r = await enviarAoDrive(s, itens);
    if (r.enviados) toast(`${r.enviados} arquivo(s) enviado(s) ao Drive.`);
    avisoDrive(r);
  });
}

async function enviarArquivos(input) {
  const s = sinistroAtual();
  const arquivos = [...(input.files || [])];
  input.value = '';
  if (!s || !arquivos.length) return;
  const ok = await executar(async () => {
    const salvos = [];
    for (const arquivo of arquivos) {
      const anexo = await dados.enviarAnexo(state.supabase, { sinistro_id: s.id, terceiro_id: input.dataset.terceiro || null, item_codigo: input.dataset.snUpload || null, arquivo, por_nome: nomeUsuario() });
      salvos.push({ anexo, blob: arquivo });
      state.dados.anexos.push(anexo); // o nome no Drive depende do item e do terceiro: o anexo precisa estar na memória
    }
    avisoDrive(await enviarAoDrive(s, salvos));
  }, { sucesso: arquivos.length > 1 ? `${arquivos.length} arquivos enviados.` : 'Arquivo enviado.' });
  return ok;
}

async function abrirArquivo(id) {
  const a = state.dados.anexos.find((x) => x.id === id);
  if (!a) return;
  try {
    const url = await dados.urlAnexo(state.supabase, a);
    window.open(url, '_blank', 'noopener');
  } catch (e) { erro(e); }
}

async function removerArquivo(id) {
  const a = state.dados.anexos.find((x) => x.id === id);
  if (!a) return;
  const ok = await confirmar({ titulo: 'Remover arquivo', mensagem: `Remover "${a.nome_arquivo || 'arquivo'}" do painel? Não dá para desfazer.${a.drive_file_id ? ' A cópia que já foi para o Drive não é apagada.' : ''}`, confirmarLabel: 'Remover' });
  if (!ok) return;
  await executar(() => dados.removerAnexo(state.supabase, a), { sucesso: 'Arquivo removido.' });
}

async function registrarNota(overlay) {
  const s = sinistroAtual();
  const campo = overlay.querySelector('[data-sn-nota]');
  const texto = String(campo?.value || '').trim();
  if (!s || !texto) { toast('Escreva a atualização.', 'warn'); return; }
  await executar(() => dados.adicionarNota(state.supabase, { sinistro_id: s.id, texto, por_nome: nomeUsuario() }), { sucesso: 'Atualização registrada.', historico: true });
}

// Um conjunto de ouvintes por janela (a janela é recriada a cada abertura; o conteúdo interno é trocado por innerHTML).
function ligarFicha(overlay) {
  overlay.addEventListener('click', (e) => {
    const alvo = (sel) => e.target.closest(sel);
    if (alvo('[data-sn-fechar]')) return fecharFicha();
    const aba = alvo('[data-sn-aba]');
    if (aba) { state.aba = aba.dataset.snAba; overlay.querySelectorAll('[data-sn-aba]').forEach((b) => b.classList.toggle('ativa', b === aba)); renderCorpo(); return; }
    const ir = alvo('[data-sn-irpara]');
    if (ir) { state.aba = ir.dataset.snIrpara; atualizarAbas(); renderCorpo(); return; }
    const etapa = alvo('[data-sn-etapa]');
    if (etapa) return trocarEtapa(etapa.dataset.snEtapa);
    if (alvo('[data-sn-cancelar]')) return cancelarSinistro();
    if (alvo('[data-sn-salvar-faixa]')) return salvarFaixa(overlay);
    if (alvo('[data-sn-add-terceiro]')) return adicionarTerceiro();
    const delT = alvo('[data-sn-del-terceiro]');
    if (delT) return removerTerceiro(delT.dataset.snDelTerceiro);
    const marca = alvo('[data-sn-marca]');
    if (marca) return marcarItem(marca);
    const ver = alvo('[data-sn-ver]');
    if (ver) return abrirArquivo(ver.dataset.snVer);
    const delA = alvo('[data-sn-del-anexo]');
    if (delA) return removerArquivo(delA.dataset.snDelAnexo);
    if (alvo('[data-sn-add-nota]')) return registrarNota(overlay);
    if (alvo('[data-sn-drive-enviar]')) return enviarPendentesAoDrive();
  });
  overlay.addEventListener('submit', (e) => {
    if (e.target.matches('[data-sn-form-dados]')) { e.preventDefault(); salvarDados(e.target); }
  });
  overlay.addEventListener('change', (e) => {
    const up = e.target.closest('[data-sn-upload]');
    if (up) return enviarArquivos(up);
    const cartao = e.target.closest('[data-sn-terceiro]');
    if (cartao && state.podeEditar) salvarTerceiroDoCartao(cartao);
  });
}

// ── entrada ────────────────────────────────────────────────────────────────
export function openHome(container, opts = {}) {
  garantirEstilos();
  state.supabase = opts.supabase;
  state.auth = opts.auth || null;
  state.podeEditar = podeOperarSinistros(opts.auth);
  state.container = container;
  container.innerHTML = htmlShell({ podeEditar: state.podeEditar });

  ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: renderLista });
  container.querySelector('[data-sn-atualizar]')?.addEventListener('click', carregar);
  container.querySelector('[data-sn-novo]')?.addEventListener('click', abrirNovo);
  container.querySelector('[data-sn-busca]')?.addEventListener('input', (e) => { state.busca = e.target.value; renderLista(); });
  container.querySelector('[data-sn-linhas]')?.addEventListener('click', (e) => {
    const linha = e.target.closest('[data-sn-abrir]');
    if (linha) abrirFicha(linha.dataset.snAbrir);
  });
  return carregar();
}

if (typeof window !== 'undefined') {
  window.FROTAS_SINISTROS = window.FROTAS_SINISTROS || {};
  window.FROTAS_SINISTROS.openHome = openHome;
}
