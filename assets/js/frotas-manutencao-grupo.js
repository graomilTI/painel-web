import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc, tabs } from './core/ui.js';
import { temAcessoFrota } from './modules/frotas-permissoes.js';

const CARDS = [
  {
    id: 'painel',
    titulo: 'Painel',
    descricao: 'Visão geral da frota: parados, alertas, quadro por etapa e saúde da preventiva.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-painel.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_PAINEL.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'manutencao',
    titulo: 'Corretiva',
    descricao: 'Solicitações, orçamentos, aprovação e ordens de serviço das manutenções.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUTENCAO.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'preventiva',
    titulo: 'Preventiva',
    descricao: 'Vencimentos das manutenções preventivas por veículo e registro do que foi feito.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-preventiva.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_PREVENTIVA.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'veiculos',
    titulo: 'Veículos',
    descricao: 'Prontuário por veículo: manutenções abertas, histórico, custo e vencimentos.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-veiculos.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_VEICULOS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'agenda',
    titulo: 'Agenda',
    descricao: 'Calendário de entradas na oficina, previsões de entrega e vencimentos da preventiva.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-agenda.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_AGENDA.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'custos',
    titulo: 'Custos',
    descricao: 'Custo final das manutenções por veículo, coordenação, categoria e mais.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-custos.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_CUSTOS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'pecas',
    titulo: 'Peças',
    descricao: 'Catálogo de peças por marca e modelo de veículo (aprende com as manutenções aprovadas).',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-pecas.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_PECAS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'oficinas',
    titulo: 'Oficinas',
    descricao: 'Cadastro de oficinas e fornecedores de manutenção.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-oficinas.js?v=20261021-frotas-manut45');
      window.FROTAS_MANUT_OFICINAS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'checklists',
    titulo: 'Checklist',
    descricao: 'Checklists de vistoria e conferência dos veículos.',
    aliases: ['FROTAS_CHECKLISTS', 'CHECKLISTS'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-checklists.js?v=20261021-frotas-manut45');
      window.FROTAS_CHECKLISTS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
];

const state = { tab: null };

// Abas que gravam (Corretiva, Preventiva): ao sair delas a leitura guardada do Painel/Veículos/Agenda deixa de valer.
const ABAS_QUE_GRAVAM = ['manutencao', 'preventiva'];

function montarTabAtiva(content, ctx, visiveis) {
  const card = visiveis.find((c) => c.id === state.tab);
  const body = content.querySelector('#frotasManutencaoTabBody');
  if (!body) return;
  if (!card) { body.innerHTML = '<div class="frotas-window-placeholder">Nenhum item disponível.</div>'; return; }
  body.innerHTML = '';
  Promise.resolve(card.montar(body, ctx)).catch((error) => {
    console.error('[frotas-manutencao] Falha ao montar aba:', error);
    body.innerHTML = `<div class="frotas-window-placeholder">Erro ao carregar esta aba: ${esc(String(error?.message || error))}.</div>`;
  });
}

export function renderContent(content, ctx) {
  const visiveis = CARDS.filter((card) => temAcessoFrota(ctx, card.aliases));
  // Link de um aviso (?abrir=<id>): abre a aba Manutenção já com a ficha da solicitação.
  const abrir = new URLSearchParams(window.location.search).get('abrir');
  if (abrir && visiveis.some((c) => c.id === 'manutencao')) {
    window.FROTAS_MANUTENCAO_ABRIR = abrir;
    state.tab = 'manutencao';
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sem histórico: segue */ }
  }
  // Pedido de nova manutenção vindo de outra página (ex.: Veículos): abre a aba Manutenção já com o formulário preenchido.
  try {
    const pedidoNova = JSON.parse(sessionStorage.getItem('fm_nova_preset') || 'null');
    sessionStorage.removeItem('fm_nova_preset');
    if (pedidoNova && visiveis.some((c) => c.id === 'manutencao')) { window.FROTAS_MANUTENCAO_NOVA = pedidoNova; state.tab = 'manutencao'; }
  } catch { /* sem armazenamento ou pedido inválido: abre a aba normalmente */ }
  if (!visiveis.some((c) => c.id === state.tab)) state.tab = visiveis[0]?.id || null;

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-tabs">${tabs({ itens: visiveis.map((c) => ({ id: c.id, label: c.titulo })), ativo: state.tab })}</div>
      <div class="frotas-hub-tab-body" id="frotasManutencaoTabBody"></div>
    </section>`;

  content.querySelectorAll('[data-ds-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.dsTab === state.tab) return;
      if (ABAS_QUE_GRAVAM.includes(state.tab)) import('./modules/frotas-manutencao-visao-dados.js?v=20261021-frotas-manut45').then((m) => m.invalidarVisao()).catch(() => {});
      state.tab = btn.dataset.dsTab;
      content.querySelectorAll('[data-ds-tab]').forEach((b) => b.classList.toggle('active', b.dataset.dsTab === state.tab));
      montarTabAtiva(content, ctx, visiveis);
    });
  });

  montarTabAtiva(content, ctx, visiveis);
}

initProtectedPage('Frotas · Manutenção', renderContent);
