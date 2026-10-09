(function(){
  const MODULE_NAME='FROTAS_MULTAS';
  const MONEY_FMT=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const DAY_MS=24*60*60*1000;
  const styles=`<style>
    .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));overflow:hidden}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:180px 190px minmax(220px,1fr) auto auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;color-scheme:dark}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;transition:.15s ease}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.26);background:rgba(34,197,94,.12);color:#bbf7d0}.fm-btn.warn{border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.14);color:#fde68a}.fm-btn.danger{border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.13);color:#fecaca}.fm-btn.info{border:1px solid rgba(96,165,250,.35);background:rgba(59,130,246,.13);color:#bfdbfe}.fm-btn.done{border:1px solid rgba(34,197,94,.55);background:rgba(22,163,74,.38);color:#dcfce7}.fm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px}.fm-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.fm-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1230px;table-layout:fixed}.fm-table th{padding:11px 8px;color:#bfdbfe;font-size:11px;letter-spacing:.09em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38);white-space:nowrap}.fm-table td{padding:11px 8px;border-bottom:1px solid rgba(148,163,184,.10);font-size:13px;vertical-align:middle}.fm-table th:nth-child(1),.fm-table td:nth-child(1){width:150px}.fm-table th:nth-child(2),.fm-table td:nth-child(2){width:105px}.fm-table th:nth-child(3),.fm-table td:nth-child(3){width:145px}.fm-table th:nth-child(4),.fm-table td:nth-child(4){width:330px;padding-left:6px}.fm-table th:nth-child(5),.fm-table td:nth-child(5){width:135px}.fm-table th:nth-child(6),.fm-table td:nth-child(6){width:95px}.fm-table th:nth-child(7),.fm-table td:nth-child(7){width:105px}.fm-table th:nth-child(8),.fm-table td:nth-child(8){width:105px}.fm-table th:nth-child(9),.fm-table td:nth-child(9){width:158px}.fm-sort{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:950;text-transform:uppercase;letter-spacing:.09em;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px}.fm-sort:hover{color:#fff}.fm-sort-mark{font-size:10px;color:#86efac}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-badge{border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.red{border-color:rgba(248,113,113,.35);background:rgba(127,29,29,.25);color:#fecaca}.fm-badge.green{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.25);color:#bbf7d0}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-action-grid{display:grid;grid-template-columns:repeat(4,32px);gap:6px}.fm-action-grid .fm-btn{min-height:32px;border-radius:10px;padding:0 8px;font-size:11px}.fm-icon-btn{position:relative;width:32px;height:32px;min-height:32px!important;padding:0!important;display:inline-flex;align-items:center;justify-content:center;border-radius:10px}.fm-icon-btn svg{width:16px;height:16px;pointer-events:none}.fm-icon-btn:disabled{opacity:.55;cursor:progress}.fm-icon-btn:hover:not(:disabled){filter:brightness(1.25)}.fm-icon-btn.blocked{opacity:.4}.fm-icon-dot{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;padding:0 3px;border-radius:999px;border:1px solid #0d0d18;background:#22c55e;color:#052e16;font-size:9px;font-weight:950;line-height:13px;text-align:center;pointer-events:none}.fm-icon-dot.amber{background:#fbbf24}.fm-hora{display:inline-block;margin-top:2px;color:#bfdbfe;font-weight:850;letter-spacing:.02em}.fm-hora.na{color:#6b7280;cursor:help}.fm-chip{display:inline-block;margin-top:4px;padding:2px 7px;border-radius:999px;border:1px solid rgba(96,165,250,.35);background:rgba(59,130,246,.13);color:#bfdbfe;font-size:10px;font-weight:950;white-space:nowrap}.fm-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px}.fm-modal{width:min(620px,100%);border:1px solid rgba(148,163,184,.18);border-radius:22px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.45);padding:18px;color:#e2e2f0}.fm-modal h3{margin:0 0 6px;color:#f8fafc;font-size:22px}.fm-modal p{margin:0 0 14px;color:#6b7280;line-height:1.45}.fm-modal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fm-modal-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.fm-meta-line{font-size:12px;color:#bfdbfe;margin:10px 0 0;line-height:1.45}.fm-autocomplete-wrap{position:relative;margin-top:8px}.fm-suggestions{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:10001;max-height:240px;overflow:auto;border:1px solid rgba(34,197,94,.30);border-radius:16px;background:#0d0d18;box-shadow:0 18px 48px rgba(0,0,0,.42);padding:6px;color-scheme:dark}.fm-suggestions.show{display:block}.fm-suggestion{width:100%;border:0;background:transparent;color:#e2e2f0;text-align:left;border-radius:12px;padding:10px 12px;cursor:pointer}.fm-suggestion:hover,.fm-suggestion.active{background:rgba(22,101,52,.42);color:#f8fafc}.fm-suggestion strong{display:block;font-size:13px;color:#f8fafc}.fm-suggestion small{display:block;margin-top:3px;color:#93c5fd;font-size:11px}.fm-suggestion-empty{padding:10px 12px;color:#6b7280;font-size:12px}.fm-input-with-suggestions{padding-right:36px}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}@media(max-width:1000px){.fm-toolbar,.fm-grid{grid-template-columns:1fr}.fm-modal-grid{grid-template-columns:1fr}}.fm-toast.show{opacity:1;transform:translateY(0)}.fm-subtabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}.fm-subtab{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:8px 16px;font-weight:950;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:4px}.fm-subtab.active{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35);color:#f8fafc}.fm-subtab-badge{display:inline-flex;align-items:center;justify-content:center;background:rgba(248,113,113,.25);color:#fca5a5;border-radius:999px;min-width:18px;height:18px;font-size:10px;font-weight:950;padding:0 4px}
  </style>`;

  const state={multas:[], motoristas:[], motoristasLoaded:false, busca:'', filtro:'pagas', arquivo:'ativas', sortKey:'vencimento', sortDir:'desc', subTab:'todas', anexos:[], anexosIndisponiveis:false, dossies:new Map(), anexosPorMulta:new Map(), anexosPorDossie:new Map(), root:null, opts:null};

  // Ícones (traço, 24x24) das ações da linha. Cada botão leva title/aria-label com o nome da ação.
  const ICON_PATHS={
    motorista:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    identificar:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
    dobrar:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    ok:'<polyline points="20 6 9 17 4 12"/>',
    notificar:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    termo:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    agrupar:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    anexos:'<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
  };
  function icon(name){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]||''}</svg>`;}
  function iconBtn(attr,id,cls,name,label,dot=''){return `<button type="button" class="fm-btn fm-icon-btn ${cls}" ${attr}="${id}" title="${esc(label)}" aria-label="${esc(label)}">${icon(name)}${dot}</button>`;}

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');}
  function pick(obj, keys){
    if(!obj) return undefined;
    for(const k of keys){
      if(Object.prototype.hasOwnProperty.call(obj,k) && obj[k]!==undefined && obj[k]!==null && String(obj[k]).trim()!=='') return obj[k];
    }
    return undefined;
  }
  function rawPayload(m){
    const raw=first(m.raw,m.payload,m.dados_api,m.dados_detran,m.retorno_api,m.api_json,m.resposta_api,m.json_api,m.detran_json,m.detran_payload);
    if(!raw) return null;
    if(typeof raw==='object') return raw;
    try{return JSON.parse(raw);}catch(_){return null;}
  }
  function apiPick(m, keys){
    const direct=pick(m,keys);
    if(direct!==undefined) return direct;
    const raw=rawPayload(m);
    if(Array.isArray(raw)) return pick(raw[0],keys);
    return pick(raw,keys);
  }
  function parseDate(v){
    if(!v) return null;
    if(v instanceof Date && !Number.isNaN(v.getTime())) return v;
    const s=String(v).trim();
    const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso) return new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]));
    const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(br) return new Date(Number(br[3]),Number(br[2])-1,Number(br[1]));
    const d=new Date(s); return Number.isNaN(d.getTime())?null:d;
  }
  function isoDate(d){return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';}
  function fmtDate(v){const d=parseDate(v);return d?isoDate(d).split('-').reverse().join('/'):'';}
  // Enquanto o condutor não foi indicado ao DETRAN, o vencimento que importa é o prazo
  // para indicação/defesa (data_limite_defesa). Só depois de indicado é que vale a data
  // de pagamento (data_vencimento_auto/data_limite_pagto) — usar essa antes disso mostra
  // uma data de cobrança que ainda nem existe de fato para a empresa.
  function condutorIndicado(m){return Boolean(String(m.motorista||'').trim())&&!isIdentificar(m);}
  function dueDate(m){
    const indicacao=first(
      apiPick(m,['dataLimiteDefesa','data_limite_defesa']),
      m.data_limite_defesa
    );
    const pagamento=first(
      apiPick(m,['dataVencimentoAuto','data_vencimento_auto','dataLimitePagto','data_limite_pagto','dataLimitePagamento','data_limite_pagamento']),
      m.data_vencimento_auto,
      m.data_limite_pagto,
      m.data_vencimento,
      m.vencimento,
      m.data_venc,
      m.data_limite_pagamento,
      m.data_pagamento_limite,
      m.data_limite
    );
    return condutorIndicado(m)?first(pagamento,indicacao):first(indicacao,pagamento);
  }
  function infractionDate(m){
    return first(
      apiPick(m,['dataInfracao','data_infracao','dataAuto','data_auto','dataOcorrencia','data_ocorrencia']),
      m.data_infracao,
      m.data_auto,
      m.data_ocorrencia,
      m.data
    );
  }
  // O DETRAN devolve a hora da infração em texto "HH:MM:SS" já no horário local do Paraná
  // (mesmo fuso de Brasília), sem deslocamento: por isso NÃO passa por Date/UTC, só é cortada em HH:MM.
  // Na multa "por não identificação do condutor" o DETRAN informa a hora em que a penalidade foi
  // lançada (madrugada, com segundos), não a da infração original; e "00:00:00" é hora não informada.
  function isNaoIdentificacao(m){return norm(first(m.descricao,apiPick(m,['descrInfracao']),'')).includes('condutor infrator');}
  function infractionTime(m){
    const mt=String(first(m.hora_infracao,apiPick(m,['horaInfracao','api_horaInfracao']),m.hora)??'').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(!mt)return '';
    if(Number(mt[1])===0&&Number(mt[2])===0&&Number(mt[3]||0)===0)return '';
    return `${mt[1].padStart(2,'0')}:${mt[2]}`;
  }
  // Hora exibida/usada nas mensagens: vazia quando não é a hora real da infração.
  function infractionTimeReal(m){return isNaoIdentificacao(m)?'':infractionTime(m);}
  function horaCell(m){
    if(isNaoIdentificacao(m))return '<small class="fm-hora na" title="Multa por não identificação do condutor: o DETRAN informa o horário em que a penalidade foi lançada, não o da infração original.">—</small>';
    const h=infractionTime(m);
    return h?`<small class="fm-hora" title="Horário de Brasília">${h}</small>`:'<small class="fm-hora na" title="O DETRAN não informou o horário desta infração.">—</small>';
  }
  // Dossiê = grupo da multa (grupo_id) ou, se avulsa, a própria multa.
  function dossieKey(m){return m.grupo_id||m.id;}
  function dossieMembers(m){return state.dossies.get(dossieKey(m))||[m];}
  // O termo de desconto em folha só é dispensado quando TODAS as multas do dossiê são "Identificar"
  // (o valor é lançado em caixa); Dobrar ou multa ainda sem ação exigem o termo assinado.
  function exigeTermo(members){return members.some(x=>!isIdentificar(x));}
  function anexosStatus(m){
    const key=dossieKey(m),members=dossieMembers(m),doss=state.anexosPorDossie.get(key)||[];
    const termo=doss.some(a=>a.tipo==='termo_assinado'),consolidado=doss.some(a=>a.tipo==='consolidado');
    const autos=members.filter(x=>state.anexosPorMulta.has(x.id)).length;
    const exige=exigeTermo(members);
    return {termo,consolidado,autos,totalAutos:members.length,exigeTermo:exige,count:autos+(termo?1:0),esperado:members.length+(exige?1:0)};
  }
  // OK (arquivar) só depois dos anexos da própria multa: Dobrar = 2 (auto de infração + termo de
  // desconto assinado); Identificar = 1 (auto de infração). Devolve o motivo do bloqueio ou ''.
  function okBloqueio(m){
    const indicar=isIdentificar(m),dobrar=!indicar&&isDobrar(m);
    if(!indicar&&!dobrar)return 'Antes do OK, escolha a ação da multa (Identificar ou Dobrar) e anexe os documentos.';
    if(state.anexosIndisponiveis)return 'Não foi possível conferir os anexos agora. Atualize a página e tente de novo.';
    const faltam=[];
    if(!state.anexosPorMulta.has(m.id))faltam.push('o auto de infração');
    if(dobrar&&!(state.anexosPorDossie.get(dossieKey(m))||[]).some(a=>a.tipo==='termo_assinado'))faltam.push('o termo de desconto assinado');
    if(!faltam.length)return '';
    return `${dobrar?'Dobrar exige 2 anexos':'Identificar exige 1 anexo'}: falta ${faltam.join(' e ')}. Use o clipe (Anexos).`;
  }
  function indexar(){
    state.dossies=new Map();state.anexosPorMulta=new Map();state.anexosPorDossie=new Map();
    state.multas.forEach(m=>{const k=dossieKey(m);if(!state.dossies.has(k))state.dossies.set(k,[]);state.dossies.get(k).push(m);});
    state.anexos.forEach(a=>{
      if(a.tipo==='auto_infracao'&&a.multa_id)state.anexosPorMulta.set(a.multa_id,a);
      else if(a.dossie_id){if(!state.anexosPorDossie.has(a.dossie_id))state.anexosPorDossie.set(a.dossie_id,[]);state.anexosPorDossie.get(a.dossie_id).push(a);}
    });
  }
  function isArchived(m){return Boolean(m.arquivada_em||m.arquivado_em||m.ok_em||m.status_arquivo==='arquivada'||m.arquivada===true||m.ok===true);}
  function isIdentificar(m){return Boolean(m.identificar_solicitado_em||m.condutor_identificado_em||m.indicar_solicitado_em||norm(m.acao_status).includes('identific'));}
  function isDobrar(m){return Boolean(m.dobrar_solicitado_em||m.multa_dobrada_em||norm(m.acao_status).includes('dobr'));}
  // Pipeline único da multa: Sem motorista -> Pendente -> Identificar|Dobrar -> Concluído (lançado em caixa).
  // Multas pagas/canceladas pulam direto para Concluído, mesmo sem terem sido arquivadas ainda.
  // Vencida também é tratada como Concluído, mas só depois de checar se falta motorista:
  // a multa estar vencida não dispensa identificar quem dirigia.
  function etapaMulta(m){
    const kind=statusKind(m);
    if(kind==='paga'||kind==='cancelada')return 'concluido';
    if(isArchived(m))return 'concluido';
    if(!String(m.motorista||'').trim())return 'sem_motorista';
    if(kind==='vencida')return 'concluido';
    if(isIdentificar(m))return 'identificar';
    if(isDobrar(m))return 'dobrar';
    return 'pendente';
  }
  function etapaLabel(e){return ({sem_motorista:'Sem Motorista',pendente:'Pendente',identificar:'Identificar',dobrar:'Dobrar',concluido:'Concluído'})[e]||e;}
  function moneyValue(v){const n=Number(v||0);if(!Number.isFinite(n))return 0;if(Number.isInteger(n)&&Math.abs(n)>=1000)return n/100;return n;}
  function fmtMoney(v){return MONEY_FMT.format(moneyValue(v));}
  function statusText(m){return first(m.status_multa,m.situacao,m.status,'A PAGAR');}
  function statusKind(m){const st=norm(statusText(m));if(/\bpag[ao]\b/.test(st)||st.includes('baix')||st.includes('quit'))return 'paga';if(st.includes('cancel'))return 'cancelada';if(st.includes('venc'))return 'vencida';const d=parseDate(dueDate(m));if(d){const today=new Date();today.setHours(0,0,0,0);if(d.getTime()<today.getTime())return 'vencida';}return 'aberta';}
  function toast(msg,error=false){let el=document.querySelector('.fm-toast');if(!el){el=document.createElement('div');el.className='fm-toast';document.body.appendChild(el);}el.textContent=msg;el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3600);}
  async function callFunction(opts,name,body){const {data,error}=await opts.supabase.functions.invoke(name,{body});if(error){const msg=error.context?.error||error.context?.message||error.message||`Falha na function ${name}`;throw new Error(msg);}if(data?.error)throw new Error(data.error);return data;}


  function motoristaLabel(c){return first(c.nome,c.nome_colaborador,c.colaborador,c.funcionario,'');}
  function motoristaSubLabel(c){return [c.supervisao,c.coordenacao,c.empresa,c.tipo].filter(Boolean).join(' • ');}
  function isColaboradorAtivo(c){const a=c.ativo;const s=norm(first(c.situacao,c.status,''));if(a===false)return false;if(s&&/(nao ativo|não ativo|deslig|demit|inativ)/.test(s))return false;return true;}
  function uniqueMotoristas(rows){const map=new Map();(rows||[]).forEach(c=>{const nome=motoristaLabel(c);if(!nome)return;const key=norm(nome);if(!map.has(key))map.set(key,c);});return Array.from(map.values()).sort((a,b)=>motoristaLabel(a).localeCompare(motoristaLabel(b),'pt-BR'));}
  async function loadMotoristas(opts){
    if(state.motoristasLoaded) return state.motoristas;
    const selects=['nome,supervisao,coordenacao,empresa,tipo,ativo,situacao','nome,supervisao,coordenacao,empresa,tipo,situacao','nome'];
    for(const sel of selects){
      try{
        let all=[],from=0;const PAGE=1000;
        while(true){const {data,error}=await opts.supabase.from('colaboradores_atuais').select(sel).order('nome',{ascending:true}).order('id',{ascending:true}).range(from,from+PAGE-1);if(error)throw error;const rows=data||[];all=all.concat(rows);if(rows.length<PAGE)break;from+=PAGE;}
        state.motoristas=uniqueMotoristas(all.filter(isColaboradorAtivo));
        state.motoristasLoaded=true;
        return state.motoristas;
      }catch(err){
        console.warn('Falha ao carregar motoristas com select:', sel, err);
      }
    }
    state.motoristas=[];state.motoristasLoaded=true;return state.motoristas;
  }
  function matchesMotorista(c,term){const q=norm(term);if(!q)return false;const hay=norm([motoristaLabel(c),c.supervisao,c.coordenacao,c.empresa,c.tipo].join(' '));return hay.includes(q);}
  function renderMotoristaSuggestions(box,input,selectedRef){
    const term=input.value.trim();
    const rows=term.length>=2?state.motoristas.filter(c=>matchesMotorista(c,term)).slice(0,12):[];
    if(term.length<2){box.classList.remove('show');box.innerHTML='';return;}
    if(!rows.length){box.innerHTML='<div class="fm-suggestion-empty">Nenhum motorista localizado na base de colaboradores.</div>';box.classList.add('show');return;}
    box.innerHTML=rows.map((c,i)=>`<button type="button" class="fm-suggestion" data-suggestion-index="${i}"><strong>${esc(motoristaLabel(c))}</strong><small>${esc(motoristaSubLabel(c)||'Colaborador')}</small></button>`).join('');
    box.classList.add('show');
    box.querySelectorAll('[data-suggestion-index]').forEach(btn=>btn.addEventListener('click',()=>{
      const c=rows[Number(btn.dataset.suggestionIndex)];
      input.value=motoristaLabel(c);
      selectedRef.value=c;
      box.classList.remove('show');
      input.focus();
    }));
  }

  async function syncMultas(root,opts){
    try{
      toast('Sincronizando multas no DETRAN em lotes...');
      let offset=0;const limit=15;let totalMultas=0,veiculos=0,inserted=0,updated=0,errors=0,totalDisponivel=null;
      const since=new Date(Date.now()-(180*DAY_MS));
      for(let i=0;i<80;i++){
        const data=await callFunction(opts,'sync-multas-detran',{mode:'all',offset,limit,dias:180,data_inicial:isoDate(since)});
        totalMultas+=Number(data?.total_multas||0);veiculos+=Number(data?.total_veiculos||0);inserted+=Number(data?.inserted||0);updated+=Number(data?.updated||0);errors+=Number(data?.errors||0);totalDisponivel=data?.total_disponivel??totalDisponivel;offset=Number(data?.next_offset||offset+limit);
        toast(`Multas: ${Math.min(offset,Number(totalDisponivel||offset))}/${totalDisponivel||'?'} veículos processados...`);
        if(!data?.has_more)break;
      }
      toast(`Sincronização concluída: ${veiculos} veículo(s), ${totalMultas} multa(s), ${inserted} nova(s), ${updated} atualizada(s)${errors?`, ${errors} erro(s)`:''}.`,Boolean(errors));
      await load(root,opts);
    }catch(err){toast(err.message||'Falha ao sincronizar multas.',true);}
  }

  function inLast180(m){const d=parseDate(dueDate(m))||parseDate(infractionDate(m));if(!d) return true;return d.getTime()>=Date.now()-(180*DAY_MS);}
  function filtered(){
    const b=norm(state.busca);
    return state.multas.filter(m=>{
      if(!inLast180(m))return false;
      const archived=isArchived(m);
      if(state.arquivo==='ativas'&&archived)return false;
      if(state.arquivo==='arquivadas'&&!archived)return false;
      if(state.subTab!=='todas'&&etapaMulta(m)!==state.subTab)return false;
      const kind=statusKind(m);
      if(state.filtro==='vencidas'&&kind!=='vencida')return false;
      if(state.filtro==='abertas'&&!['aberta','vencida'].includes(kind))return false;
      if(state.filtro==='pagas'&&kind!=='aberta')return false;
      if(b&&!norm([m.placa,m.renavam,m.motorista,m.descricao,m.local,m.numero_auto_infracao,m.auto,m.empresa,statusText(m)].join(' ')).includes(b))return false;
      return true;
    }).sort(compareRows);
  }
  function sortValue(m,key){
    if(key==='vencimento')return parseDate(dueDate(m))?.getTime()||0;
    if(key==='infracao')return parseDate(infractionDate(m))?.getTime()||0;
    if(key==='valor')return moneyValue(first(m.valor_original,m.valor,m.valor_multa));
    if(key==='status')return norm(statusText(m));
    return norm(first(m[key],''));
  }
  function compareRows(a,b){const av=sortValue(a,state.sortKey), bv=sortValue(b,state.sortKey);let r=0;if(typeof av==='number'||typeof bv==='number')r=Number(av)-Number(bv);else r=String(av).localeCompare(String(bv),'pt-BR');return state.sortDir==='asc'?r:-r;}
  function markFor(key){if(state.sortKey!==key)return '';return `<span class="fm-sort-mark">${state.sortDir==='asc'?'▲':'▼'}</span>`;}
  function stats(root){
    const rows=filtered();
    root.querySelector('[data-kpi-abertas]').textContent=rows.filter(m=>statusKind(m)==='aberta').length;
    root.querySelector('[data-kpi-vencidas]').textContent=rows.filter(m=>statusKind(m)==='vencida').length;
    root.querySelector('[data-kpi-valor]').textContent=MONEY_FMT.format(rows.reduce((s,m)=>s+moneyValue(first(m.valor_original,m.valor,m.valor_multa)),0));
    root.querySelector('[data-kpi-guias]').textContent=rows.filter(m=>m.arquivo_pdf_url||m.guia_url).length;
    root.querySelector('[data-count]').textContent=`${rows.length} multa(s) encontrada(s) · últimos 180 dias`;
    const base=state.multas.filter(inLast180);
    const counts={sem_motorista:0,pendente:0,identificar:0,dobrar:0,concluido:0};
    base.forEach(m=>{const e=etapaMulta(m);if(counts[e]!==undefined)counts[e]++;});
    const setBadge=(sel,n)=>{const el=root.querySelector(sel);if(el)el.textContent=n||'';};
    setBadge('[data-badge-sem-motorista]',counts.sem_motorista);
    setBadge('[data-badge-pendente]',counts.pendente);
    setBadge('[data-badge-identificar]',counts.identificar);
    setBadge('[data-badge-dobrar]',counts.dobrar);
    setBadge('[data-badge-concluido]',counts.concluido);
  }

  function render(root,opts){
    const tbody=root.querySelector('[data-multas-table]');
    const rows=filtered();
    stats(root);
    if(!rows.length){tbody.innerHTML='<tr><td colspan="9" class="fm-empty">Nenhuma multa encontrada para o filtro selecionado.</td></tr>';return;}
    tbody.innerHTML=rows.map(m=>{
      const kind=statusKind(m);
      const badgeClass=kind==='vencida'?'red':kind==='paga'?'green':'';
      const etapa=etapaMulta(m);
      const etapaClass=etapa==='concluido'?'green':etapa==='sem_motorista'?'red':'';
      const grupoN=dossieMembers(m).length;
      const notif=String(m.status_notificacao||'').toUpperCase();
      const notifLabel=notif==='NOTIFICADO'?`Notificar motorista (WhatsApp) — notificado${m.notificado_em?' em '+new Date(m.notificado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}`:notif==='GERADA'?'Notificar motorista (WhatsApp) — mensagem já gerada':'Notificar motorista (WhatsApp)';
      const anx=anexosStatus(m);
      const okMotivo=okBloqueio(m);
      const anxCls=anx.consolidado?'done':anx.count?'warn':'soft';
      const anxLabel=anx.consolidado?'Anexos — PDF único gerado':anx.count?`Anexos — ${anx.count} de ${anx.esperado} enviados`:(anx.exigeTermo?'Anexos (auto de infração e termo assinado)':'Anexos (auto de infração)');
      return `<tr>
        <td><strong>${esc(m.placa)}</strong><br><small>${esc(m.empresa||'')}</small></td>
        <td>${fmtDate(infractionDate(m))||'—'}<br>${horaCell(m)}</td>
        <td>${esc(m.motorista||'—')}${grupoN>1?`<br><span class="fm-chip" title="Multas agrupadas do mesmo condutor para um único termo de desconto em folha">Grupo · ${grupoN} multas</span>`:''}</td>
        <td>${esc(m.descricao||'—')}<br><small>${esc(m.local||'')}</small></td>
        <td>${esc(m.numero_auto_infracao||m.auto||'—')}</td>
        <td>${fmtMoney(first(m.valor_original,m.valor,m.valor_multa))}</td>
        <td>${fmtDate(dueDate(m))||'—'}</td>
        <td><span class="fm-badge ${badgeClass}">${esc(statusText(m))}</span><br><span class="fm-badge ${etapaClass}">${esc(etapaLabel(etapa))}</span></td>
        <td><div class="fm-action-grid">
          ${iconBtn('data-motorista',m.id,'info','motorista','Definir motorista')}
          ${iconBtn('data-identificar',m.id,isIdentificar(m)?'done':'warn','identificar',isIdentificar(m)?'Identificar condutor — solicitado (clique para desfazer)':'Identificar condutor')}
          ${iconBtn('data-dobrar',m.id,isDobrar(m)?'done':'danger','dobrar',isDobrar(m)?'Dobrar multa — solicitado (clique para desfazer)':'Dobrar multa')}
          ${iconBtn('data-ok',m.id,okMotivo?'soft blocked':'soft','ok',okMotivo?`OK bloqueado — ${okMotivo}`:'OK — arquivar multa')}
          ${iconBtn('data-notificar',m.id,notif==='NOTIFICADO'?'done':'info','notificar',notifLabel)}
          ${iconBtn('data-termo',m.id,m.termo_gerado_em?'done':'soft','termo',m.termo_gerado_em?'Gerar termo de desconto em folha — já gerado (gera novamente)':'Gerar termo de desconto em folha')}
          ${iconBtn('data-agrupar',m.id,grupoN>1?'done':'soft','agrupar',grupoN>1?`Agrupar — ${grupoN} multas no grupo`:'Agrupar multas do mesmo condutor',grupoN>1?`<span class="fm-icon-dot">${grupoN}</span>`:'')}
          ${iconBtn('data-anexos',m.id,anxCls,'anexos',anxLabel,anx.count?`<span class="fm-icon-dot${anx.consolidado?'':' amber'}">${anx.consolidado?'✓':anx.count+'/'+anx.esperado}</span>`:'')}
        </div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-motorista]').forEach(btn=>btn.addEventListener('click',()=>openMotoristaModal(root, opts, state.multas.find(x=>String(x.id)===String(btn.dataset.motorista)))));
    tbody.querySelectorAll('[data-identificar]').forEach(btn=>btn.addEventListener('click',()=>toggleAction(root, opts, state.multas.find(x=>String(x.id)===String(btn.dataset.identificar)), 'identificar')));
    tbody.querySelectorAll('[data-dobrar]').forEach(btn=>btn.addEventListener('click',()=>toggleAction(root, opts, state.multas.find(x=>String(x.id)===String(btn.dataset.dobrar)), 'dobrar')));
    tbody.querySelectorAll('[data-ok]').forEach(btn=>btn.addEventListener('click',()=>archiveMulta(root, opts, state.multas.find(x=>String(x.id)===String(btn.dataset.ok)))));
  }

  async function safeUpdate(opts,id,payload){
    const { error } = await opts.supabase.from('frotas_multas').update(payload).eq('id', id);
    if(error) throw error;
  }
  async function toggleAction(root, opts, multa, action){
    if(!multa?.id) return toast('Multa não localizada.', true);
    const now=new Date().toISOString();
    const payload={ atualizado_em: now };
    if(action==='identificar'){payload.identificar_solicitado_em=isIdentificar(multa)?null:now;payload.acao_status=payload.identificar_solicitado_em?'Identificar condutor':null;}
    if(action==='dobrar'){payload.dobrar_solicitado_em=isDobrar(multa)?null:now;payload.acao_status=payload.dobrar_solicitado_em?'Dobrar multa':null;}
    try{await safeUpdate(opts,multa.id,payload);toast(action==='identificar'?'Status de identificação atualizado.':'Status de dobra atualizado.');await load(root,opts);}catch(err){toast((err.message||'Erro ao salvar ação.')+' Execute a migration de multas caso falte coluna.',true);}
  }
  async function archiveMulta(root, opts, multa){
    if(!multa?.id) return toast('Multa não localizada.', true);
    const bloqueio=okBloqueio(multa);
    // Redesenha a tabela ao bloquear: o stable-actions deixa o botão "ocupado" até a lista mudar.
    if(bloqueio){toast(bloqueio,true);render(root,opts);return;}
    try{await safeUpdate(opts,multa.id,{arquivada_em:new Date().toISOString(),ok_em:new Date().toISOString(),atualizado_em:new Date().toISOString()});toast('Multa arquivada.');await load(root,opts);}catch(err){toast((err.message||'Erro ao arquivar multa.')+' Execute a migration de multas caso falte coluna.',true);}
  }
  function openMotoristaModal(root, opts, multa){
    if(!multa) return toast('Multa não localizada.', true);
    document.querySelector('[data-fm-modal]')?.remove();
    const el=document.createElement('div');
    el.className='fm-modal-backdrop';el.setAttribute('data-fm-modal','1');
    el.innerHTML=`<div class="fm-modal" role="dialog" aria-modal="true"><h3>Definir motorista</h3><p><strong>${esc(multa.placa||'')}</strong> · Infração ${fmtDate(infractionDate(multa))||'—'} · Vencimento ${fmtDate(dueDate(multa))||'—'} · Auto ${esc(multa.numero_auto_infracao||multa.auto||'—')}</p><label class="fm-kicker" for="fm-motorista-input">Motorista responsável</label><div class="fm-autocomplete-wrap"><input id="fm-motorista-input" class="fm-input fm-input-with-suggestions" style="width:100%" value="${esc(multa.motorista||'')}" placeholder="Digite o nome do motorista" autocomplete="off"><div class="fm-suggestions" data-motorista-suggestions></div></div><div class="fm-meta-line">${esc(multa.descricao||'')}<br>${esc(multa.local||'')}</div><div class="fm-modal-foot"><button class="fm-btn soft" data-close>Cancelar</button><button class="fm-btn primary" data-save>Salvar motorista</button></div></div>`;
    document.body.appendChild(el);
    const input=el.querySelector('#fm-motorista-input');
    const suggestionsBox=el.querySelector('[data-motorista-suggestions]');
    const selectedMotorista={value:null};
    input?.focus();input?.select();
    loadMotoristas(opts).then(()=>renderMotoristaSuggestions(suggestionsBox,input,selectedMotorista)).catch(()=>{});
    input?.addEventListener('input',()=>{selectedMotorista.value=null;renderMotoristaSuggestions(suggestionsBox,input,selectedMotorista);});
    input?.addEventListener('focus',()=>renderMotoristaSuggestions(suggestionsBox,input,selectedMotorista));
    input?.addEventListener('keydown',(ev)=>{
      if(ev.key==='Escape'){suggestionsBox?.classList.remove('show');return;}
      if(ev.key==='Enter'){
        const firstBtn=suggestionsBox?.querySelector('[data-suggestion-index]');
        if(firstBtn&&suggestionsBox.classList.contains('show')){ev.preventDefault();firstBtn.click();}
      }
    });
    el.querySelector('[data-close]')?.addEventListener('click',()=>el.remove());
    el.addEventListener('click',(ev)=>{ if(ev.target===el) el.remove(); });
    document.addEventListener('click',(ev)=>{ if(el.isConnected&&!el.contains(ev.target)) suggestionsBox?.classList.remove('show'); }, {once:true});
    el.querySelector('[data-save]')?.addEventListener('click',async()=>{
      const motorista=input.value.trim();
      if(!motorista) return toast('Informe o nome do motorista.', true);
      try{await safeUpdate(opts,multa.id,{motorista,motorista_definido_em:new Date().toISOString(),atualizado_em:new Date().toISOString()});toast('Motorista definido.');el.remove();await load(root,opts);}catch(err){toast((err.message||'Erro ao salvar motorista.')+' Execute a migration de multas caso falte coluna.',true);}
    });
  }

  // Lê tudo em páginas de 1000 com desempate por id (a tabela já passa de 1000 linhas e a
  // API limita cada resposta; sem ordem única as páginas repetem/perdem linhas).
  async function fetchAll(opts,table,select){
    const PAGE=1000;let all=[],from=0;
    while(true){
      const {data,error}=await opts.supabase.from(table).select(select).order('id',{ascending:true}).range(from,from+PAGE-1);
      if(error)throw error;
      const rows=data||[];all=all.concat(rows);
      if(rows.length<PAGE)break;from+=PAGE;
    }
    return all;
  }
  async function load(root,opts){
    state.root=root;state.opts=opts;
    const tbody=root.querySelector('[data-multas-table]');
    // Só mostra "Carregando" na 1ª carga; nas recargas (após uma ação) mantém as linhas na tela.
    if(tbody&&!state.multas.length) tbody.innerHTML='<tr><td colspan="9" class="fm-empty">Carregando multas...</td></tr>';
    let multas;
    try{multas=await fetchAll(opts,'frotas_multas','*');}
    catch(error){if(tbody) tbody.innerHTML='<tr><td colspan="9" class="fm-empty">Erro ao carregar multas: '+esc(error.message||'')+'</td></tr>';return;}
    state.multas=multas;
    await loadAnexos(opts);
    indexar();
    render(root,opts);
  }
  // Anexos são opcionais: se a tabela ainda não existe (migration pendente) a lista segue funcionando.
  async function loadAnexos(opts){
    try{state.anexos=await fetchAll(opts,'frotas_multas_anexos','id,tipo,multa_id,dossie_id,storage_bucket,storage_path,nome_arquivo,mime_type,tamanho_bytes,criado_em,criado_por_nome,drive_file_id,drive_url,drive_pasta,drive_enviado_em');state.anexosIndisponiveis=false;}
    catch(error){console.warn('Anexos de multas indisponíveis:',error);state.anexos=[];state.anexosIndisponiveis=true;}
  }
  // Recarga leve (só anexos) usada pelo modal de Anexos a cada envio/remoção.
  async function reloadAnexos(){
    if(!state.opts||!state.root)return;
    await loadAnexos(state.opts);indexar();render(state.root,state.opts);
  }

  function bindSort(container,opts){
    if(container.__fmSortBound)return;
    container.__fmSortBound=true;
    container.addEventListener('click',(ev)=>{
      const btn=ev.target.closest('[data-sort]');
      if(!btn)return;
      const key=btn.dataset.sort;
      if(state.sortKey===key)state.sortDir=state.sortDir==='asc'?'desc':'asc';
      else{state.sortKey=key;state.sortDir=(key==='valor'||key==='vencimento')?'desc':'asc';}
      render(container,opts);
    });
  }
  function refreshSortHeaders(container){
    container.querySelectorAll('[data-sort]').forEach(btn=>{const key=btn.dataset.sort;btn.innerHTML=`${btn.dataset.label} ${markFor(key)}`;});
  }
  const originalRender=render;
  render=function(root,opts){ originalRender(root,opts); refreshSortHeaders(root); };

  function openHome(container,opts={}){
    container.innerHTML=`${styles}<section class="fm-shell"><div class="fm-head"><div class="fm-kicker">Frotas · Notificações</div><h1 class="fm-title">Multas</h1><p class="fm-sub">Consulta, conferência, definição de motorista, identificação/dobra e arquivamento das multas recentes.</p></div><div class="fm-card"><div class="fm-body"><div class="fm-subtabs" data-subtabs><button class="fm-subtab active" data-subtab="todas">Todas</button><button class="fm-subtab" data-subtab="sem_motorista">Sem Motorista <span class="fm-subtab-badge" data-badge-sem-motorista></span></button><button class="fm-subtab" data-subtab="pendente">Pendente <span class="fm-subtab-badge" data-badge-pendente></span></button><button class="fm-subtab" data-subtab="identificar">Identificar <span class="fm-subtab-badge" data-badge-identificar></span></button><button class="fm-subtab" data-subtab="dobrar">Dobrar <span class="fm-subtab-badge" data-badge-dobrar></span></button><button class="fm-subtab" data-subtab="concluido">Concluído <span class="fm-subtab-badge" data-badge-concluido></span></button></div><div class="fm-toolbar"><select class="fm-select" data-filter><option value="abertas">Abertas / vencidas</option><option value="vencidas">Vencidas</option><option value="pagas" selected>A PAGAR</option><option value="todas">Todas</option></select><select class="fm-select" data-archive-filter><option value="ativas">Multas ativas</option><option value="arquivadas">Consultar arquivadas</option><option value="todas">Ativas + arquivadas</option></select><input class="fm-input" data-search placeholder="Buscar por placa, motorista, auto, renavam, empresa..."><button class="fm-btn primary" data-refresh>↻ Atualizar</button><button class="fm-btn primary" data-sync-multas>Sincronizar DETRAN</button></div><div class="fm-grid"><div class="fm-kpi"><span>Abertas</span><strong data-kpi-abertas>0</strong></div><div class="fm-kpi"><span>Vencidas</span><strong data-kpi-vencidas>0</strong></div><div class="fm-kpi"><span>Valor filtrado</span><strong data-kpi-valor>R$ 0,00</strong></div><div class="fm-kpi"><span>Guias/PDFs</span><strong data-kpi-guias>0</strong></div></div><p class="fm-sub" data-count>0 multa(s) encontrada(s)</p><div class="fm-table-wrap"><table class="fm-table"><thead><tr><th><button class="fm-sort" data-sort="placa" data-label="Placa / Empresa">Placa / Empresa</button></th><th><button class="fm-sort" data-sort="infracao" data-label="Infração">Infração</button></th><th><button class="fm-sort" data-sort="motorista" data-label="Motorista">Motorista</button></th><th><button class="fm-sort" data-sort="descricao" data-label="Descrição / Local">Descrição / Local</button></th><th><button class="fm-sort" data-sort="numero_auto_infracao" data-label="Auto">Auto</button></th><th><button class="fm-sort" data-sort="valor" data-label="Valor">Valor</button></th><th><button class="fm-sort" data-sort="vencimento" data-label="Vencimento">Vencimento</button></th><th><button class="fm-sort" data-sort="status" data-label="Status">Status</button></th><th>Ações</th></tr></thead><tbody data-multas-table></tbody></table></div><div class="fm-note">A lista exibe somente multas dos últimos <strong>180 dias</strong>, mantendo separadas a data da <strong>infração</strong> e a data de <strong>vencimento</strong>.</div></div></div></section>`;
    container.querySelector('[data-refresh]')?.addEventListener('click',()=>load(container,opts));
    container.querySelector('[data-sync-multas]')?.addEventListener('click',()=>syncMultas(container,opts));
    container.querySelector('[data-search]')?.addEventListener('input',e=>{state.busca=e.target.value;render(container,opts);});
    container.querySelector('[data-filter]')?.addEventListener('change',e=>{state.filtro=e.target.value;render(container,opts);});
    container.querySelector('[data-archive-filter]')?.addEventListener('change',e=>{state.arquivo=e.target.value;render(container,opts);});
    container.querySelectorAll('[data-subtab]').forEach(btn=>btn.addEventListener('click',()=>{state.subTab=btn.dataset.subtab;container.querySelectorAll('[data-subtab]').forEach(b=>b.classList.toggle('active',b===btn));render(container,opts);}));
    bindSort(container,opts);
    load(container,opts);
    loadMotoristas(opts).catch(()=>{});
  }
  // Contexto compartilhado com o módulo de fluxo (Notificar, Termo, Agrupar, Anexos).
  function getContext(){
    return {
      state,
      opts:state.opts,
      reload:()=>(state.root&&state.opts)?load(state.root,state.opts):Promise.resolve(),
      reloadAnexos,
      reindex:indexar,
      helpers:{esc,norm,first,fmtDate,fmtMoney,moneyValue,infractionDate,infractionTimeReal,isNaoIdentificacao,isArchived,isIdentificar,isDobrar,statusKind,dueDate,dossieKey,dossieMembers,exigeTermo,anexosStatus,okBloqueio,toast,icon}
    };
  }
  window[MODULE_NAME]=window[MODULE_NAME]||{};window[MODULE_NAME].openHome=openHome;window[MODULE_NAME].getContext=getContext;
})();
