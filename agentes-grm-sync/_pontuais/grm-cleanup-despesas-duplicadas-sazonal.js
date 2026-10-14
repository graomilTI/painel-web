#!/usr/bin/env node
'use strict';

/* Limpeza sazonal de duplicidades de Almoço/Diárias.
 * DRY-RUN por padrão. Para excluir: --real --confirm=EXCLUIR_DUPLICIDADES
 * Regra: mesmo colaborador + data de referência + tipo + valor.
 * Prioridade: preservar outro aprovador e excluir JULIANA/AUTOMAÇÕES; se só
 * houver JULIANA/AUTOMAÇÕES, manter 1; se só houver outros, apenas revisar.
 *
 * V2: a data de referência vem primeiro da observação (dd/mm/yyyy, dd/mm/yy,
 * dd/mm e "dia NN"). Data C.O. só é fallback quando a observação não informa
 * outra data. Observações com mais de uma data distinta são ignoradas para
 * exclusão automática.
 */

process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = process.env.TMP || '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = process.env.TEMP || process.env.TMP;
process.env.TMPDIR = process.env.TMPDIR || process.env.TMP;
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Module = require('module');

function loadCleanupHelpers() {
  const filename = path.join(__dirname, 'grm-cleanup-cafe-retroativo.js');
  let source = fs.readFileSync(filename, 'utf8');
  source = source.replace(/\nmain\(\);\s*$/m, '\n');
  source += '\nmodule.exports = { launchBrowser, login, api, openStaffPage, searchCpf, selectExactStaff, clickCash, closeCurrent, confirmDeleteModal };\n';
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(source, filename);
  return mod.exports;
}

