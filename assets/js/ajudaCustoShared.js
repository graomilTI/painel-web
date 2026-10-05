// Ajuda de custo: pedaços compartilhados entre a aba do RH (Folha e Holerite >
// Ajuda de custo) e a tela do Financeiro (Financeiro > Ajuda de Custo).
//
// Mês de referência = competência. A ajuda é paga no dia 15 do mês de referência,
// e é com essa data (15/MM) que o agente lança Adiantamento + Comprovante no Caixa
// do GRM — mesma convenção do Bônus em Conferência.

export const CONTAS = { ifood: 'iFood', flash: 'Flash' };

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_COMPLETOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const IFOOD_CNPJ = '29.666.679/0001-34';
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

export const dinheiro = (v) => (v == null ? '-' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
export const arredonda = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function brDataIso(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
}

// 'YYYY-MM-01' para o mês (0-11) e ano.
export function competenciaIso(ano, mes) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

// Dia do pagamento e do lançamento no GRM: 15 do mês de referência.
export function dataPagamentoIso(competencia) {
  return `${String(competencia).slice(0, 7)}-15`;
}

// Hoje em Brasília (YYYY-MM-DD) — o servidor aplica a mesma regra em America/Sao_Paulo.
export function hojeBrasiliaIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// XLS só a partir do dia 15 do mês de referência (meses passados sempre liberados).
export function pagamentoLiberado(competencia, hoje = hojeBrasiliaIso()) {
  return hoje >= dataPagamentoIso(competencia);
}

export function competenciaAnterior(competencia) {
  const [y, m] = String(competencia).slice(0, 7).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function rotuloCompetencia(competencia) {
  const [y, m] = String(competencia).slice(0, 7).split('-').map(Number);
  return `${MESES_COMPLETOS[m - 1]} de ${y}`;
}

// ---------------------------------------------------------------------------
// Barra de meses (mesmo visual e comportamento da barra do Bônus em Conferência).
export function periodoStyle() {
  return `.ac-periodo{display:flex;align-items:center;gap:10px;margin:16px 0 14px;padding:11px 12px;border:1px solid rgba(110,231,183,.12);border-radius:14px;background:rgba(5,24,18,.72);overflow:hidden}
    .ac-year{display:flex;align-items:center;gap:6px;flex:0 0 auto}
    .ac-year button{width:32px;height:32px;border:1px solid rgba(110,231,183,.16);border-radius:9px;background:#071b15;color:#d8eee3;font-size:17px;cursor:pointer}
    .ac-year strong{min-width:48px;text-align:center;color:#f1faf6;font-size:13px}
    .ac-months{display:flex;gap:5px;min-width:0;overflow-x:auto;scrollbar-width:thin;padding-bottom:1px}
    .ac-month{min-width:54px;height:32px;border:1px solid transparent;border-radius:9px;background:transparent;color:#8ca79b;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer}
    .ac-month:hover{background:rgba(34,197,94,.05);color:#ccebdc}
    .ac-month.active{background:rgba(34,197,94,.14);border-color:rgba(74,222,128,.24);color:#68efaa}
    @media(max-width:760px){.ac-periodo{align-items:flex-start;flex-direction:column}.ac-months{width:100%}}`;
}

export function periodoHtml(id, ano, mes) {
  return `<div class="ac-periodo" id="${id}">
    <div class="ac-year">
      <button type="button" data-year-step="-1" aria-label="Ano anterior">‹</button>
      <strong>${ano}</strong>
      <button type="button" data-year-step="1" aria-label="Próximo ano">›</button>
    </div>
    <div class="ac-months">
      ${MESES.map((nome, i) => `<button class="ac-month ${i === mes ? 'active' : ''}" type="button" data-month="${i}">${nome}</button>`).join('')}
    </div>
  </div>`;
}

// `periodo` = { ano, mes } (mes 0-11); mexe nele e chama onChange().
export function bindPeriodo(root, periodo, onChange) {
  root.addEventListener('click', (event) => {
    const mesBtn = event.target.closest('[data-month]');
    const anoBtn = event.target.closest('[data-year-step]');
    if (!mesBtn && !anoBtn) return;
    if (mesBtn) periodo.mes = Number(mesBtn.dataset.month);
    if (anoBtn) periodo.ano += Number(anoBtn.dataset.yearStep);
    onChange();
  });
}

export function periodoAtual() {
  const [y, m] = hojeBrasiliaIso().split('-').map(Number);
  return { ano: y, mes: m - 1 };
}

// ---------------------------------------------------------------------------
// Planilhas no formato que o Financeiro já usa em Adiantamentos (PGTO_FLASH / PGTO_IFOOD).
export const FLASH_COLS = [
  { key: 'cpf', label: 'CPF' },
  { key: 'valor', label: 'Valor' },
];

export const IFOOD_COLS = [
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'nome', label: 'Nome' },
  { key: 'cpf', label: 'CPF' },
  { key: 'nascimento', label: 'Data de nascimento' },
  { key: 'email', label: 'Email' },
  { key: 'celular', label: 'Celular' },
  { key: 'centro_custo', label: 'Centro de custo' },
  { key: 'convencao', label: 'Convenção Coletiva' },
  { key: 'grupo_entrega', label: 'Grupo de entrega' },
  { key: 'matricula', label: 'Matricula' },
  { key: 'filtro', label: 'Filtro para relatorio de recarga' },
  { key: 'refeicao', label: 'Refeição (Aderente ao PAT)' },
  { key: 'alimentacao', label: 'Alimentação (Aderente ao PAT)' },
  { key: 'livre', label: 'Livre' },
];

const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

// rows: ajudas ({colaborador_nome, colaborador_cpf, conta, valor}). Soma por CPF dentro da
// plataforma, como o Financeiro já faz — uma pessoa com duas ajudas vira uma linha só.
// centroCusto: Map(cpf -> coordenação), opcional.
export function montarPlanilhas(rows, centroCusto = new Map()) {
  const flash = new Map();
  const ifood = new Map();
  const ignoradas = [];
  for (const row of rows || []) {
    // CPF exato (o banco só aceita 11 dígitos). Nada de completar com zeros: um CPF truncado
    // viraria um CPF de outra pessoa na planilha de pagamento.
    const cpf = soDigitos(row.colaborador_cpf);
    const valor = arredonda(row.valor);
    if (cpf.length !== 11 || !valor) { ignoradas.push(row); continue; }
    if (row.conta === 'flash') {
      if (!flash.has(cpf)) flash.set(cpf, { cpf, nome: row.colaborador_nome, valor: 0 });
      flash.get(cpf).valor = arredonda(flash.get(cpf).valor + valor);
    } else if (row.conta === 'ifood') {
      if (!ifood.has(cpf)) {
        ifood.set(cpf, {
          cnpj: IFOOD_CNPJ, nome: row.colaborador_nome, cpf, nascimento: '', email: '', celular: '',
          centro_custo: centroCusto.get(cpf) || '', convencao: '', grupo_entrega: '', matricula: '',
          filtro: '', refeicao: '', alimentacao: '', livre: 0,
        });
      }
      ifood.get(cpf).livre = arredonda(ifood.get(cpf).livre + valor);
    }
  }
  return {
    flash: [...flash.values()].sort(porNome),
    ifood: [...ifood.values()].sort(porNome),
    ignoradas,
  };
}

async function arquivoXlsx(nomeArquivo, nomePlanilha, linhas, colunas) {
  const XLSX = await import(XLSX_URL);
  const matriz = [colunas.map((c) => c.label), ...linhas.map((l) => colunas.map((c) => l[c.key]))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), nomePlanilha.slice(0, 31));
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return {
    filename: nomeArquivo,
    blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  };
}

