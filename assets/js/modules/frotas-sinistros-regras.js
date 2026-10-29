// Frotas · Sinistros: regras puras (sem DOM e sem banco). Etapas, checklist de documentos, prazos, filtros e datas.
// O banco guarda os dados e valida a troca de etapa (trigger frotas_sinistros_fluxo); aqui fica o que a tela precisa decidir.

export const ETAPAS = [
  { id: 'preparando', label: 'Preparando documentos', curto: 'Preparando', tone: 'amber', avancar: 'Pedido enviado à corretora', dica: 'Reunir relato, fotos e documentos e mandar à corretora.' },
  { id: 'solicitado', label: 'Solicitado à corretora', curto: 'Solicitado', tone: 'blue', avancar: 'Corretora confirmou a abertura', dica: 'Pedido de abertura enviado; aguardando a corretora responder.' },
  { id: 'aberto', label: 'Aberto na seguradora', curto: 'Aberto', tone: 'purple', avancar: 'Veículo foi para a oficina', dica: 'A corretora confirmou que o sinistro foi aberto.' },
  { id: 'reparo', label: 'Em reparo', curto: 'Em reparo', tone: 'amber', avancar: 'Concluir sinistro', dica: 'Veículo na oficina indicada pela seguradora.' },
  { id: 'concluido', label: 'Concluído', curto: 'Concluído', tone: 'green', avancar: null, dica: 'Veículo entregue e sinistro encerrado.' },
];
export const ETAPA_CANCELADO = { id: 'cancelado', label: 'Cancelado', curto: 'Cancelado', tone: 'red', avancar: null, dica: '' };

export const CARIMBO_ETAPA = {
  preparando: 'created_at', solicitado: 'solicitado_corretora_em', aberto: 'aberto_seguradora_em', reparo: 'reparo_em', concluido: 'concluido_em', cancelado: 'cancelado_em',
};

export const etapaInfo = (id) => (id === 'cancelado' ? ETAPA_CANCELADO : ETAPAS.find((e) => e.id === id) || ETAPAS[0]);
export const encerrado = (etapa) => etapa === 'concluido' || etapa === 'cancelado';

// Próxima etapa do fluxo normal (null quando já está no fim ou foi cancelado).
export function proximaEtapa(etapa) {
  const i = ETAPAS.findIndex((e) => e.id === etapa);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
}

export function etapaAnterior(etapa) {
  const i = ETAPAS.findIndex((e) => e.id === etapa);
  return i > 0 ? ETAPAS[i - 1] : null;
}

// ── datas ──────────────────────────────────────────────────────────────────
const TZ = 'America/Sao_Paulo';

export function hojeISO(agora = new Date()) {
  return agora.toLocaleDateString('sv-SE', { timeZone: TZ });
}

// timestamptz do banco -> valor de <input type="datetime-local"> (hora de Brasília).
export function paraInputDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

// valor de <input type="datetime-local"> -> timestamptz (Brasília não tem horário de verão desde 2019: UTC-3).
export function deInputDataHora(valor) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(valor || '')) ? `${valor}:00-03:00` : null;
}

export const dataCurta = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: TZ });
};
export const dataHoraCurta = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const dataISOCurta = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

export const codigoSinistro = (s) => `SIN-${String(s?.numero ?? 0).padStart(4, '0')}`;

// ── permissão de edição (mesma conta do painel_has_module no banco) ─────────
const CODIGOS_EDICAO = ['frotas_sinistros', 'frotas_manutencao'];
const verdadeiro = (v) => ['true', 't', '1', 'yes', 'sim'].includes(String(v ?? '').toLowerCase());

export function podeEditarSinistros(auth) {
  if (auth?.user?.is_master) return true;
  return (auth?.modules || []).some((m) => {
    const codigo = String(m?.code || m?.codigo || '').toLowerCase();
    if (!CODIGOS_EDICAO.includes(codigo) || m?.can_view === false) return false;
    return ['can_edit', 'pode_editar', 'can_create', 'pode_criar', 'can_approve', 'pode_aprovar'].some((k) => verdadeiro(m?.[k]));
  });
}

// ── checklist ──────────────────────────────────────────────────────────────
const preenchido = (v) => v !== null && v !== undefined && String(v).trim() !== '';

const doDono = (lista, sinistroId, terceiroId) => lista.filter((x) => x.sinistro_id === sinistroId && (x.terceiro_id || null) === (terceiroId || null));

// Itens do checklist de UM dono: o veículo da empresa (terceiro = null) ou um terceiro.
// situacao: 'ok' (campo preenchido, arquivo anexado ou conferido à mão), 'dispensado' ou 'pendente'.
export function itensChecklist({ modelo, sinistro, terceiro = null, marcas = [], anexos = [] }) {
  const grupo = terceiro ? 'terceiro' : 'empresa';
  const dono = terceiro || sinistro;
  const marcasDono = doDono(marcas, sinistro.id, terceiro?.id);
  const anexosDono = doDono(anexos, sinistro.id, terceiro?.id);
  return (modelo || [])
    .filter((m) => m.ativo !== false && m.grupo === grupo && (!m.so_se_ferido || sinistro.houve_ferido))
    .sort((a, b) => (a.ordem - b.ordem) || String(a.codigo).localeCompare(String(b.codigo)))
    .map((m) => {
      const arquivos = anexosDono.filter((a) => a.item_codigo === m.codigo);
      const marca = marcasDono.find((x) => x.codigo === m.codigo) || null;
      const porCampo = Array.isArray(m.campos) && m.campos.length > 0 && m.campos.every((c) => preenchido(dono?.[c]));
      let situacao = 'pendente';
      let origem = null;
      if (marca?.status === 'dispensado') { situacao = 'dispensado'; origem = 'marca'; }
      else if (porCampo) { situacao = 'ok'; origem = 'campo'; }
      else if (arquivos.length) { situacao = 'ok'; origem = 'arquivo'; }
      else if (marca?.status === 'ok') { situacao = 'ok'; origem = 'marca'; }
      const obrigatorio = m.obrigatorio_quando === 'sempre' || (m.obrigatorio_quando === 'terceiro' && !!sinistro.houve_terceiro);
      return { ...m, situacao, origem, obrigatorio, arquivos, marca, porCampo: Array.isArray(m.campos) && m.campos.length > 0 };
    });
}

