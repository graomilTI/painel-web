// Frotas > Ocorrências > Multas: Notificar (WhatsApp), Gerar termo, Agrupar e Anexos.
//
// Os botões vêm de modules/frotas-multas.js (data-notificar / data-termo / data-agrupar /
// data-anexos); este módulo ouve os cliques por delegação e usa o contexto exposto em
// window.FROTAS_MULTAS.getContext(). Migration: 20261009130000_frotas_multas_notificar_termo_agrupar_anexos.sql
const BUCKET = 'frotas-multas';
const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const MAX_BYTES = 20 * 1024 * 1024;
// Pasta mãe "CONDUTORES FROTA" (uma subpasta por condutor) e Web App do Apps Script: os mesmos
// do módulo de Notificações (modules/frotas.js). A ação upload_multa_dossie é instalada no
// Apps Script conforme docs/apps-script-upload-multa-dossie.md.
const PASTA_MAE_DRIVE_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDlhiUGilfA1afrunX3Jtc8LAG4DqMO9v0AJKveUxjUaccfJM_ynnKGRghp_K5AfjK/exec';
const ACAO_DRIVE = 'upload_multa_dossie';
const MAX_DRIVE_BYTES = 25 * 1024 * 1024;
const TZ = 'America/Sao_Paulo';

// Mensagem fixa enviada ao motorista depois dos dados da multa.
const MENSAGEM_PADRAO = `❗ATENÇÃO CONDUTOR DE VEÍCULO DA FROTA ❗🚙

Segue abaixo algumas opções para sua multa.

📄 INDICAR: Indicando condutor é lançado em caixa o valor da multa original. A indicação de condutor acarreta em desconto da pontuação na CNH do condutor! Para tal multa ser indicada, agora o procedimento é ONLINE, o motorista tem que ter acesso a sua CONTA GOV E A CNH DIGITAL, simplificando para ambos lados!!!

💰 DOBRAR: Quando um veículo de pessoa jurídica é autuado e não é identificado condutor dentro do prazo legal, além da multa original, é aplicada uma multa por não indicação do condutor com valor dobrado.

OBS:

⚠️ NUNCA repasse sua matrícula de abastecimento para outra pessoa, pois é também desta forma que são identificados os condutores!

⚠️ Funcionários "FREE" não possuem opção de parcelamento de multas.`;

const STYLES = `
  .fm-modal.fm-flow{max-height:92vh;overflow:auto}
  .fm-modal.fm-flow.wide{width:min(860px,100%)}
  .fm-flow label.fm-kicker{display:block;margin:14px 0 6px}
  .fm-flow .fm-input{width:100%;box-sizing:border-box}
  .fm-flow textarea.fm-input{height:auto;padding:10px 12px;line-height:1.45;resize:vertical;font-family:inherit;font-size:13px}
  .fm-flow-list{display:grid;gap:8px;margin:12px 0}
  .fm-flow-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(2,6,23,.32)}
  .fm-flow-item.ok{border-color:rgba(34,197,94,.45);background:rgba(22,101,52,.18)}
  .fm-flow-item.off{opacity:.55}
  .fm-flow-item .grow{flex:1;min-width:0}
  .fm-flow-item strong{display:block;color:#f8fafc;font-size:13px}
  .fm-flow-item small{display:block;margin-top:2px;color:#93c5fd;font-size:11px;line-height:1.4}
  .fm-flow-item a{color:#86efac;cursor:pointer;text-decoration:underline;word-break:break-all}
  .fm-flow-item input[type=checkbox]{width:18px;height:18px;accent-color:#22c55e;flex:none}
  .fm-flow-btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .fm-flow-btns .fm-btn{min-height:34px;padding:0 12px;font-size:12px;border-radius:10px}
  .fm-flow-status{min-height:18px;margin-top:10px;font-size:12px;color:#bfdbfe}
  .fm-flow-status.err{color:#fecaca}
  .fm-flow-muted{color:#6b7280;font-size:12px;line-height:1.5}
  @media(max-width:700px){.fm-flow-item{flex-wrap:wrap}.fm-flow-btns{justify-content:flex-start}}
`;

// ───────────────────────────── utilitários ─────────────────────────────
const limpar = (v) => String(v ?? '').replace(/[ ​-‍﻿]/g, ' ').replace(/\s+/g, ' ').trim();
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slug(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sem-nome';
}
const hojeBr = () => new Date().toLocaleDateString('pt-BR', { timeZone: TZ });
const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const agoraBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : '');
function fmtCpf(v) {
  const d = soDigitos(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(v || '').trim();
}
const dataIso = (h, m) => String(h.infractionDate(m) || '').slice(0, 10);
const porDataInfracao = (h) => (a, b) => dataIso(h, a).localeCompare(dataIso(h, b)) || String(a.placa || '').localeCompare(String(b.placa || ''));
const numeroAuto = (m) => limpar(m.numero_auto_infracao || m.auto);

function usuario(ctx) {
  const u = ctx.opts?.user || ctx.opts?.auth?.user || window.AUTH?.user || null;
  return { id: UUID_RE.test(String(u?.id || '')) ? u.id : null, nome: u?.nome || u?.name || u?.email || '' };
}

function carregarScript(url, pronto, erro) {
  if (pronto()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => (pronto() ? resolve() : reject(new Error(erro)));
    s.onerror = () => reject(new Error(erro));
    document.head.appendChild(s);
  });
}
async function carregarJsPdf() {
  await carregarScript(JSPDF_URL, () => window.jspdf?.jsPDF, 'Não foi possível carregar o gerador de PDF.');
  return window.jspdf.jsPDF;
}
async function carregarPdfLib() {
  await carregarScript(PDFLIB_URL, () => window.PDFLib?.PDFDocument, 'Não foi possível carregar o editor de PDF.');
  return window.PDFLib;
}

function injetarEstilos() {
  if (document.getElementById('fm-fluxo-styles')) return;
  const st = document.createElement('style');
  st.id = 'fm-fluxo-styles';
  st.textContent = STYLES;
  document.head.appendChild(st);
}

