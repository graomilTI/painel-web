// Relatórios — importação — CSS da tela de importação.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.

  const styles = `
    <style>
      .relatorios-importacao {
        --ri-bg: #020617;
        --ri-card: rgba(15, 23, 42, .78);
        --ri-card-2: rgba(2, 6, 23, .78);
        --ri-border: rgba(34, 197, 94, .25);
        --ri-border-soft: rgba(148, 163, 184, .16);
        --ri-text: #e2e2f0;
        --ri-muted: #6b7280;
        --ri-green: #22c55e;
        --ri-green-2: #16a34a;
        --ri-red: #ef4444;
        --ri-yellow: #f59e0b;
        color: var(--ri-text);
      }

      .relatorios-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
      }

      .import-card {
        border: 1px solid var(--ri-border-soft);
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, .16), transparent 34%),
          linear-gradient(145deg, rgba(15, 23, 42, .92), rgba(2, 6, 23, .72));
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 22px 60px rgba(0, 0, 0, .22);
      }

      .import-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }

      .import-title {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -.02em;
      }

      .import-subtitle {
        margin: 6px 0 0;
        color: var(--ri-muted);
        font-size: 13px;
      }

      .dropzone {
        position: relative;
        border: 2px dashed rgba(34, 197, 94, .55);
        border-radius: 22px;
        padding: 30px 22px;
        min-height: 118px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        background:
          linear-gradient(180deg, rgba(2, 6, 23, .9), rgba(2, 6, 23, .58)),
          radial-gradient(circle at center, rgba(22, 101, 52, .24), transparent 58%);
        cursor: pointer;
        transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
      }

      .dropzone:hover,
      .dropzone.is-dragging {
        transform: translateY(-1px);
        border-color: rgba(34, 197, 94, .95);
        box-shadow: 0 0 0 4px rgba(34, 197, 94, .08);
        background:
          linear-gradient(180deg, rgba(2, 6, 23, .88), rgba(2, 6, 23, .68)),
          radial-gradient(circle at center, rgba(34, 197, 94, .2), transparent 62%);
      }

      .dropzone-main {
        font-weight: 800;
        font-size: 15px;
      }

      .dropzone-hint {
        margin-top: 7px;
        color: var(--ri-muted);
        font-size: 12px;
      }

      .file-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .file-empty {
        padding: 16px;
        color: var(--ri-muted);
        border: 1px solid var(--ri-border-soft);
        border-radius: 16px;
        background: rgba(2, 6, 23, .38);
        font-size: 13px;
      }

      .file-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
        padding: 13px 14px;
        border: 1px solid var(--ri-border-soft);
        border-radius: 16px;
        background: rgba(2, 6, 23, .42);
      }

      .file-name {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        font-weight: 700;
      }

      .file-name span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-meta {
        margin-top: 5px;
        color: var(--ri-muted);
        font-size: 12px;
      }

      .file-right {
        min-width: 220px;
        display: grid;
        gap: 8px;
      }

      .file-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .file-status {
        font-size: 12px;
        color: var(--ri-muted);
        white-space: nowrap;
      }

      .file-remove {
        border: 0;
        background: rgba(148, 163, 184, .08);
        color: #cbd5e1;
        border-radius: 10px;
        height: 30px;
        padding: 0 10px;
        cursor: pointer;
      }

      .file-remove:hover { background: rgba(239, 68, 68, .14); color: #fecaca; }
      .file-remove:disabled { opacity: .45; cursor: not-allowed; }

      .progress {
        height: 8px;
        background: rgba(30, 41, 59, .92);
        border-radius: 999px;
        overflow: hidden;
      }

      .progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, var(--ri-green-2), var(--ri-green));
        border-radius: 999px;
        transition: width .25s ease, background .2s ease;
      }

      .file-item.is-error .progress-bar { background: linear-gradient(90deg, #b91c1c, var(--ri-red)); }
      .file-item.is-success { border-color: rgba(34, 197, 94, .38); }
      .file-item.is-error { border-color: rgba(239, 68, 68, .42); }
      .file-item.is-enterprise { border-color: rgba(59, 130, 246, .38); }
      .file-item.is-enterprise .progress-bar { background: linear-gradient(90deg, #2563eb, #22c55e); }
      .upload-mode { margin-left: 8px; font-size: 10px; font-weight: 900; letter-spacing: .05em; color: #bfdbfe; border: 1px solid rgba(59, 130, 246, .35); background: rgba(37, 99, 235, .16); border-radius: 999px; padding: 3px 7px; white-space: nowrap; }

      .tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .02em;
        background: rgba(34, 197, 94, .12);
        color: #bbf7d0;
        border: 1px solid rgba(34, 197, 94, .22);
      }

      .import-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--ri-border-soft);
      }

      .import-summary {
        color: var(--ri-muted);
        font-size: 13px;
      }

      .btn-importar {
        border: 0;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 14px;
        background: linear-gradient(135deg, #16a34a, #22c55e);
        color: #052e16;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 16px 34px rgba(34, 197, 94, .18);
        transition: transform .16s ease, opacity .16s ease, filter .16s ease;
      }

      .btn-importar:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.04); }
      .btn-importar:disabled { opacity: .48; cursor: not-allowed; box-shadow: none; }
      .btn-importar.is-error { background: linear-gradient(135deg, #991b1b, #ef4444); color: #fff; }
      .btn-importar.is-success { background: linear-gradient(135deg, #15803d, #22c55e); color: #052e16; }

      .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        margin-right: 8px;
        border-radius: 50%;
        border: 2px solid rgba(5, 46, 22, .26);
        border-top-color: #052e16;
        vertical-align: -2px;
        animation: spin .75s linear infinite;
      }

      .import-log {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--ri-border-soft);
        background: rgba(2, 6, 23, .38);
        color: var(--ri-muted);
        font-size: 13px;
        display: none;
      }

      .import-log.is-visible { display: block; }
      .import-log strong { color: var(--ri-text); }

      .import-intelligence {
        margin-top: 16px;
        padding: 14px;
        border: 1px solid rgba(34, 197, 94, .18);
        border-radius: 18px;
        background: rgba(2, 6, 23, .42);
        display: grid;
        gap: 12px;
      }

      .import-intelligence-row {
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
        gap: 12px;
        align-items: end;
      }

      .import-field label {
        display: block;
        margin: 0 0 6px;
        color: #bbf7d0;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .import-field select {
        width: 100%;
        min-height: 40px;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 12px;
        padding: 0 12px;
        color: #e2e2f0;
        background: #0d0d18;
        color-scheme: dark;
        outline: none;
      }

      .import-intelligence-note {
        color: var(--ri-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .file-period {
        display: inline-flex;
        margin-left: 8px;
        padding: 3px 7px;
        border-radius: 999px;
        background: rgba(34, 197, 94, .1);
        border: 1px solid rgba(34, 197, 94, .22);
        color: #bbf7d0;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
      }

      @media (max-width: 760px) {
        .import-intelligence-row { grid-template-columns: 1fr; }
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      @media (max-width: 760px) {
        .file-item { grid-template-columns: 1fr; }
        .file-right { min-width: 0; }
        .import-actions { align-items: stretch; }
        .btn-importar { width: 100%; }
      }
    </style>
  `;

export { styles };
