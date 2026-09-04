import { supabase } from './supabaseClient.js';
import { labelCampoAberturaOs } from './logistica-abertura-os-campos.js';

// Handoff da nova tela "Logística de Correção" (logistica-correcao.js): lá o
// Gestor vê a lista completa com o que foi marcado e clica "Editar e
// reenviar", que grava aqui o id pendente antes de navegar de volta pra este
// form (único lugar onde os campos #osContratante etc. realmente existem).
const HANDOFF_KEY = 'painel_correcao_abertura_os_id';

let editingId = null;
let rows = [];
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const waitFor = (selector, timeout=15000) => new Promise((resolve,reject)=>{const found=document.querySelector(selector);if(found)return resolve(found);const obs=new MutationObserver(()=>{const el=document.querySelector(selector);if(el){obs.disconnect();resolve(el);}});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{obs.disconnect();reject(new Error(`Tempo esgotado aguardando ${selector}`));},timeout);});
const val = (id) => document.getElementById(id)?.value?.trim() || '';
const parseNum = (v) => Number(String(v ?? '').replace(/\./g,'').replace(',','.')) || 0;

// Mesma regra de assets/js/logistica.js:categoriaProduto — duplicada aqui
// porque este módulo roda como patch isolado (não importa o outro).
function categoriaProduto(valor){const t=String(valor||'').trim().toUpperCase();return {MILHO:'MILHO',SORGO:'SORGO',SOJA:'SOJA',TRIGO:'TRIGO'}[t]||null;}
function testesSelecionados(){return [...document.querySelectorAll('[data-teste-key]:checked')].map(el=>el.dataset.testeKey);}
function payload(){const opcoes=testesSelecionados();const categoria=categoriaProduto(val('osProduto'));return {contratante_cliente:val('osContratante'),filial_pagadora:val('osFilialPagadora'),produtor:val('osProdutor')||null,armazem_embarque:val('osArmazemEmbarque'),cidade_embarque:val('osCidadeEmbarque'),cidade_destino:val('osCidadeDestino'),local_destino:val('osLocalDestino'),numero_contrato:val('osNumeroContrato'),produto:val('osProduto'),tipo_produto:val('osTipoProduto'),volume_inicial:parseNum(val('osVolumeInicial')),regional:val('osRegional'),troca_notas:val('osTrocaNotas'),servico:val('osServico'),testes:categoria?{categoria,opcoes}:{}};}
function missing(p){return [['Contratante/Cliente',p.contratante_cliente],['Filial pagadora',p.filial_pagadora],['Armazém de embarque',p.armazem_embarque],['Cidade de embarque',p.cidade_embarque],['Cidade destino',p.cidade_destino],['Local de destino',p.local_destino],['Número contrato',p.numero_contrato],['Produto',p.produto],['Tipo de produto',p.tipo_produto],['Volume inicial',p.volume_inicial],['Regional',p.regional],['Troca de notas',p.troca_notas],['Serviço',p.servico]].filter(([,v])=>!v).map(([k])=>k);}

// Injeta a option se o valor histórico da solicitação não estiver mais entre
// as opções atuais de state.aberturaRefs (select agora substitui o antigo
// input+datalist — ver [[painel-web-abertura-os-searchable-select]]), senão
// select.value=x fica em branco silenciosamente.
function ensureOption(select,value){if(!select||!value)return;const existe=[...select.options].some(o=>o.value===value);if(existe)return;const opt=document.createElement('option');opt.value=value;opt.textContent=value;select.appendChild(opt);}

