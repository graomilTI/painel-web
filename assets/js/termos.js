import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const state = { tab:'celular', celular:[], veiculos:[], empresas:[] };
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const money=(v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm=(v)=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
function setMsg(msg,err=false){const el=document.getElementById('termosFeedbackMain'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}

function safeFileName(n){return String(n||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);}
async function uploadTermo(file){
  if(!file) return '';
  const ano=new Date().getFullYear();
  const path=`termos/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const {error}=await supabase.storage.from('notas-fiscais').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  const {data}=supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl||path;
}
async function notifyFinanceiro(tc, ci){
  const cfgs=await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor','FINANCEIRO').eq('ativo',true).limit(10));
  for(const cfg of cfgs){
    if(!cfg.telefone) continue;
    try{await fetch('/api/botconversa/send-message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({empresa:cfg.empresa||'Grao 1000',nome:cfg.nome||'Financeiro',telefone:cfg.telefone,cpf:cfg.cpf||'',mensagem:`Pagamento de compra pendente\nItem: CELULAR\nColaborador: ${tc.colaborador_nome||'-'}\nValor: ${money(tc.valor||0)}\nTermo assinado anexado.`})});}catch(e){console.warn(e);}
  }
}

async function loadEmpresas(){
  if(state.empresas.length) return;
  state.empresas=await safe(()=>supabase.from('envios_remetentes').select('id,nome,cpf_cnpj,cidade,uf').eq('ativo',true).order('nome'));
}

async function fetchCPF(colaboradorId){
  if(!colaboradorId) return '';
  // tenta o cache (foto atual); fallback à query direta caso o id não esteja no cache
  try{
    const lista=await getColaboradores();
    const hit=lista.find(c=>String(c.id)===String(colaboradorId));
    if(hit?.cpf) return hit.cpf;
  }catch{}
  const data=await safe(()=>supabase.from('colaboradores').select('cpf').eq('id',colaboradorId).maybeSingle(),null);
  return String(data?.cpf||'').replace(/\D/g,'');
}

const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function mesExtenso(year,month){return `${MESES[month-1]} de ${year}`;}
function addMeses(year,month,n){let m=month-1+n;let y=year+Math.floor(m/12);m=m%12;return{year:y,month:m+1};}

function valorPorExtenso(valor){
  const n=Math.round(Number(valor||0)*100);
  const reais=Math.floor(n/100);
  const centavos=n%100;
  const uns=['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dez=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const cen=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  function c(n){
    if(n===0)return '';if(n===100)return 'cem';
    let r='';
    if(n>=100){r+=cen[Math.floor(n/100)];n%=100;if(n>0)r+=' e ';}
    if(n>=20){r+=dez[Math.floor(n/10)];n%=10;if(n>0)r+=' e '+uns[n];}
    else if(n>0)r+=uns[n];
    return r;
  }
  function t(n){
    if(n===0)return 'zero';
    let r='';
    if(n>=1000000){const m=Math.floor(n/1000000);r+=c(m)+(m===1?' milhão':' milhões');n%=1000000;if(n>0)r+=' e ';}
    if(n>=1000){const mil=Math.floor(n/1000);r+=(mil===1?'mil':c(mil)+' mil');n%=1000;if(n>0)r+=' e ';}
    if(n>0)r+=c(n);
    return r;
  }
  const pr=t(reais);const lr=reais===1?'real':'reais';
  if(centavos===0)return `${pr} ${lr}`;
  const pc=t(centavos);const lc=centavos===1?'centavo':'centavos';
  if(reais===0)return `${pc} ${lc}`;
  return `${pr} ${lr} e ${pc} ${lc}`;
}

function gerarHTMLTermo({nome,cpf,empresa,cnpj,cidade,uf,valor,parcelas,metodo,mesInicio}){
  const dataHoje=new Date();
  const diaFormatado=dataHoje.getDate();
  const mesHojeExtenso=mesExtenso(dataHoje.getFullYear(),dataHoje.getMonth()+1);
  const [anoI,mesI]=mesInicio?[parseInt(mesInicio.slice(0,4)),parseInt(mesInicio.slice(5,7))]:[dataHoje.getFullYear(),dataHoje.getMonth()+1];
  let corpo='';
  if(metodo==='parcelado'&&Number(parcelas||1)>1){
    const fim=addMeses(anoI,mesI,Number(parcelas)-1);
    const valorParcela=Number(valor||0)/Number(parcelas||1);
    corpo=`a proceder o desconto em minhas verbas salariais no valor de ${money(valor)} (${valorPorExtenso(valor)}) relativo à compra de aparelho celular, a ser descontado mensalmente, a partir do mês de ${mesExtenso(anoI,mesI)} até o mês de ${mesExtenso(fim.year,fim.month)}, totalizando ${parcelas} parcelas de ${money(valorParcela)}. O saldo residual será descontado na integralidade caso ocorra a rescisão do contrato de trabalho antes da quitação das parcelas citadas, observando o limite legal.`;
  }else{
    corpo=`a proceder o desconto em minhas verbas salariais no valor de ${money(valor)} (${valorPorExtenso(valor)}) relativo à compra de aparelho celular, a ser descontado integralmente na folha de pagamento do mês de ${mesExtenso(anoI,mesI)}.`;
  }
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Autorização de Desconto — ${nome}</title>
<style>
@page{size:A4;margin:3cm 2.5cm}
body{font-family:'Times New Roman',Times,serif;font-size:13pt;line-height:1.9;color:#000;background:#fff;margin:0}
h1{text-align:center;font-size:14pt;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;margin:0 0 36px}
p{text-align:justify;margin:0 0 14px}
.data-local{text-align:right;margin:40px 0 24px}
.assinatura{margin-top:60px;text-align:center}
.linha-assinatura{display:inline-block;border-top:1px solid #000;padding-top:8px;min-width:320px;text-align:center}
</style></head><body>
<h1>Autorização de Desconto em Folha de Pagamento</h1>
<p>Eu, <strong>${nome}</strong>, CPF nº <strong>${cpf||'___________________'}</strong>, AUTORIZO por meio desta à empresa <strong>${empresa}</strong>, CNPJ nº <strong>${cnpj}</strong>, ${corpo}</p>
<div class="data-local"><p>${cidade}, ${uf}, ${diaFormatado} de ${mesHojeExtenso}.</p></div>
<p>Por ser verdade, firmo o presente na forma da lei.</p>
<div class="assinatura"><div class="linha-assinatura"><p>${nome}</p></div></div>
</body></html>`;
}

async function loadCelular(){
  const data=await safe(()=>supabase.from('termos_celular').select('*, compras_itens(id, material, valor_total, forma_pagamento, dados_pagamento, compras_solicitacoes(solicitante, data_solicitacao, fornecedor, telefone_fornecedor))').order('created_at',{ascending:false}).limit(300));
  state.celular=data;
  renderKpis();
  renderCelular();
}

function renderKpis(){
  const pend=state.celular.filter(r=>r.status==='aguardando_termo').length;
  const conf=state.celular.filter(r=>r.status==='enviado_financeiro').length;
  document.getElementById('kpiTermosPend').textContent=pend;
  document.getElementById('kpiTermosConf').textContent=conf;
  document.getElementById('kpiTermosTotal').textContent=state.celular.length;
}

function statusPill(s){
  const map={
    aguardando_termo:['#fde68a','rgba(245,158,11,.1)','Aguardando Termo'],
    enviado_financeiro:['#bbf7d0','rgba(22,101,52,.18)','Enviado ao Financeiro']
  };
  const [color,bg,label]=map[s]||['#cbd5e1','rgba(148,163,184,.1)',s||'-'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function renderCelular(){
  const body=document.getElementById('termosCelularBody');
  if(!state.celular.length){
    body.innerHTML=`<tr><td colspan="7" class="termos-empty">Nenhum registro encontrado.</td></tr>`;
    return;
  }
  body.innerHTML=state.celular.map(tc=>{
    const isSigned=tc.status==='enviado_financeiro';
    return `<tr>
      <td>${brDate(tc.created_at)}</td>
      <td><b>${esc(tc.colaborador_nome||'-')}</b></td>
      <td>CELULAR</td>
      <td>${tc.valor?money(tc.valor):'<span class="muted">Aguardando</span>'}</td>
      <td>${tc.metodo_pagamento==='parcelado'?`${tc.parcelas||1}x`:'À vista'}</td>
      <td>${statusPill(tc.status)}</td>
      <td class="termos-acoes">
        ${!isSigned?(tc.valor?`<button class="btn btn-small btn-primary" data-confirmar="${esc(tc.id)}" type="button">Criar Termo</button>`:`<span style="font-size:12px;color:#fde68a;font-weight:700">Aguardando valor</span>`):''}

        ${tc.termo_url?`<a class="btn btn-small btn-secondary" href="${esc(tc.termo_url)}" target="_blank" rel="noopener">Ver Termo</a>`:''}
      </td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-confirmar]').forEach(b=>b.onclick=()=>openConfirmarModal(b.dataset.confirmar));
}

async function openConfirmarModal(id){
  const tc=state.celular.find(x=>String(x.id)===String(id)); if(!tc) return;
  const modal=document.getElementById('termosModal');
  modal.innerHTML=`<div class="termos-modal-card"><p style="color:var(--muted);padding:20px">Carregando...</p></div>`;
  modal.classList.add('open');

  const [cpf]=await Promise.all([fetchCPF(tc.colaborador_id),loadEmpresas()]);

  const isParcelado=tc.metodo_pagamento==='parcelado';
  const hoje=new Date();
  const mesAtualISO=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const optEmpresas=state.empresas.map(e=>`<option value="${esc(e.id)}" data-nome="${esc((e.nome||'').trim())}" data-cnpj="${esc(e.cpf_cnpj||'')}" data-cidade="${esc(e.cidade||'Cascavel')}" data-uf="${esc(e.uf||'PR')}">${esc((e.nome||'').trim())} — ${esc(e.cpf_cnpj||'')}</option>`).join('');

  modal.innerHTML=`<div class="termos-modal-card">
    <div class="section-head">
      <div><h3>Criar Termo — Celular</h3><p class="muted">Gere o documento, imprima, colete a assinatura e anexe abaixo.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="termos-detail-grid mt-16">
      <div><span class="muted">Colaborador</span><b>${esc(tc.colaborador_nome||'-')}</b></div>
      <div><span class="muted">Valor</span><b>${tc.valor?money(tc.valor):'Não informado'}</b></div>
      <div><span class="muted">Pagamento</span><b>${isParcelado?`${tc.parcelas||1}x parcelado`:'À vista'}</b></div>
    </div>
    <div class="termos-gerar-box mt-16">
      <p class="termos-gerar-title">1. Gerar documento</p>
      <div class="adm-cmp-grid">
        <label class="adm-cmp-full">Empresa / CNPJ
          <select id="termoEmpresa">
            <option value="">— Selecione a empresa —</option>
            ${optEmpresas}
          </select>
        </label>
        <label>CPF do Colaborador
          <input id="termoCPF" placeholder="000.000.000-00" value="${esc(cpf)}">
        </label>
        <label>Mês de início do desconto
          <input id="termoMesInicio" type="month" value="${mesAtualISO}">
        </label>
      </div>
      <div class="adm-cmp-actions mt-12">
        <button class="btn btn-secondary" id="termosGerarBtn" type="button">Imprimir Termo</button>
      </div>
    </div>
    <div class="termos-gerar-box mt-16">
      <p class="termos-gerar-title">2. Anexar termo assinado e confirmar</p>
      <div class="adm-cmp-grid">
        <label class="adm-cmp-full">Arquivo do Termo Assinado<input id="termoFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
        <label class="adm-cmp-full">Observação (opcional)<input id="termoObs" placeholder="Ex: Colaborador assinou em 20/05/2026…"></label>
      </div>
      <div class="adm-cmp-actions mt-12">
        <button class="btn btn-primary" id="termosConfirmar" type="button">Confirmar e Enviar ao Financeiro</button>
        <button class="btn btn-secondary" id="termosCancelar" type="button">Cancelar</button>
      </div>
    </div>
    <span class="termos-feedback mt-8" id="termosFeedbackModal"></span>
  </div>`;

  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#termosCancelar').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#termosConfirmar').onclick=()=>confirmarTermo(tc);
  modal.querySelector('#termosGerarBtn').onclick=()=>{
    const sel=modal.querySelector('#termoEmpresa');
    const opt=sel?.options[sel.selectedIndex];
    if(!opt?.value){const fb=modal.querySelector('#termosFeedbackModal');fb.textContent='Selecione a empresa.';fb.classList.add('err');return;}
    const html=gerarHTMLTermo({
      nome:tc.colaborador_nome||'',
      cpf:modal.querySelector('#termoCPF')?.value?.trim()||'',
      empresa:opt.dataset.nome||opt.text,
      cnpj:opt.dataset.cnpj||'',
      cidade:opt.dataset.cidade||'Cascavel',
      uf:opt.dataset.uf||'PR',
      valor:tc.valor||0,
      parcelas:tc.parcelas||1,
      metodo:tc.metodo_pagamento||'a_vista',
      mesInicio:modal.querySelector('#termoMesInicio')?.value||mesAtualISO
    });
    const win=window.open('','_blank','width=860,height=760');
    win.document.write(html);
    win.document.close();
    setTimeout(()=>win.print(),600);
  };
}

async function confirmarTermo(tc){
  const modal=document.getElementById('termosModal');
  const btn=modal.querySelector('#termosConfirmar');
  const fb=modal.querySelector('#termosFeedbackModal');
  btn.disabled=true;
  if(fb){fb.textContent='Processando...';fb.classList.remove('err');}
  try{
    const file=modal.querySelector('#termoFile')?.files?.[0]||null;
    const obs=modal.querySelector('#termoObs')?.value?.trim()||null;
    let termoUrl=tc.termo_url||null;
    if(file){if(fb)fb.textContent='Enviando arquivo...';termoUrl=await uploadTermo(file);}

    const ci=tc.compras_itens||{};
    const sol=ci.compras_solicitacoes||{};
    const payload={
      origem:'COMPRAS',
      origem_id:tc.compra_item_id||null,
      descricao:`Compra: CELULAR | ${tc.colaborador_nome||''}`,
      favorecido:sol.fornecedor||'Fornecedor a definir',
      fornecedor:sol.fornecedor||null,
      contato:sol.telefone_fornecedor||null,
      valor:tc.valor||ci.valor_total||0,
      forma_pagamento:ci.forma_pagamento||'BOLETO',
      dados_pagamento:ci.dados_pagamento||null,
      status:'PENDENTE',
      vencimento:null,
      created_at:new Date().toISOString()
    };
    await safe(()=>supabase.from('financeiro_pagamentos').insert(payload));
    if(tc.compra_item_id) await supabase.from('compras_itens').update({status:'pendente_pagamento'}).eq('id',tc.compra_item_id);
    await supabase.from('termos_celular').update({status:'enviado_financeiro',termo_url:termoUrl,observacao:obs,confirmado_em:new Date().toISOString()}).eq('id',tc.id);
    await notifyFinanceiro(tc,ci);
    modal.classList.remove('open');
    setMsg('Termo confirmado. Compra enviada ao Financeiro.');
    await loadCelular();
  }catch(e){
    if(fb){fb.textContent=e.message;fb.classList.add('err');}
  }finally{
    btn.disabled=false;
  }
}

// ---------- Veículos (termos_veiculos) ----------
// Mesmo fluxo da aba Celular: lançar -> gerar documento pra impressão ->
// anexar o termo assinado. Sem etapa de Financeiro (não há valor a descontar;
// é termo de responsabilidade de uso, não autorização de desconto).

function gerarHTMLTermoVeiculo({nome,cpf,empresa,cnpj,cidade,uf,veiculo,placa}){
  const dataHoje=new Date();
  const diaFormatado=dataHoje.getDate();
  const mesHojeExtenso=mesExtenso(dataHoje.getFullYear(),dataHoje.getMonth()+1);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Termo de Responsabilidade — ${nome}</title>
<style>
@page{size:A4;margin:3cm 2.5cm}
body{font-family:'Times New Roman',Times,serif;font-size:13pt;line-height:1.9;color:#000;background:#fff;margin:0}
h1{text-align:center;font-size:14pt;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;margin:0 0 36px}
p{text-align:justify;margin:0 0 14px}
ol{margin:0 0 14px 22px;padding:0}
ol li{margin-bottom:8px;text-align:justify}
.data-local{text-align:right;margin:40px 0 24px}
.assinatura{margin-top:60px;text-align:center}
.linha-assinatura{display:inline-block;border-top:1px solid #000;padding-top:8px;min-width:320px;text-align:center}
</style></head><body>
<h1>Termo de Responsabilidade de Uso de Veículo</h1>
<p>Eu, <strong>${nome}</strong>, CPF nº <strong>${cpf||'___________________'}</strong>, declaro ter recebido da empresa <strong>${empresa}</strong>, CNPJ nº <strong>${cnpj}</strong>, o veículo <strong>${veiculo||'___________________'}</strong>, placa <strong>${placa||'___________'}</strong>, para uso exclusivo em atividades de trabalho, comprometendo-me a:</p>
<ol>
<li>Zelar pela guarda, conservação e limpeza do veículo, comunicando imediatamente qualquer avaria, defeito ou sinistro;</li>
<li>Utilizá-lo somente em serviço, conduzindo-o com habilitação válida e em observância à legislação de trânsito;</li>
<li>Responsabilizar-me pelas multas e infrações de trânsito cometidas enquanto o veículo estiver sob minha condução, autorizando a indicação do condutor junto ao órgão competente;</li>
<li>Devolver o veículo nas mesmas condições em que o recebi, ressalvado o desgaste natural de uso, quando solicitado pela empresa ou ao término do contrato de trabalho.</li>
</ol>
<div class="data-local"><p>${cidade}, ${uf}, ${diaFormatado} de ${mesHojeExtenso}.</p></div>
<p>Por ser verdade, firmo o presente na forma da lei.</p>
<div class="assinatura"><div class="linha-assinatura"><p>${nome}</p></div></div>
</body></html>`;
}

async function loadVeiculos(){
  state.veiculos=await safe(()=>supabase.from('termos_veiculos').select('*').order('created_at',{ascending:false}).limit(300));
  renderVeiculos();
}

function statusPillVeiculo(s){
  const map={
    aguardando_termo:['#fde68a','rgba(245,158,11,.1)','Aguardando Termo'],
    assinado:['#bbf7d0','rgba(22,101,52,.18)','Assinado']
  };
  const [color,bg,label]=map[s]||['#cbd5e1','rgba(148,163,184,.1)',s||'-'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function renderVeiculos(){
  const body=document.getElementById('termosVeiculosBody');
  if(!body) return;
  if(!state.veiculos.length){
    body.innerHTML=`<tr><td colspan="6" class="termos-empty">Nenhum termo de veículo lançado. Clique em <b>+ Novo Termo</b> para começar.</td></tr>`;
    return;
  }
  body.innerHTML=state.veiculos.map(tv=>`<tr>
    <td>${brDate(tv.created_at)}</td>
    <td><b>${esc(tv.colaborador_nome||'-')}</b></td>
    <td>${esc(tv.veiculo||'-')}</td>
    <td>${esc(tv.placa||'-')}</td>
    <td>${statusPillVeiculo(tv.status)}</td>
    <td class="termos-acoes">
      ${tv.status!=='assinado'?`<button class="btn btn-small btn-primary" data-veic-termo="${esc(tv.id)}" type="button">Criar Termo</button>`:''}
      ${tv.termo_url?`<a class="btn btn-small btn-secondary" href="${esc(tv.termo_url)}" target="_blank" rel="noopener">Ver Termo</a>`:''}
    </td>
  </tr>`).join('');
  body.querySelectorAll('[data-veic-termo]').forEach(b=>b.onclick=()=>openVeiculoTermoModal(b.dataset.veicTermo));
}

function openNovoVeiculoModal(){
  const modal=document.getElementById('termosModal');
  let selecionado=null;
  modal.innerHTML=`<div class="termos-modal-card">
    <div class="section-head"><div><h3>Novo Termo — Veículo</h3><p class="muted">Lance o veículo entregue ao colaborador; o documento é gerado na etapa seguinte.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="adm-cmp-full" style="display:block">Colaborador *<input id="veicColabInput" placeholder="Digite o nome para pesquisar..." autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px"></label>
      <div id="veicColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label>Veículo (modelo) *<input id="veicModelo" placeholder="Ex.: Fiat Strada 1.4"></label>
      <label>Placa *<input id="veicPlaca" placeholder="ABC1D23" maxlength="8"></label>
      <label class="adm-cmp-full">Observação (opcional)<input id="veicObs" placeholder="Ex.: entrega com 45.000 km"></label>
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="veicSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="veicCancelar" type="button">Cancelar</button></div>
    <span class="termos-feedback mt-8" id="veicFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input=modal.querySelector('#veicColabInput');
  const sug=modal.querySelector('#veicColabSug');
  let debounce=null;
  input.addEventListener('input',()=>{
    selecionado=null;
    const q=input.value.trim();
    if(q.length<2){sug.style.display='none';return;}
    clearTimeout(debounce);
    debounce=setTimeout(async()=>{
      const lista=await getColaboradores();
      const nq=norm(q);
      const hits=lista.filter(c=>norm(c.nome).includes(nq)).slice(0,10);
      if(!hits.length){sug.style.display='none';return;}
      sug.innerHTML=hits.map((c,i)=>`<button type="button" data-idx="${i}" style="display:block;width:100%;text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px;margin-bottom:4px;cursor:pointer">${esc(c.nome)}</button>`).join('');
      sug.style.display='block';
      sug.querySelectorAll('button').forEach(b=>b.onmousedown=(ev)=>{ev.preventDefault();selecionado=hits[Number(b.dataset.idx)];input.value=selecionado.nome;sug.style.display='none';});
    },250);
  });
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#veicCancelar').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#veicSalvar').onclick=async()=>{
    const fb=modal.querySelector('#veicFeedback');
    const nome=selecionado?.nome||input.value.trim();
    const veiculo=modal.querySelector('#veicModelo').value.trim();
    const placa=modal.querySelector('#veicPlaca').value.trim().toUpperCase();
    if(!nome){fb.textContent='Selecione o colaborador.';fb.classList.add('err');return;}
    if(!veiculo||!placa){fb.textContent='Informe o veículo e a placa.';fb.classList.add('err');return;}
    try{
      const {error}=await supabase.from('termos_veiculos').insert({
        colaborador_id:selecionado?.id||null,
        colaborador_nome:nome,
        veiculo,
        placa,
        observacao:modal.querySelector('#veicObs').value.trim()||null,
        status:'aguardando_termo'
      });
      if(error) throw error;
      modal.classList.remove('open');
      setMsg('Termo de veículo lançado.');
      await loadVeiculos();
    }catch(e){fb.textContent=e.message;fb.classList.add('err');}
  };
}

async function openVeiculoTermoModal(id){
  const tv=state.veiculos.find(x=>String(x.id)===String(id)); if(!tv) return;
  const modal=document.getElementById('termosModal');
  modal.innerHTML=`<div class="termos-modal-card"><p style="color:var(--muted);padding:20px">Carregando...</p></div>`;
  modal.classList.add('open');

  const [cpf]=await Promise.all([fetchCPF(tv.colaborador_id),loadEmpresas()]);
  const optEmpresas=state.empresas.map(e=>`<option value="${esc(e.id)}" data-nome="${esc((e.nome||'').trim())}" data-cnpj="${esc(e.cpf_cnpj||'')}" data-cidade="${esc(e.cidade||'Cascavel')}" data-uf="${esc(e.uf||'PR')}">${esc((e.nome||'').trim())} — ${esc(e.cpf_cnpj||'')}</option>`).join('');

  modal.innerHTML=`<div class="termos-modal-card">
    <div class="section-head">
      <div><h3>Criar Termo — Veículo</h3><p class="muted">Gere o documento, imprima, colete a assinatura e anexe abaixo.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="termos-detail-grid mt-16">
      <div><span class="muted">Colaborador</span><b>${esc(tv.colaborador_nome||'-')}</b></div>
      <div><span class="muted">Veículo</span><b>${esc(tv.veiculo||'-')}</b></div>
      <div><span class="muted">Placa</span><b>${esc(tv.placa||'-')}</b></div>
    </div>
    <div class="termos-gerar-box mt-16">
      <p class="termos-gerar-title">1. Gerar documento</p>
      <div class="adm-cmp-grid">
        <label class="adm-cmp-full">Empresa / CNPJ
          <select id="veicTermoEmpresa"><option value="">— Selecione a empresa —</option>${optEmpresas}</select>
        </label>
        <label>CPF do Colaborador<input id="veicTermoCPF" placeholder="000.000.000-00" value="${esc(cpf)}"></label>
      </div>
      <div class="adm-cmp-actions mt-12"><button class="btn btn-secondary" id="veicGerarBtn" type="button">Imprimir Termo</button></div>
    </div>
    <div class="termos-gerar-box mt-16">
      <p class="termos-gerar-title">2. Anexar termo assinado</p>
      <div class="adm-cmp-grid">
        <label class="adm-cmp-full">Arquivo do Termo Assinado<input id="veicTermoFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
        <label class="adm-cmp-full">Observação (opcional)<input id="veicTermoObs" value="${esc(tv.observacao||'')}"></label>
      </div>
      <div class="adm-cmp-actions mt-12">
        <button class="btn btn-primary" id="veicConfirmar" type="button">Confirmar Termo Assinado</button>
        <button class="btn btn-secondary" id="veicCancelar" type="button">Cancelar</button>
      </div>
    </div>
    <span class="termos-feedback mt-8" id="veicTermoFb"></span>
  </div>`;

  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#veicCancelar').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#veicGerarBtn').onclick=()=>{
    const sel=modal.querySelector('#veicTermoEmpresa');
    const opt=sel?.options[sel.selectedIndex];
    const fb=modal.querySelector('#veicTermoFb');
    if(!opt?.value){fb.textContent='Selecione a empresa.';fb.classList.add('err');return;}
    const html=gerarHTMLTermoVeiculo({
      nome:tv.colaborador_nome||'',
      cpf:modal.querySelector('#veicTermoCPF')?.value?.trim()||'',
      empresa:opt.dataset.nome||opt.text,
      cnpj:opt.dataset.cnpj||'',
      cidade:opt.dataset.cidade||'Cascavel',
      uf:opt.dataset.uf||'PR',
      veiculo:tv.veiculo||'',
      placa:tv.placa||''
    });
    const win=window.open('','_blank','width=860,height=760');
    win.document.write(html);
    win.document.close();
    setTimeout(()=>win.print(),600);
  };
  modal.querySelector('#veicConfirmar').onclick=async()=>{
    const btn=modal.querySelector('#veicConfirmar');
    const fb=modal.querySelector('#veicTermoFb');
    btn.disabled=true;
    fb.textContent='Processando...';fb.classList.remove('err');
    try{
      const file=modal.querySelector('#veicTermoFile')?.files?.[0]||null;
      if(!file&&!tv.termo_url) throw new Error('Anexe o termo assinado antes de confirmar.');
      let termoUrl=tv.termo_url||null;
      if(file){fb.textContent='Enviando arquivo...';termoUrl=await uploadTermo(file);}
      const {error}=await supabase.from('termos_veiculos').update({
        status:'assinado',
        termo_url:termoUrl,
        observacao:modal.querySelector('#veicTermoObs')?.value?.trim()||null,
        assinado_em:new Date().toISOString()
      }).eq('id',tv.id);
      if(error) throw error;
      modal.classList.remove('open');
      setMsg('Termo de veículo confirmado.');
      await loadVeiculos();
    }catch(e){fb.textContent=e.message;fb.classList.add('err');}
    finally{btn.disabled=false;}
  };
}

function styles(){return `<style>
.termos-tabs{display:flex;gap:8px;flex-wrap:wrap}.termos-tabs .active{background:#166534!important;color:#fff!important}
.termos-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.termos-table{width:100%;border-collapse:collapse;min-width:760px}.termos-table th,.termos-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}.termos-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.termos-empty{text-align:center;color:var(--muted)}.termos-acoes{display:flex;gap:8px;flex-wrap:wrap}
.termos-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.termos-modal.open{display:flex}.termos-modal-card{width:min(760px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
.termos-detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.termos-detail-grid>div{display:flex;flex-direction:column;gap:4px}.termos-detail-grid .muted{font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.termos-gerar-box{border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:16px;background:rgba(15,23,42,.4)}.termos-gerar-title{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;margin:0 0 12px}
.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input,.adm-cmp-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;appearance:none}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-grid input[type=month]{cursor:pointer}.adm-cmp-full{grid-column:1/-1}.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}
.termos-feedback{font-weight:700;display:block}.termos-feedback.err{color:#fecaca}
@media(max-width:640px){.termos-detail-grid{grid-template-columns:1fr}.adm-cmp-grid{grid-template-columns:1fr}}
</style>`}

export async function renderContent(content){
  content.innerHTML=`${styles()}
  <section class="hero-card"><div><div class="eyebrow">Conferência</div><h2>Termos</h2><p>Gestão de termos de responsabilidade para compras especiais que exigem assinatura antes do pagamento.</p></div><div class="hero-badge-wrap"><span class="hero-badge">CONF</span></div></section>
  <section class="grid-cards mt-16">
    <article class="card"><h3>Aguardando Termo</h3><p class="metric" id="kpiTermosPend">0</p><p class="muted">Celulares aguardando assinatura.</p></article>
    <article class="card"><h3>Enviados ao Financeiro</h3><p class="metric" id="kpiTermosConf">0</p><p class="muted">Termos confirmados.</p></article>
    <article class="card"><h3>Total</h3><p class="metric" id="kpiTermosTotal">0</p><p class="muted">Total de registros.</p></article>
  </section>
  <section class="card mt-16">
    <div class="section-head">
      <div class="termos-tabs">
        <button class="btn btn-secondary active" data-termos-tab="celular" type="button">Celular</button>
        <button class="btn btn-secondary" data-termos-tab="veiculos" type="button">Veículos</button>
      </div>
      <button class="btn btn-secondary" id="termosRefresh" type="button">↻ Atualizar</button>
    </div>
    <div id="termosTabCelular" class="mt-16">
      <div class="termos-table-wrap">
        <table class="termos-table">
          <thead><tr><th>Data</th><th>Colaborador</th><th>Compra</th><th>Valor</th><th>Parcelas</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody id="termosCelularBody"></tbody>
        </table>
      </div>
    </div>
    <div id="termosTabVeiculos" class="mt-16" style="display:none">
      <div class="adm-cmp-actions" style="justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" id="veicNovo" type="button">+ Novo Termo</button>
      </div>
      <div class="termos-table-wrap">
        <table class="termos-table">
          <thead><tr><th>Data</th><th>Colaborador</th><th>Veículo</th><th>Placa</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody id="termosVeiculosBody"></tbody>
        </table>
      </div>
    </div>
    <span class="termos-feedback mt-8" id="termosFeedbackMain"></span>
  </section>
  <div class="termos-modal" id="termosModal"></div>`;

  document.querySelectorAll('[data-termos-tab]').forEach(b=>b.onclick=()=>{
    state.tab=b.dataset.termosTab;
    document.querySelectorAll('[data-termos-tab]').forEach(x=>x.classList.toggle('active',x===b));
    document.getElementById('termosTabCelular').style.display=state.tab==='celular'?'block':'none';
    document.getElementById('termosTabVeiculos').style.display=state.tab==='veiculos'?'block':'none';
  });
  document.getElementById('termosRefresh').onclick=()=>{loadCelular();loadVeiculos();};
  document.getElementById('veicNovo').onclick=openNovoVeiculoModal;
  await Promise.all([loadCelular(),loadVeiculos()]);
}

initProtectedPage('Termos', renderContent);
