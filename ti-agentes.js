import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const AGENTES = [
  { id: 'sync-colaboradores', name: 'Colaboradores', freq: '5 min', table: 'colaboradores' },
  { id: 'sync-producao-diaria', name: 'Produção Diária', freq: '1h', table: 'grm_producao_diaria_importacoes' },
  { id: 'sync-locais-embarque', name: 'Locais de Embarque', freq: '1h', table: 'grm_locais_embarque_importacoes' },
  { id: 'sync-resultado-diario', name: 'Resultado Diário', freq: '1h', table: 'grm_resultado_diario_importacoes' },
  { id: 'sync-despesas', name: 'Despesas', freq: '1h', table: 'grm_despesas_importacoes' },
  { id: 'sync-notas-fiscais', name: 'Notas Fiscais', freq: '1h', table: 'grm_notas_fiscais_importacoes' },
  { id: 'sync-mapa-embarque', name: 'Mapa de Embarque', freq: '1h', table: 'grm_mapa_embarque_importacoes' },
  { id: 'sync-patrimonios', name: 'Patrimônios', freq: '1h', table: 'grm_patrimonios_importacoes' },
  { id: 'sync-contas-pagar', name: 'Contas a Pagar', freq: '1h', table: 'grm_contas_pagar_importacoes' },
  { id: 'sync-contas-receber', name: 'Contas a Receber', freq: '1h', table: 'grm_contas_receber_importacoes' },
  { id: 'sync-auditorias', name: 'Auditorias', freq: '1h', table: 'grm_auditorias_importacoes' },
  { id: 'sync-nhe', name: 'NHE', freq: '1h', table: 'grm_nhe_importacoes' },
  { id: 'sync-lista-os', name: 'Lista de OS', freq: '1h', table: 'grm_lista_os_importacoes' },
  { id: 'sync-distribuicao-os', name: 'Distribuição de OS', freq: '1h', table: 'grm_distribuicao_os_importacoes' },
];

const state = {
  agentes: [],
  loading: false,
  selectedAgent: null,
};

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function getStyles() {
  return `<style id="agentes-style">
.ag-wrap{width:100%;color:#e2e2f0}
.ag-hero{background:radial-gradient(ellipse at top left,rgba(59,130,246,.13),transparent 55%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:24px 28px;margin-bottom:20px}
.ag-hero h2{margin:0;font-size:clamp(20px,2vw,28px);letter-spacing:-.03em;color:#f8fafc}
.ag-hero p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.5;max-width:560px}
.ag-stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
.ag-stat{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:12px 18px;text-align:center}
.ag-stat-val{font-size:22px;font-weight:900;color:#3b82f6;line-height:1}
.ag-stat-lbl{font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.ag-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:20px}
.ag-card{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:16px;cursor:pointer;transition:.15s ease}
.ag-card:hover{border-color:rgba(59,130,246,.3);background:rgba(15,23,42,.85)}
.ag-card.active{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.08)}
.ag-card-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:12px}
.ag-card-title{font-size:14px;font-weight:900;color:#f8fafc}
.ag-card-freq{font-size:11px;color:#94a3b8;background:rgba(148,163,184,.1);padding:3px 8px;border-radius:6px}
.ag-card-status{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px}
.ag-status-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.ag-status-dot.online{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.4)}
.ag-status-dot.error{background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.4)}
.ag-status-dot.idle{background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.4)}
.ag-card-meta{display:flex;gap:16px;font-size:12px;color:#6b7280}
.ag-card-meta span{display:flex;flex-direction:column}
.ag-card-meta span strong{color:#e2e2f0;display:block;font-weight:900;font-size:13px}
.ag-details{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:20px;margin-bottom:20px}
.ag-details-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid rgba(148,163,184,.12);padding-bottom:16px}
.ag-details-title{font-size:16px;font-weight:900;color:#f8fafc}
.ag-details-close{background:transparent;border:0;color:#94a3b8;cursor:pointer;padding:4px;font-size:18px}
.ag-log-box{background:rgba(0,0,0,.3);border:1px solid rgba(148,163,184,.12);border-radius:12px;padding:12px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:11px;color:#6b7280;line-height:1.4}
.ag-log-line{margin:2px 0;color:#94a3b8}
.ag-log-error{color:#fca5a5}
.ag-log-success{color:#86efac}
.ag-btn{border:0;border-radius:12px;padding:10px 16px;font-weight:900;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s ease}
.ag-btn-primary{background:linear-gradient(135deg,#3b82f6,#60a5fa);color:#fff}
.ag-btn-danger{background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.22)}
.ag-btn:disabled{opacity:.5;cursor:not-allowed}
</style>`;
}