const H = loadCleanupHelpers();
const VERSION = 'V2-DUPLICIDADES-REF-DATE';
const SPECIAL = ['JULIANA CAROLINA DE OLIVEIRA', 'AUTOMACOES'];
const TARGETS = new Set(['ALMOCO', 'DIARIA', 'SALARIO DE INTERMITENTE', 'SERVICOS TERCEIRIZADOS']);
const TIMEOUT = Math.max(15000, Number(process.env.GRM_CLEANUP_DUP_TIMEOUT_MS || 45000));
const MAX_DELETE = Math.max(1, Number(process.env.GRM_CLEANUP_DUP_MAX_EXCLUSOES || 500));
const DAY_MS = 86400000;

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const digits = (v) => String(v || '').replace(/\D/g, '');
const brIso = (v) => { const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}` : ''; };
const iso = (v) => { const s = String(v || ''); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : brIso(s); };
const isoBr = (v) => { const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
const cents = (v) => Math.round(Number(v || 0) * 100);
const log = (level,msg,data) => console.log(`[${level}] ${new Date().toISOString()} - ${msg}${data===undefined?'':` ${JSON.stringify(data)}`}`);
const arg = (p) => { const x = process.argv.find((a) => a.startsWith(p)); return x ? x.slice(p.length) : ''; };

function monthBounds() {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date()).reduce((a,x)=>({...a,[x.type]:x.value}),{});
  const last = new Date(Date.UTC(+p.year,+p.month,0)).getUTCDate();
  return { from:`${p.year}-${p.month}-01`, to:`${p.year}-${p.month}-${String(last).padStart(2,'0')}` };
}
const MB = monthBounds();
const DATE_FROM = arg('--from=') || process.env.GRM_CLEANUP_DUP_DATA_DE || MB.from;
const DATE_TO = arg('--to=') || process.env.GRM_CLEANUP_DUP_DATA_ATE || MB.to;
const REAL = process.argv.includes('--real');
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE_FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(DATE_TO) || DATE_FROM > DATE_TO) throw new Error('Período inválido.');
if (REAL && norm(arg('--confirm=')) !== 'EXCLUIR DUPLICIDADES') throw new Error('Use --real --confirm=EXCLUIR_DUPLICIDADES.');

function typeKey(v) {
  const k=norm(v);
  if(k.includes('SERVICOS TERCEIRIZADOS')) return 'SERVICOS TERCEIRIZADOS';
  if(k.includes('SALARIO DE INTERMITENTE')) return 'SALARIO DE INTERMITENTE';
  if(/(^| )ALMOCO( |$)/.test(k)) return 'ALMOCO';
  if(/(^| )DIARIA( |$)/.test(k)) return 'DIARIA';
  return '';
}

function validIso(y,m,d) {
  const dt = new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y || dt.getUTCMonth()!==m-1 || dt.getUTCDate()!==d) return '';
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function inferYear(day,month,yearToken,fallback) {
  if(yearToken) {
    const n=Number(yearToken);
    return yearToken.length===2 ? 2000+n : n;
  }
  const fb=iso(fallback) || DATE_FROM;
  let y=Number(fb.slice(0,4));
  const candidate=new Date(Date.UTC(y,month-1,day));
  const fbDate=new Date(`${fb}T00:00:00Z`);
  const diff=candidate-fbDate;
  if(diff>45*DAY_MS) y-=1;
  else if(diff < -320*DAY_MS) y+=1;
  return y;
}
function explicitDates(text,fallback) {
  const s=String(text||'');
  const out=[];
  const re=/(^|[^0-9])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=$|[^0-9])/g;
  let m;
  while((m=re.exec(s))) {
    const d=Number(m[2]), mo=Number(m[3]), y=inferYear(d,mo,m[4]||'',fallback);
    const value=validIso(y,mo,d);
    if(value) out.push(value);
  }
  return [...new Set(out)];
}
function dayOnlyDate(text,fallback) {
  const s=String(text||'');
  const m=s.match(/\bDIA\s*(\d{1,2})(?!\s*\/)/i);
  if(!m) return '';
  const fb=iso(fallback) || DATE_FROM;
  const day=Number(m[1]);
  let y=Number(fb.slice(0,4)), mo=Number(fb.slice(5,7)), fbDay=Number(fb.slice(8,10));
  if(day > fbDay + 7) {
    mo-=1;
    if(mo===0){mo=12;y-=1;}
  }
  return validIso(y,mo,day);
}
function refDate(desc,fallback) {
  const dates=explicitDates(desc,fallback);
  if(dates.length===1) return {date:dates[0],source:'descricao',ambiguous:false,dates};
  if(dates.length>1) return {date:'',source:'descricao',ambiguous:true,dates};
  const dayOnly=dayOnlyDate(desc,fallback);
  if(dayOnly) return {date:dayOnly,source:'descricao-dia',ambiguous:false,dates:[dayOnly]};
  return {date:iso(fallback),source:'data_co',ambiguous:false,dates:[]};
}
const gkey=(g)=>`${g.staCode}|${g.typeKey}|${g.refDate}|${g.valueCents}`;

async function loadGroups(page) {
  const [report,staffResp,typesResp]=await Promise.all([
    H.api(page,'/api/reports/finance/operatingFlow',{ofmDateFrom:isoBr(DATE_FROM),ofmDateTo:isoBr(DATE_TO),ofmStatusReport:['A'],reportType:'flowList'}),
    H.api(page,'/api/staff/getRecords',{staName:'',staCPF:'',staEmail:'',staStatus:'A'}),
    H.api(page,'/api/oFlowExpenseType/getRecords',{oexStatus:'A'}),
  ]);
  const tmap=new Map((typesResp.searchData||[]).map(x=>[Number(x.oexCode),norm(x.oexName)]));
  const smap=new Map((staffResp.searchData||[]).map(x=>[Number(x.staCode),x]));
  const groups=new Map(); let targetRows=0, ambiguousRows=0;
  for(const r of report.searchData||[]) {
    if(String(r.ofmStatus||'').toUpperCase()!=='A') continue;
    const tk=tmap.get(Number(r.oexCode))||typeKey(r.oexName); if(!TARGETS.has(tk)) continue;
    const st=smap.get(Number(r.staCode)); if(!st) continue;
    const rd=refDate(r.ofmDescription,r.ofmDate);
    targetRows++;
    if(rd.ambiguous || !rd.date) { ambiguousRows++; continue; }
    const g={staCode:Number(r.staCode),typeKey:tk,refDate:rd.date,valueCents:cents(r.ofmValue)};
    const key=gkey(g), cur=groups.get(key)||{...g,key,cpf:digits(st.staCPF),colaborador:st.staName||String(r.staCode),movements:[]};
    cur.movements.push({ofmCode:Number(r.ofmCode),date:iso(r.ofmDate),refDate:rd.date,refSource:rd.source,description:String(r.ofmDescription||'')});
    groups.set(key,cur);
  }
  return {reportCount:(report.searchData||[]).length,targetRows,ambiguousRows,groups:[...groups.values()].filter(g=>g.movements.length>1).map(g=>({...g,apiCount:g.movements.length}))};
}

async function openCash(page, staff) {
  if(staff.cpf.length!==11) throw new Error(`CPF inválido: ${staff.colaborador}`);
  await H.openStaffPage(page); await H.searchCpf(page,staff.cpf); await H.selectExactStaff(page,staff.cpf); await H.clickCash(page);
  return inspectRows(page);
}

async function inspectRows(page) {
  return page.evaluate(({targets,special,defaultYear})=>{
    const norm=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
    const vis=(e)=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
    const type=(k)=>k.includes('SERVICOS TERCEIRIZADOS')?'SERVICOS TERCEIRIZADOS':k.includes('SALARIO DE INTERMITENTE')?'SALARIO DE INTERMITENTE':/(^| )ALMOCO( |$)/.test(k)?'ALMOCO':/(^| )DIARIA( |$)/.test(k)?'DIARIA':'';
    const valid=(y,m,d)=>{const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:''};
    const tokens=(s)=>{const a=[];const re=/(^|[^0-9])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=$|[^0-9])/g;let m;while((m=re.exec(s))){a.push({index:m.index+m[1].length,end:re.lastIndex,d:+m[2],mo:+m[3],y:m[4]?+(m[4].length===2?'20'+m[4]:m[4]):null});}return a;};
    const date=(s)=>{const ts=tokens(s);if(!ts.length)return'';const first=ts[0];const postingYear=first.y||+defaultYear;const posting=valid(postingYear,first.mo,first.d);const rest=s.slice(first.end);const rt=tokens(rest);if(rt.length){const q=rt[rt.length-1];let y=q.y||postingYear;if(!q.y&&posting){const c=new Date(Date.UTC(y,q.mo-1,q.d)),p=new Date(`${posting}T00:00:00Z`);if(c-p>45*86400000)y--;else if(c-p < -320*86400000)y++;}return valid(y,q.mo,q.d);}const dm=rest.match(/\bDIA\s*(\d{1,2})(?!\s*\/)/i);if(dm&&posting){const day=+dm[1];let y=+posting.slice(0,4),mo=+posting.slice(5,7),pd=+posting.slice(8,10);if(day>pd+7){mo--;if(mo===0){mo=12;y--;}}const v=valid(y,mo,day);if(v)return v;}return posting;};
    const money=(s)=>{const m=s.match(/R\$\s*([\d.]+,\d{2})/i);if(!m)return null;const n=Number(m[1].replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?Math.round(n*100):null};
    return [...document.querySelectorAll('tr,[role="row"]')].filter(vis).map((row,i)=>{const text=String(row.innerText||'').replace(/\s+/g,' ').trim(),k=norm(text),tk=type(k);return {i,text,typeKey:tk,refDate:date(text),valueCents:money(text),special:special.some(x=>k.includes(x))}}).filter(r=>targets.includes(r.typeKey)&&r.refDate&&r.valueCents!=null);
  },{targets:[...TARGETS],special:SPECIAL,defaultYear:DATE_FROM.slice(0,4)});
}
const match=(rows,g)=>rows.filter(r=>r.typeKey===g.typeKey&&r.refDate===g.refDate&&r.valueCents===g.valueCents);
function plan(g,rows){const m=match(rows,g),s=m.filter(r=>r.special);if(m.length<g.apiCount)return{safe:false,reason:`UI ${m.length} < API ${g.apiCount}`,matched:m,special:s};if(s.length>g.apiCount)return{safe:false,reason:`Especiais ${s.length} > API ${g.apiCount}`,matched:m,special:s};if(!s.length)return{safe:true,action:'REVISAR',deleteCount:0,other:g.apiCount,matched:m,special:s};const other=g.apiCount-s.length;return{safe:true,action:'EXCLUIR',deleteCount:other>0?s.length:Math.max(0,s.length-1),other,matched:m,special:s};}

async function preflight(page,groups){const by=new Map();for(const g of groups){const s=by.get(g.staCode)||{staCode:g.staCode,cpf:g.cpf,colaborador:g.colaborador,groups:[]};s.groups.push(g);by.set(g.staCode,s)}const out=[];let unsafe=0;for(const s of [...by.values()].sort((a,b)=>a.colaborador.localeCompare(b.colaborador,'pt-BR'))){try{const rows=await openCash(page,s);for(const g of s.groups){const p=plan(g,rows);out.push({...g,...p});if(!p.safe)unsafe++;log(p.safe?'INFO':'ERROR',`${g.colaborador} / ${g.refDate} / ${g.typeKey}: ${p.safe?p.action:'INSEGURO'}`,{valor:(g.valueCents/100).toFixed(2),aprovadas:g.apiCount,juliana_automacoes:p.special.length,outros:p.other??null,excluir:p.deleteCount||0,motivo:p.reason||null,ofm:g.movements.map(x=>x.ofmCode),fontes_data:[...new Set(g.movements.map(x=>x.refSource))],descricoes:[...new Set(g.movements.map(x=>x.description))]});}}catch(e){unsafe+=s.groups.length;for(const g of s.groups)out.push({...g,safe:false,deleteCount:0,reason:e.message});log('ERROR',`${s.colaborador}: ${e.message}`)}finally{await H.closeCurrent(page).catch(()=>{})}}return{plans:out,unsafe};}

async function prepareDelete(page,g){return page.evaluate(({g,special,defaultYear})=>{
  const norm=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(), vis=(e)=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const type=(k)=>k.includes('SERVICOS TERCEIRIZADOS')?'SERVICOS TERCEIRIZADOS':k.includes('SALARIO DE INTERMITENTE')?'SALARIO DE INTERMITENTE':/(^| )ALMOCO( |$)/.test(k)?'ALMOCO':/(^| )DIARIA( |$)/.test(k)?'DIARIA':'';
  const valid=(y,m,d)=>{const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:''};
  const tokens=(s)=>{const a=[];const re=/(^|[^0-9])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=$|[^0-9])/g;let m;while((m=re.exec(s))){a.push({index:m.index+m[1].length,end:re.lastIndex,d:+m[2],mo:+m[3],y:m[4]?+(m[4].length===2?'20'+m[4]:m[4]):null});}return a;};
  const date=(s)=>{const ts=tokens(s);if(!ts.length)return'';const first=ts[0];const postingYear=first.y||+defaultYear;const posting=valid(postingYear,first.mo,first.d);const rest=s.slice(first.end);const rt=tokens(rest);if(rt.length){const q=rt[rt.length-1];let y=q.y||postingYear;if(!q.y&&posting){const c=new Date(Date.UTC(y,q.mo-1,q.d)),p=new Date(`${posting}T00:00:00Z`);if(c-p>45*86400000)y--;else if(c-p < -320*86400000)y++;}return valid(y,q.mo,q.d);}const dm=rest.match(/\bDIA\s*(\d{1,2})(?!\s*\/)/i);if(dm&&posting){const day=+dm[1];let y=+posting.slice(0,4),mo=+posting.slice(5,7),pd=+posting.slice(8,10);if(day>pd+7){mo--;if(mo===0){mo=12;y--;}}const v=valid(y,mo,day);if(v)return v;}return posting;};
  const money=(s)=>{const m=s.match(/R\$\s*([\d.]+,\d{2})/i);if(!m)return null;const n=Number(m[1].replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?Math.round(n*100):null};
  const sig=(e)=>norm([e.innerText,e.textContent,e.getAttribute?.('title'),e.getAttribute?.('aria-label'),typeof e.className==='string'?e.className:''].filter(Boolean).join(' '));document.querySelectorAll('[data-grm-dup-del]').forEach(e=>delete e.dataset.grmDupDel);
  const rows=[...document.querySelectorAll('tr,[role="row"]')].filter(vis).filter(row=>{const text=String(row.innerText||'').replace(/\s+/g,' ').trim(),k=norm(text);return special.some(x=>k.includes(x))&&type(k)===g.typeKey&&date(text)===g.refDate&&money(text)===g.valueCents});if(!rows.length)return{ok:false,reason:'NO_SPECIAL_TARGET'};
  const row=rows[0], text=String(row.innerText||'').replace(/\s+/g,' ').trim(), cells=[...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')], btns=[...row.querySelectorAll('button,[role="button"],a')].filter(vis).filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true');let del=btns.filter(e=>/EXCLUIR|REMOVER|DELETE|TRASH|LIXEIRA|BIN/.test(sig(e)))[0],strategy=del?'SEMANTIC':null;if(!del&&cells.length){const b=[...cells[0].querySelectorAll('button,[role="button"],a')].filter(vis);if(b.length===1){del=b[0];strategy='FIRST_CELL'}}if(!del)return{ok:false,reason:'DELETE_NOT_UNIQUE',row:text.slice(0,1000)};const vm=text.match(/R\$\s*([\d.]+,\d{2})/i);if(!vm)return{ok:false,reason:'VALUE_NOT_FOUND'};del.dataset.grmDupDel='1';return{ok:true,selector:'[data-grm-dup-del="1"]',valueKey:norm(`R$ ${vm[1]}`),strategy,row:text.slice(0,1000)};
},{g,special:SPECIAL,defaultYear:DATE_FROM.slice(0,4)})}

async function deleteOne(page,g){const before=match(await inspectRows(page),g).filter(r=>r.special).length;if(!before)throw new Error('Sem alvo especial');const p=await prepareDelete(page,g);if(!p.ok)throw new Error(JSON.stringify(p));await page.click(p.selector);await H.confirmDeleteModal(page,p.valueKey);await new Promise(r=>setTimeout(r,700));const after=match(await inspectRows(page),g).filter(r=>r.special).length;if(after!==before-1)throw new Error(`Exclusão não confirmada ${before}->${after}`);log('SUCCESS',`${g.colaborador}: excluído`,{data:g.refDate,tipo:g.typeKey,valor:(g.valueCents/100).toFixed(2),antes:before,depois:after,estrategia:p.strategy});}

async function execute(page,plans){const act=plans.filter(p=>p.safe&&p.deleteCount>0),expected=act.reduce((a,p)=>a+p.deleteCount,0);if(expected>MAX_DELETE)throw new Error(`Proteção: ${expected} > ${MAX_DELETE}`);const by=new Map();for(const p of act){const s=by.get(p.staCode)||{staCode:p.staCode,cpf:p.cpf,colaborador:p.colaborador,plans:[]};s.plans.push(p);by.set(p.staCode,s)}let deleted=0;for(const s of by.values()){try{await openCash(page,s);for(const p of s.plans){for(let i=0;i<p.deleteCount;i++){await deleteOne(page,p);deleted++}const rem=match(await inspectRows(page),p).filter(r=>r.special).length, want=p.other>0?0:1;if(rem!==want)throw new Error(`Restante especial ${rem}; esperado ${want}`)}}finally{await H.closeCurrent(page).catch(()=>{})}}if(deleted!==expected)throw new Error(`Incompleto ${deleted}/${expected}`);return deleted;}

(async()=>{let browser;try{log('INFO',`Iniciando ${VERSION}`,{de:DATE_FROM,ate:DATE_TO,dry_run:!REAL,tipos:[...TARGETS]});browser=await H.launchBrowser();const page=await browser.newPage();page.setDefaultTimeout(TIMEOUT);await H.login(page);const s=await loadGroups(page);log('INFO','API lida',{movimentos:s.reportCount,linhas_alvo_aprovadas:s.targetRows,linhas_data_ambigua:s.ambiguousRows,grupos_duplicados:s.groups.length});if(!s.groups.length){log('SUCCESS','Nenhuma duplicidade encontrada');return}const pre=await preflight(page,s.groups),proposed=pre.plans.reduce((a,p)=>a+(p.safe?p.deleteCount||0:0),0),review=pre.plans.filter(p=>p.safe&&p.action==='REVISAR').length;log(pre.unsafe?'ERROR':'INFO','PRECHECK',{grupos:pre.plans.length,inseguros:pre.unsafe,exclusoes_propostas:proposed,revisao_manual:review});if(pre.unsafe)throw new Error('PRECHECK inseguro; zero exclusões');if(!REAL){log('SUCCESS','DRY-RUN concluído; zero exclusões',{exclusoes_propostas:proposed,revisao_manual:review});return}const deleted=await execute(page,pre.plans);const after=await loadGroups(page);const executedKeys=new Set(pre.plans.filter(p=>p.safe&&p.deleteCount>0).map(p=>p.key));const stillThere=after.groups.filter(g=>executedKeys.has(g.key));if(stillThere.length)throw new Error(`Verificação final encontrou ${stillThere.length} grupo(s) ainda duplicado(s) no escopo executado.`);log('SUCCESS','Limpeza sazonal concluída e verificada',{excluidos:deleted,revisao_manual:review,grupos_restantes:after.groups.length});}catch(e){log('ERROR',e.message,{stack:String(e.stack||'').split('\n').slice(0,6).join(' | ')});process.exitCode=1;}finally{if(browser)await browser.close().catch(()=>{})}})();
