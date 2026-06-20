// Ajustes visuais do menu BTG para o fluxo automático via agentes.
// Script propositalmente simples: sem MutationObserver e sem alterar regras de negócio.

function txt(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

function injectStyles() {
  if (document.getElementById('btg-agentes-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'btg-agentes-ui-style';
  style.textContent = `
    .btg-agent-source-card{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin-bottom:12px;padding:13px 14px;border:1px solid rgba(59,130,246,.26);border-radius:16px;background:linear-gradient(135deg,rgba(59,130,246,.14),rgba(34,197,94,.07))}
    .btg-agent-source-title{font-size:13px;font-weight:900;color:#f8fafc;margin-bottom:3px}
    .btg-agent-source-sub{font-size:12px;color:#94a3b8;line-height:1.45}
    .btg-agent-source-pill{font-size:11px;font-weight:900;color:#93c5fd;border:1px solid rgba(96,165,250,.28);background:rgba(59,130,246,.12);border-radius:999px;padding:6px 10px;white-space:nowrap}
    .btg-upload-area.btg-auto-source{border-style:solid;background:rgba(15,23,42,.36)}
    .btg-chip-file.loaded::before{content:'✓ ';font-weight:900}
    @media(max-width:760px){.btg-agent-source-card{grid-template-columns:1fr}.btg-agent-source-pill{width:max-content}}
  `;
  document.head.appendChild(style);
}

function renameFileButton() {
  const label = document.querySelector('.btg-file-label');
  if (!label) return;
  for (const node of [...label.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      if (node.textContent.trim() !== 'Upload manual') node.textContent = ' Upload manual';
      return;
    }
  }
}

function applyBtgAgentUi() {
  try {
    injectStyles();

    const h3 = [...document.querySelectorAll('h3')].find((item) => ['BTG — Ordens de Serviço', 'BTG — Relatórios dos Agentes'].includes(item.textContent.trim()));
    if (h3) {
      txt(h3, 'BTG — Relatórios dos Agentes');
      txt(h3.parentElement?.querySelector('.muted'), 'Relatórios BTG carregados automaticamente pelos agentes. A tela cruza Relatório BTG, Lista de OS e Distribuição para apontar pendências de contrato, OS, colaborador, check-in e NHE.');
    }

    const recarregar = document.getElementById('btgRecarregar');
    if (recarregar) {
      txt(recarregar, '↻ Atualizar relatórios');
      recarregar.title = 'Recarrega do banco os relatórios sincronizados pelos agentes';
    }

    const dropZone = document.getElementById('btgDropZone');
    if (dropZone) {
      dropZone.classList.add('btg-auto-source');
      if (!dropZone.querySelector('.btg-agent-source-card')) {
        dropZone.insertAdjacentHTML('afterbegin', `
          <div class="btg-agent-source-card">
            <div>
              <div class="btg-agent-source-title">🤖 Fonte automática: agentes BTG</div>
              <div class="btg-agent-source-sub">Os arquivos coletados pelos agentes alimentam o banco e esta tela já abre reconciliando os relatórios disponíveis.</div>
            </div>
            <div class="btg-agent-source-pill">Upload manual = contingência</div>
          </div>
        `);
      }
    }

    renameFileButton();
    txt(document.querySelector('.btg-upload-hint'), 'Use somente se precisar substituir manualmente algum relatório. No fluxo normal, os agentes atualizam os dados automaticamente.');

    const mode = document.getElementById('btgModeTag');
    if (mode?.textContent.trim() === 'RELATÓRIOS') txt(mode, 'AGENTES');

    const subtitle = document.getElementById('btgTableSubtitle');
    if (subtitle) {
      const value = subtitle.textContent || '';
      if (value.includes('Importação unificada')) txt(subtitle, 'Dados automáticos dos agentes: Relatório BTG + Lista de OS + Distribuição.');
      if (value.includes('Dados do banco de dados')) txt(subtitle, 'Base carregada do Supabase. Aguardando relatórios dos agentes para reconciliação completa.');
    }

    const feedback = document.getElementById('btgFeedback');
    if (feedback && feedback.textContent.includes('Carregue os relatórios')) {
      txt(feedback, 'Aguardando relatórios sincronizados pelos agentes. Use Atualizar relatórios para recarregar o banco.');
    }

    const empty = document.querySelector('.btg-empty');
    if (empty && empty.textContent.includes('Carregue os relatórios')) {
      txt(empty, 'Nenhum relatório BTG sincronizado ainda. Execute o agente em AGENTES TI ou aguarde a próxima sincronização automática.');
    }

    const chipLabels = {
      btgChipDist: 'Distribuição de O.S.',
      btgChipBtg: 'Relatório BTG',
      btgChipListaOs: 'Lista de O.S.',
    };
    for (const [id, label] of Object.entries(chipLabels)) {
      const chip = document.getElementById(id);
      if (!chip) continue;
      const value = chip.textContent || '';
      if (value.includes('aguardando')) txt(chip, `${label} — aguardando agente`);
      if (value.includes('Banco de dados')) txt(chip, value.replace('Banco de dados', 'Agente/Banco'));
    }
  } catch (err) {
    console.warn('[BTG agentes UI] ajuste visual ignorado:', err);
  }
}

function bootBtgAgentUi() {
  const delays = [100, 400, 900, 1600, 2600, 4000];
  delays.forEach((delay) => setTimeout(applyBtgAgentUi, delay));
  document.addEventListener('click', () => setTimeout(applyBtgAgentUi, 80), true);
  document.addEventListener('input', () => setTimeout(applyBtgAgentUi, 80), true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootBtgAgentUi, { once: true });
else bootBtgAgentUi();