function fill(row){const values={osContratante:row.contratante_cliente,osFilialPagadora:row.filial_pagadora,osProdutor:row.produtor,osArmazemEmbarque:row.armazem_embarque,osCidadeEmbarque:row.cidade_embarque,osCidadeDestino:row.cidade_destino,osLocalDestino:row.local_destino,osNumeroContrato:row.numero_contrato,osProduto:row.produto,osTipoProduto:row.tipo_produto,osVolumeInicial:row.volume_inicial,osRegional:row.regional,osTrocaNotas:row.troca_notas,osServico:row.servico};Object.entries(values).forEach(([id,value])=>{const input=document.getElementById(id);if(!input)return;if(input instanceof HTMLSelectElement)ensureOption(input,value??'');input.value=value??'';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  // O evento acima em osProduto já disparou a re-renderização que mostra os
  // checkboxes de Testes (lógica em logistica.js); marca os que vieram da
  // solicitação original disparando "change" pra logistica.js atualizar o
  // próprio estado interno (não temos acesso direto a ele deste módulo).
  const opcoesSalvas=Array.isArray(row.testes?.opcoes)?row.testes.opcoes:[];
  opcoesSalvas.forEach(key=>{const chk=document.querySelector(`[data-teste-key="${CSS.escape(key)}"]`);if(!chk)return;chk.checked=true;chk.dispatchEvent(new Event('change',{bubbles:true}));});
  editingId=row.id;const button=document.getElementById('abrirOsSalvarBtn');if(button)button.textContent='Corrigir e reenviar para o ADM';document.querySelector('.abrir-os-card')?.scrollIntoView({behavior:'smooth',block:'start'});}

async function load(){const {data,error}=await supabase.from('logistica_abertura_os').select('*').eq('status','CORRIGIR').order('decidido_em',{ascending:false}).limit(100);rows=error?[]:(data||[]);render();}
function camposBadges(row){const campos=Array.isArray(row.campos_corrigir)?row.campos_corrigir:[];if(!campos.length)return '';return `<div class="abertura-correcao-campos">${campos.map(c=>`<span class="abertura-campo-badge">${esc(labelCampoAberturaOs(typeof c==='string'?c:c.campo))}</span>`).join('')}</div>`;}
function render(){const card=document.querySelector('.abrir-os-card');if(!card)return;let box=document.getElementById('aberturaCorrecoesGestor');if(!rows.length){box?.remove();return;}if(!box){box=document.createElement('section');box.id='aberturaCorrecoesGestor';box.className='abrir-os-card abertura-correcoes';card.parentElement.insertBefore(box,card);}box.innerHTML=`<h4>Correções solicitadas pelo ADM</h4><div class="abertura-correcao-list">${rows.map(row=>`<article class="abertura-correcao-item"><div><strong>${esc(row.contratante_cliente||'-')}</strong><span>${esc(row.filial_pagadora||'-')} · ${esc(row.numero_contrato||'-')}</span></div><div><strong>${esc(row.produto||'-')} · ${esc(row.servico||'-')}</strong><span>${esc(row.armazem_embarque||'-')} → ${esc(row.local_destino||'-')}</span></div><div class="abertura-correcao-motivo">${camposBadges(row)}<strong>Correção:</strong> ${esc(row.observacao_adm||'-')}</div><button class="log-btn-ok" data-editar-abertura="${esc(row.id)}" type="button">Editar e reenviar</button></article>`).join('')}</div>`;}
function style(){if(document.getElementById('abertura-correcao-style'))return;const s=document.createElement('style');s.id='abertura-correcao-style';s.textContent=`.abertura-correcoes{border-color:rgba(250,204,21,.32)!important;background:rgba(113,63,18,.10)!important}.abertura-correcao-list{display:flex;flex-direction:column;gap:8px}.abertura-correcao-item{display:grid;grid-template-columns:1.2fr 1.2fr 1.5fr auto;gap:12px;align-items:center;border:1px solid rgba(250,204,21,.18);background:rgba(15,23,42,.36);border-radius:12px;padding:10px 12px}.abertura-correcao-item strong{display:block;color:#e5e7eb;font-size:12px}.abertura-correcao-item span{display:block;color:#8fa1b5;font-size:11px;margin-top:2px}.abertura-correcao-motivo{color:#fde68a;font-size:12px}.abertura-correcao-campos{margin-bottom:4px}.abertura-campo-badge{display:inline-block;margin:0 4px 4px 0;padding:2px 7px;border-radius:999px;background:rgba(250,204,21,.16);color:#fde68a;font-size:10px;font-weight:800}@media(max-width:900px){.abertura-correcao-item{grid-template-columns:1fr}.abertura-correcao-item .log-btn-ok{width:100%}}`;document.head.appendChild(s);}

function consumeHandoff(){let pendingId=null;try{pendingId=sessionStorage.getItem(HANDOFF_KEY);}catch{return;}if(!pendingId)return;try{sessionStorage.removeItem(HANDOFF_KEY);}catch{}const row=rows.find(r=>String(r.id)===String(pendingId));if(row)fill(row);}

async function boot(){await waitFor('#abrirOsSalvarBtn');style();await load();consumeHandoff();document.addEventListener('click',async event=>{const edit=event.target.closest('[data-editar-abertura]');if(edit){event.preventDefault();event.stopImmediatePropagation();const row=rows.find(r=>String(r.id)===String(edit.dataset.editarAbertura));if(row)fill(row);return;}const save=event.target.closest('#abrirOsSalvarBtn');if(!save||!editingId)return;event.preventDefault();event.stopImmediatePropagation();const p=payload();const faltando=missing(p);if(faltando.length){alert(`Preencha os campos obrigatórios: ${faltando.join(', ')}`);return;}save.disabled=true;save.textContent='Reenviando...';const {error}=await supabase.rpc('reenviar_abertura_os_corrigida',{p_id:editingId,p_payload:p});if(error){alert(error.message);save.disabled=false;save.textContent='Corrigir e reenviar para o ADM';return;}editingId=null;alert('Correção reenviada para análise do ADM.');location.reload();},true);new MutationObserver(()=>{if(rows.length&&!document.getElementById('aberturaCorrecoesGestor'))render();}).observe(document.getElementById('pageContent')||document.body,{childList:true,subtree:true});}

boot().catch(error=>console.error('[logistica-abertura-correcao]',error));
