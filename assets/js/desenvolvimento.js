import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { mensagemFalhaSalvar } from './rls-sessao-expirada.js';
import {
  esc, norm, clamp, renderBase, applyModules, filterItems, renderKpis,
  renderList, renderDetail, renderHistory, fillForm, fillProgress,
  openModal, closeModal,
} from './desenvolvimento-view.js';

const TABLE='diretoria_desenvolvimento';
const HISTORY='diretoria_desenvolvimento_atualizacoes';
const state={items:[],selected:null,canEdit:false,context:null,channel:null,filters:{q:'',status:'',modulo:'',prioridade:'',ativos:'true'}};

function currentUser(){return{id:state.context?.user?.id||null,name:state.context?.user?.nome||state.context?.user?.name||state.context?.user?.email||'Usuário do painel'};}
function userCanEdit(ctx){if(ctx?.user?.is_master)return true;const roles=[ctx?.user?.role,ctx?.role,ctx?.perfil_codigo,ctx?.perfil_nome,ctx?.department?.code,ctx?.department?.name,ctx?.setor].map(norm);return roles.some((v)=>['admin','administrador','ti'].includes(v)||v.includes('tecnologia')||v.includes('desenvolv'));}
function selectedItem(){return state.items.find((i)=>i.id===state.selected)||null;}
function localDateValue(value){if(!value)return value;const raw=String(value).slice(0,10);return{toString:()=>raw,valueOf:()=>new Date(`${raw}T12:00:00`).getTime()};}

async function showDetail(content){
  const item=selectedItem();
  const timeline=renderDetail(content,item,state.canEdit);
  if(!item||!timeline)return;
  const {data,error}=await supabase.from(HISTORY).select('*').eq('desenvolvimento_id',item.id).order('created_at',{ascending:false}).limit(20);
  if(state.selected===item.id)renderHistory(timeline,data,error);
}

function repaint(content){
  const rows=filterItems(state.items,state.filters);
  if(!state.selected||!rows.some((i)=>i.id===state.selected))state.selected=rows[0]?.id||null;
  renderKpis(content,state.items);renderList(content,rows,state.selected);showDetail(content);
}

async function load(content){
  const {data,error}=await supabase.from(TABLE).select('*').order('ordem').order('updated_at',{ascending:false});
  if(error){content.querySelector('[data-list]').innerHTML=`<div class="dv-error"><b>Não foi possível carregar.</b><br>${esc(error.message)}<br><br>Aplique a migration <code>20260724160000_diretoria_desenvolvimento.sql</code> no Supabase.</div>`;return;}
  state.items=(data||[]).map((item)=>({...item,data_inicio:localDateValue(item.data_inicio),previsao_conclusao:localDateValue(item.previsao_conclusao),data_conclusao:localDateValue(item.data_conclusao)}));applyModules(content,state.items,state.filters.modulo);repaint(content);
}

async function addHistory(after,before,note){
  if(!note?.trim())return;
  const u=currentUser();
  const {error}=await supabase.from(HISTORY).insert({desenvolvimento_id:after.id,progresso_anterior:before?.progresso??null,progresso_novo:after.progresso,status_anterior:before?.status??null,status_novo:after.status,descricao:note.trim(),autor_id:u.id,autor_nome:u.name});
  if(error)console.warn('[Desenvolvimento] histórico:',error);
}

async function saveItem(content,form){
  const id=form.elements.id.value||null,before=state.items.find((i)=>i.id===id),u=currentUser();
  const status=form.elements.status.value;
  const payload={
    titulo:form.elements.titulo.value.trim(),modulo:form.elements.modulo.value.trim(),submenu:form.elements.submenu.value.trim()||null,
    tipo:form.elements.tipo.value,status,prioridade:form.elements.prioridade.value,progresso:status==='CONCLUIDO'?100:clamp(form.elements.progresso.value),
    responsavel:form.elements.responsavel.value.trim()||null,descricao:form.elements.descricao.value.trim(),
    proxima_etapa:form.elements.proxima_etapa.value.trim()||null,impedimentos:form.elements.impedimentos.value.trim()||null,
    data_inicio:form.elements.data_inicio.value||null,previsao_conclusao:form.elements.previsao_conclusao.value||null,
    updated_by:u.id,updated_by_name:u.name,
  };
  if(!id){payload.created_by=u.id;payload.created_by_name=u.name;}
  const query=id?supabase.from(TABLE).update(payload).eq('id',id):supabase.from(TABLE).insert(payload);
  const {data,error}=await query.select().single();
  if(error){alert(await mensagemFalhaSalvar(error, `Não foi possível salvar: ${error.message}`));return;}
  await addHistory(data,before,form.elements.nota.value||(id?'Cadastro atualizado.':'Desenvolvimento cadastrado.'));
  state.selected=data.id;closeModal(content,'form');await load(content);
}

