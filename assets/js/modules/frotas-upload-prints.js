// Frotas — envio dos prints de excesso de velocidade (OCR + conciliação).
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261015-frotas-dos1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { buildOcrReconciliationPlan, normalizeOcrResponse } from './frotas-print-ocr-core.js?v=20260820a';
import { PASTA_MAE_DRIVE_ID, DEFAULT_GAS_URL, state, currentRenderOpts, todayBRShort, isUnknownDriverName, escapeHtml, onlyPlate, formatDateBR, brDateToFilePrefix, parseSpeed, dedupeHighestSpeedByDate, getCurrentUserName, getCurrentUserId, toast, normalizeDateForMatch, toInputDate } from './frotas-base.js?v=20261015-frotas-dos1';
import { fileToBase64, runBrowserOcrWithTesseract, fileToOcrBase64Variants, getOcrTextFromFileResult, isNotificationTitleLike, getPossibleFileDriverName, normalizeSavedPrintFileResult, extractOcrRecordsFromText, getFileNotificationNumber, rowNotificationNumber, getFileMatchedIds, getPossibleFilePlate } from './frotas-ocr.js?v=20261015-frotas-dos1';
import { loadColaboradoresFromSupabase } from './frotas-colaboradores.js?v=20261015-frotas-dos1';
import { buildPrintDriverMap, buildKnownDriversForOcr } from './frotas-excessos-dados.js?v=20261015-frotas-dos1';

  function cloneFileWithName(file, name) {
    try {
      return new File([file], name, { type: file.type || 'image/png', lastModified: file.lastModified || Date.now() });
    } catch (_) {
      file.__displayName = name;
      return file;
    }
  }

  function clipboardImageFilesFromEvent(ev) {
    const out = [];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    Array.from(ev?.clipboardData?.items || []).forEach((item, index) => {
      if (!String(item.type || '').startsWith('image/')) return;
      const blob = item.getAsFile && item.getAsFile();
      if (!blob) return;
      const ext = (String(blob.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
      const name = blob.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(blob.name)
        ? blob.name
        : `print-colado-${stamp}-${index + 1}.${ext}`;
      out.push(cloneFileWithName(blob, name));
    });

    if (!out.length) {
      Array.from(ev?.clipboardData?.files || []).forEach((file, index) => {
        if (!String(file.type || '').startsWith('image/')) return;
        const ext = (String(file.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
        const name = file.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(file.name)
          ? file.name
          : `print-colado-${stamp}-${index + 1}.${ext}`;
        out.push(cloneFileWithName(file, name));
      });
    }

    return out;
  }

  function addUploadedFiles(root, files, source = 'selecionado') {
    const incoming = Array.from(files || []).filter((file) => String(file.type || '').startsWith('image/'));
    if (!incoming.length) {
      toast('Nenhuma imagem encontrada. Cole ou selecione prints em formato de imagem.', 'error');
      return;
    }

    const prepared = incoming.map((file, index) => {
      const hasUsefulName = file.name && !/^image\.(png|jpg|jpeg|webp)$/i.test(file.name);
      const name = hasUsefulName ? file.name : `print-colado-${new Date().toISOString().replace(/[:.]/g, '-')}-${index + 1}.png`;
      const next = hasUsefulName ? file : cloneFileWithName(file, name);
      next.__source = source;
      return next;
    });

    const seen = new Set(state.uploadedFiles.map((file) => `${file.name || file.__displayName}|${file.size}|${file.lastModified || ''}`));
    prepared.forEach((file) => {
      const key = `${file.name || file.__displayName}|${file.size}|${file.lastModified || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        state.uploadedFiles.push(file);
      }
    });

    renderUploadLists(root);
    toast(`${prepared.length} print(s) adicionados para envio.`);
  }

  function syncRecordsFromDom(root) {
    state.records = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({ data: row.querySelector('[data-speed-date]')?.value || '', velocidade: row.querySelector('[data-speed-value]')?.value || '' }));
    if (!state.records.length) state.records = [{ data: '', velocidade: '' }];
  }

  function renderRecords(root) {
    const list = root.querySelector('[data-speed-records]');
    if (!list) return;
    list.innerHTML = state.records.map((record, index) => `
      <div class="speed-row" data-speed-record data-index="${index}">
        <div class="speed-field"><label>Data</label><input class="speed-input" type="date" data-speed-date value="${escapeHtml(record.data)}"></div>
        <div class="speed-field"><label>Velocidade</label><input class="speed-input" type="number" min="1" step="1" placeholder="123" data-speed-value value="${escapeHtml(record.velocidade)}"></div>
        <button class="speed-btn speed-btn-danger" type="button" title="Remover registro" data-remove-record="${index}">×</button>
      </div>`).join('');
    bindRecordEvents(root);
  }

  function bindRecordEvents(root) {
    root.querySelectorAll('[data-speed-date], [data-speed-value]').forEach((input) => input.addEventListener('input', () => syncRecordsFromDom(root)));
    root.querySelectorAll('[data-remove-record]').forEach((btn) => btn.addEventListener('click', () => {
      syncRecordsFromDom(root);
      state.records.splice(Number(btn.getAttribute('data-remove-record')), 1);
      if (!state.records.length) state.records.push({ data: '', velocidade: '' });
      renderRecords(root);
    }));
  }

  function renderUploadLists(root) {
    const selected = root.querySelector('[data-upload-list]');
    if (selected) {
      selected.innerHTML = state.uploadedFiles.length ? state.uploadedFiles.map((f, index) => `<div class="upload-item"><span><strong>${escapeHtml(f.name || f.__displayName || 'print.png')}</strong><br>${Math.round(f.size / 1024)} KB · ${escapeHtml(f.__source || 'selecionado')}</span><button class="speed-btn speed-btn-danger" type="button" data-remove-upload="${index}" title="Remover print">×</button></div>`).join('') : '<div class="speed-import-empty">Nenhum print adicionado ainda.</div>';
      selected.querySelectorAll('[data-remove-upload]').forEach((btn) => btn.addEventListener('click', () => {
        state.uploadedFiles.splice(Number(btn.getAttribute('data-remove-upload')), 1);
        renderUploadLists(root);
      }));
    }
    const saved = root.querySelector('[data-saved-list]');
    if (saved) {
      saved.innerHTML = state.savedPrints.length ? state.savedPrints.map((f) => {
        const driverName = getPossibleFileDriverName(f);
        const rawFolder = f.driverFolderName || f.folderName || '';
        const folderIsInvalid = isUnknownDriverName(rawFolder) || isNotificationTitleLike(rawFolder);
        const folderName = driverName || (folderIsInvalid ? 'OCR - CONFERIR' : rawFolder);
        const notificationNumber = getFileNotificationNumber(f);
        const notificationLine = notificationNumber ? `<br>Nº notificação: ${escapeHtml(notificationNumber)}` : '';
        const previewRaw = String(f.ocrPreview || f.ocrText || '').trim();
        const preview = previewRaw ? `<br><small>OCR usado: ${escapeHtml(f.ocrVariantUsed || f.ocrVariant || f.browserOcrSource || 'imagem tratada')} · Prévia: ${escapeHtml(previewRaw.slice(0, 320))}${previewRaw.length > 320 ? '...' : ''}</small>` : '<br><small>OCR vazio: nem o navegador nem o Drive retornaram texto útil.</small>';
        const extra = driverName && folderIsInvalid
          ? '<br><small>Motorista identificado pelo OCR do print. A pasta exibida foi corrigida para o nome do motorista.</small>'
          : (folderIsInvalid ? '<br><small>OCR ainda não retornou motorista válido para este arquivo.</small>' : '');
        return `<div class="saved-item"><strong>${escapeHtml(f.fileName || 'Print salvo')}</strong><br>Pasta: ${escapeHtml(folderName)}${notificationLine}${extra}${preview}${f.fileUrl ? `<br><a href="${escapeHtml(f.fileUrl)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}</div>`;
      }).join('') : '';
    }
  }

  function applyOcrResult(root, result) {
    const data = normalizeOcrResponse(result);
    const placa = onlyPlate(data.placa || data.vehiclePlate || '');
    if (placa) {
      const plateInput = root.querySelector('[data-speed-plate]');
      if (plateInput && !plateInput.value) plateInput.value = placa;
    }

    const registros = Array.isArray(data.registros) ? data.registros : [];
    const parsedRecords = registros.map((r) => ({ data: toInputDate(r.data || r.date), velocidade: parseSpeed(r.velocidade || r.speed) })).filter((r) => r.data && r.velocidade);
    if (parsedRecords.length) {
      syncRecordsFromDom(root);
      const existing = state.records.filter((r) => r.data && r.velocidade);
      state.records = dedupeHighestSpeedByDate([...existing, ...parsedRecords]).map((r) => ({ data: toInputDate(r.data) || r.data, velocidade: r.velocidade }));
      renderRecords(root);
    }

    if (Array.isArray(data.files)) {
      const normalizedFiles = data.files.map((file) => normalizeSavedPrintFileResult(file));
      state.savedPrints = [...normalizedFiles, ...state.savedPrints];
      renderUploadLists(root);
    }
  }

  async function persistOcrJob(supabase, plan, notificationDate) {
    const file = plan.file || {};
    const userId = getCurrentUserId();
    const payload = {
      arquivo_id: String(file.fileId || file.id || '') || null,
      arquivo_nome: String(file.fileName || file.name || 'Print sem nome'),
      arquivo_url: String(file.fileUrl || file.url || '') || null,
      data_notificacao: normalizeDateForMatch(notificationDate) || null,
      placa_ocr: plan.plate || null,
      motorista_ocr: getPossibleFileDriverName(file) || null,
      registros_ocr: plan.records,
      resposta_ocr: file,
      status: plan.status,
      ids_correspondentes: plan.matches.map((item) => item.row.id),
      candidatos_ambiguos: plan.ambiguous,
      motivo: plan.matches[0]?.reason || (plan.ambiguous.length ? 'mais_de_um_candidato' : 'sem_evidencia_suficiente')
    };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.criado_por = userId;
    const { data, error } = await supabase.from('frotas_print_ocr_execucoes').insert(payload).select('id').single();
    if (error) throw new Error(`Não foi possível registrar a auditoria do print: ${error.message}`);
    return data.id;
  }

  async function archiveMatchedImportedRowsFromOcr(root, files, notificationDate) {
    const supabase = window.supabase;
    const savedFiles = Array.isArray(files) ? files : [];
    if (!savedFiles.length || !supabase || typeof supabase.from !== 'function') return { archivedCount: 0, reviewCount: 0 };

    const openRows = (state.importedExcessos || []).filter((row) => {
      const status = String(row.status_notificacao || '').toUpperCase();
      return status === 'PENDENTE' || status === 'GERADA';
    });
    const plans = buildOcrReconciliationPlan({
      files: savedFiles,
      openRows,
      helpers: {
        getPlate: getPossibleFilePlate,
        getNotification: getFileNotificationNumber,
        getMatchedIds: getFileMatchedIds,
        rowNotification: rowNotificationNumber,
        getTextRecords: (file) => extractOcrRecordsFromText(getOcrTextFromFileResult(file))
      },
      speedTolerance: 1
    });
    const nowIso = new Date().toISOString();
    const userId = getCurrentUserId();
    const userName = getCurrentUserName();
    let archivedCount = 0;
    let reviewCount = 0;
    const archivedIds = new Set();
    try {
      for (const plan of plans) {
        const executionId = await persistOcrJob(supabase, plan, notificationDate);
        const ids = plan.matches.map((item) => item.row.id);
        if (!ids.length) { reviewCount += 1; continue; }
        const file = plan.file || {};
        const payload = {
          status_notificacao: 'NOTIFICADO',
          notificado_em: nowIso,
          observacoes: `Arquivado automaticamente por OCR auditável #${executionId}. Motivo: ${plan.matches[0].reason}. Arquivo: ${file.fileName || file.fileUrl || 'print salvo no Drive'}`
        };
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) payload.notificado_por = userId;
        if (userName) payload.notificado_por_nome = userName;
        const { data: updated, error } = await supabase.from('frotas_excesso_velocidade')
          .update(payload).in('id', ids).in('status_notificacao', ['PENDENTE', 'GERADA']).select('id');
        if (error) throw error;
        (updated || []).forEach((row) => archivedIds.add(String(row.id)));
        archivedCount += (updated || []).length;
        const { error: auditError } = await supabase.from('frotas_print_ocr_execucoes').update({
          status: (updated || []).length === ids.length ? 'ARQUIVADO' : 'CONFLITO_CONCORRENCIA',
          ids_arquivados: (updated || []).map((row) => row.id),
          processado_em: new Date().toISOString()
        }).eq('id', executionId);
        if (auditError) console.warn('[FROTAS] Ocorrência baixada, mas a finalização da auditoria falhou:', auditError);
      }
      state.importedExcessos.forEach((row) => {
        if (archivedIds.has(String(row.id))) row.status_notificacao = 'NOTIFICADO';
      });
      if (archivedCount) toast(`${archivedCount} registro(s) arquivado(s) com auditoria do OCR.${reviewCount ? ` ${reviewCount} print(s) ficaram para conferência.` : ''}`);
      else toast(`${reviewCount || plans.length} print(s) registrado(s) para conferência. Nenhuma ocorrência foi baixada sem evidência suficiente.`, 'error');
      return { archivedCount, reviewCount };
    } catch (err) {
      console.warn('[FROTAS] Falha ao arquivar registros após envio do print:', err);
      throw err;
    }
  }

  async function uploadPrints(root) {
    const urlInput = root.querySelector('[data-gas-url]');
    const gasUrl = String(urlInput?.value || state.gasUrl || DEFAULT_GAS_URL).trim();
    const dataNotificacao = root.querySelector('[data-notification-date]')?.value || todayBRShort();

    if (!gasUrl) return toast('Informe a URL do Web App do Apps Script.', 'error');
    if (!state.uploadedFiles.length) return toast('Selecione ao menos um print para enviar.', 'error');

    state.gasUrl = gasUrl;

    const btn = root.querySelector('[data-upload-prints]');
    if (btn) { btn.disabled = true; btn.textContent = 'Lendo prints por OCR no navegador e Drive...'; }

    try {
      if (!state.colaboradoresLoaded) {
        await loadColaboradoresFromSupabase(root, currentRenderOpts);
      }
      const driverMap = buildPrintDriverMap();
      const knownDrivers = buildKnownDriversForOcr(currentRenderOpts);
      const files = [];
      for (const file of state.uploadedFiles) {
        const originalBase64 = await fileToBase64(file);
        const ocrVariants = await fileToOcrBase64Variants(file);
        const browserOcr = await runBrowserOcrWithTesseract(file, ocrVariants);
        files.push({
          name: file.name || file.__displayName || `print-${Date.now()}.png`,
          mimeType: file.type || 'image/png',
          base64: originalBase64,
          ocrBase64: ocrVariants[0]?.base64 || '',
          ocrVariants,
          browserOcrText: browserOcr.text || '',
          browserOcrSource: browserOcr.source || '',
          ocrTextHint: browserOcr.text || ''
        });
      }

      const resp = await fetch(gasUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upload_excesso_velocidade',
          parentFolderId: PASTA_MAE_DRIVE_ID,
          // Processo 2 100% independente do Painel 1:
          // não envia motorista/placa selecionados, para o print nunca ficar preso à mensagem copiada.
          // Não deixar o Apps Script cair no fallback antigo "MOTORISTA NAO IDENTIFICADO".
          // A pasta final deve ser definida pelo OCR; se não identificar, cai em conferência.
          driverName: '',
          driverFolderName: 'OCR - CONFERIR',
          folderName: 'OCR - CONFERIR',
          targetFolderName: 'OCR - CONFERIR',
          fallbackFolderName: 'OCR - CONFERIR',
          defaultFolderName: 'OCR - CONFERIR',
          plate: '',
          selectedDriverName: '',
          selectedPlate: '',
          processMode: 'OCR_ONLY_INDEPENDENT',
          autoRouteByOcr: true,
          routeByOcrDriverName: true,
          ocrOnlyIndependent: true,
          ignoreSelectedSuggestion: true,
          ignoreCopiedMessage: true,
          ignoreFileNameAsDriver: true,
          preventFolderFromFileName: true,
          rejectGenericDriverName: true,
          rejectNotificationTitleAsDriver: true,
          requireOcrBeforeFolder: true,
          folderFallbackMode: 'OCR_CONFERIR_ONLY',
          saveUnknownDriverFolder: false,
          unknownDriverFolderName: 'OCR - CONFERIR',
          unknownFolderName: 'OCR - CONFERIR',
          ocrReviewFolderName: 'OCR - CONFERIR',
          identifyDriverIndependentOfPanel1: true,
          blockFolderNames: ['MOTORISTA NAO IDENTIFICADO', 'MOTORISTA NÃO IDENTIFICADO'],
          forceUnknownToReviewFolder: true,
          driverNameRegexHints: [
            '^(.*?)\\s*,\\s*Constatamos',
            '^(.*?)\\s*,\\s*comunicamos',
            '^(.*?)\\s*,\\s*identificamos'
          ],
          notificationDate: formatDateBR(dataNotificacao),
          filePrefixDate: brDateToFilePrefix(dataNotificacao),
          fileNamingPattern: 'ordinal_notification_year_driver',
          driverMap,
          knownDrivers,
          files
        })
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'Falha ao processar prints.');
      applyOcrResult(root, json);
      const ocrData = normalizeOcrResponse(json);
      const reconciliation = await archiveMatchedImportedRowsFromOcr(root, ocrData.files.map((file) => normalizeSavedPrintFileResult(file)), dataNotificacao);
      state.uploadedFiles = [];
      const input = root.querySelector('[data-print-files]');
      if (input) input.value = '';
      renderUploadLists(root);
      if (!reconciliation?.archivedCount) toast('Prints salvos no Drive e mantidos na fila de conferência.');
    } catch (err) {
      console.error('[FROTAS] Upload/OCR:', err);
      toast(err.message || 'Erro ao enviar prints.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar prints e conferir por OCR'; }
    }
  }

export { clipboardImageFilesFromEvent, addUploadedFiles, renderUploadLists, uploadPrints };
