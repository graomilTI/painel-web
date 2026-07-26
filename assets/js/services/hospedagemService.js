// ============================================================================
// hospedagemService — serviço de domínio de Hospedagem (plano seção 8)
//
// 8.1 hotéis com geocodificação sem chave Google (Nominatim/OSM);
// 8.2 alojamentos com contas e matrículas; 8.3 reservas com ações
// (incluir, estender, checkout, extras, pagar); 8.4 relatório consolidado.
// ============================================================================

import { listar, inserir, atualizar } from '../core/supabaseService.js';
import { registrarAuditoria } from '../core/audit.js';
import { lancarPagamento } from './financeiroService.js';

const MODULO = 'hospedagem';

// ── 8.1 Geocodificação sem chave (Nominatim / OpenStreetMap) ─────────────────
export async function geocodificar(endereco, cidade = '', estado = '') {
  const consulta = [endereco, cidade, estado, 'Brasil'].filter(Boolean).join(', ');
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consulta)}`;
  try {
    const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
    const dados = await resposta.json();
    if (dados?.[0]) {
      return { latitude: Number(dados[0].lat), longitude: Number(dados[0].lon), origem: 'nominatim' };
    }
  } catch { /* geocodificação é acessória: não bloqueia o cadastro */ }
  return { latitude: null, longitude: null, origem: null };
}

// ── 8.1 Hotéis ───────────────────────────────────────────────────────────────
export async function listarHoteis({ pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('hospedagem_hoteis', {
    busca: busca ? { colunas: ['nome', 'cidade', 'cnpj'], termo: busca } : null,
    ordenar: [{ coluna: 'nome', asc: true }],
    pagina, porPagina, chaveCorrida: 'hosp:hoteis',
  });
}

export async function salvarHotel(payload, { usuario = null } = {}) {
  if (!payload.nome) throw new Error('Nome do hotel é obrigatório.');
  if ((payload.latitude == null || payload.longitude == null) && payload.endereco) {
    const geo = await geocodificar(payload.endereco, payload.cidade, payload.estado);
    payload.latitude = payload.latitude ?? geo.latitude;
    payload.longitude = payload.longitude ?? geo.longitude;
  }
  let linha;
  if (payload.id) {
    const linhas = await atualizar('hospedagem_hoteis', [{ coluna: 'id', valor: payload.id }], { ...payload, atualizado_por: usuario });
    linha = linhas?.[0] || null;
  } else {
    const linhas = await inserir('hospedagem_hoteis', { ...payload, criado_por: usuario });
    linha = linhas?.[0] || null;
  }
  await registrarAuditoria({
    modulo: MODULO, tabela: 'hospedagem_hoteis', registroId: linha?.id,
    acao: payload.id ? 'hotel_atualizado' : 'hotel_criado', valorNovo: payload,
  });
  return linha;
}

// ── 8.2 Alojamentos ──────────────────────────────────────────────────────────
export async function listarAlojamentos({ pagina = 1, porPagina = 50, busca = '' } = {}) {
  return listar('hospedagem_alojamentos', {
    busca: busca ? { colunas: ['nome', 'cidade', 'responsavel'], termo: busca } : null,
    ordenar: [{ coluna: 'nome', asc: true }],
    pagina, porPagina, chaveCorrida: 'hosp:alojamentos',
  });
}

export async function salvarAlojamento(payload, { usuario = null } = {}) {
  if (!payload.nome) throw new Error('Nome do alojamento é obrigatório.');
  if ((payload.latitude == null || payload.longitude == null) && payload.endereco) {
    const geo = await geocodificar(payload.endereco, payload.cidade, payload.estado);
    payload.latitude = payload.latitude ?? geo.latitude;
    payload.longitude = payload.longitude ?? geo.longitude;
  }
  let linha;
  if (payload.id) {
    const linhas = await atualizar('hospedagem_alojamentos', [{ coluna: 'id', valor: payload.id }], { ...payload, atualizado_por: usuario });
    linha = linhas?.[0] || null;
  } else {
    const linhas = await inserir('hospedagem_alojamentos', { ...payload, criado_por: usuario });
    linha = linhas?.[0] || null;
  }
  await registrarAuditoria({
    modulo: MODULO, tabela: 'hospedagem_alojamentos', registroId: linha?.id,
    acao: payload.id ? 'alojamento_atualizado' : 'alojamento_criado', valorNovo: payload,
  });
  return linha;
}

// ── 8.3 Reservas ─────────────────────────────────────────────────────────────
function calcularDiarias(checkin, checkout) {
  if (!checkin || !checkout) return null;
  const dias = Math.round((new Date(checkout) - new Date(checkin)) / 86_400_000);
  return Math.max(1, dias);
}

export async function listarReservas({ status = null, pagina = 1, porPagina = 50 } = {}) {
  return listar('hospedagem_reservas', {
    filtros: status ? [{ coluna: 'status', valor: status }] : [],
    ordenar: [{ coluna: 'checkin', asc: false }],
    pagina, porPagina, chaveCorrida: 'hosp:reservas',
  });
}

export async function incluirReserva(payload, { usuario = null } = {}) {
  for (const campo of ['colaborador_nome', 'local_tipo', 'checkin']) {
    if (!payload[campo]) throw new Error(`Reserva exige ${campo.replace('_', ' ')}.`);
  }
  if (payload.local_tipo === 'hotel' && !payload.hotel_id) throw new Error('Selecione o hotel da reserva.');
  if (payload.local_tipo === 'alojamento' && !payload.alojamento_id) throw new Error('Selecione o alojamento da reserva.');
  payload.diarias = payload.diarias ?? calcularDiarias(payload.checkin, payload.checkout);
  const linhas = await inserir('hospedagem_reservas', { ...payload, criado_por: usuario });
  const linha = linhas?.[0] || null;
  await registrarAuditoria({
    modulo: MODULO, tabela: 'hospedagem_reservas', registroId: linha?.id,
    acao: 'reserva_incluida', valorNovo: payload,
  });
  return linha;
}

export async function estenderReserva(id, novoCheckout, { usuario = null } = {}) {
  const { rows } = await listar('hospedagem_reservas', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const reserva = rows?.[0];
  if (!reserva) throw new Error('Reserva não encontrada.');
  const diarias = calcularDiarias(reserva.checkin, novoCheckout);
  const linhas = await atualizar('hospedagem_reservas', [{ coluna: 'id', valor: id }], {
    checkout: novoCheckout, diarias, atualizado_por: usuario,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'hospedagem_reservas', registroId: id, acao: 'reserva_estendida',
    valorAnterior: { checkout: reserva.checkout, diarias: reserva.diarias },
    valorNovo: { checkout: novoCheckout, diarias },
  });
  return linhas?.[0] || null;
}

export async function fazerCheckout(id, { usuario = null } = {}) {
  const linhas = await atualizar('hospedagem_reservas', [{ coluna: 'id', valor: id }], {
    status: 'Checkout', atualizado_por: usuario,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'hospedagem_reservas', registroId: id,
    acao: 'reserva_checkout', valorNovo: { status: 'Checkout' },
  });
  return linhas?.[0] || null;
}

export async function lancarExtras(id, { valor, descricao = '', usuario = null } = {}) {
  const { rows } = await listar('hospedagem_reservas', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const reserva = rows?.[0];
  if (!reserva) throw new Error('Reserva não encontrada.');
  const extras = Number(reserva.extras || 0) + Number(valor || 0);
  const extrasDescricao = [reserva.extras_descricao, descricao].filter(Boolean).join(' | ');
  const linhas = await atualizar('hospedagem_reservas', [{ coluna: 'id', valor: id }], {
    extras, extras_descricao: extrasDescricao, atualizado_por: usuario,
  });
  await registrarAuditoria({
    modulo: MODULO, tabela: 'hospedagem_reservas', registroId: id, acao: 'reserva_extras',
    valorAnterior: { extras: reserva.extras }, valorNovo: { extras, descricao },
  });
  return linhas?.[0] || null;
}

/** Paga a reserva gerando obrigação no domínio financeiro (integração 7.4). */
export async function pagarReserva(id, { usuario = null } = {}) {
  const { rows } = await listar('hospedagem_reservas', { filtros: [{ coluna: 'id', valor: id }], porPagina: 1 });
  const reserva = rows?.[0];
  if (!reserva) throw new Error('Reserva não encontrada.');
  if (reserva.pagamento_status === 'Pago') throw new Error('Reserva já paga.');
  const total = Number(reserva.valor || 0) + Number(reserva.extras || 0);
  const pagamento = await lancarPagamento({
    origem: 'hospedagem', origem_id: String(id), tipo: 'hospedagem',
    descricao: `Hospedagem — ${reserva.colaborador_nome} (${reserva.numero_os || 'sem OS'})`,
    valor: total, vencimento: reserva.checkout || null,
  }, { usuario });
  const linhas = await atualizar('hospedagem_reservas', [{ coluna: 'id', valor: id }], {
    pagamento_status: 'Pago', pagamento_id: pagamento?.id ? String(pagamento.id) : null,
  });
  return linhas?.[0] || null;
}

// ── 8.4 Relatório consolidado ────────────────────────────────────────────────
export async function relatorioConsolidado({ inicio = null, fim = null } = {}) {
  const t0 = performance.now();
  const filtros = [];
  if (inicio) filtros.push({ coluna: 'checkin', op: 'gte', valor: inicio });
  if (fim) filtros.push({ coluna: 'checkin', op: 'lte', valor: fim });
  const { rows } = await listar('hospedagem_reservas', { filtros, porPagina: 5000 });
  const reservas = rows || [];
  const totalDiarias = reservas.reduce((s, r) => s + Number(r.diarias || 0), 0);
  const totalExtras = reservas.reduce((s, r) => s + Number(r.extras || 0), 0);
  const totalValor = reservas.reduce((s, r) => s + Number(r.valor || 0), 0);
  return {
    reservas,
    kpis: {
      quantidade: reservas.length,
      diarias: totalDiarias,
      extras: totalExtras,
      custoTotal: totalValor + totalExtras,
      pagas: reservas.filter((r) => r.pagamento_status === 'Pago').length,
    },
    atualizadoEm: new Date().toISOString(),
    origem: 'Supabase · hospedagem_reservas',
    duracaoMs: Math.round(performance.now() - t0),
  };
}
