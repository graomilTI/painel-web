import { supabase } from './supabaseClient.js';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getOsCard() {
  return [...document.querySelectorAll('.db-mini-card')]
    .find((card) => normalize(card.querySelector('.db-mini-eyebrow')?.textContent) === 'ORDENS DE SERVICO') || null;
}

function getRegionalFiltro() {
  const tag = document.querySelector('#dbGestorSection .db-region-tag')?.textContent?.trim() || '';
  if (!tag || normalize(tag) === 'TODAS AS REGIONAIS') return '';
  return tag;
}

function applyRegional(query, regional) {
  return regional ? query.eq('supervisao', regional) : query;
}

async function fetchOsCounts() {
  const regional = getRegionalFiltro();
  const base = () => applyRegional(
    supabase.from('operacional_os').select('id', { count: 'exact', head: true }).eq('situacao', 'Aberta'),
    regional
  );

  const [pendentes, conferencia, aguardando, total] = await Promise.all([
    base().is('status_gestor', null),
    base().eq('status_gestor', 'ATENDER'),
    base().eq('status_gestor', 'AGUARDAR'),
    base(),
  ]);

  const error = [pendentes, conferencia, aguardando, total].find((res) => res.error)?.error;
  if (error) throw error;

  return {
    pendentes: pendentes.count ?? 0,
    conferencia: conferencia.count ?? 0,
    aguardando: aguardando.count ?? 0,
    total: total.count ?? 0,
  };
}

export async function updateDashboardOsCard() {
  const card = getOsCard();
  if (!card || card.dataset.osCountsFixLoading === '1') return false;

  card.dataset.osCountsFixLoading = '1';
  try {
    const counts = await fetchOsCounts();
    const blocks = card.querySelectorAll('.db-os-block');
    const values = [counts.pendentes, counts.conferencia, counts.total];
    const labels = ['Pendentes', 'Conferência', 'Total abertas'];

    blocks.forEach((block, index) => {
      const num = block.querySelector('.db-os-num');
      const label = block.querySelector('.db-os-label');
      if (num) {
        num.textContent = Number(values[index] || 0).toLocaleString('pt-BR');
        num.classList.toggle('is-amber', index === 0 && values[index] > 0);
        num.classList.toggle('is-green', index === 1 && values[index] > 0);
      }
      if (label) label.textContent = labels[index];
    });

    card.title = `OS abertas reais: ${counts.total.toLocaleString('pt-BR')} · Pendentes: ${counts.pendentes.toLocaleString('pt-BR')} · Conferência: ${counts.conferencia.toLocaleString('pt-BR')} · Aguardando gestor: ${counts.aguardando.toLocaleString('pt-BR')}`;
    card.dataset.osCountsFixApplied = '1';
    return true;
  } catch (error) {
    console.warn('[dashboard-os-card-fix] falha ao atualizar card:', error?.message || error);
    return false;
  } finally {
    delete card.dataset.osCountsFixLoading;
  }
}

let timer = null;
export function scheduleDashboardOsCardUpdate() {
  clearTimeout(timer);
  timer = setTimeout(updateDashboardOsCard, 250);
}

scheduleDashboardOsCardUpdate();
new MutationObserver(scheduleDashboardOsCardUpdate).observe(document.body, { childList: true, subtree: true });
