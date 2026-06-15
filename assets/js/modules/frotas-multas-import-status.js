const AUTO_FIELDS = [
  'numero_auto_infracao',
  'numero_auto',
  'numero_autuacao',
  'auto_infracao',
  'codigo_auto',
  'cod_auto',
  'auto'
];

function normalize(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function valueByHeader(row, aliases) {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row).find(([header]) => aliasSet.has(normalizeHeader(header)));
  return entry?.[1] ?? '';
}

function rowAutoKeys(row) {
  return AUTO_FIELDS.map((field) => normalize(row?.[field])).filter(Boolean);
}

function sameVehicle(row, target) {
  const renavam = normalize(row?.renavam);
  const placa = normalize(row?.placa);
  return (renavam && target.renavam && renavam === target.renavam)
    || (placa && target.placa && placa === target.placa);
}

function findMatches(rows, target) {
  if (target.numeroAuto) {
    const exact = rows.filter((row) => rowAutoKeys(row).includes(target.numeroAuto));
    if (exact.length) return exact;
  }
  if (!target.codigoAuto) return [];
  return rows.filter((row) => (
    rowAutoKeys(row).some((key) => key === target.codigoAuto || key.endsWith(target.codigoAuto))
    && sameVehicle(row, target)
  ));
}

function uint16(view, offset) {
  return view.getUint16(offset, true);
}

function uint32(view, offset) {
  return view.getUint32(offset, true);
}

async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (uint32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo XLSX inválido: diretório ZIP não encontrado.');

  const count = uint16(view, eocd + 10);
  let offset = uint32(view, eocd + 16);
  const decoder = new TextDecoder();
  const entries = new Map();

  for (let index = 0; index < count; index += 1) {
    if (uint32(view, offset) !== 0x02014b50) {
      throw new Error('Arquivo XLSX inválido: entrada ZIP corrompida.');
    }
    const method = uint16(view, offset + 10);
    const compressedSize = uint32(view, offset + 20);
    const nameLength = uint16(view, offset + 28);
    const extraLength = uint16(view, offset + 30);
    const commentLength = uint16(view, offset + 32);
    const localOffset = uint32(view, offset + 42);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  async function readEntry(name) {
    const entry = entries.get(name);
    if (!entry) return '';
    const localNameLength = uint16(view, entry.localOffset + 26);
    const localExtraLength = uint16(view, entry.localOffset + 28);
    const start = entry.localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + entry.compressedSize);
    if (entry.method === 0) return decoder.decode(compressed);
    if (entry.method !== 8 || typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não consegue descompactar o arquivo XLSX.');
    }
    const stream = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return decoder.decode(await new Response(stream).arrayBuffer());
  }

  return { readEntry };
}

function decodeXml(value) {
  return String(value || '').replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, code) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (named[code]) return named[code];
      if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return entity;
    }
  );
}

function attributes(source) {
  const result = {};
  const pattern = /([\w:.-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(source))) result[match[1]] = decodeXml(match[3]);
  return result;
}

