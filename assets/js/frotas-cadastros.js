import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc, tabs } from './core/ui.js';
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

const state = { tab: null };

function montarTabAtiva(content, ctx, visiveis) {
  const card = visiveis.find((c) => c.id === state.tab);
  const desc = content.querySelector('#frotasCadastrosTabDesc');
  const body = content.querySelector('#frotasCadastrosTabBody');
  if (desc) desc.textContent = card?.descricao || '';
  if (!body) return;
  if (!card) { body.innerHTML = '<div class="frotas-window-placeholder">Nenhum item disponível.</div>'; return; }
  body.innerHTML = '';
  Promise.resolve(card.montar(body, ctx)).catch((error) => {
    console.error('[frotas-cadastros] Falha ao montar aba:', error);
    body.innerHTML = `<div class="frotas-window-placeholder">Erro ao carregar esta aba: ${esc(String(error?.message || error))}.</div>`;
  });
}

export function renderContent(content, ctx) {
  const visiveis = CARDS.filter((card) => !card.aliases || temAcessoFrota(ctx, card.aliases));
  if (!visiveis.some((c) => c.id === state.tab)) state.tab = visiveis[0]?.id || null;

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-kicker">Frotas · Cadastros</div>
      <h1 class="frotas-hub-title">Cadastros</h1>
      <p class="frotas-hub-subtitle">Motoristas, veículos, rastreadores e o termo de utilização de veículos.</p>
      <div class="frotas-hub-tabs">${tabs({ itens: visiveis.map((c) => ({ id: c.id, label: c.titulo, badge: c.badge })), ativo: state.tab })}</div>
      <p class="frotas-hub-tab-desc" id="frotasCadastrosTabDesc"></p>
      <div class="frotas-hub-tab-body" id="frotasCadastrosTabBody"></div>
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

initProtectedPage('Frotas · Cadastros', renderContent);
