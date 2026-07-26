// assets/js/auditoria-central.js
// Auditoria Central pesquisável (plano 12.5): quem fez o quê, quando, onde e
// com qual resultado — filtros por usuário, módulo, ação, registro, período,
// IP/dispositivo, sucesso/erro, e comparação de valor anterior × novo.

import { initProtectedPage } from './pageInit.js';
import {
  pageHeader, dataStatus, badge, table, pagination, esc,
  emptyState, errorState, loadingState, openModal, debounce,
} from './core/ui.js';
import { pesquisarAuditoria, compararValores } from './services/relatoriosService.js';
import { registrarAuditoria } from './core/audit.js';

const MODULOS = [
  '', 'notas-fiscais', 'compras', 'financeiro', 'programacao', 'logistica',
  'conferencia', 'operacional', 'hospedagem', 'frotas', 'patrimonios', 'rh',
  'ti', 'comercial', 'correios', 'importacoes', 'auth', 'admin',
];

const estado = {
  status: 'loading',
  erro: null,
  rows: [],
  total: 0,
  pagina: 1,
  porPagina: 50,
  filtros: {
    usuario: '', modulo: '', acao: '', registro: '',
    inicio: '', fim: '', resultado: '',
  },
  atualizadoEm: null,
  duracaoMs: null,
};

let raiz = null;
let bootId = 0;

function dataHora(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  } catch { return String(v); }
}

function resultadoBadge(r) {
  if (r.erro) return badge('Erro', 'danger');
  const res = String(r.resultado || 'sucesso').toLowerCase();
  return res.includes('erro') || res.includes('falha') ? badge('Erro', 'danger') : badge('Sucesso', 'ok');
}

function linhaHtml(r, i) {
  return `<tr>
    <td>${dataHora(r.created_at)}</td>
    <td>${esc(r.usuario_email || r.usuario || '-')}</td>
    <td>${esc(r.modulo || '-')}</td>
    <td><strong>${esc(r.acao || '-')}</strong>${r.tabela ? `<br><small style="color:#6b7280">${esc(r.tabela)}</small>` : ''}</td>
    <td>${esc(String(r.registro_id || '-')).slice(0, 40)}</td>
    <td>${resultadoBadge(r)}</td>
    <td><button class="ds-btn" data-detalhe="${i}" type="button">Detalhes</button></td>
  </tr>`;
}

function render() {
  if (!raiz) return;
  const f = estado.filtros;
  raiz.innerHTML = `
    <section style="display:grid;gap:18px">
      ${pageHeader({
        titulo: 'Auditoria Central',
        subtitulo: 'Pesquisa unificada de tudo o que foi feito no painel: quem, o quê, quando e com qual resultado.',
      })}

      <article class="ds-card" style="display:grid;gap:14px">
        <div class="ds-filter" style="grid-template-columns:repeat(4,minmax(150px,1fr))">
          <div class="ds-field">
            <label for="fUsuario">Usuário</label>
            <input id="fUsuario" type="search" placeholder="e-mail ou parte dele" value="${esc(f.usuario)}" autocomplete="off">
          </div>
          <div class="ds-field">
            <label for="fModulo">Módulo</label>
            <select id="fModulo">
              ${MODULOS.map((m) => `<option value="${m}" ${f.modulo === m ? 'selected' : ''}>${m || 'Todos'}</option>`).join('')}
            </select>
          </div>
          <div class="ds-field">
            <label for="fAcao">Ação</label>
            <input id="fAcao" type="search" placeholder="ex.: nf_lancada, login" value="${esc(f.acao)}" autocomplete="off">
          </div>
          <div class="ds-field">
            <label for="fRegistro">Registro</label>
            <input id="fRegistro" type="search" placeholder="id do registro" value="${esc(f.registro)}" autocomplete="off">
          </div>
          <div class="ds-field">
            <label for="fInicio">De</label>
            <input id="fInicio" type="date" value="${esc(f.inicio)}">
          </div>
          <div class="ds-field">
            <label for="fFim">Até</label>
            <input id="fFim" type="date" value="${esc(f.fim)}">
          </div>
          <div class="ds-field">
            <label for="fResultado">Resultado</label>
            <select id="fResultado">
              <option value="" ${!f.resultado ? 'selected' : ''}>Todos</option>
              <option value="sucesso" ${f.resultado === 'sucesso' ? 'selected' : ''}>Sucesso</option>
              <option value="erro" ${f.resultado === 'erro' ? 'selected' : ''}>Erro</option>
            </select>
          </div>
          <div class="ds-field">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
              <button class="ds-btn ds-btn-primary" id="btnPesquisar" type="button">Pesquisar</button>
              <button class="ds-btn" id="btnLimpar" type="button">Limpar</button>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end">
          ${estado.atualizadoEm ? dataStatus({
            atualizadoEm: estado.atualizadoEm,
            origem: 'Supabase · auditoria',
            duracaoMs: estado.duracaoMs,
            erro: estado.status === 'error' ? estado.erro : null,
          }) : ''}
        </div>
        <div id="audTabela">${renderTabela()}</div>
      </article>
    </section>`;
  vincular();
}

