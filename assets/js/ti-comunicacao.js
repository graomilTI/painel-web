import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BUCKET = 'comunicacao-midias';
const TEMPLATE_PATH = 'templates/aniversario.png';

const state = {
  job: null,
  pollTimer: null,
  aniversariantes: [],
  logsHoje: [],
  loadingLista: false,
};

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function onlyDigits(v) { return String(v ?? '').replace(/\D+/g, ''); }

function brasiliaHojeInicioIso() {
  const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const yyyy = brNow.getUTCFullYear();
  const mm = String(brNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(brNow.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T03:00:00.000Z`;
}

function styles() {
  return `<style id="comunicacao-style">
    .cm-wrap{width:100%;color:#e2e2f0}
    .cm-hero{background:radial-gradient(ellipse at top left,rgba(59,130,246,.13),transparent 55%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:24px 28px;margin-bottom:20px}
    .cm-hero h2{margin:0;font-size:clamp(20px,2vw,28px);letter-spacing:-.03em;color:#f8fafc}
    .cm-hero p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.5;max-width:700px}
    .cm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
    .cm-card{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:20px}
    .cm-card h3{margin:0 0 4px;font-size:15px;font-weight:900;color:#f8fafc}
    .cm-card p.cm-sub{margin:0 0 14px;font-size:12px;color:#94a3b8}
    .cm-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
    .cm-kpi{background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.12);border-radius:13px;padding:10px 14px;text-align:center;min-width:90px}
    .cm-kpi-val{font-size:20px;font-weight:900;color:#3b82f6;line-height:1}
    .cm-kpi-val.ok{color:#22c55e}
    .cm-kpi-val.err{color:#ef4444}
    .cm-kpi-lbl{font-size:10px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
    .cm-btn{border:0;border-radius:12px;padding:10px 16px;font-weight:900;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s ease}
    .cm-btn-primary{background:linear-gradient(135deg,#3b82f6,#60a5fa);color:#fff}
    .cm-btn-secondary{background:rgba(148,163,184,.12);color:#e2e2f0;border:1px solid rgba(148,163,184,.18)}
    .cm-btn-small{padding:5px 10px;font-size:11px;border-radius:9px}
    .cm-btn:disabled{opacity:.5;cursor:not-allowed}
    .cm-alert{border-radius:12px;padding:10px 14px;font-size:12px;margin-top:10px;border:1px solid}
    .cm-alert.ok{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.25);color:#86efac}
    .cm-alert.err{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);color:#fca5a5}
    .cm-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
    .cm-table th,.cm-table td{padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left}
    .cm-table th{color:#94a3b8;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    .cm-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px}
    .cm-pill.enviado{background:rgba(34,197,94,.12);color:#86efac}
    .cm-pill.pendente{background:rgba(245,158,11,.12);color:#fde68a}
    .cm-pill.erro{background:rgba(239,68,68,.12);color:#fca5a5}
    .cm-template-row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .cm-template-preview{width:220px;border-radius:12px;border:1px solid rgba(148,163,184,.18)}
    .cm-field{margin-top:10px}
    .cm-field label{display:block;font-size:11px;color:#94a3b8;margin-bottom:4px}
    .cm-field input[type="text"]{width:100%;background:rgba(8,12,22,.7);border:1px solid rgba(148,163,184,.18);border-radius:10px;padding:8px 10px;color:#e2e2f0;font-size:13px}
    .cm-preview-result{margin-top:10px;max-width:320px;border-radius:10px;border:1px solid rgba(148,163,184,.18)}
  </style>`;
}

async function invoke(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('botconversa-aniversario', { body: { action, ...payload } });
  if (error) throw error;
  if (!data || data.ok === false) throw new Error(data?.error || 'Falha na comunicação com o disparo de aniversário.');
  return data;
}

function jobIsRunning(job) {
  return job?.status === 'pendente' || job?.status === 'processando';
}

async function loadJobStatus() {
  try {
    const resp = await invoke('job_status');
    state.job = resp.job || null;
  } catch (err) {
    console.error('[ti-comunicacao] job_status', err);
  }
}

async function loadAniversariantesHoje() {
  state.loadingLista = true;
  try {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('cpf,nome,situacao,whatsapp,data_nascimento')
      .not('data_nascimento', 'is', null);
    if (error) throw error;
    const hojeMMDD = (() => {
      const brNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
      return `${String(brNow.getUTCMonth() + 1).padStart(2, '0')}-${String(brNow.getUTCDate()).padStart(2, '0')}`;
    })();
    state.aniversariantes = (data || []).filter((c) => {
      const situacao = String(c.situacao || '').toLowerCase();
      const ativo = !situacao.includes('nao ativo') && !situacao.includes('inativo') && !situacao.includes('desligado');
      return ativo && c.whatsapp && String(c.data_nascimento || '').slice(5, 10) === hojeMMDD;
    });

    const inicioHoje = brasiliaHojeInicioIso();
    const { data: logs, error: logsError } = await supabase
      .from('botconversa_logs')
      .select('cpf,sucesso,erro,created_at')
      .eq('tipo', 'aniversario')
      .gte('created_at', inicioHoje)
      .order('created_at', { ascending: false });
    if (logsError) throw logsError;
    state.logsHoje = logs || [];
  } catch (err) {
    console.error('[ti-comunicacao] lista aniversariantes', err);
  } finally {
    state.loadingLista = false;
  }
}

function statusDoAniversariante(cpf) {
  const cpfDigits = onlyDigits(cpf);
  const log = state.logsHoje.find((l) => onlyDigits(l.cpf) === cpfDigits);
  if (!log) return { status: 'pendente', label: 'Pendente', erro: null };
  if (log.sucesso) return { status: 'enviado', label: 'Enviado', erro: null };
  return { status: 'erro', label: 'Erro', erro: log.erro };
}

function renderJobAlert() {
  const job = state.job;
  if (!job) return '';
  const running = jobIsRunning(job);
  const cls = job.status === 'erro' || job.status === 'parcial' ? 'err' : 'ok';
  return `<div class="cm-alert ${cls}">
    <strong>Último job:</strong> ${esc(String(job.status || '').toUpperCase())}${job.observacoes ? ` · ${esc(job.observacoes)}` : ''}
    ${job.erro ? `<br><strong>Erro:</strong> ${esc(job.erro)}` : ''}
    ${running ? '<br>Processando no Supabase…' : ''}
  </div>`;
}

function renderListaAniversariantes() {
  if (state.loadingLista) return '<p class="cm-sub">Carregando…</p>';
  if (!state.aniversariantes.length) return '<p class="cm-sub">Nenhum aniversariante hoje.</p>';
  const rows = state.aniversariantes.map((c) => {
    const st = statusDoAniversariante(c.cpf);
    return `<tr>
      <td>${esc(c.nome)}</td>
      <td><span class="cm-pill ${st.status}">${esc(st.label)}</span>${st.erro ? `<div class="cm-sub" style="margin-top:2px">${esc(st.erro)}</div>` : ''}</td>
      <td><button class="cm-btn cm-btn-secondary cm-btn-small" data-reenviar="${esc(onlyDigits(c.cpf))}" type="button">Reenviar</button></td>
    </tr>`;
  }).join('');
  return `<table class="cm-table"><thead><tr><th>Colaborador</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCardAniversario() {
  const job = state.job;
  const running = jobIsRunning(job);
  const enviados = state.logsHoje.filter((l) => l.sucesso).length;
  const erros = state.logsHoje.filter((l) => !l.sucesso).length;
  return `<article class="cm-card">
    <h3>🎂 Aniversário</h3>
    <p class="cm-sub">Envia a imagem de aniversário com o primeiro nome para colaboradores ativos. Roda automaticamente todo dia às 08:00.</p>
    <div class="cm-kpis">
      <div class="cm-kpi"><div class="cm-kpi-val">${state.aniversariantes.length}</div><div class="cm-kpi-lbl">Hoje</div></div>
      <div class="cm-kpi"><div class="cm-kpi-val ok">${enviados}</div><div class="cm-kpi-lbl">Enviados</div></div>
      <div class="cm-kpi"><div class="cm-kpi-val err">${erros}</div><div class="cm-kpi-lbl">Erros</div></div>
    </div>
    <button class="cm-btn cm-btn-primary" id="cm_disparar" type="button" ${running ? 'disabled' : ''}>${running ? 'Processando…' : '▶️ Disparar agora'}</button>
    ${renderJobAlert()}
    <div id="cm_lista_aniversariantes">${renderListaAniversariantes()}</div>
  </article>`;
}

function renderCardModelo() {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(TEMPLATE_PATH);
  const templateUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : '';
  return `<article class="cm-card">
    <h3>🖼️ Modelo da imagem</h3>
    <p class="cm-sub">Substitua o modelo quando quiser trocar a arte. O nome do colaborador é escrito automaticamente dentro do retângulo abaixo de "ANIVERSÁRIO".</p>
    <div class="cm-template-row">
      ${templateUrl ? `<img class="cm-template-preview" src="${esc(templateUrl)}" alt="Modelo atual" />` : '<p class="cm-sub">Nenhum modelo cadastrado ainda.</p>'}
      <div style="flex:1;min-width:220px">
        <div class="cm-field">
          <label>Substituir modelo (PNG/JPG)</label>
          <input type="file" id="cm_template_file" accept="image/png,image/jpeg" />
        </div>
        <div class="cm-field">
          <label>Testar com um nome</label>
          <input type="text" id="cm_preview_nome" placeholder="Ex.: Maria" />
        </div>
        <button class="cm-btn cm-btn-secondary" id="cm_preview_btn" type="button" style="margin-top:8px">Gerar prévia</button>
        <div id="cm_preview_result"></div>
      </div>
    </div>
  </article>`;
}

function render(content) {
  content.innerHTML = `
    ${styles()}
    <div class="cm-wrap">
      <div class="cm-hero">
        <h2>📣 Comunicação</h2>
        <p>Administração dos disparos automáticos do BotConversa para os colaboradores.</p>
      </div>
      <div class="cm-grid" id="cm_grid">
        ${renderCardAniversario()}
        ${renderCardModelo()}
      </div>
    </div>
  `;
  wireEvents(content);
}

function wireEvents(content) {
  content.querySelector('#cm_disparar')?.addEventListener('click', () => dispararAgora(content));
  content.querySelector('#cm_lista_aniversariantes')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-reenviar]');
    if (btn) reenviarUm(content, btn.dataset.reenviar);
  });
  content.querySelector('#cm_preview_btn')?.addEventListener('click', () => gerarPreview(content));
  content.querySelector('#cm_template_file')?.addEventListener('change', (ev) => substituirModelo(content, ev.target.files?.[0]));
}

async function refreshAniversarioCard(content) {
  await Promise.all([loadJobStatus(), loadAniversariantesHoje()]);
  const grid = content.querySelector('#cm_grid');
  if (!grid) return;
  const novo = document.createElement('div');
  novo.innerHTML = renderCardAniversario();
  const atual = grid.children[0];
  if (atual) grid.replaceChild(novo.firstElementChild, atual);
  wireEvents(content);
}

function stopPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
}

async function pollJob(content) {
  stopPolling();
  await refreshAniversarioCard(content);
  if (jobIsRunning(state.job)) {
    state.pollTimer = setTimeout(() => pollJob(content), 4000);
  }
}

async function dispararAgora(content) {
  const btn = content.querySelector('#cm_disparar');
  if (btn) { btn.disabled = true; btn.textContent = 'Iniciando…'; }
  try {
    await invoke('run_now');
    await pollJob(content);
  } catch (err) {
    alert(`Erro ao disparar: ${err?.message || err}`);
    await refreshAniversarioCard(content);
  }
}

async function reenviarUm(content, cpf) {
  if (!confirm('Reenviar a imagem de aniversário para este colaborador?')) return;
  try {
    await invoke('send_one', { cpf });
    await refreshAniversarioCard(content);
  } catch (err) {
    alert(`Erro ao reenviar: ${err?.message || err}`);
  }
}

async function gerarPreview(content) {
  const input = content.querySelector('#cm_preview_nome');
  const resultBox = content.querySelector('#cm_preview_result');
  const nome = String(input?.value || '').trim();
  if (!nome) { alert('Informe um nome para testar.'); return; }
  const btn = content.querySelector('#cm_preview_btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  try {
    const resp = await invoke('preview', { nome });
    if (resultBox) resultBox.innerHTML = `<img class="cm-preview-result" src="data:image/jpeg;base64,${resp.image_base64}" alt="Prévia" />`;
  } catch (err) {
    if (resultBox) resultBox.innerHTML = `<div class="cm-alert err">${esc(err?.message || String(err))}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Gerar prévia'; }
  }
}

async function substituirModelo(content, file) {
  if (!file) return;
  if (!confirm(`Substituir o modelo de aniversário por "${file.name}"?`)) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(TEMPLATE_PATH, file, { upsert: true, contentType: file.type || 'image/png' });
    if (error) throw error;
    const grid = content.querySelector('#cm_grid');
    if (grid) {
      const novo = document.createElement('div');
      novo.innerHTML = renderCardModelo();
      grid.replaceChild(novo.firstElementChild, grid.children[1]);
      wireEvents(content);
    }
  } catch (err) {
    alert(`Erro ao enviar modelo: ${err?.message || err}`);
  }
}

export async function renderContent(content) {
  content.innerHTML = '<div style="padding:10px 0;color:var(--muted);font-size:13px">Carregando…</div>';
  await Promise.all([loadJobStatus(), loadAniversariantesHoje()]);
  render(content);
  if (jobIsRunning(state.job)) pollJob(content);
}

initProtectedPage('TI · Comunicação', renderContent);
