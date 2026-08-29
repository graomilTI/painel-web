import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc, tabs } from './core/ui.js';
import { temAcessoFrota } from './modules/frotas-permissoes.js';

const CARDS = [
  {
    id: 'manutencao',
    titulo: 'Manutenção',
    descricao: 'Ordens de manutenção, custos e status por veículo.',
    aliases: ['FROTAS_MANUTENCAO', 'MANUTENCAO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-manutencao.js');
      window.FROTAS_MANUTENCAO.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'troca-oleo',
    titulo: 'Troca de Óleo',
    descricao: 'Controle de troca de óleo e revisões periódicas.',
    aliases: ['FROTAS_TROCA_OLEO', 'TROCA_OLEO'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-troca-oleo.js');
      window.FROTAS_TROCA_OLEO.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'checklists',
    titulo: 'Checklist',
    descricao: 'Checklists de vistoria e conferência dos veículos.',
    aliases: ['FROTAS_CHECKLISTS', 'CHECKLISTS'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-checklists.js');
      window.FROTAS_CHECKLISTS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
];

const state = { tab: null };

function montarTabAtiva(content, ctx, visiveis) {
  const card = visiveis.find((c) => c.id === state.tab);
  const desc = content.querySelector('#frotasManutencaoTabDesc');
  const body = content.querySelector('#frotasManutencaoTabBody');
  if (desc) desc.textContent = card?.descricao || '';
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
  if (!visiveis.some((c) => c.id === state.tab)) state.tab = visiveis[0]?.id || null;

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-kicker">Frotas · Manutenção</div>
      <h1 class="frotas-hub-title">Manutenção</h1>
      <p class="frotas-hub-subtitle">Manutenção, troca de óleo e checklists dos veículos.</p>
      <div class="frotas-hub-tabs">${tabs({ itens: visiveis.map((c) => ({ id: c.id, label: c.titulo })), ativo: state.tab })}</div>
      <p class="frotas-hub-tab-desc" id="frotasManutencaoTabDesc"></p>
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
