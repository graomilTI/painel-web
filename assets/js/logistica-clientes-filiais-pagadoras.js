import { supabase } from './supabaseClient.js';

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\u00A0/g, ' ')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const byCliente = new Map();
let ready = false;
let syncing = false;

function hasOption(select, value) {
  return [...select.options].some((option) => option.value === value);
}

function ensureOption(select, value) {
  if (!select || !value || hasOption(select, value)) return;
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  select.appendChild(option);
}

function buildIndex(data, clientesInativos) {
  byCliente.clear();

  (Array.isArray(data) ? data : []).forEach((row) => {
    const cliente = String(row.cliente_nacional ?? '').trim();
    const filial = String(row.filial_pagadora ?? '').trim();
    const key = normalize(cliente);
    if (!key || !filial || clientesInativos.has(key)) return;

    if (!byCliente.has(key)) byCliente.set(key, { cliente, filiais: [] });
    const entry = byCliente.get(key);
    if (!entry.filiais.some((item) => normalize(item) === normalize(filial))) {
      entry.filiais.push(filial);
    }
  });

  [...byCliente.values()].forEach((entry) => {
    entry.filiais.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });
}

function syncFiliais(clienteValue, filialValue = '', preserveLegacy = false) {
  const select = document.getElementById('osFilialPagadora');
  if (!select || !ready) return;

  const entry = byCliente.get(normalize(clienteValue));
  const filiais = entry?.filiais || [];
  const placeholder = !clienteValue
    ? 'Selecione o cliente primeiro'
    : filiais.length
      ? 'Selecione'
      : 'Nenhuma filial pagadora associada';

  select.innerHTML = `<option value="">${placeholder}</option>${filiais
    .map((filial) => `<option value="${esc(filial)}">${esc(filial)}</option>`)
    .join('')}`;

  if (preserveLegacy && filialValue && !hasOption(select, filialValue)) {
    ensureOption(select, filialValue);
  }

  select.value = filialValue && hasOption(select, filialValue) ? filialValue : '';
  select.disabled = !filiais.length && !(preserveLegacy && filialValue);
  select.dataset.clienteFilialMaster = '1';
}

function syncForm() {
  if (!ready || syncing) return;

  const clienteSelect = document.getElementById('osContratante');
  const filialSelect = document.getElementById('osFilialPagadora');
  if (!clienteSelect || !filialSelect) return;

  syncing = true;
  try {
    const clienteAtual = clienteSelect.value;
    const filialAtual = filialSelect.value;
    const clientes = [...byCliente.values()]
      .map((entry) => entry.cliente)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    clienteSelect.innerHTML = `<option value="">Selecione</option>${clientes
      .map((cliente) => `<option value="${esc(cliente)}">${esc(cliente)}</option>`)
      .join('')}`;

    // Compatibilidade com solicitações antigas abertas para correção: se o
    // valor histórico não estiver mais no cadastro mestre, ele continua
    // selecionável somente enquanto aquela solicitação estiver sendo editada.
    if (clienteAtual && !hasOption(clienteSelect, clienteAtual)) {
      ensureOption(clienteSelect, clienteAtual);
    }

    clienteSelect.value = clienteAtual && hasOption(clienteSelect, clienteAtual)
      ? clienteAtual
      : '';
    clienteSelect.dataset.clienteFilialMaster = '1';

    syncFiliais(clienteSelect.value, filialAtual, true);
  } finally {
    syncing = false;
  }
}

document.addEventListener('change', (event) => {
  if (event.target?.id !== 'osContratante' || !ready) return;

  // O listener original de logistica.js também reage a esta mudança. Rodamos
  // depois dele para garantir que a relação mestre seja a fonte final.
  queueMicrotask(() => {
    const filialAtual = document.getElementById('osFilialPagadora')?.value || '';
    const alteracaoDoUsuario = event.isTrusted;
    syncFiliais(
      event.target.value,
      alteracaoDoUsuario ? '' : filialAtual,
      !alteracaoDoUsuario,
    );
  });
});

const observerRoot = document.getElementById('pageContent') || document.body;
new MutationObserver(() => {
  const clienteSelect = document.getElementById('osContratante');
  if (clienteSelect && clienteSelect.dataset.clienteFilialMaster !== '1') {
    syncForm();
  }
}).observe(observerRoot, { childList: true, subtree: true });

async function boot() {
  const [mestre, inativos] = await Promise.all([
    supabase
      .from('logistica_clientes_filiais_pagadoras')
      .select('cliente_nacional,filial_pagadora')
      .eq('ativo', true)
      .order('cliente_nacional', { ascending: true })
      .order('filial_pagadora', { ascending: true })
      .limit(5000),
    supabase
      .from('clientes_nacionais')
      .select('nome')
      .eq('ativo', false)
      .limit(1000),
  ]);

  if (mestre.error) {
    console.error('[logistica-clientes-filiais-pagadoras] Falha ao carregar cadastro mestre:', mestre.error);
    // Em falha de leitura, a lógica histórica já existente em logistica.js
    // permanece funcionando como fallback, sem bloquear a Abertura de O.S.
    return;
  }

  if (inativos.error) {
    console.warn('[logistica-clientes-filiais-pagadoras] Não foi possível filtrar clientes inativos:', inativos.error);
  }

  const clientesInativos = new Set(
    (Array.isArray(inativos.data) ? inativos.data : [])
      .map((row) => normalize(row.nome))
      .filter(Boolean),
  );

  buildIndex(mestre.data, clientesInativos);
  ready = byCliente.size > 0;

  if (!ready) {
    console.warn('[logistica-clientes-filiais-pagadoras] Cadastro mestre vazio; mantendo referências históricas.');
    return;
  }

  syncForm();
}

boot().catch((error) => {
  console.error('[logistica-clientes-filiais-pagadoras]', error);
});
