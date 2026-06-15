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

function parseTargets(file) {
  if (!window.XLSX) {
    throw new Error('Leitor XLSX indisponível. Atualize a página e tente novamente.');
  }

  return file.arrayBuffer().then((buffer) => {
    const workbook = window.XLSX.read(buffer);
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'multas')
      || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

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
  });
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
  input.accept = '.xlsx,.xls';
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
      const targets = await parseTargets(file);
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
