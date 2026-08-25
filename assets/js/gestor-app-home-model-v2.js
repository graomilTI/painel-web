import { toPanelUrl } from './paths.js';

const UF_NAMES={AC:'ACRE',AL:'ALAGOAS',AP:'AMAPÁ',AM:'AMAZONAS',BA:'BAHIA',CE:'CEARÁ',DF:'DISTRITO FEDERAL',ES:'ESPÍRITO SANTO',GO:'GOIÁS',MA:'MARANHÃO',MT:'MATO GROSSO',MS:'MATO GROSSO DO SUL',MG:'MINAS GERAIS',PA:'PARÁ',PB:'PARAÍBA',PR:'PARANÁ',PE:'PERNAMBUCO',PI:'PIAUÍ',RJ:'RIO DE JANEIRO',RN:'RIO GRANDE DO NORTE',RS:'RIO GRANDE DO SUL',RO:'RONDÔNIA',RR:'RORAIMA',SC:'SANTA CATARINA',SP:'SÃO PAULO',SE:'SERGIPE',TO:'TOCANTINS'};
const MODULES=[['programacao','📅','Programação'],['logistica','🚚','Logística'],['compras','🛒','Compras'],['hospedagem','🏨','Hospedagem'],['contato-cliente','🤝','Contato'],['patrimonios','📦','Patrimônio']];
const isHome=()=>Boolean(document.querySelector('#appMain .db-topbar'));

function focusState(){
  if(!isHome())return;
  const svg=document.querySelector('#appMain .db-state-svg');
  if(!svg||svg.dataset.homeFocus==='1')return;
  const target=svg.querySelector('path[filter*="appGlowFilter"]');
  if(!target)return;
  try{
    const b=target.getBBox(); if(!b.width||!b.height)return;
    const px=Math.max(18,b.width*.18),py=Math.max(18,b.height*.20);
    let x=b.x-px,y=b.y-py,w=b.width+px*2,h=b.height+py*2;
    const wanted=1.18,aspect=w/h;
    if(aspect<wanted){const nw=h*wanted;x-=(nw-w)/2;w=nw;}
    else if(aspect>wanted*1.5){const nh=w/(wanted*1.5);y-=(nh-h)/2;h=nh;}
    svg.setAttribute('viewBox',`${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.dataset.homeFocus='1';
  }catch(e){console.warn('[gestor-home] foco do mapa',e);}
}

function regionLabel(){
  if(!isHome())return;
  const uf=String(document.querySelector('#appMain .db-state-abbr')?.textContent||'').trim().toUpperCase();
  const el=document.querySelector('#appMain .db-region');
  if(el&&UF_NAMES[uf])el.textContent=UF_NAMES[uf];
}

function moduleGrid(){
  if(!isHome()||document.getElementById('gestorHomeModuleGrid'))return;
  const row=document.querySelector('#appMain .db-row-2'); if(!row)return;
  const nav=document.createElement('nav'); nav.id='gestorHomeModuleGrid'; nav.setAttribute('aria-label','Módulos do gestor');
  nav.innerHTML=MODULES.map(([path,icon,label])=>`<a class="gm-home-module${path==='logistica'?' is-primary':''}" href="${toPanelUrl(path)}"><span class="gm-home-module-icon">${icon}</span><span>${label}</span></a>`).join('');
  row.insertAdjacentElement('afterend',nav);
}

function topMenu(){const b=document.getElementById('uxMenuBtn');if(b){b.setAttribute('aria-label','Abrir menu do gestor');b.setAttribute('title','Menu');}}
function patch(){if(!isHome())return;regionLabel();moduleGrid();topMenu();focusState();}
let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;patch();});}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('resize',()=>{document.querySelector('#appMain .db-state-svg')?.removeAttribute('data-home-focus');schedule();},{passive:true});
window.addEventListener('load',schedule);schedule();
