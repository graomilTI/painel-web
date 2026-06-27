// Fase 2 da Programação reestruturada: "Fechar custos da equipe".
// Consolida em UM card por colaborador confirmado (que vai embarcar) as quatro
// antigas etapas — Estadia, Deslocamento, Alimentação e Extras — para o gestor
// fazer uma passada só, em vez de varrer a lista inteira 4 vezes.
//
// Reaproveita as MESMAS tabelas Supabase e o mesmo formato de payload do núcleo
// (programacao.js saveRow): upsert por (programacao_id,colaborador_id) em
// programacao_estadia/_deslocamento/_alimentacao e insert/update/delete em
// programacao_extras. A lista de confirmados vem de programacao_equipe.
import { supabase } from './supabaseClient.js';

const TIPOS_ESTADIA_BOTOES = ['CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];
const COM_ESTADIA = new Set(['PERNOITE', 'ALOJAMENTO', 'HOTEL']);
const TIPOS_DESLOCAMENTO = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM', 'ÔNIBUS'];
const REFEICOES = [['cafe', 'Café'], ['almoco', 'Almoço'], ['janta', 'Janta']];
// Estimativas só para dar noção de custo ao gestor (o banco não guarda preço de
// refeição/diária — são informativos). Combustível: R$7/L, 10km/L, ida+volta.
const EST_REFEICAO = { cafe: 12, almoco: 25, janta: 22 };
const EST_ESTADIA = { CASA: 0, PERNOITE: 0, ALOJAMENTO: 60, HOTEL: 180 };
const HOTEL_KM_THRESHOLD = 150;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function normalizeUF(value) { return String(value || '').trim().toUpperCase().slice(0, 2); }
function onlyPlate(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
function toNumberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}
function iniciais(nome) {
  return String(nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}
function estimarCombustivel(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n * 2 / 10) * 7 * 100) / 100;
}

