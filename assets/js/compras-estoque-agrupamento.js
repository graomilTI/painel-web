import { supabase } from './supabaseClient.js';
import { mensagemFalhaSalvar } from './rls-sessao-expirada.js';

let applying = false;

function norm(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function parseQtd(text = '') {
  const raw = String(text || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(raw || 0) || 0;
}

function formatQtd(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function getUnit(text = '') {
  const match = String(text || '').trim().match(/\s([A-Z]{1,5})$/i);
  return match ? match[1].toUpperCase() : 'UN';
}

function statusInfo(atual, minimo) {
  if (atual <= 0) return { cls: 'critico', label: 'Crítico' };
  if (minimo > 0 && atual <= minimo) return { cls: 'baixo', label: 'Baixo' };
  return { cls: 'normal', label: 'Normal' };
}

function ensureStyles() {
  if (document.getElementById('stkGroupingStyles')) return;
  const style = document.createElement('style');
  style.id = 'stkGroupingStyles';
  style.textContent = `.stk-merged{display:inline-flex;margin-top:4px;padding:3px 7px;border-radius:999px;background:rgba(111,208,165,.12);color:#bbf7d0;font-size:11px;font-weight:800}.stk-merged-break{display:block}`;
  document.head.appendChild(style);
}

function isMaterialTable(table) {
  const headers = [...table.querySelectorAll('thead th')].map((th) => norm(th.textContent));
  return headers.length >= 6 && headers[0] === 'MATERIAL' && headers.includes('CATEGORIA') && headers.includes('ATUAL') && headers.includes('MINIMO');
}

function rowKey(cells) {
  const material = norm(cells[0]?.querySelector('b')?.textContent || cells[0]?.textContent || '');
  const categoria = norm(cells[1]?.textContent || '');
  const local = norm(cells[2]?.textContent || '');
  const unidade = getUnit(cells[3]?.textContent || '');
  return [material, categoria, local, unidade].join('|');
}

function ensureGroupedBadge(cell, count) {
  cell.querySelectorAll('.stk-merged,.stk-merged-break').forEach((el) => el.remove());
  if (count <= 1) return;
  const br = document.createElement('br');
  br.className = 'stk-merged-break';
  const badge = document.createElement('span');
  badge.className = 'stk-merged';
  badge.textContent = `${count} cadastros agrupados`;
  cell.appendChild(br);
  cell.appendChild(badge);
}

function applyTableGrouping() {
  if (applying) return;
  applying = true;
  observer.disconnect();
  try {
    ensureStyles();
    document.querySelectorAll('.stk-table').forEach((table) => {
      if (!isMaterialTable(table)) return;
      const rows = [...table.querySelectorAll('tbody tr')].filter((row) => row.children.length >= 6 && !row.querySelector('.stk-empty'));
      const groups = new Map();

      rows.forEach((row) => {
        const cells = row.children;
        const key = rowKey(cells);
        const atual = parseQtd(cells[3]?.textContent || '0');
        const minimo = parseQtd(cells[4]?.textContent || '0');
        const unidade = getUnit(cells[3]?.textContent || cells[4]?.textContent || 'UN');
        const group = groups.get(key);
        if (!group) {
          groups.set(key, { row, count: 1, atual, minimo, unidade });
          return;
        }
        group.count += 1;
        group.atual += atual;
        group.minimo = Math.max(group.minimo, minimo);
        row.remove();
      });

      groups.forEach((group) => {
        const cells = group.row.children;
        cells[3].textContent = `${formatQtd(group.atual)} ${group.unidade}`;
        cells[4].textContent = `${formatQtd(group.minimo)} ${group.unidade}`;
        const status = statusInfo(group.atual, group.minimo);
        cells[5].innerHTML = `<span class="stk-pill ${status.cls}">${status.label}</span>`;
        ensureGroupedBadge(cells[0], group.count);
      });
    });
  } finally {
    applying = false;
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function materialPayloadFromForm() {
  return {
    nome: document.getElementById('mNome')?.value.trim().toUpperCase() || '',
    categoria: document.getElementById('mCategoria')?.value || 'Outros',
    tamanho: document.getElementById('mTamanho')?.value.trim() || null,
    codigo_interno: document.getElementById('mCodigo')?.value.trim() || null,
    unidade: document.getElementById('mUnidade')?.value || 'UN',
    estoque_atual: Number(document.getElementById('mAtual')?.value || 0),
    estoque_minimo: Number(document.getElementById('mMin')?.value || 0),
    estoque_maximo: Number(document.getElementById('mMax')?.value || 0),
    local_armazenamento: document.getElementById('mLocal')?.value || null,
    observacao: document.getElementById('mObs')?.value.trim() || null,
    ativo: true
  };
}

function payloadKey(item) {
  return [norm(item.nome), norm(item.categoria), norm(item.tamanho), norm(item.unidade || 'UN'), norm(item.local_armazenamento)].join('|');
}

async function saveWithoutDuplicate(event) {
  const form = event.target;
  if (!form?.matches?.('#stkMatForm')) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const feedback = document.getElementById('mFb');
  const payload = materialPayloadFromForm();
  if (!payload.nome) return;

  if (feedback) {
    feedback.textContent = 'Verificando material existente...';
    feedback.className = 'stk-feedback';
  }

  try {
    const { data, error } = await supabase
      .from('compras_estoque_materiais')
      .select('*')
      .neq('ativo', false)
      .limit(5000);
    if (error) throw error;

    const existing = (data || []).find((item) => payloadKey(item) === payloadKey(payload));
    if (existing) {
      const { error: updateError } = await supabase
        .from('compras_estoque_materiais')
        .update({
          codigo_interno: existing.codigo_interno || payload.codigo_interno,
          estoque_atual: Number(existing.estoque_atual || 0) + Number(payload.estoque_atual || 0),
          estoque_minimo: Math.max(Number(existing.estoque_minimo || 0), Number(payload.estoque_minimo || 0)),
          estoque_maximo: Math.max(Number(existing.estoque_maximo || 0), Number(payload.estoque_maximo || 0)),
          observacao: payload.observacao || existing.observacao || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from('compras_estoque_materiais').insert(payload);
      if (insertError) throw insertError;
    }

    if (feedback) {
      feedback.textContent = existing ? 'Material existente atualizado e agrupado.' : 'Material salvo.';
      feedback.className = 'stk-feedback ok';
    }
    setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    if (feedback) {
      feedback.textContent = await mensagemFalhaSalvar(error, error?.message || 'Não foi possível salvar o material.');
      feedback.className = 'stk-feedback err';
    }
  }
}

function bindFormInterceptor() {
  const form = document.getElementById('stkMatForm');
  if (!form || form.dataset.groupingBound) return;
  form.addEventListener('submit', saveWithoutDuplicate, { capture: true });
  form.dataset.groupingBound = '1';
}

function tick() {
  applyTableGrouping();
  bindFormInterceptor();
}

const observer = new MutationObserver(() => tick());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', tick);
setTimeout(tick, 300);
