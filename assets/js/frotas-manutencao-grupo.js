import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc, tabs } from './core/ui.js';
import { temAcessoFrota } from './modules/frotas-permissoes.js';

const CARDS = [
  {
    id: 'manutencao',
    titulo: 'Corretiva',
    descricao: 'Solicitações, orçamentos, aprovação e ordens de serviço das manutenções.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao.js?v=20261016-frotas-manut21');
      window.FROTAS_MANUTENCAO.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'preventiva',
    titulo: 'Preventiva',
    descricao: 'Vencimentos das manutenções preventivas por veículo e registro do que foi feito.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-preventiva.js?v=20261016-frotas-manut21');
      window.FROTAS_MANUT_PREVENTIVA.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'custos',
    titulo: 'Custos',
    descricao: 'Custo final das manutenções por veículo, coordenação, categoria e mais.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-custos.js?v=20261016-frotas-manut21');
      window.FROTAS_MANUT_CUSTOS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'oficinas',
    titulo: 'Oficinas',
    descricao: 'Cadastro de oficinas e fornecedores de manutenção.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao-oficinas.js?v=20261016-frotas-manut21');
      window.FROTAS_MANUT_OFICINAS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'checklists',
    titulo: 'Checklist',
    descricao: 'Checklists de vistoria e conferência dos veículos.',
    aliases: ['FROTAS_CHECKLISTS', 'CHECKLISTS'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-checklists.js?v=20261016-frotas-manut21');
      window.FROTAS_CHECKLISTS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
];

const state = { tab: null };

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
  if (!visiveis.some((c) => c.id === state.tab)) state.tab = visiveis[0]?.id || null;

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-tabs">${tabs({ itens: visiveis.map((c) => ({ id: c.id, label: c.titulo })), ativo: state.tab })}</div>
      <div class="frotas-hub-tab-body" id="frotasManutencaoTabBody"></div>
    </section>`;

  content.querySelectorAll('[data-ds-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.dsTab === state.tab) return;
      state.tab = btn.dataset.dsTab;
      content.querySelectorAll('[data-ds-tab]').forEach((b) => b.classList.toggle('active', b.dataset.dsTab === state.tab));
      montarTabAtiva(content, ctx, visiveis);
    });
  });

  montarTabAtiva(content, ctx, visiveis);
}

initProtectedPage('Frotas · Manutenção', renderContent);