let modalAtual = null;
function onKeyDown(ev) { if (ev.key === 'Escape') fecharModal(); }
function fecharModal() {
  if (!modalAtual) return;
  modalAtual.remove();
  modalAtual = null;
  document.removeEventListener('keydown', onKeyDown);
}
function abrirModal(html, { wide = false } = {}) {
  fecharModal();
  const el = document.createElement('div');
  el.className = 'fm-modal-backdrop';
  el.setAttribute('data-flow-modal', '1');
  el.innerHTML = `<div class="fm-modal fm-flow${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(el);
  el.addEventListener('mousedown', (ev) => { if (ev.target === el) fecharModal(); });
  el.querySelectorAll('[data-flow-close]').forEach((b) => b.addEventListener('click', fecharModal));
  document.addEventListener('keydown', onKeyDown);
  modalAtual = el;
  return el;
}

async function atualizarMultas(ctx, ids, payload) {
  const { error } = await ctx.opts.supabase.from('frotas_multas')
    .update({ ...payload, atualizado_em: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}
// Histórico por multa (frotas_multas_acoes). Falha aqui nunca derruba a ação principal.
async function registrarAcao(ctx, multaIds, acao, detalhe = null) {
  try {
    const nome = usuario(ctx).nome || null;
    const rows = multaIds.map((id) => ({ multa_id: String(id), acao, detalhe, usuario: nome }));
    await ctx.opts.supabase.from('frotas_multas_acoes').insert(rows);
  } catch (err) { console.warn('[multas] histórico não registrado:', err); }
}

// Contato (WhatsApp, CPF, empresa) do motorista: base de RH e, se faltar, o cadastro de motoristas da frota.
async function buscarContato(supabase, nome) {
  const out = { whatsapp: '', cpf: '', empresa: '' };
  const termo = limpar(nome).replace(/[%_]/g, ' ');
  if (!termo) return out;
  try {
    const { data } = await supabase.from('colaboradores_atuais')
      .select('nome,cpf,empresa,whatsapp,ativo').ilike('nome', termo).limit(5);
    const c = (data || []).find((x) => x.ativo) || (data || [])[0];
    if (c) { out.whatsapp = soDigitos(c.whatsapp); out.cpf = c.cpf || ''; out.empresa = limpar(c.empresa); }
  } catch (err) { console.warn('[multas] contato (colaboradores_atuais):', err); }
  if (!out.whatsapp || !out.cpf) {
    try {
      const { data } = await supabase.from('frotas_motoristas').select('nome,cpf,telefone').ilike('nome', termo).limit(1);
      const f = data?.[0];
      if (f) { out.whatsapp = out.whatsapp || soDigitos(f.telefone); out.cpf = out.cpf || f.cpf || ''; }
    } catch (err) { console.warn('[multas] contato (frotas_motoristas):', err); }
  }
  return out;
}
// DDI 55 quando vier só DDD+número; vazio se não parecer um telefone brasileiro.
function normalizarFone(v) {
  const d = soDigitos(v);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return '';
}

// ───────────────────────────── Notificar ─────────────────────────────
function montarMensagem(m, h) {
  const hora = h.infractionTimeReal(m);
  const valor = h.fmtMoney(h.first(m.valor_original, m.valor, m.valor_multa));
  const dados = [
    `MOTORISTA: ${limpar(m.motorista)}`,
    `ORGÃO AUTUADOR: ${limpar(m.orgao_autuador)}`,
    `PLACA: ${limpar(m.placa)}`,
    `DATA: ${h.fmtDate(h.infractionDate(m))}`,
    `HORA: ${hora || '—'}`,
    `LOCAL: ${limpar(m.local)}`,
    `MULTA: ${limpar(m.descricao)}`,
    `VALOR: ${valor}`,
    `AUT INFR: ${numeroAuto(m)}`,
  ];
  return `${dados.join('\n')}\n\n${MENSAGEM_PADRAO}`;
}

async function abrirNotificar(ctx, m) {
  const h = ctx.helpers;
  if (!limpar(m.motorista)) return h.toast('Defina o motorista antes de notificar.', true);
  const status = String(m.status_notificacao || '').toUpperCase();
  const jaNotificado = status === 'NOTIFICADO';
  const el = abrirModal(`
    <h3>Notificar motorista</h3>
    <p><strong>${h.esc(m.placa || '')}</strong> · ${h.esc(m.motorista)} · Auto ${h.esc(numeroAuto(m) || '—')}</p>
    ${jaNotificado ? `<div class="fm-note" style="margin:0 0 6px">Já notificado${m.notificado_em ? ` em ${h.esc(agoraBr(m.notificado_em))}` : ''}${m.notificado_por_nome ? ` por ${h.esc(m.notificado_por_nome)}` : ''}. Você pode enviar de novo.</div>` : ''}
    <label class="fm-kicker" for="fm-flow-fone">WhatsApp do motorista</label>
    <input id="fm-flow-fone" class="fm-input" data-flow-fone inputmode="tel" placeholder="(45) 99999-9999" autocomplete="off">
    <div class="fm-meta-line" data-flow-fone-info>Buscando o telefone no cadastro…</div>
    <label class="fm-kicker" for="fm-flow-msg">Mensagem</label>
    <textarea id="fm-flow-msg" class="fm-input" data-flow-msg rows="17" spellcheck="false"></textarea>
    <div class="fm-modal-foot">
      <button type="button" class="fm-btn soft" data-flow-close>Fechar</button>
      <button type="button" class="fm-btn info" data-flow-copiar>Copiar mensagem</button>
      <button type="button" class="fm-btn primary" data-flow-whats>Abrir no WhatsApp</button>
    </div>`);
  const ta = el.querySelector('[data-flow-msg]');
  const fone = el.querySelector('[data-flow-fone]');
  const info = el.querySelector('[data-flow-fone-info]');
  ta.value = montarMensagem(m, h);

  buscarContato(ctx.opts.supabase, m.motorista).then((c) => {
    if (!el.isConnected) return;
    if (c.whatsapp && !fone.value) fone.value = c.whatsapp;
    info.textContent = c.whatsapp
      ? 'Telefone preenchido a partir do cadastro de colaboradores. Confira antes de enviar.'
      : 'Telefone não encontrado no cadastro. Digite o número ou escolha o contato direto no WhatsApp.';
  });

  const salvar = async (payload, acao) => {
    try {
      await atualizarMultas(ctx, [m.id], payload);
      await registrarAcao(ctx, [m.id], acao, { fone: normalizarFone(fone.value) || null });
      await ctx.reload();
    } catch (err) {
      h.toast(`Mensagem pronta, mas não foi possível registrar o status: ${err?.message || err}`, true);
    }
  };

  el.querySelector('[data-flow-copiar]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.select(); document.execCommand('copy'); }
    h.toast('Mensagem copiada.');
    if (!jaNotificado) await salvar({ status_notificacao: 'GERADA', mensagem_gerada: ta.value }, 'Notificar (mensagem copiada)');
  });

  el.querySelector('[data-flow-whats]').addEventListener('click', async () => {
    const numero = normalizarFone(fone.value);
    if (fone.value.trim() && !numero) return h.toast('Telefone inválido. Use DDD + número (ex.: 45 99999-9999).', true);
    const texto = encodeURIComponent(ta.value);
    // window.open precisa rodar direto no clique, antes de qualquer await, ou o navegador bloqueia o pop-up.
    window.open(`https://wa.me/${numero}?text=${texto}`, '_blank', 'noopener');
    const agora = new Date().toISOString();
    const u = usuario(ctx);
    const payload = {
      status_notificacao: 'NOTIFICADO', mensagem_gerada: ta.value,
      notificado_em: agora, condutor_notificado_em: agora, notificado_por_nome: u.nome || null,
    };
    if (u.id) payload.notificado_por = u.id;
    fecharModal();
    await salvar(payload, 'Notificar (WhatsApp)');
    h.toast('Multa marcada como notificada.');
  });
}

