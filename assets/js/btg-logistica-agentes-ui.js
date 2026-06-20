// Ajustes visuais do menu BTG para o novo fluxo automático via agentes.
// Mantém o importador XLSX antigo como contingência, sem alterar a regra de negócio do btg-logistica.js.

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function replaceTextNode(container, text) {
  if (!container) return;
  for (const node of [...container.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = ` ${text}`;
      return;
    }
  }
  container.appendChild(document.createTextNode(` ${text}`));
}

function injectAgentStyles() {
  if (document.getElementById('btg-agentes-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'btg-agentes-ui-style';
  style.textContent = `
    .btg-agent-source-card{
      display:grid;
      grid-template-columns:1fr auto;
      gap:12px;
      align-items:center;
      margin-bottom:12px;
      padding:13px 14px;
      border:1px solid rgba(59,130,246,.26);
      border-radius:16px;
      background:linear-gradient(135deg,rgba(59,130,246,.14),rgba(34,197,94,.07));
    }
    .btg-agent-source-title{font-size:13px;font-weight:900;color:#f8fafc;margin-bottom:3px}
    .btg-agent-source-sub{font-size:12px;color:#94a3b8;line-height:1.45}
    .btg-agent-source-pill{font-size:11px;font-weight:900;color:#93c5fd;border:1px solid rgba(96,165,250,.28);background:rgba(59,130,246,.12);border-radius:999px;padding:6px 10px;white-space:nowrap}
    .btg-upload-area.btg-auto-source{border-style:solid;background:rgba(15,23,42,.36)}
    .btg-upload-area.btg-auto-source .btg-upload-inner{align-items:center}
    .btg-upload-area.btg-auto-source .btg-file-label{opacity:.86}
    .btg-upload-area.btg-auto-source .btg-file-label:hover{opacity:1}
    .btg-chip-file.loaded::before{content:'✓ ';font-weight:900}
    @media(max-width:760px){.btg-agent-source-card{grid-template-columns:1fr}.btg-agent-source-pill{width:max-content}}
  `;
  document.head.appendChild(style);
}

function updateAgentCopy() {
  injectAgentStyles();

  const h3 = [...document.querySelectorAll('h3')].find((item) => item.textContent.trim() === 'BTG — Ordens de Serviço');
  if (h3) {
    h3.textContent = 'BTG — Relatórios dos Agentes';
    const desc = h3.parentElement?.querySelector('.muted');
    setText(desc, 'Os relatórios BTG, Lista de OS e Distribuição são carregados automaticamente pelos agentes. A tela cruza os dados salvos no banco e mostra pendências de contrato, OS, colaborador, check-in e NHE.');
  }

  const recarregar = document.getElementById('btgRecarregar');
  if (recarregar) {
    recarregar.textContent = '↻ Atualizar relatórios';
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

  const fileLabel = document.querySelector('.btg-file-label');
  replaceTextNode(fileLabel, 'Upload manual');

  const hint = document.querySelector('.btg-upload-hint');
  setText(hint, 'Use somente se precisar substituir manualmente um relatório. No fluxo normal, os agentes atualizam os dados automaticamente.');

  const mode = document.getElementById('btgModeTag');
  if (mode && mode.textContent.trim() === 'RELATÓRIOS') mode.textContent = 'AGENTES';

  const subtitle = document.getElementById('btgTableSubtitle');
  if (subtitle) {
    const txt = subtitle.textContent || '';
    if (txt.includes('Importação unificada')) {
      subtitle.textContent = 'Dados automáticos dos agentes: Relatório BTG + Lista de OS + Distribuição, com validação de contrato, OS, check-in e NHE.';
    } else if (txt.includes('Dados do banco de dados')) {
      subtitle.textContent = 'Base carregada do Supabase. Aguardando relatórios dos agentes para reconciliação completa.';
    }
  }

  const feedback = document.getElementById('btgFeedback');
  if (feedback) {
    const txt = feedback.textContent || '';
    if (txt.includes('Carregue os relatórios xlsx') || txt.includes('Carregue os relatórios')) {
      feedback.textContent = 'Aguardando relatórios sincronizados pelos agentes. Use Atualizar relatórios para recarregar o banco.';
    }
  }

  const empty = document.querySelector('.btg-empty');
  if (empty) {
    const txt = empty.textContent || '';
    if (txt.includes('Carregue os relatórios xlsx') || txt.includes('Carregue os relatórios')) {
      empty.textContent = 'Nenhum relatório BTG sincronizado ainda. Execute o agente em AGENTES TI ou aguarde a próxima sincronização automática.';
    }
  }

  const chips = [
    ['btgChipDist', 'Distribuição de O.S.'],
    ['btgChipBtg', 'Relatório BTG'],
    ['btgChipListaOs', 'Lista de O.S.'],
  ];
  for (const [id, label] of chips) {
    const chip = document.getElementById(id);
    if (!chip) continue;
    if (chip.textContent.includes('aguardando')) chip.textContent = `${label} — aguardando agente`;
    if (chip.textContent.includes('Banco de dados')) chip.textContent = chip.textContent.replace('Banco de dados', 'Agente/Banco');
  }
}

function boot() {
  updateAgentCopy();
  const observer = new MutationObserver(() => updateAgentCopy());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