function getAgenteStatus(agente) {
  if (!agente.ultima_sync) return 'idle';
  const diff = Date.now() - new Date(agente.ultima_sync).getTime();
  const hours = diff / (1000 * 60 * 60);
  return hours > 2 ? 'error' : 'online';
}

function renderAgentes() {
  const statusCount = {
    online: AGENTES.filter(a => {
      const agente = state.agentes.find(x => x.id === a.id);
      return agente && getAgenteStatus(agente) === 'online';
    }).length,
    error: AGENTES.filter(a => {
      const agente = state.agentes.find(x => x.id === a.id);
      return agente && getAgenteStatus(agente) === 'error';
    }).length,
  };

  let html = getStyles();
  html += `<div class="ag-wrap">
    <div class="ag-hero">
      <h2>🤖 Agentes de Sincronização</h2>
      <p>Monitor em tempo real dos 13 agentes que sincronizam dados do GRM Server para o Supabase</p>
      <div class="ag-stats">
        <div class="ag-stat">
          <div class="ag-stat-val">${AGENTES.length}</div>
          <div class="ag-stat-lbl">Total de Agentes</div>
        </div>
        <div class="ag-stat">
          <div class="ag-stat-val" style="color:#22c55e">${statusCount.online}</div>
          <div class="ag-stat-lbl">Online</div>
        </div>
        <div class="ag-stat">
          <div class="ag-stat-val" style="color:#ef4444">${statusCount.error}</div>
          <div class="ag-stat-lbl">Com Erro</div>
        </div>
      </div>
    </div>`;

  if (state.selectedAgent) {
    html += renderAgentDetails(state.selectedAgent);
  }

  html += `<div class="ag-grid">`;
  AGENTES.forEach(a => {
    const agente = state.agentes.find(x => x.id === a.id);
    const status = agente ? getAgenteStatus(agente) : 'idle';
    const statusColor = status === 'online' ? '#22c55e' : status === 'error' ? '#ef4444' : '#f59e0b';
    const statusLabel = status === 'online' ? 'Online' : status === 'error' ? 'Erro' : 'Aguardando';

    html += `<div class="ag-card ${state.selectedAgent?.id === a.id ? 'active' : ''}" onclick="selectAgent('${a.id}')">
      <div class="ag-card-header">
        <div class="ag-card-title">${esc(a.name)}</div>
        <div class="ag-card-freq">${a.freq}</div>
      </div>
      <div class="ag-card-status">
        <div class="ag-status-dot ${status}"></div>
        <span style="color:${statusColor}">${statusLabel}</span>
      </div>
      <div class="ag-card-meta">
        <span>
          Total
          <strong>${agente?.total_records || 0}</strong>
        </span>
        <span>
          Última Sync
          <strong>${agente?.ultima_sync ? new Date(agente.ultima_sync).toLocaleString('pt-BR') : 'N/A'}</strong>
        </span>
      </div>
    </div>`;
  });
  html += `</div>`;

  if (!state.selectedAgent) {
    html += `<div style="text-align:center;padding:40px;color:#6b7280">
      <p>Clique em um agente para ver detalhes</p>
    </div>`;
  }

  html += `</div>`;
  return html;
}