function openTags(xml, name) {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*)>`, 'gi');
  return [...String(xml || '').matchAll(pattern)].map((match) => attributes(match[1]));
}

function pairedTags(xml, name) {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?<!\\/)>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,
    'gi'
  );
  return [...String(xml || '').matchAll(pattern)].map((match) => ({
    attrs: attributes(match[1]),
    inner: match[2]
  }));
}

function textFromTags(xml, name) {
  return pairedTags(xml, name).map((tag) => decodeXml(tag.inner.replace(/<[^>]+>/g, ''))).join('');
}

function zipPath(target) {
  const initial = String(target || '').startsWith('/') ? String(target).slice(1) : `xl/${target}`;
  return initial.split('/').reduce((parts, part) => {
    if (!part || part === '.') return parts;
    if (part === '..') parts.pop();
    else parts.push(part);
    return parts;
  }, []).join('/');
}

function columnIndex(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const letter of letters) index = (index * 26) + letter.charCodeAt(0) - 64;
  return index - 1;
}

export async function readXlsxRows(file) {
  const archive = await unzipEntries(await file.arrayBuffer());
  const workbook = await archive.readEntry('xl/workbook.xml');
  const relationships = await archive.readEntry('xl/_rels/workbook.xml.rels');
  const sheets = openTags(workbook, 'sheet');
  const selected = sheets.find((sheet) => normalizeHeader(sheet.name) === 'multas') || sheets[0];
  if (!selected) throw new Error('Nenhuma aba foi encontrada no arquivo XLSX.');

  const relationshipId = selected['r:id'];
  const relationship = openTags(relationships, 'Relationship')
    .find((item) => item.Id === relationshipId);
  if (!relationship) throw new Error('Não foi possível localizar a aba de multas.');

  const sheet = await archive.readEntry(zipPath(relationship.Target));
  const sharedXml = await archive.readEntry('xl/sharedStrings.xml');
  const shared = sharedXml
    ? pairedTags(sharedXml, 'si').map((item) => textFromTags(item.inner, 't'))
    : [];

  const matrix = pairedTags(sheet, 'row').map((row) => {
    const cells = [];
    pairedTags(row.inner, 'c').forEach((cell) => {
      const index = columnIndex(cell.attrs.r);
      const type = cell.attrs.t;
      let value = textFromTags(cell.inner, 'v');
      if (type === 's') value = shared[Number(value)] ?? '';
      if (type === 'inlineStr') value = textFromTags(cell.inner, 't');
      cells[index] = value;
    });
    return cells;
  });

  const headers = matrix[0] || [];
  return matrix.slice(1).map((cells) => Object.fromEntries(
    headers.map((header, index) => [header, cells[index] ?? ''])
  ));
}

export async function parseMultasStatusXlsx(file) {
  const rows = await readXlsxRows(file);
  const parsed = rows.map((row) => ({
    placa: normalize(valueByHeader(row, ['Placa'])),
    renavam: normalize(valueByHeader(row, ['Renavam'])),
    numeroAuto: normalize(valueByHeader(row, [
      'Nº Auto Infração',
      'N° Auto Infração',
      'Numero Auto Infracao',
      'Auto Infração'
    ])),
    codigoAuto: normalize(valueByHeader(row, ['CodAuto', 'Código Auto', 'Codigo Auto'])),
    status: String(valueByHeader(row, ['Situação', 'Situacao', 'Status'])).trim()
  })).filter((row) => row.status && (row.numeroAuto || row.codigoAuto));

  if (!parsed.length) {
    throw new Error('Nenhuma linha com Auto e Situação preenchidos foi encontrada.');
  }

  const unique = new Map();
  parsed.forEach((target) => {
    const key = target.numeroAuto || `${target.codigoAuto}:${target.renavam}:${target.placa}`;
    const existing = unique.get(key);
    if (existing && normalize(existing.status) !== normalize(target.status)) {
      throw new Error(`O Auto ${key} possui Situações conflitantes na planilha.`);
    }
    unique.set(key, target);
  });
  return [...unique.values()];
}

async function updateGroup(supabase, ids, status) {
  const now = new Date().toISOString();
  const result = await supabase
    .from('frotas_multas')
    .update({ status_multa: status, situacao: status, atualizado_em: now })
    .in('id', ids);
  if (!result.error) return;

  const fallback = await supabase
    .from('frotas_multas')
    .update({ status_multa: status, atualizado_em: now })
    .in('id', ids);
  if (fallback.error) throw fallback.error;
}

async function applyTargets(supabase, targets) {
  const { data, error } = await supabase.from('frotas_multas').select('*');
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const groups = new Map();
  const notFound = [];
  let unchanged = 0;
  targets.forEach((target) => {
    const matches = findMatches(rows, target);
    if (matches.length !== 1) {
      notFound.push(target.numeroAuto || target.codigoAuto);
      return;
    }
    const row = matches[0];
    if (normalize(row.status_multa) === normalize(target.status)) {
      unchanged += 1;
      return;
    }
    const ids = groups.get(target.status) || [];
    ids.push(row.id);
    groups.set(target.status, ids);
  });

  let updated = 0;
  for (const [status, ids] of groups.entries()) {
    await updateGroup(supabase, [...new Set(ids)], status);
    updated += new Set(ids).size;
  }
  return { total: targets.length, updated, unchanged, notFound };
}

function toast(message, error = false) {
  let element = document.querySelector('[data-multas-xlsx-toast]');
  if (!element) {
    element = document.createElement('div');
    element.className = 'fm-toast';
    element.dataset.multasXlsxToast = '1';
    document.body.appendChild(element);
  }
  element.textContent = message;
  element.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 6500);
}

export function installMultasStatusImporter(container, supabase) {
  const toolbar = container.querySelector('.fm-toolbar');
  if (!toolbar || toolbar.querySelector('[data-import-status-xlsx]')) return;

  toolbar.classList.add('fm-toolbar-status-import');
  if (!container.querySelector('[data-import-status-style]')) {
    const style = document.createElement('style');
    style.dataset.importStatusStyle = '1';
    style.textContent = '@media(min-width:1001px){'
      + '.fm-toolbar.fm-toolbar-status-import{'
      + 'grid-template-columns:180px 190px minmax(220px,1fr) auto auto auto'
      + '}}';
    container.appendChild(style);
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.hidden = true;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fm-btn soft';
  button.dataset.importStatusXlsx = '1';
  button.textContent = 'Atualizar status por XLSX';

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Lendo planilha...';
    try {
      const targets = await parseMultasStatusXlsx(file);
      const confirmed = window.confirm(
        `${targets.length} multa(s) possuem Situação preenchida. `
        + 'Deseja atualizar somente as multas existentes com correspondência única?'
      );
      if (!confirmed) return;

      button.textContent = 'Atualizando...';
      const summary = await applyTargets(supabase, targets);
      container.querySelector('[data-refresh]')?.click();
      const message = `${summary.updated} atualizada(s), ${summary.unchanged} já correta(s)`
        + (summary.notFound.length ? ` e ${summary.notFound.length} não localizada(s).` : '.');
      toast(message, Boolean(summary.notFound.length));
      if (summary.notFound.length) {
        window.alert(
          `${message}\n\nAutos não localizados ou ambíguos:\n`
          + summary.notFound.slice(0, 20).join('\n')
        );
      }
    } catch (error) {
      console.error('Falha ao importar status das multas:', error);
      toast(error.message || 'Falha ao importar a planilha.', true);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  toolbar.append(button, input);
}
