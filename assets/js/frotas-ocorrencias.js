import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { esc } from './core/ui.js';
import { openFrotasWindow } from './modules/frotas-window.js';
import { temAcessoFrota } from './modules/frotas-permissoes.js';

function installFleetHeaderCleanup() {
  if (document.getElementById('frotasOcorrenciasHeaderCleanupStyles')) return;
  const style = document.createElement('style');
  style.id = 'frotasOcorrenciasHeaderCleanupStyles';
  style.textContent = `.frotas-window-body .frotas-header { display: none !important; }`;
  document.head.appendChild(style);
}

async function montarNotificacao(body, ctx) {
  installFleetHeaderCleanup();
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
  installFleetHeaderCleanup();
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
      <div class="frotas-hub-kicker">Frotas · Ocorrências</div>
      <h1 class="frotas-hub-title">Ocorrências</h1>
      <p class="frotas-hub-subtitle">Notificações de excesso de velocidade, multas e histórico dos colaboradores.</p>
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

initProtectedPage('Frotas · Ocorrências', renderContent);