function renderAgentDetails(agente) {
  return `<div class="ag-details">
    <div class="ag-details-header">
      <div class="ag-details-title">${esc(agente.name)} - Detalhes</div>
      <button class="ag-details-close" onclick="closeDetails()">✕</button>
    </div>
    <div style="margin-bottom:16px">
      <p><strong>ID:</strong> ${esc(agente.id)}</p>
      <p><strong>Tabela:</strong> ${esc(agente.table)}</p>
      <p><strong>Frequência:</strong> ${esc(agente.freq)}</p>
      <p><strong>Status:</strong> ${getAgenteStatus(agente) === 'online' ? '✅ Online' : '❌ Erro'}</p>
      <p><strong>Última Sincronização:</strong> ${agente.ultima_sync ? new Date(agente.ultima_sync).toLocaleString('pt-BR') : 'N/A'}</p>
      <p><strong>Total de Registros:</strong> ${agente.total_records || 0}</p>
    </div>
    <div>
      <p style="margin-bottom:8px"><strong>Log da Função:</strong></p>
      <div class="ag-log-box">
        <div class="ag-log-line">Executar: supabase functions get-logs ${esc(agente.id)} --limit 50</div>
        <div class="ag-log-line" style="color:#f8fafc;margin-top:8px">📋 Logs não disponíveis no Dashboard</div>
        <div class="ag-log-line">Use o comando CLI acima para ver logs detalhados</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <button class="ag-btn ag-btn-primary" onclick="executeAgent('${agente.id}')" style="background:linear-gradient(135deg,#3b82f6,#60a5fa)">
        ▶️ Executar Agora
      </button>
      <button class="ag-btn ag-btn-danger" onclick="viewLogs('${agente.id}')" style="margin-left:8px">
        📊 Ver Logs CLI
      </button>
    </div>
  </div>`;
}

window.selectAgent = (agentId) => {
  const agente = AGENTES.find(a => a.id === agentId);
  const agenteData = state.agentes.find(a => a.id === agentId);
  state.selectedAgent = { ...agente, ...agenteData };
  render();
};

window.closeDetails = () => {
  state.selectedAgent = null;
  render();
};

window.executeAgent = async (agentId) => {
  if (!confirm(`Executar agente "${agentId}" agora?`)) return;

  try {
    const response = await fetch(`https://xyzpnuumdqhegxakkyws.supabase.co/functions/v1/${agentId}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sync-colaboradores-secret-key-123',
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    const data = await response.json();
    alert(`✅ Agente executado!\n\nInseridos: ${data.inserted}\nAtualizados: ${data.updated}\nDuração: ${data.duration_ms}ms`);
    loadAgentes();
  } catch (e) {
    alert(`❌ Erro: ${e.message}`);
  }
};

window.viewLogs = (agentId) => {
  const cmd = `supabase functions get-logs ${agentId} --limit 50`;
  const msg = `Execute no terminal:\n\n${cmd}\n\nPara ver os logs da execução dessa função.`;
  alert(msg);
};

async function loadAgentes() {
  state.loading = true;
  try {
    const results = await Promise.all(
      AGENTES.map(async (agente) => {
        try {
          const { data, error } = await supabase
            .from(agente.table)
            .select('sincronizado_em')
            .order('sincronizado_em', { ascending: false })
            .limit(1);

          if (error) throw error;

          return {
            id: agente.id,
            name: agente.name,
            freq: agente.freq,
            table: agente.table,
            ultima_sync: data?.[0]?.sincronizado_em || null,
            total_records: 0,
          };
        } catch (e) {
          console.error(`Erro carregando ${agente.name}:`, e);
          return { id: agente.id, name: agente.name, freq: agente.freq, table: agente.table };
        }
      })
    );

    state.agentes = results;
  } catch (e) {
    console.error('Erro ao carregar agentes:', e);
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.innerHTML = renderAgentes();
}

async function init() {
  await initProtectedPage(['TI_AGENTES', 'TI']);
  await loadAgentes();
}

init();

// Recarregar a cada 30 segundos
setInterval(loadAgentes, 30000);