async function saveProgress(content,form){
  const before=state.items.find((i)=>i.id===form.elements.id.value);if(!before)return;
  const u=currentUser(),status=form.elements.status.value;
  const payload={status,progresso:status==='CONCLUIDO'?100:clamp(form.elements.progresso.value),proxima_etapa:form.elements.proxima_etapa.value.trim()||null,impedimentos:form.elements.impedimentos.value.trim()||null,updated_by:u.id,updated_by_name:u.name};
  const {data,error}=await supabase.from(TABLE).update(payload).eq('id',before.id).select().single();
  if(error){alert(await mensagemFalhaSalvar(error, `Não foi possível atualizar: ${error.message}`));return;}
  await addHistory(data,before,form.elements.nota.value);state.selected=data.id;closeModal(content,'progress');await load(content);
}

async function archiveItem(content){
  const item=selectedItem();if(!item||!confirm(`Arquivar “${item.titulo}”?`))return;
  const u=currentUser();
  const {data,error}=await supabase.from(TABLE).update({ativo:false,updated_by:u.id,updated_by_name:u.name}).eq('id',item.id).select().single();
  if(error){alert(error.message);return;}
  await addHistory(data,item,'Item arquivado.');closeModal(content,'form');state.selected=null;await load(content);
}

function bind(content){
  content.addEventListener('click',async(e)=>{
    const row=e.target.closest('[data-id]');if(row){state.selected=row.dataset.id;repaint(content);return;}
    const close=e.target.closest('[data-close]');if(close){closeModal(content,close.dataset.close);return;}
    if(e.target.classList.contains('dv-modal')){closeModal(content,e.target.dataset.modal);return;}
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    const item=selectedItem();
    if(action==='refresh')await load(content);
    if(action==='new'){fillForm(content);openModal(content,'form');}
    if(action==='edit'&&item){fillForm(content,item);openModal(content,'form');}
    if(action==='progress'&&item){fillProgress(content,item);openModal(content,'progress');}
    if(action==='archive')await archiveItem(content);
  });
  content.addEventListener('input',(e)=>{
    if(e.target.dataset.filter==='q'){state.filters.q=e.target.value;repaint(content);}
    const form=e.target.closest('form');if(form&&['range','progresso'].includes(e.target.name)){const value=clamp(e.target.value);form.elements.range.value=value;form.elements.progresso.value=value;}
  });
  content.addEventListener('change',(e)=>{const key=e.target.dataset.filter;if(key&&key!=='q'){state.filters[key]=e.target.value;repaint(content);}});
  content.addEventListener('keydown',(e)=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-id]')){e.preventDefault();state.selected=e.target.dataset.id;repaint(content);}if(e.key==='Escape')content.querySelectorAll('.dv-modal.open').forEach((m)=>closeModal(content,m.dataset.modal));});
  content.querySelector('[data-form]').addEventListener('submit',(e)=>{e.preventDefault();saveItem(content,e.currentTarget);});
  content.querySelector('[data-progress]').addEventListener('submit',(e)=>{e.preventDefault();saveProgress(content,e.currentTarget);});
}

function subscribe(content){
  if(state.channel)supabase.removeChannel(state.channel);
  state.channel=supabase.channel('diretoria-desenvolvimento').on('postgres_changes',{event:'*',schema:'public',table:TABLE},()=>load(content)).on('postgres_changes',{event:'*',schema:'public',table:HISTORY},()=>showDetail(content)).subscribe();
}

export async function renderContent(content,context){
  if(state.channel){try{await supabase.removeChannel(state.channel);}catch{}}
  state.context=context;state.canEdit=userCanEdit(context);state.items=[];state.selected=null;
  renderBase(content,state.canEdit);bind(content);await load(content);subscribe(content);
}

initProtectedPage('Desenvolvimento',renderContent);
