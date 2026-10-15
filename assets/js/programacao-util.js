// Programação — funções utilitárias (formatação, normalização de texto/CPF/placa, HTML de selects e cartões).
// Extraído de programacao.js em 15/10/2026 (declarações do topo do arquivo e funções de renderContent que não
// dependem do estado da tela). Código movido sem alteração. Ao editar, troque o ?v= deste módulo em TODOS os
// imports (programacao.js e demais módulos programacao-*): o teste tests/programacao-modulos-versao.test.mjs confere.
import { TIPOS_EXTRA } from './programacao-constantes.js?v=20261015-nucleo1';

function debounce(fn, wait = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIso() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function brDate(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(iso);
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(colab) {
  return normalizeCpf(colab.cpf) || String(colab.id || colab.nome || '').trim();
}

function toNumberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeUF(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function onlyPlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function splitPossibleNames(value) {
  return String(value || '')
    .split(/[;,|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pessoaMatchesColaborador(pessoa, colab) {
  if (!pessoa || !colab) return false;
  const cpfPessoa = normalizeCpf(pessoa.cpf || pessoa.documento || pessoa.cpf_colaborador || pessoa.colaborador_cpf);
  const cpfColab = normalizeCpf(colab.cpf);
  if (cpfPessoa && cpfColab && cpfPessoa === cpfColab) return true;

  const nomes = splitPossibleNames(firstFilled(pessoa.nome, pessoa.name, pessoa.motorista, pessoa.condutor, pessoa.colaborador, pessoa.responsavel));
  const nomeColab = normalizeText(colab.nome);
  if (!nomeColab) return false;
  return nomes.some((nome) => {
    const nomeNorm = normalizeText(nome);
    return nomeNorm && (nomeNorm === nomeColab || nomeNorm.includes(nomeColab) || nomeColab.includes(nomeNorm));
  });
}

function selectOptions(options, selected) {
  return options.map((opt) => `<option value="${escapeHtml(opt)}" ${String(selected || '') === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');
}

function estadiaLabel(tipo) {
  return ({ CASA: 'Casa', PERNOITE: 'Pernoite', ALOJAMENTO: 'Alojamento', HOTEL: 'Hotel' })[normalizeText(tipo)] || '';
}

function estadiaIcon(tipo) {
  const key = normalizeText(tipo);
  if (key === 'CASA') return '<svg viewBox="0 0 48 48"><path d="M7 24L24 10l17 14"/><path d="M13 22v17h22V22"/><path d="M20 39V28h8v11"/></svg>';
  if (key === 'PERNOITE') return '<svg viewBox="0 0 48 48"><path d="M8 36h32"/><path d="M12 36V22l12-8 12 8v14"/><path d="M18 36v-9h12v9"/><path d="M6 26l18-12 18 12"/><path d="M36 12c4 2 6 5 6 9"/></svg>';
  if (key === 'ALOJAMENTO') return '<svg viewBox="0 0 48 48"><circle cx="16" cy="16" r="5"/><circle cx="32" cy="16" r="5"/><path d="M8 36c1-7 5-11 8-11s7 4 8 11"/><path d="M24 36c1-7 5-11 8-11s7 4 8 11"/></svg>';
  return '<svg viewBox="0 0 48 48"><path d="M12 40V10h24v30"/><path d="M8 40h32"/><path d="M18 16h4M26 16h4M18 23h4M26 23h4M18 30h4M26 30h4"/><path d="M22 40v-6h4v6"/></svg>';
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const a = Number(lat1), b = Number(lon1), c = Number(lat2), d = Number(lon2);
  if (![a,b,c,d].every(Number.isFinite)) return null;
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(c - a);
  const dLon = toRad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

  function addDaysIso(iso, days) {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function extraCard(r, blocked) {
    return `<div class="prog-extra-card" data-extra-id="${escapeHtml(r.id)}">
      <select data-extra-field="tipo_despesa" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_EXTRA, r.tipo_despesa || 'OUTRO')}</select>
      <input data-extra-field="descricao" type="text" value="${escapeHtml(r.descricao || '')}" placeholder="Descrição" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação" ${blocked ? 'disabled' : ''}/>
      <button type="button" class="prog-mini-btn danger" data-action="delete-extra" ${blocked ? 'disabled' : ''}>Excluir</button>
    </div>`;
  }

  function getFieldPayload(container, attr = 'data-field') {
    const payload = {};
    container.querySelectorAll(`[${attr}]`).forEach((field) => {
      const key = field.getAttribute(attr);
      if (field.type === 'checkbox') payload[key] = !!field.checked;
      else if (['km', 'valor', 'diarias'].includes(key)) payload[key] = toNumberBR(field.value);
      else payload[key] = field.value || null;
    });
    return payload;
  }

export { debounce, escapeHtml, todayIso, brDate, normalizeCpf, colaboradorKey, moneyBR, normalizeText, normalizeUF, onlyPlate, firstFilled, pessoaMatchesColaborador, selectOptions, estadiaLabel, estadiaIcon, haversineKm, addDaysIso, extraCard, getFieldPayload };
