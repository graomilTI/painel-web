const AUTO_FIELDS=['numero_auto_infracao','numero_auto','numero_autuacao','auto_infracao','codigo_auto','cod_auto','auto'];
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const headerKey=v=>normalize(v).toLowerCase();
function byHeader(row,names){const keys=new Set(names.map(headerKey));const item=Object.entries(row).find(([key])=>keys.has(headerKey(key)));return item?.[1]??'';}
function rowAutoKeys(row){return AUTO_FIELDS.map(field=>normalize(row?.[field])).filter(Boolean);}
function sameVehicle(row,target){const renavam=normalize(row?.renavam),placa=normalize(row?.placa);return Boolean((renavam&&renavam===target.renavam)||(placa&&placa===target.placa));}
function matches(rows,target){
  if(target.numeroAuto){const exact=rows.filter(row=>rowAutoKeys(row).includes(target.numeroAuto));if(exact.length)return exact;}
  if(!target.codigoAuto)return [];
  return rows.filter(row=>rowAutoKeys(row).some(key=>key===target.codigoAuto||key.endsWith(target.codigoAuto))&&sameVehicle(row,target));
}
const u16=(view,offset)=>view.getUint16(offset,true);
const u32=(view,offset)=>view.getUint32(offset,true);
async function unzip(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder();let eocd=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--){if(u32(view,offset)===0x06054b50){eocd=offset;break;}}
  if(eocd<0)throw new Error('Arquivo XLSX inválido.');
  const count=u16(view,eocd+10),entries=new Map();let offset=u32(view,eocd+16);
  for(let index=0;index<count;index++){
    if(u32(view,offset)!==0x02014b50)throw new Error('Arquivo XLSX corrompido.');
    const method=u16(view,offset+10),size=u32(view,offset+20),nameLength=u16(view,offset+28),extraLength=u16(view,offset+30),commentLength=u16(view,offset+32),localOffset=u32(view,offset+42);
    const name=decoder.decode(bytes.slice(offset+46,offset+46+nameLength));entries.set(name,{method,size,localOffset});offset+=46+nameLength+extraLength+commentLength;
  }
  return async name=>{
    const entry=entries.get(name);if(!entry)return '';
    const nameLength=u16(view,entry.localOffset+26),extraLength=u16(view,entry.localOffset+28),start=entry.localOffset+30+nameLength+extraLength;
    const compressed=bytes.slice(start,start+entry.size);if(entry.method===0)return decoder.decode(compressed);
    if(entry.method!==8||typeof DecompressionStream==='undefined')throw new Error('Navegador sem suporte à leitura deste XLSX.');
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return decoder.decode(await new Response(stream).arrayBuffer());
  };
}
function decodeXml(value){return String(value||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(entity,code)=>{const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(named[code])return named[code];if(code.startsWith('#x'))return String.fromCodePoint(parseInt(code.slice(2),16));if(code.startsWith('#'))return String.fromCodePoint(parseInt(code.slice(1),10));return entity;});}
function attrs(source){const result={};let match;const pattern=/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g;while((match=pattern.exec(source)))result[match[1]]=decodeXml(match[3]);return result;}
function openTags(xml,name){const pattern=new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*)>`,'gi');return [...String(xml||'').matchAll(pattern)].map(match=>attrs(match[1]));}
function pairedTags(xml,name){const pattern=new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?<!\\/)>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`,'gi');return [...String(xml||'').matchAll(pattern)].map(match=>({attrs:attrs(match[1]),inner:match[2]}));}
function tagText(xml,name){return pairedTags(xml,name).map(tag=>decodeXml(tag.inner.replace(/<[^>]+>/g,''))).join('');}
function zipPath(target){const initial=String(target||'').startsWith('/')?String(target).slice(1):`xl/${target}`;return initial.split('/').reduce((parts,part)=>{if(!part||part==='.')return parts;if(part==='..')parts.pop();else parts.push(part);return parts;},[]).join('/');}
function columnIndex(reference){const letters=String(reference||'').match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'';let index=0;for(const letter of letters)index=index*26+letter.charCodeAt(0)-64;return index-1;}
async function parseXlsx(file){
  const read=await unzip(await file.arrayBuffer()),workbook=await read('xl/workbook.xml'),relationships=await read('xl/_rels/workbook.xml.rels');
  const sheets=openTags(workbook,'sheet'),selected=sheets.find(sheet=>headerKey(sheet.name)==='multas')||sheets[0];if(!selected)throw new Error('Aba MULTAS não encontrada.');
  const relationship=openTags(relationships,'Relationship').find(item=>item.Id===selected['r:id']);if(!relationship)throw new Error('Aba MULTAS inválida.');
  const sheet=await read(zipPath(relationship.Target)),sharedXml=await read('xl/sharedStrings.xml');
  const shared=sharedXml?pairedTags(sharedXml,'si').map(item=>tagText(item.inner,'t')):[];
  const matrix=pairedTags(sheet,'row').map(row=>{const cells=[];pairedTags(row.inner,'c').forEach(cell=>{const index=columnIndex(cell.attrs.r),type=cell.attrs.t;let value=tagText(cell.inner,'v');if(type==='s')value=shared[Number(value)]??'';if(type==='inlineStr')value=tagText(cell.inner,'t');cells[index]=value;});return cells;});
  const headers=matrix[0]||[],rows=matrix.slice(1).map(cells=>Object.fromEntries(headers.map((header,index)=>[header,cells[index]??''])));
  const parsed=rows.map(row=>({placa:normalize(byHeader(row,['Placa'])),renavam:normalize(byHeader(row,['Renavam'])),numeroAuto:normalize(byHeader(row,['Nº Auto Infração','N° Auto Infração','Numero Auto Infracao','Auto Infração'])),codigoAuto:normalize(byHeader(row,['CodAuto','Código Auto','Codigo Auto'])),status:String(byHeader(row,['Situação','Situacao','Status'])).trim()})).filter(row=>row.status&&(row.numeroAuto||row.codigoAuto));
  const unique=new Map();for(const target of parsed){const key=target.numeroAuto||`${target.codigoAuto}:${target.renavam}:${target.placa}`,current=unique.get(key);if(current&&normalize(current.status)!==normalize(target.status))throw new Error(`Situações conflitantes para o Auto ${key}.`);unique.set(key,target);}
  return [...unique.values()];
}
function actionType(status){const value=normalize(status);if(value.includes('DOBRADO')&&value.includes('LANCADO'))return 'dobrar';if((value.includes('INDICADO')&&value.includes('LANCADO'))||value.includes('AGUARDANDORESPOSTA'))return 'identificar';return '';}
function actionDone(row,type){if(type==='dobrar')return Boolean(row.multa_dobrada_em);if(type==='identificar')return Boolean(row.condutor_identificado_em);return true;}
function payloadFor(target,row){
  const now=new Date().toISOString(),type=actionType(target.status),payload={status_multa:target.status,situacao:target.status,atualizado_em:now};
  if(type==='dobrar'){payload.multa_dobrada_em=row.multa_dobrada_em||now;payload.dobrar_solicitado_em=null;if(String(row.acao_status||'').toLowerCase().includes('dobr'))payload.acao_status=null;}
  if(type==='identificar'){payload.condutor_identificado_em=row.condutor_identificado_em||now;payload.identificar_solicitado_em=null;if(String(row.acao_status||'').toLowerCase().includes('identific'))payload.acao_status=null;}
  return {payload,type};
}
async function apply(supabase,targets){
  const {data,error}=await supabase.from('frotas_multas').select('*');if(error)throw error;const rows=Array.isArray(data)?data:[],notFound=[];let updated=0,unchanged=0,actions=0;
  for(const target of targets){const found=matches(rows,target);if(found.length!==1){notFound.push(target.numeroAuto||target.codigoAuto);continue;}const row=found[0],{payload,type}=payloadFor(target,row);const statusDone=normalize(row.status_multa)===normalize(target.status);if(statusDone&&actionDone(row,type)){unchanged++;continue;}const result=await supabase.from('frotas_multas').update(payload).eq('id',row.id);if(result.error)throw result.error;updated++;if(type&&!actionDone(row,type))actions++;}
  return {total:targets.length,updated,unchanged,actions,notFound};
}
function showOverlay(container,supabase){
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:10020;background:rgba(2,6,23,.82);display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML='<div style="width:min(520px,100%);border:1px solid rgba(34,197,94,.35);border-radius:18px;background:#07120f;color:#e2e8f0;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.55)"><h2 style="margin:0 0 8px;font-size:21px">Atualização única das multas</h2><p style="margin:0 0 16px;color:#94a3b8;line-height:1.5">Selecione a planilha enviada. O sistema atualizará o status e marcará as ações Dobrar ou Identificar como concluídas.</p><input data-file type="file" accept=".xlsx" hidden><div style="display:flex;gap:10px;justify-content:flex-end"><button data-cancel class="fm-btn soft" type="button">Cancelar</button><button data-select class="fm-btn primary" type="button">Selecionar XLSX</button></div><p data-result style="margin:14px 0 0;color:#bfdbfe;font-size:12px"></p></div>';
  document.body.appendChild(overlay);const input=overlay.querySelector('[data-file]'),select=overlay.querySelector('[data-select]'),result=overlay.querySelector('[data-result]');
  overlay.querySelector('[data-cancel]').onclick=()=>{overlay.remove();history.replaceState({},'',location.pathname);};select.onclick=()=>input.click();
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;select.disabled=true;select.textContent='Atualizando...';try{const targets=await parseXlsx(file);const summary=await apply(supabase,targets);result.textContent=`${summary.updated} multa(s) atualizada(s), ${summary.actions} ação(ões) concluída(s), ${summary.unchanged} já correta(s)${summary.notFound.length?` e ${summary.notFound.length} não localizada(s)`:''}.`;container.querySelector('[data-refresh]')?.click();if(!summary.notFound.length){setTimeout(()=>{overlay.remove();history.replaceState({},'',location.pathname);},2600);}else{console.warn('Autos não localizados ou ambíguos:',summary.notFound);}}catch(error){console.error(error);result.textContent=error.message||'Falha ao aplicar a atualização.';}finally{select.disabled=false;select.textContent='Selecionar XLSX';input.value='';}};
}
export function installOneTimeMultasXlsx(container,supabase){const params=new URLSearchParams(location.search);if(params.get('atualizar-acoes-xlsx')!=='1')return;showOverlay(container,supabase);}
