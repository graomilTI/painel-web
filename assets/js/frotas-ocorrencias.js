import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc, tabs } from './core/ui.js';
import { temAcessoFrota } from './modules/frotas-permissoes.js';

async function montarNotificacao(body, ctx) {
  const [{ installDailyDriverResolution }, { installPreviousWeekDefaults }, { installIntuitiveFleetLayout }] = await Promise.all([
    import('./frotas-motorista-leitura-diaria.js'),
    import('./frotas-periodo-semana-anterior.js'),
    import('./frotas-layout-intuitivo.js'),
    import('./modules/frotas.js'),
  ]);
  installDailyDriverResolution(supabase);
  installPreviousWeekDefaults(document, supabase);
  installIntuitiveFleetLayout(document);
  window.FROTAS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
}

async function montarHistorico(body, ctx) {
  await import('./modules/frotas.js');
  window.FROTAS.openHistorico(body, { supabase, auth: ctx, user: ctx?.user || null });
}

async function montarMultas(body, ctx) {
  const [{ installStableMultasActions }, { installTemporaryMultasUpload }] = await Promise.all([
    import('./modules/frotas-multas-stable-actions.js'),
    import('./modules/frotas-multas-temporary-upload.js'),
    import('./modules/frotas-multas.js'),
  ]);
  window.FROTAS_MULTAS.openHome(body, { supabase, auth: ctx, user: ctx?.user || null });
  installStableMultasActions(body);
  installTemporaryMultasUpload(body, supabase);
}

const CARDS = [
  {
    id: 'notificacoes',
    titulo: 'Notificações',
    descricao: 'Geração de notificação de excesso de velocidade aos motoristas.',
    aliases: ['FROTAS_EXCESSO_VELOCIDADE', 'EXCESSO_VELOCIDADE'],
    montar: montarNotificacao,
  },
  {
    id: 'multas',
    titulo: 'Multas',
    descricao: 'Acompanhamento de multas, ações e pendências.',
    aliases: ['FROTAS_MULTAS', 'MULTAS'],
    montar: montarMultas,
  },
  {
    id: 'historico',
    titulo: 'Histórico',
    descricao: 'Histórico do colaborador: multas, manutenções e excessos.',
    aliases: ['FROTAS_HISTORICO', 'HISTORICO_FROTAS'],
    montar: montarHistorico,
  },
];

const state = { tab: null };

function montarTabAtiva(content, ctx, visiveis) {
  const card = visiveis.find((c) => c.id === state.tab);
  const desc = content.querySelector('#frotasOcorrenciasTabDesc');
  const body = content.querySelector('#frotasOcorrenciasTabBody');
  if (desc) desc.textContent = card?.descricao || '';
  if (!body) return;
  if (!card) { body.innerHTML = '<div class="frotas-window-placeholder">Nenhum item disponível.</div>'; return; }
  body.innerHTML = '';
  Promise.resolve(card.montar(body, ctx)).catch((error) => {
    console.error('[frotas-ocorrencias] Falha ao montar aba:', error);
    body.innerHTML = `<div class="frotas-window-placeholder">Erro ao carregar esta aba: ${esc(String(error?.message || error))}.</div>`;
  });
}

export function renderContent(content, ctx) {
  const visiveis = CARDS.filter((card) => temAcessoFrota(ctx, card.aliases));
  if (!visiveis.some((c) => c.id === state.tab)) state.tab = visiveis[0]?.id || null;

  content.innerHTML = `
    <section class="card mt-16">
      <div class="frotas-hub-kicker">Frotas · Ocorrências</div>
      <h1 class="frotas-hub-title">Ocorrências</h1>
      <p class="frotas-hub-subtitle">Notificações de excesso de velocidade, multas e histórico dos colaboradores.</p>
      ${tabs({ itens: visiveis.map((c) => ({ id: c.id, label: c.titulo })), ativo: state.tab })}
      <p class="frotas-hub-tab-desc" id="frotasOcorrenciasTabDesc"></p>
      <div class="frotas-hub-tab-body" id="frotasOcorrenciasTabBody"></div>
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

initProtectedPage('Frotas · Ocorrências', renderContent);