function renderTabela() {
  if (estado.status === 'loading') return loadingState('Pesquisando auditoria...');
  if (estado.status === 'error') return errorState(estado.erro, { retryId: 'audRetry' });
  if (!estado.rows.length) {
    return emptyState('Nenhum evento encontrado.', 'Ajuste os filtros ou amplie o período.');
  }
  return `
    ${table({
      colunas: [
        { id: 'created_at', label: 'Quando' },
        { id: 'usuario', label: 'Usuário' },
        { id: 'modulo', label: 'Módulo' },
        { id: 'acao', label: 'Ação' },
        { id: 'registro', label: 'Registro' },
        { id: 'resultado', label: 'Resultado' },
        { id: 'detalhes', label: '' },
      ],
      linhasHtml: estado.rows.map((r, i) => linhaHtml(r, i)).join(''),
      minWidth: 920,
    })}
    ${pagination({ pagina: estado.pagina, porPagina: estado.porPagina, total: estado.total })}`;
}

function abrirDetalhe(r) {
  const diffs = compararValores(r.valor_anterior, r.valor_novo);
  const diffHtml = diffs.length ? `
    <div class="ds-table-wrap" style="margin-top:12px">
      <table class="ds-table">
        <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor novo</th></tr></thead>
        <tbody>
          ${diffs.map((d) => `<tr>
            <td><strong>${esc(d.campo)}</strong></td>
            <td style="color:${d.alterado ? '#fca5a5' : '#94a3b8'}">${esc(d.anterior)}</td>
            <td style="color:${d.alterado ? '#86efac' : '#94a3b8'}">${esc(d.novo)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<p class="ds-modal-text" style="margin-top:12px">Sem alteração de valores registrada neste evento.</p>';

  openModal({
    id: 'audDetalheModal',
    conteudoHtml: `
      <h3 class="ds-modal-title">Detalhe do evento</h3>
      <div class="ds-modal-grid">
        <div><div class="ds-modal-label">Quando</div><div class="ds-modal-value">${dataHora(r.created_at)}</div></div>
        <div><div class="ds-modal-label">Usuário</div><div class="ds-modal-value">${esc(r.usuario_email || r.usuario || '-')}</div></div>
        <div><div class="ds-modal-label">Módulo</div><div class="ds-modal-value">${esc(r.modulo || '-')}</div></div>
        <div><div class="ds-modal-label">Ação</div><div class="ds-modal-value">${esc(r.acao || '-')}</div></div>
        <div><div class="ds-modal-label">Tabela</div><div class="ds-modal-value">${esc(r.tabela || '-')}</div></div>
        <div><div class="ds-modal-label">Registro</div><div class="ds-modal-value">${esc(String(r.registro_id || '-'))}</div></div>
        <div><div class="ds-modal-label">IP</div><div class="ds-modal-value">${esc(r.ip || '-')}</div></div>
        <div><div class="ds-modal-label">Dispositivo</div><div class="ds-modal-value">${esc(r.dispositivo || r.user_agent || '-')}</div></div>
        ${r.erro ? `<div class="ds-modal-full"><div class="ds-modal-label">Erro</div><div class="ds-modal-value" style="color:#fca5a5">${esc(r.erro)}</div></div>` : ''}
        ${r.detalhe ? `<div class="ds-modal-full"><div class="ds-modal-label">Detalhe</div><div class="ds-modal-value">${esc(typeof r.detalhe === 'string' ? r.detalhe : JSON.stringify(r.detalhe))}</div></div>` : ''}
      </div>
      ${diffHtml}
      <div class="ds-modal-actions" style="margin-top:16px">
        <button class="ds-btn" data-ds-close type="button">Fechar</button>
      </div>`,
  });
  document.querySelector('#audDetalheModal [data-ds-close]')?.addEventListener('click', () => {
    document.getElementById('audDetalheModal')?.remove();
  });
}

function lerFiltros() {
  estado.filtros = {
    usuario: raiz.querySelector('#fUsuario')?.value?.trim() || '',
    modulo: raiz.querySelector('#fModulo')?.value || '',
    acao: raiz.querySelector('#fAcao')?.value?.trim() || '',
    registro: raiz.querySelector('#fRegistro')?.value?.trim() || '',
    inicio: raiz.querySelector('#fInicio')?.value || '',
    fim: raiz.querySelector('#fFim')?.value || '',
    resultado: raiz.querySelector('#fResultado')?.value || '',
  };
}

function vincular() {
  raiz.querySelector('#btnPesquisar')?.addEventListener('click', () => { lerFiltros(); estado.pagina = 1; carregar(); });
  raiz.querySelector('#btnLimpar')?.addEventListener('click', () => {
    estado.filtros = { usuario: '', modulo: '', acao: '', registro: '', inicio: '', fim: '', resultado: '' };
    estado.pagina = 1;
    carregar();
  });
  raiz.querySelector('#audRetry')?.addEventListener('click', () => carregar());
  raiz.querySelectorAll('[data-detalhe]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = estado.rows[Number(b.dataset.detalhe)];
      if (r) abrirDetalhe(r);
    });
  });
  raiz.querySelectorAll('[data-ds-page]').forEach((b) => {
    b.addEventListener('click', () => {
      const pagina = Number(b.dataset.dsPage);
      if (!Number.isFinite(pagina) || pagina < 1) return;
      estado.pagina = pagina;
      carregar();
    });
  });
  // Enter em qualquer campo de texto dispara a pesquisa
  const aplicarEnter = (e) => { if (e.key === 'Enter') { lerFiltros(); estado.pagina = 1; carregar(); } };
  ['#fUsuario', '#fAcao', '#fRegistro'].forEach((sel) => {
    raiz.querySelector(sel)?.addEventListener('keydown', aplicarEnter);
  });
}

