import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc } from './core/ui.js';
import { openFrotasWindow } from './modules/frotas-window.js';
import { temAcessoFrota } from './modules/frotas-permissoes.js';

const CARDS = [
  {
    id: 'motoristas',
    titulo: 'Motoristas',
    descricao: 'Cadastro de motoristas, documentos e vínculo com veículos.',
    aliases: ['FROTAS_MOTORISTAS', 'MOTORISTAS'],
    montar: async (body, ctx) => {
      await import('./modules/frotas-motoristas.js');
      window.FROTAS_MOTORISTAS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'veiculos',
    titulo: 'Veículos',
    descricao: 'Frota de veículos, documentação e importação do Detran.',
    aliases: ['FROTAS_VEICULOS', 'VEICULOS', 'VEÍCULOS', 'FROTA_VEICULOS'],
    montar: async (body, ctx) => {
      const [{ enhanceFrotasVeiculos }, { enhanceFrotasVeiculosXlsx }] = await Promise.all([
        import('./modules/frotas-veiculos-ui.js'),
        import('./modules/frotas-veiculos-xlsx.js'),
        import('./modules/frotas-veiculos.js'),
      ]);
      window.FROTAS_VEICULOS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
      enhanceFrotasVeiculos(body, { supabase });
      enhanceFrotasVeiculosXlsx(body, { supabase });
    },
  },
  {
    id: 'rastreadores',
    titulo: 'Rastreadores',
    descricao: 'Instalações, remoções e histórico de rastreadores.',
    aliases: ['FROTAS_RASTREADORES', 'RASTREADORES'],
    montar: async (body, ctx) => {
      await Promise.all([
        import('./modules/frotas-rastreadores.js'),
        import('./modules/frotas-rastreadores-bfleet-status.js'),
      ]);
      window.FROTAS_RASTREADORES.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
    },
  },
  {
    id: 'termo-veiculos',
    titulo: 'Termo de Utilização de Veículos',
    descricao: 'Geração do termo de utilização de veículos pelo motorista.',
    badge: 'Em construção',
    aliases: null, // visível pra quem acessa o hub — feature nova, ainda sem permissão própria
    montar: async (body) => {
      body.innerHTML = `
        <div class="frotas-window-placeholder">
          <strong style="color:#f8fafc;font-size:15px">Em construção</strong>
          <p style="margin:0">A criação do Termo de Utilização de Veículos ainda está sendo desenvolvida. Em breve será possível gerar o termo por aqui.</p>
        </div>`;
    },
  },
];

export function renderContent(content, ctx) {
  const cardsHtml = CARDS
    .filter((card) => !card.aliases || temAcessoFrota(ctx, card.aliases))
    .map((card) => `
      <button class="frotas-hub-card" type="button" data-card="${esc(card.id)}">
        ${card.badge ? `<span class="frotas-hub-card-badge">${esc(card.badge)}</span>` : ''}
        <h3 class="frotas-hub-card-title">${esc(card.titulo)}</h3>
        <p class="frotas-hub-card-desc">${esc(card.descricao)}</p>
      </button>`)
    .join('');

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-kicker">Frotas · Cadastros</div>
      <h1 class="frotas-hub-title">Cadastros</h1>
      <p class="frotas-hub-subtitle">Motoristas, veículos, rastreadores e o termo de utilização de veículos.</p>
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

initProtectedPage('Frotas · Cadastros', renderContent);
