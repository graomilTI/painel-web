import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc } from './core/ui.js';
import { openFrotasWindow } from './modules/frotas-window.js';
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

export function renderContent(content, ctx) {
  const cardsHtml = CARDS
    .filter((card) => temAcessoFrota(ctx, card.aliases))
    .map((card) => `
      <button class="frotas-hub-card" type="button" data-card="${esc(card.id)}">
        <h3 class="frotas-hub-card-title">${esc(card.titulo)}</h3>
        <p class="frotas-hub-card-desc">${esc(card.descricao)}</p>
      </button>`)
    .join('');

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-kicker">Frotas · Manutenção</div>
      <h1 class="frotas-hub-title">Manutenção</h1>
      <p class="frotas-hub-subtitle">Manutenção, troca de óleo e checklists dos veículos.</p>
      <div class="frotas-hub-grid">${cardsHtml}</div>
    </section>`;

  content.querySelectorAll('[data-card]').forEach((btn) => {
    const card = CARDS.find((c) => c.id === btn.dataset.card);
    if (!card) return;
    btn.addEventListener('click', () => {
      openFrotasWindow({ titulo: card.titulo, montar: (body) => card.montar(body, ctx) });
    });
  });
}

initProtectedPage('Frotas · Manutenção', renderContent);