// Quanto falta para o sinistro estar pronto para a corretora: só conta o que é obrigatório.
export function resumoChecklist({ modelo, sinistro, terceiros = [], marcas = [], anexos = [] }) {
  const grupos = [{ terceiro: null, nome: null }, ...terceiros.filter((t) => t.sinistro_id === sinistro.id).map((t) => ({ terceiro: t, nome: t.nome || 'Terceiro' }))];
  let total = 0;
  let feitos = 0;
  const faltam = [];
  for (const g of grupos) {
    for (const item of itensChecklist({ modelo, sinistro, terceiro: g.terceiro, marcas, anexos })) {
      if (!item.obrigatorio) continue;
      total += 1;
      if (item.situacao === 'pendente') faltam.push({ codigo: item.codigo, rotulo: item.rotulo, quem: g.nome });
      else feitos += 1;
    }
  }
  return { total, feitos, faltam, pct: total ? Math.round((feitos / total) * 100) : 100 };
}

// ── agenda (próximo passo com prazo) ────────────────────────────────────────
export function prazoSituacao(sinistro, hoje = hojeISO()) {
  if (!sinistro || encerrado(sinistro.etapa) || !sinistro.proxima_acao_em) return null;
  const dia = String(sinistro.proxima_acao_em).slice(0, 10);
  if (dia < hoje) return 'vencido';
  if (dia === hoje) return 'hoje';
  const dias = Math.round((new Date(`${dia}T00:00:00Z`) - new Date(`${hoje}T00:00:00Z`)) / 86400000);
  return dias <= 3 ? 'proximo' : 'futuro';
}

// ── lista ──────────────────────────────────────────────────────────────────
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function contarPorFiltro(linhas) {
  const c = { todos: linhas.length, preparando: 0, solicitado: 0, aberto: 0, reparo: 0, concluido: 0, cancelado: 0, prazo: 0 };
  for (const l of linhas) {
    if (c[l.etapa] !== undefined) c[l.etapa] += 1;
    if (l.__prazo === 'vencido' || l.__prazo === 'hoje') c.prazo += 1;
  }
  return c;
}

// linhas = sinistros já enriquecidos pelo controlador (__veiculo, __prazo, __resumo).
export function filtrarSinistros(linhas, filtro = 'todos', busca = '') {
  let r = linhas;
  if (filtro === 'prazo') r = r.filter((l) => l.__prazo === 'vencido' || l.__prazo === 'hoje');
  else if (filtro && filtro !== 'todos') r = r.filter((l) => l.etapa === filtro);
  const q = norm(busca).trim();
  if (q) {
    r = r.filter((l) => norm([l.placa, l.condutor_nome, l.local_texto, l.protocolo, l.oficina_nome, l.seguradora, l.proxima_acao, codigoSinistro(l), l.__veiculo?.marca_modelo].join(' ')).includes(q));
  }
  return r;
}

// Em andamento primeiro (prazo mais próximo no topo), encerrados no fim (mais recentes primeiro).
export function ordenarSinistros(linhas) {
  const chave = (l) => (encerrado(l.etapa) ? 1 : 0);
  return [...linhas].sort((a, b) => {
    if (chave(a) !== chave(b)) return chave(a) - chave(b);
    if (!encerrado(a.etapa)) {
      const pa = a.proxima_acao_em || '9999-12-31';
      const pb = b.proxima_acao_em || '9999-12-31';
      if (pa !== pb) return pa < pb ? -1 : 1;
    }
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

// ── Drive ──────────────────────────────────────────────────────────────────
const limparNome = (v) => String(v ?? '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// Subpasta do sinistro dentro de SINISTROS: "SIN-0001 - ABC1D23" (o número não muda, então a pasta é sempre a mesma).
export const pastaDriveSinistro = (s) => limparNome(`${codigoSinistro(s)} - ${s?.placa || ''}`).replace(/ -$/, '');

// Nome do arquivo no Drive, já com o que ele é (para a corretora achar sem abrir): "CNH do colaborador - cnh.pdf",
// "Terceiro 1 (Carlos) - CNH do condutor - cnh.pdf", "Outros - foto.jpg".
export function nomeArquivoDrive({ anexo, modelo = [], terceiros = [] }) {
  const item = modelo.find((m) => m.codigo === anexo.item_codigo);
  const idx = anexo.terceiro_id ? terceiros.findIndex((t) => t.id === anexo.terceiro_id) : -1;
  const terc = anexo.terceiro_id ? `Terceiro ${idx >= 0 ? idx + 1 : ''}${terceiros[idx]?.nome ? ` (${terceiros[idx].nome})` : ''}`.replace(/\s+/g, ' ').trim() : '';
  const partes = [terc, item?.rotulo || 'Outros', anexo.nome_arquivo || 'arquivo'].filter(Boolean).map(limparNome);
  return partes.join(' - ').slice(0, 200);
}

export const driveEnviado = (anexo) => !!anexo?.drive_file_id;