function injectStyles() {
  if (document.getElementById('progFase2Styles')) return;
  const style = document.createElement('style');
  style.id = 'progFase2Styles';
  style.textContent = `
    .f2-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
    .f2-kpi{flex:1;min-width:150px;background:var(--bg-card,rgba(8,22,17,.72));border:1px solid var(--line,rgba(111,208,165,.16));border-radius:14px;padding:11px 14px}
    .f2-kpi span{display:block;font-size:11px;color:var(--muted,#8ba79a);text-transform:uppercase;letter-spacing:.06em}
    .f2-kpi strong{display:block;font-size:21px;margin-top:3px;color:var(--text,#eef7f2)}
    .f2-kpi.total strong{color:var(--green-2,#6fd0a5)}
    .f2-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px;align-items:start}
    .f2-card{background:var(--bg-card,rgba(8,22,17,.72));border:1px solid var(--line,rgba(111,208,165,.16));border-radius:18px;padding:16px}
    .f2-head{display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--line,rgba(111,208,165,.16));padding-bottom:13px;margin-bottom:13px}
    .f2-av{flex:0 0 auto;width:40px;height:40px;border-radius:50%;background:rgba(63,168,120,.22);color:var(--green-2,#6fd0a5);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px}
    .f2-head-main{flex:1;min-width:0}
    .f2-name{font-size:15px;font-weight:850;color:#f8fafc}
    .f2-os{font-size:12px;color:var(--muted,#8ba79a);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .f2-subtot{text-align:right;white-space:nowrap}
    .f2-subtot b{font-size:18px;font-weight:900;color:#f8fafc}
    .f2-subtot span{display:block;font-size:10px;color:var(--muted,#8ba79a)}
    .f2-sec{margin-bottom:14px}
    .f2-sec-lab{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--green-2,#6fd0a5);margin-bottom:7px}
    .f2-chips{display:flex;gap:6px;flex-wrap:wrap}
    .f2-chip{border:1px solid var(--line,rgba(111,208,165,.16));background:transparent;color:var(--muted,#8ba79a);border-radius:10px;padding:7px 11px;font-size:12.5px;font-weight:700;cursor:pointer;transition:all .12s}
    .f2-chip:hover{border-color:var(--line-2,rgba(111,208,165,.3));color:#cfe7da}
    .f2-chip.on{border-color:rgba(111,208,165,.55);background:rgba(63,168,120,.18);color:#bbf7d0}
    .f2-chip.on.amber{border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.14);color:#fde68a}
    .f2-hint{font-size:11px;color:#fbbf24;margin:6px 0 0}
    .f2-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .f2-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:120px}
    .f2-field label{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#8ba79a)}
    .f2-field input,.f2-field select{min-height:40px;border:1px solid var(--line-2,rgba(111,208,165,.3));background:var(--bg-soft,#0a1e17);color:var(--text,#eef7f2);border-radius:11px;padding:8px 11px;font-size:14px;color-scheme:dark;width:100%;box-sizing:border-box}
    .f2-meta{font-size:11.5px;color:var(--muted,#8ba79a);margin-top:8px}
    .f2-meta b{color:var(--text,#eef7f2)}
    .f2-foot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line,rgba(111,208,165,.16));padding-top:12px;margin-top:2px}
    .f2-extra-add{background:transparent;border:1px dashed var(--line-2,rgba(111,208,165,.3));color:var(--muted,#8ba79a);border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer}
    .f2-extra-add:hover{color:#bbf7d0;border-color:rgba(111,208,165,.5)}
    .f2-extra{display:grid;grid-template-columns:1fr 96px 32px;gap:7px;margin-top:7px;align-items:center}
    .f2-extra input{min-height:38px;border:1px solid var(--line-2,rgba(111,208,165,.3));background:var(--bg-soft,#0a1e17);color:var(--text,#eef7f2);border-radius:10px;padding:7px 10px;font-size:13px;color-scheme:dark}
    .f2-extra-del{border:1px solid rgba(248,113,113,.3);background:rgba(239,68,68,.12);color:#fca5a5;border-radius:9px;cursor:pointer;height:38px;font-size:16px}
    .f2-empty{border:1px dashed var(--line-2,rgba(111,208,165,.3));border-radius:16px;padding:26px;text-align:center;color:var(--muted,#8ba79a);line-height:1.5}
    @media(max-width:600px){.f2-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

const state = {
  programacaoId: null,
  dataReferencia: null,
  supervisao: null,
  team: [],            // [{colaboradorId, nome, osLabel, km}]
  estadia: new Map(),
  deslocamento: new Map(),
  alimentacao: new Map(),
  extras: new Map(),   // colaboradorId -> [rows]
  alojamentos: [],
  timers: new Map(),
};

async function carregarDados(programacaoId, supervisao) {
  const [equipe, est, des, ali, ext, aloj] = await Promise.all([
    supabase.from('programacao_equipe').select('*').eq('programacao_id', programacaoId).eq('confirmado', true),
    supabase.from('programacao_estadia').select('*').eq('programacao_id', programacaoId),
    supabase.from('programacao_deslocamento').select('*').eq('programacao_id', programacaoId),
    supabase.from('programacao_alimentacao').select('*').eq('programacao_id', programacaoId),
    supabase.from('programacao_extras').select('*').eq('programacao_id', programacaoId).order('created_at', { ascending: true }),
    supabase.from('hospedagem_alojamentos').select('id,nome,cidade,uf,capacidade,status').eq('status', 'ATIVO').order('cidade', { ascending: true }),
  ]);
  if (equipe.error) throw equipe.error;

  const confirmados = equipe.data || [];
  const osIds = [...new Set(confirmados.map((r) => r.os_id).filter(Boolean))];
  let osById = new Map();
  if (osIds.length) {
    const { data: osRows } = await supabase.from('operacional_os').select('id,numero_os,cliente,embarque').in('id', osIds);
    osById = new Map((osRows || []).map((o) => [String(o.id), o]));
  }

  state.team = confirmados.map((r) => {
    const os = osById.get(String(r.os_id));
    const osLabel = os ? `OS ${os.numero_os || '-'} · ${os.cliente || '-'}` : (r.os_id ? `OS ${r.os_id}` : 'Sem OS vinculada');
    return {
      colaboradorId: String(r.colaborador_id),
      nome: r.nome_colaborador || 'Colaborador',
      osLabel,
      embarque: os?.embarque || '',
      km: r.km_estimado != null ? Number(r.km_estimado) : null,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  state.estadia = new Map((est.data || []).map((r) => [String(r.colaborador_id), r]));
  state.deslocamento = new Map((des.data || []).map((r) => [String(r.colaborador_id), r]));
  state.alimentacao = new Map((ali.data || []).map((r) => [String(r.colaborador_id), r]));
  const exMap = new Map();
  (ext.data || []).forEach((r) => {
    const k = String(r.colaborador_id);
    if (!exMap.has(k)) exMap.set(k, []);
    exMap.get(k).push(r);
  });
  state.extras = exMap;
  state.alojamentos = aloj.error ? [] : (aloj.data || []);
}

function ufFromEmbarque(embarque) {
  const m = /^([A-Z]{2})\s*-/.exec(String(embarque || '').trim());
  return m ? m[1].toUpperCase() : '';
}
function cidadeFromEmbarque(embarque) {
  const m = /^[A-Z]{2}\s*-\s*([^(]+)/.exec(String(embarque || '').trim());
  return m ? m[1].trim() : '';
}

function alojamentoOptions(selectedId, uf) {
  const ufn = normalizeUF(uf);
  const rows = ufn ? state.alojamentos.filter((a) => normalizeUF(a.uf) === ufn) : state.alojamentos;
  const lista = rows.length ? rows : state.alojamentos;
  return '<option value="">Selecionar alojamento/hotel</option>' + lista.map((a) =>
    `<option value="${esc(a.id)}" ${String(selectedId || '') === String(a.id) ? 'selected' : ''}>${esc(`${a.nome} · ${a.cidade || '-'}/${a.uf || ''}`)}</option>`
  ).join('');
}

function custoEstimado(colabId, km) {
  const est = state.estadia.get(colabId) || {};
  const des = state.deslocamento.get(colabId) || {};
  const ali = state.alimentacao.get(colabId) || {};
  const extras = state.extras.get(colabId) || [];
  const tipoEst = normalizeText(est.tipo_estadia || 'CASA');
  const hosp = EST_ESTADIA[tipoEst] != null ? EST_ESTADIA[tipoEst] : 0;
  const comb = des.valor != null && des.valor !== '' ? toNumberBR(des.valor) : estimarCombustivel(des.km != null ? des.km : km);
  const ref = REFEICOES.reduce((a, [k]) => a + (ali[k] ? EST_REFEICAO[k] : 0), 0);
  const ext = extras.reduce((a, r) => a + toNumberBR(r.valor), 0);
  return hosp + comb + ref + ext;
}

function chipsEstadia(colabId, tipoAtual) {
  return TIPOS_ESTADIA_BOTOES.map((t) =>
    `<button type="button" class="f2-chip ${normalizeText(tipoAtual) === t ? 'on' : ''}" data-act="estadia-tipo" data-tipo="${t}">${t === 'CASA' ? 'Casa' : t === 'PERNOITE' ? 'Pernoite' : t === 'ALOJAMENTO' ? 'Alojamento' : 'Hotel'}</button>`
  ).join('');
}
function chipsDeslocamento(tipoAtual) {
  const atual = String(tipoAtual || 'NÃO PRECISA').toUpperCase();
  return TIPOS_DESLOCAMENTO.map((t) =>
    `<button type="button" class="f2-chip ${atual === t ? 'on' : ''}" data-act="desloc-tipo" data-tipo="${esc(t)}">${esc(t === 'NÃO PRECISA' ? 'Não precisa' : t === 'MOTORISTA FROTA' ? 'Frota' : t === 'CARONA FROTA' ? 'Carona' : t === 'UBER/TÁXI' ? 'Uber/Táxi' : t === 'REEMBOLSO KM' ? 'Reemb. km' : 'Ônibus')}</button>`
  ).join('');
}
function chipsRefeicao(ali) {
  return REFEICOES.map(([k, label]) =>
    `<button type="button" class="f2-chip ${ali[k] ? 'on' : ''}" data-act="refeicao" data-ref="${k}">${label}</button>`
  ).join('');
}

function cardHtml(p) {
  const est = state.estadia.get(p.colaboradorId) || {};
  const des = state.deslocamento.get(p.colaboradorId) || {};
  const ali = state.alimentacao.get(p.colaboradorId) || { almoco: true };
  const extras = state.extras.get(p.colaboradorId) || [];
  const tipoEst = normalizeText(est.tipo_estadia || 'CASA');
  const mostraHotel = COM_ESTADIA.has(tipoEst) && tipoEst !== 'PERNOITE';
  const uf = est.uf || ufFromEmbarque(p.embarque);
  const kmDes = des.km != null ? des.km : (p.km != null ? p.km : '');
  const comb = des.valor != null && des.valor !== '' ? toNumberBR(des.valor) : estimarCombustivel(kmDes);
  const longe = p.km != null && p.km >= HOTEL_KM_THRESHOLD;
  const tot = custoEstimado(p.colaboradorId, p.km);

  return `
    <article class="f2-card" data-colab-id="${esc(p.colaboradorId)}" data-nome="${esc(p.nome)}">
      <div class="f2-head">
        <span class="f2-av">${esc(iniciais(p.nome))}</span>
        <div class="f2-head-main">
          <div class="f2-name">${esc(p.nome)}</div>
          <div class="f2-os">${esc(p.osLabel)}</div>
        </div>
        <div class="f2-subtot"><b data-subtot>${BRL.format(tot)}</b><span>estimado no dia</span></div>
      </div>

      <div class="f2-sec">
        <div class="f2-sec-lab">🛏 Hospedagem</div>
        ${longe && !COM_ESTADIA.has(tipoEst) ? `<div class="f2-hint">⚡ ${p.km}km do embarque — considere hotel/alojamento.</div>` : ''}
        <div class="f2-chips" data-chips="estadia">${chipsEstadia(p.colaboradorId, tipoEst)}</div>
        <div class="f2-row" data-estadia-extra ${mostraHotel ? '' : 'hidden'}>
          <div class="f2-field"><label>Cidade</label><input data-fld="cidade" value="${esc(est.cidade || cidadeFromEmbarque(p.embarque))}" placeholder="Cidade" /></div>
          <div class="f2-field" style="flex:0 0 76px"><label>UF</label><input data-fld="uf" maxlength="2" value="${esc(uf)}" placeholder="UF" /></div>
          <div class="f2-field" style="flex:1 1 100%"><label>Alojamento / hotel</label><select data-fld="alojamento_id">${alojamentoOptions(est.alojamento_id, uf)}</select></div>
        </div>
      </div>

      <div class="f2-sec">
        <div class="f2-sec-lab">🚐 Deslocamento</div>
        <div class="f2-chips" data-chips="desloc">${chipsDeslocamento(des.tipo_deslocamento)}</div>
        <div class="f2-row">
          <div class="f2-field"><label>Placa (frota)</label><input data-fld="placa_veiculo" maxlength="7" value="${esc(des.placa_veiculo || '')}" placeholder="ABC1D23" style="text-transform:uppercase" /></div>
          <div class="f2-field" style="flex:0 0 96px"><label>Km</label><input data-fld="km" type="number" min="0" step="1" value="${esc(kmDes)}" /></div>
          <div class="f2-field" style="flex:0 0 120px"><label>Valor</label><input data-fld="valor" value="${esc(des.valor != null ? des.valor : '')}" placeholder="R$ 0,00" /></div>
        </div>
        <div class="f2-meta">Combustível estimado (ida+volta): <b>${BRL.format(comb)}</b></div>
      </div>

      <div class="f2-sec">
        <div class="f2-sec-lab">🍽 Alimentação</div>
        <div class="f2-chips" data-chips="refeicao">${chipsRefeicao(ali)}</div>
      </div>

      <div class="f2-sec">
        <div class="f2-sec-lab">＋ Extras</div>
        <div data-extras-list>${extras.map(extraHtml).join('')}</div>
        <button type="button" class="f2-extra-add" data-act="extra-add">＋ Adicionar despesa</button>
      </div>

      <div class="f2-foot">
        <span style="font-size:12px;color:var(--muted,#8ba79a)">Tudo desta pessoa em um lugar</span>
        <span style="font-size:12px;color:var(--muted,#8ba79a)">subtotal <b style="color:var(--green-2,#6fd0a5);font-size:15px" data-subtot2>${BRL.format(tot)}</b></span>
      </div>
    </article>`;
}

function extraHtml(r) {
  return `<div class="f2-extra" data-extra-id="${esc(r.id)}">
    <input data-exfld="descricao" value="${esc(r.descricao || '')}" placeholder="Descrição (ex.: pedágio)" />
    <input data-exfld="valor" value="${esc(r.valor != null ? r.valor : '')}" placeholder="R$ 0,00" />
    <button type="button" class="f2-extra-del" data-act="extra-del" title="Excluir">×</button>
  </div>`;
}

function atualizarTotais(content) {
  let dia = 0;
  state.team.forEach((p) => {
    const tot = custoEstimado(p.colaboradorId, p.km);
    dia += tot;
    const card = content.querySelector(`.f2-card[data-colab-id="${CSS.escape(p.colaboradorId)}"]`);
    if (card) {
      const s1 = card.querySelector('[data-subtot]');
      const s2 = card.querySelector('[data-subtot2]');
      if (s1) s1.textContent = BRL.format(tot);
      if (s2) s2.textContent = BRL.format(tot);
    }
  });
  const totEl = content.querySelector('#f2DayTotal');
  if (totEl) totEl.textContent = BRL.format(dia);
}

function basePayload(card) {
  return {
    programacao_id: state.programacaoId,
    data_referencia: state.dataReferencia,
    colaborador_id: card.dataset.colabId,
    nome_colaborador: card.dataset.nome,
  };
}

function agendarSave(key, fn) {
  clearTimeout(state.timers.get(key));
  state.timers.set(key, setTimeout(fn, 450));
}

async function salvarEstadia(card) {
  const colabId = card.dataset.colabId;
  const tipo = normalizeText(card.querySelector('[data-chips="estadia"] .f2-chip.on')?.dataset.tipo || 'CASA') || 'CASA';
  const cidade = card.querySelector('[data-fld="cidade"]')?.value || null;
  const uf = normalizeUF(card.querySelector('[data-fld="uf"]')?.value || '');
  const alojId = card.querySelector('[data-fld="alojamento_id"]')?.value || null;
  const aloj = state.alojamentos.find((a) => String(a.id) === String(alojId));
  const payload = {
    ...basePayload(card),
    tipo_estadia: tipo,
    tem_estadia: COM_ESTADIA.has(tipo),
    cidade,
    uf: uf || null,
    alojamento_id: alojId || null,
    alojamento_nome: aloj?.nome || null,
  };
  const { data, error } = await supabase.from('programacao_estadia').upsert(payload, { onConflict: 'programacao_id,colaborador_id' }).select('*').single();
  if (error) { console.error('[fase2 estadia]', error); return; }
  state.estadia.set(colabId, data);
}

async function salvarDeslocamento(card) {
  const colabId = card.dataset.colabId;
  const tipo = card.querySelector('[data-chips="desloc"] .f2-chip.on')?.dataset.tipo || 'NÃO PRECISA';
  const payload = {
    ...basePayload(card),
    tipo_deslocamento: tipo,
    placa_veiculo: onlyPlate(card.querySelector('[data-fld="placa_veiculo"]')?.value || ''),
    km: toNumberBR(card.querySelector('[data-fld="km"]')?.value || 0),
    valor: card.querySelector('[data-fld="valor"]')?.value || null,
  };
  const { data, error } = await supabase.from('programacao_deslocamento').upsert(payload, { onConflict: 'programacao_id,colaborador_id' }).select('*').single();
  if (error) { console.error('[fase2 deslocamento]', error); return; }
  state.deslocamento.set(colabId, data);
}

async function salvarAlimentacao(card) {
  const colabId = card.dataset.colabId;
  const payload = { ...basePayload(card) };
  REFEICOES.forEach(([k]) => { payload[k] = !!card.querySelector(`[data-chips="refeicao"] .f2-chip[data-ref="${k}"]`)?.classList.contains('on'); });
  const { data, error } = await supabase.from('programacao_alimentacao').upsert(payload, { onConflict: 'programacao_id,colaborador_id' }).select('*').single();
  if (error) { console.error('[fase2 alimentacao]', error); return; }
  state.alimentacao.set(colabId, data);
}

async function adicionarExtra(card) {
  const colabId = card.dataset.colabId;
  const { data, error } = await supabase.from('programacao_extras').insert({
    ...basePayload(card), tipo_despesa: 'OUTRO', descricao: '', valor: 0, observacao: '',
  }).select('*').single();
  if (error) { console.error('[fase2 extra add]', error); return; }
  const arr = state.extras.get(colabId) || [];
  arr.push(data);
  state.extras.set(colabId, arr);
  const list = card.querySelector('[data-extras-list]');
  if (list) list.insertAdjacentHTML('beforeend', extraHtml(data));
}

async function salvarExtra(row) {
  const id = row.dataset.extraId;
  const payload = {
    descricao: row.querySelector('[data-exfld="descricao"]')?.value || '',
    valor: toNumberBR(row.querySelector('[data-exfld="valor"]')?.value || 0),
  };
  const { data, error } = await supabase.from('programacao_extras').update(payload).eq('id', id).select('*').single();
  if (error) { console.error('[fase2 extra save]', error); return; }
  const arr = state.extras.get(String(data.colaborador_id)) || [];
  const i = arr.findIndex((r) => r.id === data.id);
  if (i >= 0) arr[i] = data;
}

async function excluirExtra(row) {
  const id = row.dataset.extraId;
  const { error } = await supabase.from('programacao_extras').delete().eq('id', id);
  if (error) { console.error('[fase2 extra del]', error); return; }
  for (const [k, arr] of state.extras.entries()) state.extras.set(k, arr.filter((r) => String(r.id) !== String(id)));
  row.remove();
}

function bindEvents(content) {
  content.addEventListener('click', async (event) => {
    const card = event.target.closest('.f2-card');
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!card || !act) return;

    if (act === 'estadia-tipo') {
      const tipo = event.target.dataset.tipo;
      card.querySelectorAll('[data-chips="estadia"] .f2-chip').forEach((c) => c.classList.toggle('on', c.dataset.tipo === tipo));
      const extra = card.querySelector('[data-estadia-extra]');
      if (extra) extra.hidden = !(COM_ESTADIA.has(tipo) && tipo !== 'PERNOITE');
      await salvarEstadia(card);
      atualizarTotais(content);
    } else if (act === 'desloc-tipo') {
      const tipo = event.target.dataset.tipo;
      card.querySelectorAll('[data-chips="desloc"] .f2-chip').forEach((c) => c.classList.toggle('on', c.dataset.tipo === tipo));
      await salvarDeslocamento(card);
    } else if (act === 'refeicao') {
      event.target.classList.toggle('on');
      await salvarAlimentacao(card);
      atualizarTotais(content);
    } else if (act === 'extra-add') {
      await adicionarExtra(card);
    } else if (act === 'extra-del') {
      const row = event.target.closest('.f2-extra');
      if (row) { await excluirExtra(row); atualizarTotais(content); }
    }
  });

  content.addEventListener('input', (event) => {
    const card = event.target.closest('.f2-card');
    if (!card) return;
    if (event.target.matches('[data-fld="placa_veiculo"]')) event.target.value = event.target.value.toUpperCase();
    if (event.target.matches('[data-fld]')) {
      const isEstadia = ['cidade', 'uf', 'alojamento_id'].includes(event.target.dataset.fld);
      agendarSave(`${isEstadia ? 'est' : 'des'}:${card.dataset.colabId}`, () => {
        (isEstadia ? salvarEstadia(card) : salvarDeslocamento(card)).then(() => atualizarTotais(content));
      });
    }
    const exRow = event.target.closest('.f2-extra');
    if (exRow && event.target.matches('[data-exfld]')) {
      agendarSave(`ex:${exRow.dataset.extraId}`, () => salvarExtra(exRow).then(() => atualizarTotais(content)));
    }
  });

  content.addEventListener('change', (event) => {
    const card = event.target.closest('.f2-card');
    if (card && event.target.matches('[data-fld="alojamento_id"]')) salvarEstadia(card).then(() => atualizarTotais(content));
  });
}

export async function renderFase2Custos(content, options = {}) {
  injectStyles();
  state.programacaoId = options.programacaoId || null;
  state.dataReferencia = options.dataReferencia || null;
  state.supervisao = options.supervisao || null;

  content.innerHTML = `
    <div class="prog-section-title"><h4>Fechar custos da equipe</h4><span class="badge">Fase 2</span></div>
    <div class="f2-kpis">
      <div class="f2-kpi"><span>Equipe que embarca</span><strong id="f2Count">—</strong></div>
      <div class="f2-kpi total"><span>Custo estimado do dia</span><strong id="f2DayTotal">—</strong></div>
    </div>
    <div id="f2Grid"><div class="f2-empty">Carregando equipe confirmada...</div></div>
  `;

  if (!state.programacaoId) {
    content.querySelector('#f2Grid').innerHTML = '<div class="f2-empty">Carregue o contexto (supervisão e data) e confirme a equipe na Fase 1 primeiro.</div>';
    return;
  }

  try {
    await carregarDados(state.programacaoId, state.supervisao);
  } catch (error) {
    console.error('[fase2] carregar:', error);
    content.querySelector('#f2Grid').innerHTML = `<div class="f2-empty">Erro ao carregar custos: ${esc(error.message || '')}</div>`;
    return;
  }

  const grid = content.querySelector('#f2Grid');
  const countEl = content.querySelector('#f2Count');
  if (countEl) countEl.textContent = `${state.team.length} pessoa${state.team.length === 1 ? '' : 's'}`;

  if (!state.team.length) {
    grid.innerHTML = '<div class="f2-empty">Nenhum colaborador confirmado ainda. Volte para a Fase 1 (Programar OS) e atribua a equipe.</div>';
    return;
  }

  grid.outerHTML = `<div id="f2Grid" class="f2-grid">${state.team.map(cardHtml).join('')}</div>`;
  const gridEl = content.querySelector('#f2Grid');
  bindEvents(gridEl);
  atualizarTotais(content);
}