// sufixo: data AAAAMMDD do arquivo (+ "_L2" etc. quando o lote não é o primeiro do mês).
export async function arquivosPlanilha(rows, centroCusto, sufixo) {
  const { flash, ifood, ignoradas } = montarPlanilhas(rows, centroCusto);
  const arquivos = [];
  if (flash.length) arquivos.push(await arquivoXlsx(`PGTO_FLASH_${sufixo}.xlsx`, 'PGTO_FLASH', flash, FLASH_COLS));
  if (ifood.length) arquivos.push(await arquivoXlsx(`PGTO_IFOOD_${sufixo}.xlsx`, 'PGTO_IFOOD', ifood, IFOOD_COLS));
  return { arquivos, totais: { flash: flash.length, ifood: ifood.length }, ignoradas };
}

// Painel com os links de download (mesmo comportamento do Financeiro > Adiantamentos):
// dispara os downloads sozinho, espaçados, e deixa os botões caso o navegador bloqueie.
export function mostrarDownloads(arquivos, titulo = 'Planilhas do pagamento') {
  document.getElementById('acDownloads')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acDownloads';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px';
  const card = document.createElement('div');
  card.style.cssText = 'width:min(520px,100%);background:#07111f;border:1px solid rgba(34,197,94,.45);border-radius:16px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e5edf7';
  const h = document.createElement('h3');
  h.textContent = titulo;
  h.style.margin = '0 0 6px';
  const p = document.createElement('p');
  p.textContent = `${arquivos.length} arquivo(s) criado(s). Os downloads iniciam automaticamente; se o navegador bloquear algum, use os botões abaixo.`;
  p.style.cssText = 'margin:0 0 16px;color:#aebdce;line-height:1.45';
  const lista = document.createElement('div');
  lista.style.cssText = 'display:grid;gap:10px';
  const urls = [];
  arquivos.forEach((arq) => {
    const url = URL.createObjectURL(arq.blob);
    urls.push(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = arq.filename;
    a.textContent = `Baixar ${arq.filename}`;
    a.style.cssText = 'display:block;padding:11px 14px;border-radius:10px;background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.35);color:#86efac;font-weight:700;text-decoration:none';
    lista.appendChild(a);
  });
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.textContent = 'Fechar';
  fechar.style.cssText = 'margin-top:16px;width:100%;padding:11px 14px;border-radius:10px;border:1px solid rgba(148,163,184,.32);background:rgba(255,255,255,.05);color:#e5edf7;font-weight:700;cursor:pointer';
  fechar.onclick = () => { urls.forEach((u) => URL.revokeObjectURL(u)); overlay.remove(); };
  card.append(h, p, lista, fechar);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  Array.from(lista.querySelectorAll('a')).forEach((a, i) => setTimeout(() => a.click(), i * 900));
}
