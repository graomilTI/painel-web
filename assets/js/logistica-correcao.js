// Logística > Correção (Gestor): hub dedicado pra ver o que o ADM marcou
// como errado numa solicitação de Abertura de O.S. — quais campos
// especificamente (campos_corrigir) e/ou pontos de problema de local
// reportados (pontos_problema), que não mudam o status mas precisam
// aparecer aqui. A edição de verdade continua acontecendo no form real
// (logistica.html, aba Abrir O.S.) porque é lá que os campos existem;
// "Editar e reenviar" só faz o handoff via sessionStorage (ver
// logistica-abertura-os-correcao.js:HANDOFF_KEY) e navega pra lá.
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import { labelCampoAberturaOs } from './logistica-abertura-os-campos.js';

const HANDOFF_KEY = 'painel_correcao_abertura_os_id';

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const dataHora = (v) => { const d=new Date(v); return !v||Number.isNaN(d.getTime())?'-':d.toLocaleString('pt-BR'); };

function ensureStyle() {
  if (document.getElementById('logisticaCorrecaoStyle')) return;
  const style = document.createElement('style');
  style.id = 'logisticaCorrecaoStyle';
  style.textContent = `
    .lc-list{display:flex;flex-direction:column;gap:14px}
    .lc-card{border:1px solid rgba(250,204,21,.22);background:rgba(113,63,18,.08);border-radius:14px;padding:16px 18px}
    .lc-card.lc-only-alerta{border-color:rgba(251,146,60,.26);background:rgba(124,45,18,.08)}
    .lc-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px}
    .lc-card-head h3{margin:0;font-size:15px;color:#f1fbf6}
    .lc-card-head span{display:block;color:#8fa1b5;font-size:11px;margin-top:2px}
    .lc-tag{display:inline-block;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.03em}
    .lc-tag.correcao{background:rgba(250,204,21,.16);color:#fde68a}
    .lc-tag.alerta{background:rgba(251,146,60,.18);color:#fdba74}
    .lc-route{color:#a8bcb1;font-size:12px;margin-bottom:10px}
    .lc-campos{margin-bottom:8px}
    .lc-campo-badge{display:inline-block;margin:0 5px 5px 0;padding:3px 9px;border-radius:999px;background:rgba(250,204,21,.14);color:#fde68a;font-size:11px;font-weight:700}
    .lc-motivo{color:#f1fbf6;font-size:13px;margin-bottom:10px}
    .lc-motivo b{color:#fde68a}
    .lc-problemas{margin-bottom:10px}
    .lc-problema-item{padding:7px 10px;border-radius:9px;background:rgba(251,146,60,.10);border:1px solid rgba(251,146,60,.2);color:#fdba74;font-size:12px;margin-bottom:6px}
    .lc-problema-item span{display:block;color:#c99a75;font-size:10px;margin-top:2px}
    .lc-empty{padding:32px;text-align:center;color:#8fa1b5}
  `;
  document.head.appendChild(style);
}

function cardHtml(row) {
  const campos = Array.isArray(row.campos_corrigir) ? row.campos_corrigir : [];
  const pontos = Array.isArray(row.pontos_problema) ? row.pontos_problema : [];
  const precisaCorrigir = String(row.status || '').toUpperCase() === 'CORRIGIR';
  const pontosOrdenados = [...pontos].sort((a, b) => String(b.em || '').localeCompare(String(a.em || '')));
  return `<article class="lc-card card${precisaCorrigir ? '' : ' lc-only-alerta'}">
    <div class="lc-card-head">
      <div>
        <h3>${esc(row.contratante_cliente || '-')} · ${esc(row.numero_contrato || '-')}</h3>
        <span>${esc(row.produto || '-')} · ${esc(row.servico || '-')} · Solicitado em ${dataHora(row.created_at)}</span>
      </div>
      <div>
        ${precisaCorrigir ? '<span class="lc-tag correcao">Correção pendente</span>' : ''}
        ${pontos.length ? '<span class="lc-tag alerta">❗ Ponto com problema</span>' : ''}
      </div>
    </div>
    <div class="lc-route">${esc(row.armazem_embarque || '-')} (${esc(row.cidade_embarque || '-')}) → ${esc(row.local_destino || '-')} (${esc(row.cidade_destino || '-')})</div>
    ${campos.length ? `<div class="lc-campos">${campos.map((c) => `<span class="lc-campo-badge">${esc(labelCampoAberturaOs(typeof c === 'string' ? c : c.campo))}</span>`).join('')}</div>` : ''}
    ${row.observacao_adm ? `<div class="lc-motivo"><b>Correção pedida pelo ADM:</b> ${esc(row.observacao_adm)}</div>` : ''}
    ${pontosOrdenados.length ? `<div class="lc-problemas">${pontosOrdenados.map((p) => `<div class="lc-problema-item">${esc(p.descricao || '-')}<span>Reportado pelo ADM em ${dataHora(p.em)}</span></div>`).join('')}</div>` : ''}
    ${precisaCorrigir ? `<button class="btn btn-primary" data-editar-abertura="${esc(row.id)}" type="button">Editar e reenviar</button>` : ''}
  </article>`;
}

async function carregar(content) {
  ensureStyle();
  content.innerHTML = '<section class="card mt-16"><div class="feedback">Carregando correções...</div></section>';

  // Filtro client-side (não via PostgREST) por simplicidade: comparar jsonb
  // "diferente de []" via query string é frágil, e o volume total da tabela
  // não justifica a complexidade — a mesma lista de 1000 linhas já é buscada
  // inteira em logistica-abertura-os-workflow.js.
  const { data, error } = await supabase.from('logistica_abertura_os').select('*').order('updated_at', { ascending: false }).limit(1000);

  if (error) {
    content.innerHTML = `<section class="card mt-16"><div class="log-empty">${esc(error.message)}</div></section>`;
    return;
  }

  const rows = (data || []).filter((row) => String(row.status || '').toUpperCase() === 'CORRIGIR' || (Array.isArray(row.pontos_problema) && row.pontos_problema.length > 0));

  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head"><h3>Logística de Correção</h3><p class="muted">Solicitações de Abertura de O.S. que o ADM devolveu pra correção, ou onde reportou um ponto com problema no local de embarque/destino.</p></div>
      ${rows.length ? `<div class="lc-list">${rows.map(cardHtml).join('')}</div>` : '<div class="lc-empty">Nenhuma correção ou aviso pendente no momento.</div>'}
    </section>`;

  content.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-editar-abertura]');
    if (!btn) return;
    event.preventDefault();
    try { sessionStorage.setItem(HANDOFF_KEY, btn.dataset.editarAbertura); } catch {}
    window.location.href = toPanelUrl('logistica');
  });
}

initProtectedPage('Logística de Correção', carregar);