async function carregar() {
  const meuBoot = bootId;
  estado.status = 'loading';
  estado.erro = null;
  render();
  const t0 = performance.now();
  try {
    const f = estado.filtros;
    const { rows, total } = await pesquisarAuditoria({
      usuario: f.usuario || null,
      modulo: f.modulo || null,
      acao: f.acao || null,
      registro: f.registro || null,
      inicio: f.inicio || null,
      fim: f.fim || null,
      resultado: f.resultado || null,
      pagina: estado.pagina,
      porPagina: estado.porPagina,
    });
    if (meuBoot !== bootId) return;
    estado.rows = rows || [];
    estado.total = total ?? estado.rows.length;
    estado.status = 'ok';
    estado.atualizadoEm = new Date().toISOString();
    estado.duracaoMs = Math.round(performance.now() - t0);
  } catch (error) {
    if (meuBoot !== bootId) return;
    estado.status = 'error';
    estado.erro = String(error?.message || error);
  }
  render();
}

export function renderContent(content) {
  bootId += 1;
  raiz = content;
  estado.pagina = 1;
  render();
  carregar();
  registrarAuditoria({ modulo: 'admin', acao: 'auditoria_central_acessada' }).catch(() => {});
}

initProtectedPage('Auditoria Central', renderContent);