// ───────────────────────────── Termo de desconto em folha ─────────────────────────────
function montarPdfTermo(JsPDF, { nome, cpf, empresa, multas, h }) {
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const M = 20, W = 210, H = 297, CW = W - M * 2, LH = 4.6;
  let y = 20;
  const garantir = (preciso) => { if (y + preciso > H - 18) { doc.addPage(); y = 20; return true; } return false; };
  const paragrafo = (texto, { bold = false, gap = 4, size = 10 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const linhas = doc.splitTextToSize(texto, CW);
    garantir(linhas.length * LH + gap);
    linhas.forEach((l) => { doc.text(l, M, y); y += LH; });
    y += gap;
  };

  const total = multas.reduce((s, m) => s + h.moneyValue(h.first(m.valor_original, m.valor, m.valor_multa)), 0);
  const moeda = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  const plural = multas.length > 1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TERMO DE AUTORIZAÇÃO DE DESCONTO EM FOLHA DE PAGAMENTO', W / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${plural ? 'Infrações' : 'Infração'} de trânsito - veículo da empresa`, W / 2, y, { align: 'center' });
  y += 11;

  paragrafo(
    `Eu, ${nome.toUpperCase()}, portador(a) do CPF nº ${cpf ? fmtCpf(cpf) : '______________________'}, colaborador(a) da empresa ${empresa.toUpperCase()}, `
    + `condutor(a) do${plural ? 's' : ''} veículo${plural ? 's' : ''} identificado${plural ? 's' : ''} no quadro abaixo à época d${plural ? 'as infrações' : 'a infração'} de trânsito nele discriminad${plural ? 'as' : 'a'}, `
    + `reconheço que fui responsável ${plural ? 'pelas infrações' : 'pela infração'} e AUTORIZO, de forma livre e expressa, a EMPRESA a descontar de minha remuneração (folha de pagamento) `
    + `o valor total de ${moeda(total)}, correspondente a ${multas.length} multa${plural ? 's' : ''} de trânsito de minha responsabilidade.`,
    { gap: 6 },
  );

  // Quadro das multas (colunas em mm; soma = largura útil).
  const cols = [
    { t: 'Placa', w: 22 }, { t: 'Data / hora', w: 26 }, { t: 'Auto de infração', w: 34 },
    { t: 'Infração / local / órgão', w: 66 }, { t: 'Valor', w: 22, dir: true },
  ];
  const xs = []; cols.reduce((x, c) => { xs.push(x); return x + c.w; }, M);
  const cabecalho = () => {
    doc.setFillColor(232, 236, 240);
    doc.rect(M, y - 4.2, CW, 6.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    cols.forEach((c, i) => doc.text(c.t, c.dir ? xs[i] + c.w - 1.5 : xs[i] + 1.5, y, c.dir ? { align: 'right' } : undefined));
    y += 5;
  };
  garantir(30);
  cabecalho();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  multas.forEach((m) => {
    const hora = h.infractionTimeReal(m);
    const cel = [
      [limpar(m.placa)],
      [h.fmtDate(h.infractionDate(m)), hora || '-'],
      doc.splitTextToSize(numeroAuto(m) || '-', cols[2].w - 3),
      [
        ...doc.splitTextToSize(limpar(m.descricao) || '-', cols[3].w - 3),
        ...doc.splitTextToSize(limpar(m.local), cols[3].w - 3),
        ...doc.splitTextToSize(m.orgao_autuador ? `Órgão: ${limpar(m.orgao_autuador)}` : '', cols[3].w - 3),
      ].filter(Boolean),
      [moeda(h.moneyValue(h.first(m.valor_original, m.valor, m.valor_multa)))],
    ];
    const altura = Math.max(...cel.map((c) => c.length)) * 4 + 3;
    if (garantir(altura + 2)) { cabecalho(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); }
    cel.forEach((linhas, i) => linhas.forEach((l, k) => doc.text(l, cols[i].dir ? xs[i] + cols[i].w - 1.5 : xs[i] + 1.5, y + k * 4, cols[i].dir ? { align: 'right' } : undefined)));
    y += altura;
    doc.setDrawColor(210); doc.line(M, y - 2.2, M + CW, y - 2.2);
  });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(`TOTAL (${multas.length} multa${plural ? 's' : ''})`, M + 1.5, y + 2);
  doc.text(moeda(total), M + CW - 1.5, y + 2, { align: 'right' });
  y += 10;

  paragrafo('Forma de desconto: em ______ parcela(s) mensal(is) e consecutiva(s), a partir da folha de pagamento de ______ / ________.');
  paragrafo(
    'A presente autorização é dada nos termos do art. 462, §1º, da CLT e do Termo de Responsabilidade por Utilização de Veículo da Empresa por mim assinado. '
    + 'Comprometo-me ainda a respeitar a legislação de trânsito, utilizar os veículos da empresa com zelo e comunicar imediatamente qualquer ocorrência ou autuação recebida.',
  );
  paragrafo(`Declaro ter tido acesso ao${plural ? 's' : ''} auto${plural ? 's' : ''} de infração acima identificado${plural ? 's' : ''}.`);
  paragrafo('E por estar de pleno acordo, assino o presente instrumento.', { gap: 8 });

  garantir(52);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Cascavel PR, ${hojeBr()}`, W - M, y, { align: 'right' });
  y += 24;
  doc.line(M, y, M + 95, y);
  y += 5;
  doc.text('Assinatura do colaborador', M, y); y += 5;
  doc.text(nome.toUpperCase(), M, y); y += 5;
  doc.text(`CPF: ${cpf ? fmtCpf(cpf) : '______________________'}`, M, y);
  return doc;
}

async function gerarTermo(ctx, m) {
  const h = ctx.helpers;
  const nome = limpar(m.motorista);
  if (!nome) return h.toast('Defina o motorista antes de gerar o termo.', true);
  const membros = h.dossieMembers(m).slice().sort(porDataInfracao(h));
  const motoristas = new Set(membros.map((x) => h.norm(x.motorista)));
  if (motoristas.size > 1) {
    return h.toast('As multas deste grupo estão com motoristas diferentes. Ajuste o motorista ou desfaça o grupo antes de gerar o termo.', true);
  }
  h.toast('Gerando termo…');
  const [JsPDF, contato] = await Promise.all([carregarJsPdf(), buscarContato(ctx.opts.supabase, nome)]);
  const doc = montarPdfTermo(JsPDF, {
    nome, cpf: contato.cpf, empresa: contato.empresa || limpar(m.empresa) || 'EMPRESA', multas: membros, h,
  });
  doc.save(`termo-desconto-multa-${slug(nome)}-${hojeIso()}.pdf`);
  h.toast(`Termo gerado com ${membros.length} multa${membros.length > 1 ? 's' : ''}.`);
  const ids = membros.map((x) => x.id);
  try {
    await atualizarMultas(ctx, ids, { termo_gerado_em: new Date().toISOString(), termo_gerado_por_nome: usuario(ctx).nome || null });
    await registrarAcao(ctx, ids, 'Termo', { multas: ids.length });
    await ctx.reload();
  } catch (err) {
    h.toast(`PDF baixado, mas não foi possível registrar a geração do termo: ${err?.message || err}`, true);
  }
}

// ───────────────────────────── Agrupar ─────────────────────────────
function abrirAgrupar(ctx, m) {
  const h = ctx.helpers;
  const nome = limpar(m.motorista);
  if (!nome) return h.toast('Defina o motorista antes de agrupar as multas.', true);
  const alvo = h.norm(nome);
  const grupoAtual = m.grupo_id || null;
  // Quem já está no grupo sempre aparece (mesmo arquivada/paga ou com outro motorista), senão
  // o salvar o tiraria do grupo sem o usuário ver. Para entrar: mesmo condutor e multa em aberto.
  const elegivel = (x) => x.id !== m.id && ((grupoAtual && x.grupo_id === grupoAtual)
    || (h.norm(x.motorista) === alvo && !h.isArchived(x) && !['paga', 'cancelada'].includes(h.statusKind(x))));
  const candidatos = ctx.state.multas.filter(elegivel).sort(porDataInfracao(h)).reverse();
  const linha = (x, fixa) => {
    const noGrupo = fixa || (grupoAtual && x.grupo_id === grupoAtual);
    const outroGrupo = !fixa && x.grupo_id && x.grupo_id !== grupoAtual;
    const hora = h.infractionTimeReal(x);
    return `<label class="fm-flow-item${noGrupo ? ' ok' : ''}">
      <input type="checkbox" data-flow-chk="${x.id}" ${noGrupo ? 'checked' : ''} ${fixa ? 'disabled' : ''}>
      <div class="grow"><strong>${h.esc(x.placa || '')} · Auto ${h.esc(numeroAuto(x) || '—')}${fixa ? ' (esta multa)' : ''}</strong>
      <small>${h.esc(h.fmtDate(h.infractionDate(x)))}${hora ? ' ' + h.esc(hora) : ''} · ${h.esc(limpar(x.descricao))} · ${h.esc(h.fmtMoney(h.first(x.valor_original, x.valor, x.valor_multa)))}${outroGrupo ? ' · já agrupada com outras multas (sai do grupo atual)' : ''}</small></div>
    </label>`;
  };
  const el = abrirModal(`
    <h3>Agrupar multas</h3>
    <p>Condutor: <strong>${h.esc(nome)}</strong>. Marque as multas que entram no mesmo termo de desconto em folha e no mesmo dossiê de anexos.</p>
    <div class="fm-flow-list">${linha(m, true)}${candidatos.map((x) => linha(x, false)).join('')}</div>
    ${candidatos.length ? '' : '<div class="fm-flow-muted">Este condutor não tem outras multas em aberto para agrupar.</div>'}
    <div class="fm-flow-status" data-flow-status></div>
    <div class="fm-modal-foot">
      <button type="button" class="fm-btn soft" data-flow-close>Cancelar</button>
      <button type="button" class="fm-btn primary" data-flow-salvar>Salvar grupo</button>
    </div>`, { wide: true });
  const status = el.querySelector('[data-flow-status]');
  el.querySelector('[data-flow-salvar]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const sel = new Set([m.id]);
    el.querySelectorAll('[data-flow-chk]:checked').forEach((c) => sel.add(c.dataset.flowChk));
    btn.disabled = true;
    try {
      const n = await salvarAgrupamento(ctx, m, sel);
      fecharModal();
      h.toast(n < 0 ? 'Nenhuma alteração no grupo.' : n ? `Grupo salvo com ${n} multas.` : 'Multa desagrupada.');
    } catch (err) {
      status.className = 'fm-flow-status err';
      status.textContent = err?.message || String(err);
      btn.disabled = false;
    }
  });
}

async function salvarAgrupamento(ctx, m, selecionados) {
  const h = ctx.helpers;
  const todas = ctx.state.multas;
  const porId = new Map(todas.map((x) => [x.id, x]));
  const grupoAtual = m.grupo_id || null;
  const grupoNovo = selecionados.size >= 2 ? (grupoAtual || crypto.randomUUID()) : null;

  // novo grupo_id só para as multas afetadas (null = avulsa)
  const novo = new Map();
  (grupoAtual ? todas.filter((x) => x.grupo_id === grupoAtual) : [m])
    .forEach((x) => { if (!selecionados.has(x.id)) novo.set(x.id, null); });
  selecionados.forEach((id) => novo.set(id, grupoNovo));
  // grupos de onde saíram multas não podem sobrar com um único membro
  const origens = new Set();
  selecionados.forEach((id) => { const g = porId.get(id)?.grupo_id; if (g && g !== grupoNovo) origens.add(g); });
  origens.forEach((g) => {
    const resto = todas.filter((x) => x.grupo_id === g && !novo.has(x.id));
    if (resto.length === 1) novo.set(resto[0].id, null);
  });

  const mudancas = [...novo].filter(([id, g]) => (porId.get(id)?.grupo_id || null) !== g);
  if (!mudancas.length) return -1;

  // Termo assinado / PDF único valem para o dossiê: não deixa mudar o grupo por baixo deles.
  const chaves = new Set([grupoAtual, grupoNovo].filter(Boolean));
  mudancas.forEach(([id]) => chaves.add(h.dossieKey(porId.get(id))));
  if ([...chaves].some((k) => (ctx.state.anexosPorDossie.get(k) || []).length)) {
    throw new Error('Este grupo já tem termo assinado ou PDF único anexado. Remova esses anexos (ação Anexos) antes de alterar o grupo.');
  }

  const porGrupo = new Map();
  mudancas.forEach(([id, g]) => { const k = g || ''; if (!porGrupo.has(k)) porGrupo.set(k, []); porGrupo.get(k).push(id); });
  for (const [g, ids] of porGrupo) await atualizarMultas(ctx, ids, { grupo_id: g || null });
  await registrarAcao(ctx, [...novo.keys()], 'Agrupar', { grupo_id: grupoNovo, multas: selecionados.size });
  await ctx.reload();
  return grupoNovo ? selecionados.size : 0;
}

// ───────────────────────────── Anexos ─────────────────────────────
function tipoArquivo(file) {
  const t = String(file.type || '').toLowerCase();
  const n = String(file.name || '').toLowerCase();
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/^image\/(jpeg|png|webp)$/.test(t) || /\.(jpe?g|png|webp)$/.test(n)) return 'img';
  return '';
}
// Fotos viram JPEG (corrige a rotação do celular, aceita WebP e reduz o tamanho).
async function prepararArquivo(file) {
  const tipo = tipoArquivo(file);
  if (!tipo) throw new Error('Formato não suportado. Envie PDF, JPG ou PNG.');
  if (file.size > MAX_BYTES) throw new Error('Arquivo maior que 20 MB.');
  if (tipo === 'pdf') return { blob: file, mime: 'application/pdf', ext: 'pdf' };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, 2600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.88));
    if (blob) return { blob, mime: 'image/jpeg', ext: 'jpg' };
  } catch (err) { console.warn('[multas] conversão da imagem falhou, usando o arquivo original:', err); }
  if (/jpe?g/i.test(file.type || file.name)) return { blob: file, mime: 'image/jpeg', ext: 'jpg' };
  if (/png/i.test(file.type || file.name)) return { blob: file, mime: 'image/png', ext: 'png' };
  throw new Error('Não foi possível ler a imagem. Envie em PDF, JPG ou PNG.');
}

async function urlAssinada(ctx, anexo, baixar = false) {
  const { data, error } = await ctx.opts.supabase.storage.from(anexo.storage_bucket || BUCKET)
    .createSignedUrl(anexo.storage_path, 3600, baixar ? { download: anexo.nome_arquivo || true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
async function removerObjeto(ctx, anexo) {
  try { await ctx.opts.supabase.storage.from(anexo.storage_bucket || BUCKET).remove([anexo.storage_path]); }
  catch (err) { console.warn('[multas] objeto não removido do storage:', err); }
}
async function apagarLinha(ctx, anexo) {
  const { error } = await ctx.opts.supabase.from('frotas_multas_anexos').delete().eq('id', anexo.id);
  if (error) throw error;
}
async function apagarAnexo(ctx, anexo) {
  await apagarLinha(ctx, anexo);
  await removerObjeto(ctx, anexo);
}

// Pasta no bucket: <motorista>/<ano>/ ; o PDF único fica nela e os arquivos enviados em originais/.
function pastaDoDossie(h, membros) {
  const nome = limpar(membros[0]?.motorista);
  const ano = dataIso(h, membros[0]).slice(0, 4) || hojeIso().slice(0, 4);
  return { nome, ano, pasta: `${slug(nome)}/${ano}` };
}

async function enviarAnexo(ctx, m, alvo, file) {
  const h = ctx.helpers;
  const sb = ctx.opts.supabase;
  const membros = h.dossieMembers(m).slice().sort(porDataInfracao(h));
  const chave = h.dossieKey(m);
  const { pasta } = pastaDoDossie(h, membros);
  const { blob, mime, ext } = await prepararArquivo(file);

  const ehAuto = alvo.startsWith('auto:');
  const multaId = ehAuto ? alvo.slice(5) : null;
  const alvoMulta = ehAuto ? membros.find((x) => x.id === multaId) : null;
  if (ehAuto && !alvoMulta) throw new Error('Multa do auto não localizada neste grupo.');
  const ref = ehAuto ? slug(numeroAuto(alvoMulta) || alvoMulta.id) : String(chave).slice(0, 8);
  const path = `${pasta}/originais/${ehAuto ? 'auto' : 'termo-assinado'}-${ref}-${Date.now()}.${ext}`;

  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (up.error) throw up.error;

  // substitui o anexo anterior do mesmo tipo e invalida o PDF único (fica desatualizado)
  const anteriores = ehAuto
    ? [ctx.state.anexosPorMulta.get(multaId)].filter(Boolean)
    : (ctx.state.anexosPorDossie.get(chave) || []).filter((a) => a.tipo === 'termo_assinado');
  const consolidados = (ctx.state.anexosPorDossie.get(chave) || []).filter((a) => a.tipo === 'consolidado');
  const velhos = [...anteriores, ...consolidados];
  try {
    // Linhas antigas saem antes (índice único por tipo); os arquivos antigos só são apagados
    // depois que o novo anexo está gravado, para não perder nada se o insert falhar.
    for (const a of velhos) await apagarLinha(ctx, a);
    const u = usuario(ctx);
    const { error } = await sb.from('frotas_multas_anexos').insert({
      tipo: ehAuto ? 'auto_infracao' : 'termo_assinado',
      multa_id: ehAuto ? multaId : null,
      dossie_id: ehAuto ? null : chave,
      storage_bucket: BUCKET, storage_path: path,
      nome_arquivo: file.name || `${ref}.${ext}`, mime_type: mime, tamanho_bytes: blob.size,
      criado_por_nome: u.nome || null,
    });
    if (error) throw error;
  } catch (err) {
    await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    throw err;
  }
  await Promise.all(velhos.map((a) => removerObjeto(ctx, a)));
  await registrarAcao(ctx, [ehAuto ? multaId : m.id], ehAuto ? 'Anexo (auto de infração)' : 'Anexo (termo assinado)', { arquivo: file.name || null });
}

async function paginasDoAnexo(PDFLib, out, sb, anexo) {
  const { data, error } = await sb.storage.from(anexo.storage_bucket || BUCKET).download(anexo.storage_path);
  if (error) throw error;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (anexo.mime_type === 'application/pdf') {
    const origem = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    (await out.copyPages(origem, origem.getPageIndices())).forEach((p) => out.addPage(p));
    return;
  }
  const img = anexo.mime_type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const [pw, ph] = img.width > img.height ? [841.89, 595.28] : [595.28, 841.89];
  const margem = 24;
  const esc = Math.min((pw - margem * 2) / img.width, (ph - margem * 2) / img.height);
  const w = img.width * esc, hh = img.height * esc;
  out.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
}

// Título do arquivo no Drive: DATA - PLACA - CONDUTOR - AUTO (dd-mm-aaaa). Num grupo, datas,
// placas e autos distintos entram juntos separados por "+".
function tituloDossie(h, membros) {
  const lim = (s) => limpar(s).replace(/[\\/]+/g, '-');
  const unicos = (arr) => [...new Set(arr.filter(Boolean))];
  const datas = unicos(membros.map((x) => (dataIso(h, x) || hojeIso()).split('-').reverse().join('-')));
  const placas = unicos(membros.map((x) => lim(x.placa).toUpperCase()));
  const autos = unicos(membros.map((x) => lim(numeroAuto(x))));
  const condutor = lim(membros[0]?.motorista).toUpperCase();
  const monta = (a) => [datas.join('+'), placas.join('+'), condutor, a.join('+')].join(' - ');
  let titulo = monta(autos);
  if (titulo.length > 180 && autos.length > 1) titulo = monta([`${autos[0]}+${autos.length - 1}`]);
  return titulo.slice(0, 200);
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('Não foi possível ler o PDF para enviar ao Drive.'));
    r.readAsDataURL(blob);
  });
}

async function chamarAppsScript(payload) {
  const url = String(window.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || DEFAULT_GAS_URL).trim();
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  } catch (err) {
    console.warn('[multas] Apps Script inacessível:', err);
    throw new Error('Não foi possível falar com o Apps Script do Drive (sem conexão ou bloqueado).');
  }
  let json = null;
  try { json = JSON.parse(await resp.text()); } catch { /* resposta que não é JSON */ }
  if (!json) throw new Error(`O Apps Script respondeu algo que não é JSON (HTTP ${resp.status}): a ação ${ACAO_DRIVE} provavelmente ainda não foi instalada nele.`);
  if (!json.ok) throw new Error(json.message || json.error || `O Apps Script recusou a ação ${ACAO_DRIVE}.`);
  return json;
}

// Salva o PDF único na subpasta do condutor (mesma pasta das notificações de excesso de velocidade).
async function enviarParaDrive(h, membros, blob) {
  if (blob.size > MAX_DRIVE_BYTES) throw new Error('PDF maior que 25 MB: não enviado ao Drive.');
  const titulo = tituloDossie(h, membros);
  const r = await chamarAppsScript({
    action: ACAO_DRIVE,
    parentFolderId: PASTA_MAE_DRIVE_ID,
    driverName: limpar(membros[0].motorista),
    fileName: `${titulo}.pdf`,
    mimeType: 'application/pdf',
    base64: await blobParaBase64(blob),
    replaceExisting: true,
    createFolderIfMissing: true,
  });
  if (!r.fileId && !r.fileUrl) throw new Error('O Apps Script não devolveu o arquivo salvo.');
  return { titulo, fileId: r.fileId || null, fileUrl: r.fileUrl || '', pasta: r.folderName || '' };
}
async function registrarDrive(ctx, anexoId, info) {
  const { error } = await ctx.opts.supabase.from('frotas_multas_anexos').update({
    drive_file_id: info.fileId, drive_url: info.fileUrl || null, drive_pasta: info.pasta || null,
    drive_enviado_em: new Date().toISOString(),
  }).eq('id', anexoId);
  if (error) throw error;
}
async function reenviarDrive(ctx, multaId) {
  const h = ctx.helpers;
  const m = ctx.state.multas.find((x) => x.id === multaId);
  const membros = h.dossieMembers(m).slice().sort(porDataInfracao(h));
  const cons = (ctx.state.anexosPorDossie.get(h.dossieKey(m)) || []).find((a) => a.tipo === 'consolidado');
  if (!cons) throw new Error('Gere o PDF único antes de enviar ao Drive.');
  const { data, error } = await ctx.opts.supabase.storage.from(cons.storage_bucket || BUCKET).download(cons.storage_path);
  if (error) throw error;
  const info = await enviarParaDrive(h, membros, data);
  await registrarDrive(ctx, cons.id, info);
  await registrarAcao(ctx, membros.map((x) => x.id), 'Anexo (enviado ao Drive)', { pasta: info.pasta, arquivo: `${info.titulo}.pdf` });
  return info;
}

// Junta termo assinado + autos num único PDF, guarda a cópia no painel e envia à pasta do condutor no Drive.
async function consolidar(ctx, multaId) {
  const h = ctx.helpers;
  const sb = ctx.opts.supabase;
  const m = ctx.state.multas.find((x) => x.id === multaId);
  const chave = h.dossieKey(m);
  const membros = h.dossieMembers(m).slice().sort(porDataInfracao(h));
  const termo = (ctx.state.anexosPorDossie.get(chave) || []).find((a) => a.tipo === 'termo_assinado');
  const autos = membros.map((x) => ctx.state.anexosPorMulta.get(x.id));
  if (!termo || autos.some((a) => !a)) return { gerado: false };

  const PDFLib = await carregarPdfLib();
  const out = await PDFLib.PDFDocument.create();
  for (const anexo of [termo, ...autos]) await paginasDoAnexo(PDFLib, out, sb, anexo);
  const bytes = await out.save();

  const { pasta } = pastaDoDossie(h, membros);
  const placas = [...new Set(membros.map((x) => slug(x.placa)))].join('-');
  const auto1 = slug(numeroAuto(membros[0]) || membros[0].id);
  const nomeArq = `${dataIso(h, membros[0]) || hojeIso()}_${placas}_${auto1}${membros.length > 1 ? `-mais-${membros.length - 1}` : ''}.pdf`;
  const path = `${pasta}/${nomeArq}`;
  const blob = new Blob([bytes], { type: 'application/pdf' });

  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw up.error;
  const antigos = (ctx.state.anexosPorDossie.get(chave) || []).filter((a) => a.tipo === 'consolidado');
  for (const a of antigos) { const { error } = await sb.from('frotas_multas_anexos').delete().eq('id', a.id); if (error) throw error; if (a.storage_path !== path) await removerObjeto(ctx, a); }
  const titulo = `${tituloDossie(h, membros)}.pdf`;
  const { data: novo, error } = await sb.from('frotas_multas_anexos').insert({
    tipo: 'consolidado', dossie_id: chave, storage_bucket: BUCKET, storage_path: path,
    nome_arquivo: titulo, mime_type: 'application/pdf', tamanho_bytes: blob.size, criado_por_nome: usuario(ctx).nome || null,
  }).select('id').single();
  if (error) throw error;
  await registrarAcao(ctx, membros.map((x) => x.id), 'Anexo (PDF único gerado)', { pasta, arquivo: titulo });

  // A cópia no painel já está gravada; a falha do Drive não desfaz nada e pode ser reenviada depois.
  try {
    const drive = await enviarParaDrive(h, membros, blob);
    await registrarDrive(ctx, novo.id, drive);
    await registrarAcao(ctx, membros.map((x) => x.id), 'Anexo (enviado ao Drive)', { pasta: drive.pasta, arquivo: `${drive.titulo}.pdf` });
    return { gerado: true, drive, erroDrive: '' };
  } catch (err) {
    console.warn('[multas] envio ao Drive falhou:', err);
    return { gerado: true, drive: null, erroDrive: err?.message || String(err) };
  }
}

// Mensagem final do modal depois de juntar os arquivos (e tentar o Drive).
function resultadoConsolidacao(h, r) {
  if (!r.gerado) return null;
  if (r.erroDrive) {
    h.toast('PDF único gerado, mas não foi enviado ao Drive.', true);
    return { aviso: `PDF único gerado e guardado no painel, mas não foi enviado ao Drive: ${r.erroDrive} Use “Enviar ao Drive” para tentar de novo.`, erro: true };
  }
  h.toast(`PDF único salvo no Drive (${r.drive.pasta || 'pasta do condutor'}).`);
  return { aviso: `Salvo no Drive, pasta ${r.drive.pasta || 'do condutor'}: ${r.drive.titulo}.pdf` };
}

function abrirAnexos(ctx, multaId) {
  const h = ctx.helpers;
  const inicial = ctx.state.multas.find((x) => x.id === multaId);
  if (!limpar(inicial?.motorista)) return h.toast('Defina o motorista antes de anexar: os arquivos ficam na pasta dele.', true);
  if (ctx.state.anexosIndisponiveis) {
    return h.toast('A tabela de anexos ainda não existe no banco (migration pendente).', true);
  }
  const el = abrirModal('<div class="fm-flow-muted">Carregando…</div>', { wide: true });
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
  input.hidden = true;
  el.appendChild(input);
  let ocupado = false;
  let alvoUpload = '';

  const status = (txt, erro = false) => {
    const s = el.querySelector('[data-flow-status]');
    if (s) { s.textContent = txt; s.className = `fm-flow-status${erro ? ' err' : ''}`; }
  };
  const executar = async (txt, fn) => {
    if (ocupado) return;
    ocupado = true;
    el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    status(txt);
    try {
      const r = await fn();
      await ctx.reloadAnexos(); desenhar();
      if (r?.aviso) status(r.aviso, Boolean(r.erro)); // o redesenho limpa a linha de status
    } catch (err) { console.error('[multas] anexos:', err); await ctx.reloadAnexos().catch(() => {}); desenhar(); status(err?.message || String(err), true); }
    finally { ocupado = false; el.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  };
  const abrirArquivo = async (anexo, baixar) => {
    try { window.open(await urlAssinada(ctx, anexo, baixar), '_blank', 'noopener'); }
    catch (err) { status(err?.message || String(err), true); }
  };

  function desenhar() {
    if (!el.isConnected) return;
    const m = ctx.state.multas.find((x) => x.id === multaId);
    if (!m) return fecharModal();
    const membros = h.dossieMembers(m).slice().sort(porDataInfracao(h));
    const chave = h.dossieKey(m);
    const doss = ctx.state.anexosPorDossie.get(chave) || [];
    const termo = doss.find((a) => a.tipo === 'termo_assinado');
    const cons = doss.find((a) => a.tipo === 'consolidado');
    const completo = Boolean(termo) && membros.every((x) => ctx.state.anexosPorMulta.has(x.id));
    const { pasta } = pastaDoDossie(h, membros);
    const botoes = (anexo, alvo) => `<div class="fm-flow-btns">
      <button type="button" class="fm-btn ${anexo ? 'soft' : 'primary'}" data-flow-up="${alvo}">${anexo ? 'Substituir' : 'Anexar'}</button>
      ${anexo ? `<button type="button" class="fm-btn danger" data-flow-del="${anexo.id}">Remover</button>` : ''}</div>`;
    const arquivo = (a) => (a ? `<a data-flow-abrir="${a.id}" title="Abrir">${h.esc(a.nome_arquivo || 'arquivo')}</a>` : '<span class="fm-flow-muted">não enviado</span>');

    const linhasAutos = membros.map((x) => {
      const a = ctx.state.anexosPorMulta.get(x.id);
      const hora = h.infractionTimeReal(x);
      return `<div class="fm-flow-item${a ? ' ok' : ''}">
        <div class="grow"><strong>Auto de infração · ${h.esc(x.placa || '')}</strong>
        <small>Auto ${h.esc(numeroAuto(x) || '—')} · ${h.esc(h.fmtDate(h.infractionDate(x)))}${hora ? ' ' + h.esc(hora) : ''} · ${h.esc(h.fmtMoney(h.first(x.valor_original, x.valor, x.valor_multa)))}</small>
        <small>${arquivo(a)}</small></div>${botoes(a, 'auto:' + x.id)}</div>`;
    }).join('');

    el.innerHTML = `<div class="fm-modal fm-flow wide" role="dialog" aria-modal="true">
      <h3>Anexos da multa</h3>
      <p><strong>${h.esc(limpar(m.motorista))}</strong> · ${membros.length} multa${membros.length > 1 ? 's' : ''} no dossiê. Anexe o auto de infração de cada multa e o termo de desconto assinado; com todos enviados o painel junta tudo num único PDF e salva na pasta do condutor no Drive (a mesma do excesso de velocidade).</p>
      <div class="fm-flow-list">
        ${linhasAutos}
        <div class="fm-flow-item${termo ? ' ok' : ''}">
          <div class="grow"><strong>Termo de desconto em folha assinado</strong>
          <small>${termo ? arquivo(termo) : 'Gere o termo (ícone de documento), colha a assinatura e anexe aqui.'}</small></div>${botoes(termo, 'termo')}
        </div>
        <div class="fm-flow-item${cons ? ' ok' : ''}">
          <div class="grow"><strong>PDF único (termo + autos)</strong>
          <small>${cons ? `${arquivo(cons)}<br>${cons.drive_url
            ? `Drive: <a data-flow-drive="${cons.id}" title="Abrir no Drive">abrir pasta do condutor${cons.drive_pasta ? ' — ' + h.esc(cons.drive_pasta) : ''}</a> · enviado em ${h.esc(agoraBr(cons.drive_enviado_em))}`
            : 'Drive: ainda não enviado para a pasta do condutor.'}<br>Cópia de segurança no painel: ${h.esc(BUCKET)}/${h.esc(pasta)}/`
            : (completo ? 'Todos os anexos enviados. Clique em “Gerar PDF único” se ele não foi criado.' : `Será gerado automaticamente quando todos os anexos forem enviados, com o título “${h.esc(tituloDossie(h, membros))}”.`)}</small></div>
          <div class="fm-flow-btns">
            ${cons ? `<button type="button" class="fm-btn info" data-flow-abrir="${cons.id}">Abrir</button><button type="button" class="fm-btn soft" data-flow-baixar="${cons.id}">Baixar</button><button type="button" class="fm-btn ${cons.drive_url ? 'soft' : 'primary'}" data-flow-drive-enviar>${cons.drive_url ? 'Reenviar ao Drive' : 'Enviar ao Drive'}</button>` : ''}
            ${completo ? `<button type="button" class="fm-btn soft" data-flow-gerar>${cons ? 'Gerar novamente' : 'Gerar PDF único'}</button>` : ''}
          </div>
        </div>
      </div>
      <div class="fm-flow-status" data-flow-status></div>
      <div class="fm-modal-foot"><button type="button" class="fm-btn soft" data-flow-close>Fechar</button></div>
    </div>`;
    el.appendChild(input);
    el.querySelectorAll('[data-flow-close]').forEach((b) => b.addEventListener('click', fecharModal));
    const todos = [...ctx.state.anexos];
    const achar = (id) => todos.find((a) => a.id === id);
    el.querySelectorAll('[data-flow-up]').forEach((b) => b.addEventListener('click', () => { alvoUpload = b.dataset.flowUp; input.value = ''; input.click(); }));
    el.querySelectorAll('[data-flow-del]').forEach((b) => b.addEventListener('click', () => {
      const a = achar(b.dataset.flowDel);
      if (!a || !window.confirm('Remover este anexo? O PDF único também será removido (se existir).')) return;
      executar('Removendo…', async () => {
        const stale = (ctx.state.anexosPorDossie.get(chave) || []).filter((x) => x.tipo === 'consolidado');
        for (const x of [a, ...stale.filter((c) => c.id !== a.id)]) await apagarAnexo(ctx, x);
      });
    }));
    el.querySelectorAll('[data-flow-abrir]').forEach((b) => b.addEventListener('click', () => { const a = achar(b.dataset.flowAbrir); if (a) abrirArquivo(a, false); }));
    el.querySelectorAll('[data-flow-baixar]').forEach((b) => b.addEventListener('click', () => { const a = achar(b.dataset.flowBaixar); if (a) abrirArquivo(a, true); }));
    el.querySelectorAll('[data-flow-drive]').forEach((b) => b.addEventListener('click', () => {
      const a = achar(b.dataset.flowDrive);
      if (a?.drive_url && /^https:\/\//.test(a.drive_url)) window.open(a.drive_url, '_blank', 'noopener');
    }));
    el.querySelector('[data-flow-drive-enviar]')?.addEventListener('click', () => executar('Enviando ao Drive…', async () => {
      const info = await reenviarDrive(ctx, multaId);
      return { aviso: `Salvo no Drive, pasta ${info.pasta || 'do condutor'}: ${info.titulo}.pdf` };
    }));
    el.querySelector('[data-flow-gerar]')?.addEventListener('click', () => executar('Juntando os arquivos em um único PDF…', async () => resultadoConsolidacao(h, await consolidar(ctx, multaId))));
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file || !alvoUpload) return;
    executar('Enviando arquivo…', async () => {
      await enviarAnexo(ctx, ctx.state.multas.find((x) => x.id === multaId), alvoUpload, file);
      await ctx.reloadAnexos();
      status('Arquivo enviado. Conferindo se já dá para juntar tudo…');
      return resultadoConsolidacao(h, await consolidar(ctx, multaId));
    });
  });

  desenhar();
}

// ───────────────────────────── instalação ─────────────────────────────
export function installMultasFluxo(container) {
  if (!container || container.__fmFluxo) return;
  container.__fmFluxo = true;
  injetarEstilos();
  const emAndamento = new Set();
  container.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-notificar],[data-termo],[data-agrupar],[data-anexos]');
    if (!btn || !container.contains(btn)) return;
    const ctx = window.FROTAS_MULTAS?.getContext?.();
    if (!ctx) return;
    const acao = ['notificar', 'termo', 'agrupar', 'anexos'].find((a) => btn.hasAttribute(`data-${a}`));
    const id = btn.getAttribute(`data-${acao}`);
    const m = ctx.state.multas.find((x) => String(x.id) === String(id));
    if (!m) return ctx.helpers.toast('Multa não localizada.', true);
    const chave = `${acao}:${id}`;
    if (emAndamento.has(chave)) return;
    emAndamento.add(chave);
    try {
      if (acao === 'notificar') await abrirNotificar(ctx, m);
      else if (acao === 'termo') await gerarTermo(ctx, m);
      else if (acao === 'agrupar') abrirAgrupar(ctx, m);
      else abrirAnexos(ctx, m.id);
    } catch (err) {
      console.error(`[multas] ${acao}:`, err);
      ctx.helpers.toast(err?.message || `Falha na ação ${acao}.`, true);
    } finally {
      emAndamento.delete(chave);
    }
  });
}

// Funções puras expostas só para os testes (tests/frotas-multas-fluxo.test.mjs).
export const __teste = { montarMensagem, normalizarFone, slug, limpar, tituloDossie, montarPdfTermo, MENSAGEM_PADRAO };
