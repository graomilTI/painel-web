/* assets/js/modules/frotas.js */
(function () {
  'use strict';

  const MODULE_NAME = 'FROTAS';

  const state = {
    records: [
      { data: '', velocidade: '' }
    ],
    lastMessage: ''
  };

  function todayBR() {
    const d = new Date();
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  function normalizeName(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function onlyPlate(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  }

  function formatDateBR(value) {
    if (!value) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

    const parts = String(value).split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }

    return value;
  }

  function parseSpeed(value) {
    const n = Number(String(value || '').replace(',', '.'));
    if (!Number.isFinite(n)) return '';
    return Math.round(n);
  }

  function getStyles() {
    return `
      <style id="frotas-module-style">
        .frotas-shell {
          width: 100%;
          color: #e5e7eb;
        }

        .frotas-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .frotas-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #86efac;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .frotas-title {
          margin: 0;
          font-size: clamp(22px, 2.2vw, 32px);
          line-height: 1.1;
          color: #f8fafc;
          letter-spacing: -0.04em;
        }

        .frotas-subtitle {
          max-width: 780px;
          margin: 10px 0 0;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.55;
        }

        .frotas-card {
          background:
            radial-gradient(circle at top left, rgba(34, 197, 94, .13), transparent 34%),
            linear-gradient(180deg, rgba(15, 23, 42, .98), rgba(2, 6, 23, .98));
          border: 1px solid rgba(148, 163, 184, .16);
          border-radius: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, .28);
          overflow: hidden;
        }

        .frotas-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          padding: 14px;
          border-bottom: 1px solid rgba(148, 163, 184, .12);
          background: rgba(2, 6, 23, .36);
        }

        .frotas-tab {
          appearance: none;
          border: 1px solid rgba(148, 163, 184, .16);
          background: rgba(15, 23, 42, .72);
          color: #cbd5e1;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          transition: .18s ease;
        }

        .frotas-tab.active,
        .frotas-tab:hover {
          color: #f8fafc;
          border-color: rgba(34, 197, 94, .55);
          background: rgba(22, 101, 52, .35);
        }

        .frotas-body {
          padding: 18px;
        }

        .speed-grid {
          display: grid;
          grid-template-columns: minmax(260px, 420px) minmax(280px, 1fr);
          gap: 18px;
          align-items: start;
        }

        .speed-panel {
          background: rgba(15, 23, 42, .72);
          border: 1px solid rgba(148, 163, 184, .14);
          border-radius: 22px;
          padding: 18px;
        }

        .speed-panel h3 {
          margin: 0 0 14px;
          color: #f8fafc;
          font-size: 16px;
          letter-spacing: -0.02em;
        }

        .speed-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-bottom: 14px;
        }

        .speed-field label {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .08em;
        }

        .speed-input,
        .speed-select,
        .speed-textarea {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, .18);
          background: #0f172a;
          color: #e5e7eb;
          border-radius: 14px;
          padding: 12px 13px;
          outline: none;
          font-size: 14px;
          transition: .16s ease;
          color-scheme: dark;
        }

        .speed-select option {
          background: #0f172a;
          color: #e5e7eb;
        }

        .speed-input:focus,
        .speed-select:focus,
        .speed-textarea:focus {
          border-color: rgba(34, 197, 94, .68);
          box-shadow: 0 0 0 4px rgba(34, 197, 94, .10);
        }

        .speed-row {
          display: grid;
          grid-template-columns: 1fr 130px 42px;
          gap: 10px;
          align-items: end;
          margin-bottom: 10px;
        }

        .speed-row .speed-field {
          margin-bottom: 0;
        }

        .speed-btn {
          border: 0;
          border-radius: 14px;
          padding: 12px 14px;
          font-weight: 900;
          cursor: pointer;
          transition: .18s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 44px;
        }

        .speed-btn-primary {
          width: 100%;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          color: #052e16;
          box-shadow: 0 14px 34px rgba(34, 197, 94, .22);
        }

        .speed-btn-primary:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .speed-btn-soft {
          background: rgba(34, 197, 94, .12);
          color: #86efac;
          border: 1px solid rgba(34, 197, 94, .24);
        }

        .speed-btn-danger {
          background: rgba(239, 68, 68, .10);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, .20);
          padding: 0;
          min-width: 42px;
        }

        .speed-actions {
          display: grid;
          gap: 10px;
          margin-top: 14px;
        }

        .speed-message {
          min-height: 520px;
          resize: vertical;
          line-height: 1.55;
          white-space: pre-wrap;
        }

        .speed-hint {
          margin: 10px 0 0;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.45;
        }

        .speed-toast {
          position: fixed;
          right: 22px;
          bottom: 22px;
          background: rgba(22, 101, 52, .96);
          color: #dcfce7;
          border: 1px solid rgba(134, 239, 172, .32);
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 800;
          box-shadow: 0 16px 45px rgba(0, 0, 0, .35);
          z-index: 99999;
          opacity: 0;
          transform: translateY(10px);
          pointer-events: none;
          transition: .2s ease;
        }

        .speed-toast.show {
          opacity: 1;
          transform: translateY(0);
        }

        .speed-empty {
          padding: 22px;
          border: 1px dashed rgba(148, 163, 184, .22);
          border-radius: 18px;
          color: #94a3b8;
          background: rgba(2, 6, 23, .22);
        }

        @media (max-width: 920px) {
          .speed-grid {
            grid-template-columns: 1fr;
          }

          .speed-row {
            grid-template-columns: 1fr 1fr 42px;
          }
        }

        @media (max-width: 560px) {
          .frotas-header {
            display: block;
          }

          .speed-row {
            grid-template-columns: 1fr;
          }

          .speed-btn-danger {
            width: 100%;
          }
        }
      </style>
    `;
  }

  function getColaboradores(opts) {
    const raw =
      opts?.colaboradores ||
      opts?.auth?.colaboradores ||
      opts?.user?.colaboradores ||
      [];

    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => {
        if (typeof item === 'string') return { nome: item };
        return {
          nome: item.nome || item.Nome || item.funcionario || item.Funcionário || item.name || '',
          cpf: item.cpf || item.CPF || ''
        };
      })
      .filter((item) => item.nome)
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  function buildMessage({ nome, placa, registros, cidadeData }) {
    const nomeFinal = normalizeName(nome);
    const placaFinal = onlyPlate(placa);
    const registrosValidos = registros
      .map((r) => ({
        data: formatDateBR(r.data),
        velocidade: parseSpeed(r.velocidade)
      }))
      .filter((r) => r.data && r.velocidade);

    const linhas = registrosValidos
      .map((r) => `* ${r.data} – ${r.velocidade} km/h`)
      .join('\n');

    return `${nomeFinal},

Constatamos, por meio do sistema de rastreamento da frota, que V.S. excedeu de forma recorrente o limite máximo de velocidade permitido (120 km/h), conduzindo o veículo de placa ${placaFinal}, conforme registros abaixo:

${linhas}

Os registros demonstram reincidência contínua na prática de excesso de velocidade, ainda que com variações moderadas acima do limite permitido, evidenciando a necessidade de maior atenção e adequação imediata por parte do condutor.

Ressaltamos que o excesso de velocidade configura descumprimento das normas de trânsito e das diretrizes internas da empresa, podendo gerar riscos à segurança do próprio condutor, de terceiros e ao patrimônio da organização.

Diante disso, reforçamos que é indispensável o cumprimento rigoroso dos limites estabelecidos e das políticas internas de condução segura.

Solicitamos atenção redobrada quanto à condução do veículo, evitando novos registros e possíveis medidas administrativas futuras.

${cidadeData}.`;
  }

  function validateForm(root) {
    const nome = root.querySelector('[data-speed-name]')?.value || '';
    const placa = root.querySelector('[data-speed-plate]')?.value || '';
    const cidadeData = root.querySelector('[data-speed-city-date]')?.value || '';

    const registros = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({
      data: row.querySelector('[data-speed-date]')?.value || '',
      velocidade: row.querySelector('[data-speed-value]')?.value || ''
    }));

    if (!nome.trim()) return { ok: false, message: 'Selecione ou informe o colaborador.' };
    if (!onlyPlate(placa) || onlyPlate(placa).length < 7) return { ok: false, message: 'Preencha uma placa válida com 7 caracteres.' };
    if (!cidadeData.trim()) return { ok: false, message: 'Preencha a cidade e data do documento.' };

    const validRecords = registros.filter((r) => r.data && parseSpeed(r.velocidade));
    if (!validRecords.length) return { ok: false, message: 'Informe pelo menos uma data e velocidade.' };

    return {
      ok: true,
      payload: {
        nome,
        placa,
        cidadeData,
        registros: validRecords
      }
    };
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }

  function toast(message, type = 'success') {
    let el = document.querySelector('.speed-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'speed-toast';
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.background = type === 'error'
      ? 'rgba(127, 29, 29, .96)'
      : 'rgba(22, 101, 52, .96)';

    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 2600);
  }

  function renderRecords(root) {
    const list = root.querySelector('[data-speed-records]');
    if (!list) return;

    list.innerHTML = state.records.map((record, index) => `
      <div class="speed-row" data-speed-record data-index="${index}">
        <div class="speed-field">
          <label>Data</label>
          <input class="speed-input" type="date" data-speed-date value="${escapeHtml(record.data)}">
        </div>

        <div class="speed-field">
          <label>Velocidade</label>
          <input class="speed-input" type="number" min="1" step="1" placeholder="123" data-speed-value value="${escapeHtml(record.velocidade)}">
        </div>

        <button class="speed-btn speed-btn-danger" type="button" title="Remover registro" data-remove-record="${index}">×</button>
      </div>
    `).join('');

    bindRecordEvents(root);
  }

  function syncRecordsFromDom(root) {
    state.records = Array.from(root.querySelectorAll('[data-speed-record]')).map((row) => ({
      data: row.querySelector('[data-speed-date]')?.value || '',
      velocidade: row.querySelector('[data-speed-value]')?.value || ''
    }));

    if (!state.records.length) {
      state.records = [{ data: '', velocidade: '' }];
    }
  }

  function bindRecordEvents(root) {
    root.querySelectorAll('[data-speed-date], [data-speed-value]').forEach((input) => {
      input.addEventListener('input', () => syncRecordsFromDom(root));
    });

    root.querySelectorAll('[data-remove-record]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncRecordsFromDom(root);
        const index = Number(btn.getAttribute('data-remove-record'));
        state.records.splice(index, 1);
        if (!state.records.length) state.records.push({ data: '', velocidade: '' });
        renderRecords(root);
      });
    });
  }

  function renderExcessoVelocidade(container, opts = {}) {
    const colaboradores = getColaboradores(opts);

    container.innerHTML = `
      ${getStyles()}

      <section class="frotas-shell">
        <div class="frotas-header">
          <div>
            <div class="frotas-kicker">Frotas · Notificações</div>
            <h1 class="frotas-title">Excesso de Velocidade</h1>
            <p class="frotas-subtitle">
              Gere a notificação formal de excesso de velocidade com base nos registros do rastreador.
              Ao clicar em <strong>Gerar ✉️</strong>, a mensagem é montada e copiada automaticamente.
            </p>
          </div>
        </div>

        <div class="frotas-card">
          <div class="frotas-tabs">
            <button class="frotas-tab active" type="button">Excesso de Velocidade</button>
          </div>

          <div class="frotas-body">
            <div class="speed-grid">
              <div class="speed-panel">
                <h3>Dados da notificação</h3>

                <div class="speed-field">
                  <label>Colaborador</label>
                  ${
                    colaboradores.length
                      ? `<select class="speed-select" data-speed-name>
                          <option value="">Selecione o colaborador</option>
                          ${colaboradores.map((c) => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join('')}
                        </select>`
                      : `<input class="speed-input" type="text" placeholder="Nome do colaborador" data-speed-name>`
                  }
                  <p class="speed-hint">
                    Caso o painel já envie a lista de colaboradores em <code>opts.colaboradores</code>, o campo vira seleção automática.
                  </p>
                </div>

                <div class="speed-field">
                  <label>Placa do veículo</label>
                  <input class="speed-input" type="text" maxlength="8" placeholder="RVQ6J42" data-speed-plate>
                </div>

                <div class="speed-field">
                  <label>Cidade e data</label>
                  <input class="speed-input" type="text" value="Cascavel, ${escapeHtml(todayBR())}" data-speed-city-date>
                </div>

                <div class="speed-field">
                  <label>Registros de velocidade</label>
                  <div data-speed-records></div>
                  <button class="speed-btn speed-btn-soft" type="button" data-add-record>+ Adicionar data e velocidade</button>
                </div>

                <div class="speed-actions">
                  <button class="speed-btn speed-btn-primary" type="button" data-generate-speed-message>
                    Gerar ✉️
                  </button>
                </div>
              </div>

              <div class="speed-panel">
                <h3>Mensagem gerada</h3>
                <textarea class="speed-input speed-textarea speed-message" readonly data-speed-output placeholder="A mensagem será gerada aqui e copiada automaticamente."></textarea>
                <p class="speed-hint">
                  Depois de gerar, basta colar no canal de envio ao colaborador.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    renderRecords(container);

    const plate = container.querySelector('[data-speed-plate]');
    if (plate) {
      plate.addEventListener('input', () => {
        plate.value = onlyPlate(plate.value);
      });
    }

    container.querySelector('[data-add-record]')?.addEventListener('click', () => {
      syncRecordsFromDom(container);
      state.records.push({ data: '', velocidade: '' });
      renderRecords(container);
    });

    container.querySelector('[data-generate-speed-message]')?.addEventListener('click', async () => {
      syncRecordsFromDom(container);

      const validation = validateForm(container);
      if (!validation.ok) {
        toast(validation.message, 'error');
        return;
      }

      const message = buildMessage(validation.payload);
      state.lastMessage = message;

      const output = container.querySelector('[data-speed-output]');
      if (output) output.value = message;

      try {
        await copyText(message);
        toast('Mensagem gerada e copiada para a área de transferência.');
      } catch (err) {
        console.warn('[FROTAS] Falha ao copiar mensagem:', err);
        toast('Mensagem gerada, mas não foi possível copiar automaticamente.', 'error');
      }
    });
  }

  function renderHome(container, opts = {}) {
    renderExcessoVelocidade(container, opts);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = renderHome;

  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.frotas = {
    mount: renderHome
  };
})();
