import { supabase } from './supabaseClient.js';

// Lado Gestor da correção: quando o ADM marca uma solicitação como CORRIGIR
// (assets/js/logistica-abertura-os-workflow.js), a própria linha em "Minhas
// solicitações" (renderAberturaOsHistorico, em logistica.js) já fica amarela
// e ganha um lápis (✎ data-editar-abertura) — não existe uma tela separada.
// Este módulo só resolve esse id pro registro completo e preenche de volta o
// formulário real (#osContratante etc.), porque roda como patch isolado
// (não importa logistica.js, então mantém sua própria cópia mínima da lógica
// de payload/validação do form).

let editingId = null;
let rows = [];
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

async function load(){const {data,error}=await supabase.from('logistica_abertura_os').select('*').eq('status','CORRIGIR').limit(200);rows=error?[]:(data||[]);}

async function boot(){await waitFor('#abrirOsSalvarBtn');await load();document.addEventListener('click',async event=>{const edit=event.target.closest('[data-editar-abertura]');if(edit){event.preventDefault();event.stopImmediatePropagation();const row=rows.find(r=>String(r.id)===String(edit.dataset.editarAbertura));if(row)fill(row);return;}const save=event.target.closest('#abrirOsSalvarBtn');if(!save||!editingId)return;event.preventDefault();event.stopImmediatePropagation();const p=payload();const faltando=missing(p);if(faltando.length){alert(`Preencha os campos obrigatórios: ${faltando.join(', ')}`);return;}save.disabled=true;save.textContent='Reenviando...';const {error}=await supabase.rpc('reenviar_abertura_os_corrigida',{p_id:editingId,p_payload:p});if(error){alert(error.message);save.disabled=false;save.textContent='Corrigir e reenviar para o ADM';return;}editingId=null;alert('Correção reenviada para análise do ADM.');location.reload();},true);}

boot().catch(error=>console.error('[logistica-abertura-correcao]',error));
