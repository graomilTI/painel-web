// Cenário de regressão da Manutenção (Corretiva) no navegador: abre a tela com dados simulados, percorre o fluxo clicando como o usuário
// e tira uma "foto" do DOM a cada passo. Rodando antes e depois de uma reorganização, as fotos têm de ser idênticas.
import { criarDb, criarSupabase, log } from './mock-supabase.js';

const AGORA = '2026-10-29T15:00:00-03:00';
const DataReal = Date;
globalThis.Date = class extends DataReal {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return new DataReal(AGORA).getTime(); }
};
const buscaReal = globalThis.fetch?.bind(globalThis);
globalThis.fetch = async (url, ...r) => (String(url).includes('ibge.gov.br') ? new Response('[]', { status: 200 }) : buscaReal(url, ...r));

const quieto = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function foto(nome) {
  const copia = document.body.cloneNode(true);
  copia.querySelectorAll('script,style,#dsToastHost,link').forEach((e) => e.remove());
  const html = copia.innerHTML.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  let h = 5381;
  for (let i = 0; i < html.length; i += 1) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return { nome, hash: h, tamanho: html.length, html };
}

const sel = (s, escopo = document) => escopo.querySelector(s);
// Espera o elemento aparecer (as telas carregam dados e desenham em seguida), até 2 s.
async function achar(s, escopo = document) {
  for (let i = 0; i < 40; i += 1) { const el = sel(s, escopo); if (el) return el; await quieto(50); }
  return null;
}
async function clicar(s, escopo = document) {
  const el = await achar(s, escopo);
  if (!el) throw new Error(`não achei ${s}`);
  el.click();
  await quieto();
}
async function digitar(s, valor, evento = 'input') {
  const el = await achar(s);
  if (!el) throw new Error(`não achei ${s}`);
  el.value = valor;
  el.dispatchEvent(new Event(evento, { bubbles: true }));
  if (evento === 'input') el.dispatchEvent(new Event('change', { bubbles: true }));
  await quieto(20);
}
async function marcar(s) { const el = await achar(s); if (!el) throw new Error(`não achei ${s}`); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); await quieto(20); }
async function anexar(s, nomeArquivo, conteudo, tipo = 'text/xml') {
  const el = await achar(s); if (!el) throw new Error(`não achei ${s}`);
  const dt = new DataTransfer(); dt.items.add(new File([conteudo], nomeArquivo, { type: tipo }));
  el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); await quieto(20);
}

const NFSE = '<CompNfse><Nfse><InfNfse><Numero>88</Numero><DataEmissao>2026-10-18T09:00:00</DataEmissao><ValorLiquidoNfse>800.00</ValorLiquidoNfse><PrestadorServico><RazaoSocial>OFICINA A LTDA</RazaoSocial></PrestadorServico></InfNfse></Nfse></CompNfse>';

export async function rodar(app) {
  const db = criarDb();
  const supabase = criarSupabase(db);
  await import('/assets/js/modules/frotas-manutencao.js');
  const passos = [];
  const f = (nome) => passos.push(foto(nome));
  const erros = [];
  window.__erros = erros; window.__log = log;
  window.addEventListener('error', (e) => erros.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => erros.push(String(e.reason?.message || e.reason)));

  await window.FROTAS_MANUTENCAO.openHome(app, { supabase, auth: { user: { is_master: true } } });
  await quieto(150);
  f('01 lista cotações');

  await clicar('[data-abrir="m1"]'); f('02 ficha aberta (cotação)');
  await clicar('[data-mc-acao="orcamento"][data-id="m1"]'); f('03 janela da cotação');
  await digitar('[data-o="fornecedor"]', 'Oficina A', 'change');
  await digitar('[data-o="valor_total"]', '820');
  await clicar('[data-acao="orc-itens-abrir"]'); f('04 itens dentro da cotação');
  await clicar('[data-acao="orc-itens-cancelar"]');
  await clicar('[data-acao="orc-salvar"]'); f('05 depois de salvar a cotação');

  await clicar('[data-mc-acao="comparar"][data-id="m1"]'); f('06 comparativo');
  await clicar('[data-acao="cmp-fechar"]');
  await clicar('[data-mc-acao="historico"][data-id="m1"]'); f('07 histórico');
  await clicar('[data-acao="hist-fechar"]');

  await clicar('[data-mc-acao="aprovar"][data-id="m1"]'); f('08 janela de aprovação');
  await marcar('[name="apr-uma"][value="o2"]'); f('09 aprovação com cotação escolhida');
  await marcar('[name="apr-modo"][value="varios"]'); f('10 aprovação por item');
  await clicar('[data-acao="apr-confirmar"]'); await quieto(120); f('11 depois de aprovar (vai para andamento)');

  await clicar('[data-filtro="andamento"]'); f('12 lista andamento');
  await clicar('[data-abrir="m2"]'); f('13 ficha em execução (ícones de nota)');
  await anexar('[data-nt-arquivo]', 'nfse.xml', NFSE);
  await clicar('[data-acao="nota-add"]'); await quieto(250); f('14 nota adicionada (lida do XML)');
  await clicar('[data-mc-acao="concluir"][data-id="m2"]'); f('15 formulário de conclusão');
  await digitar('[data-a="custo"]', '800'); await digitar('[data-a="km_execucao"]', '51000');
  await clicar('[data-acao="confirmar-conclusao"]'); await quieto(150); f('16 depois de concluir');

  await clicar('[data-filtro="nf"]').catch(() => {}); f('17 lista seguinte');
  const etapa = [...document.querySelectorAll('[data-filtro]')].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.filtro;
  passos.push({ nome: '17b etapa ativa', hash: 0, tamanho: 0, html: String(etapa) });
  for (const alvo of ['apagar', 'nf', 'concluido']) {
    await clicar(`[data-filtro="${alvo}"]`).catch(() => {});
    if (sel('[data-abrir="m3"]')) break;
  }
  await clicar('[data-abrir="m3"]'); f('18 ficha concluída (notas)');
  await clicar('[data-acao="notas-enviar"]'); f('19 confirmação de lançamento');
  await clicar('[data-ds-ok]'); await quieto(150); f('20 depois de enviar para lançamento');
  await clicar('[data-acao="notas-financeiro"]'); f('21 janela do Financeiro');
  await digitar('[data-fin-nota="n2"] [data-fin-dado="PIX"]', 'pix@b.com');
  await clicar('[data-acao="fin-confirmar"]'); await quieto(150); f('22 depois de enviar ao Financeiro');

  await clicar('[data-acao="nova"]'); f('23 nova manutenção');
  await clicar('[data-acao="fechar"]');
  f('24 final');

  return { passos, log: log.map((l) => l.join('|')), db: { manut: db.frotas_manutencoes.map((m) => `${m.id}:${m.status}:${JSON.stringify(m.escolha_itens)}`), orcs: db.frotas_manutencao_orcamentos.map((o) => `${o.id}:${o.fornecedor}:${o.valor_total}:${o.selecionado}`), notas: db.frotas_manutencao_notas.map((n) => `${n.id}:${n.numero}:${n.valor}:${!!n.enviada_em}:${n.pagamento_id}`) }, erros };
}
