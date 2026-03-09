/**
 * assets/js/modules/financeiro.js
 * Financeiro — Inbox de solicitações (vinculado ao Compras)
 *
 * ✅ Padrão Painel Web: window.FINANCEIRO.openHome(container, opts)
 * - Lista pedidos do Compras em PAGAMENTO (ou com __PgtoStatus)
 * - Card UI (ERP) + filtros + modal de pagamento + upload comprovante
 */
(function(){
  const MOD = {};
  const esc = (s)=>String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

  function getToken_(opts){
    const t = (opts && (opts.token || (opts.auth && opts.auth.token))) ? (opts.token || opts.auth.token) : "";
    if (t) return String(t).trim();
    try{ const lt=(localStorage.getItem('g1000_token')||'').trim(); if (lt) return lt; }catch(_){ }
    return "";
  }

  function toast_(msg, kind){
    try{
      if (window.toast) return window.toast(String(msg||""), kind||"info");
      if (window.TOAST && typeof window.TOAST.show === 'function') return window.TOAST.show(String(msg||""), kind||"info");
    }catch(_){ }
    try{ console.log('[toast]', kind||'', msg); }catch(_){ }
    try{ alert(String(msg||"")); }catch(_){ }
  }

  async function apiAdm_(opts, action, payload){
    const api = opts && (opts.api || window.API);
    if (!api || typeof api.post !== 'function') throw new Error('API.post não disponível.');
    const token = getToken_(opts);
    const body = Object.assign({ module:'adm', action, token }, payload||{});
    const res = await api.post(body);
    if (!res) throw new Error('Sem resposta do servidor.');
    if (res.ok === false) throw new Error(res.error || res.message || 'Erro');
    return res;
  }

  function fmtDate_(v){
    const s = String(v||"").trim();
    if (!s) return "-";
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0,10);
    const d = new Date(s);
    if (!isNaN(d.getTime())){
      const dd=String(d.getDate()).padStart(2,'0');
      const mm=String(d.getMonth()+1).padStart(2,'0');
      const yy=d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
    return s;
  }

  function fmtDT_(v){
    const s = String(v||"").trim();
    if (!s) return "-";
    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())){
      const dd=String(d.getDate()).padStart(2,'0');
      const mm=String(d.getMonth()+1).padStart(2,'0');
      const yy=d.getFullYear();
      const hh=String(d.getHours()).padStart(2,'0');
      const mi=String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yy} ${hh}:${mi}`;
    }
    return s;
  }

  function fmtMoney_(v){
    if (v == null || v === "") return "-";
    const raw = String(v);
    const n = typeof v === 'number' ? v : Number(raw.replace(/[^0-9,.-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));
    if (!isFinite(n)) return raw;
    try{ return n.toLocaleString('pt-BR',{ style:'currency', currency:'BRL' }); }catch(_){ return `R$ ${n.toFixed(2)}`; }
  }

  function normStatus_(s){
    s = String(s||"").trim().toUpperCase();
    if (!s) return 'SOLICITADO';
    if (s === 'COMPROVANTE' || s === 'COMPROVANTE_ANEXADO') return 'COMPROVANTE ANEXADO';
    if (s === 'PAGO' || s === 'PAGAMENTO_OK') return 'PAGO';
    return s;
  }

  function statusCls_(s){
    const n = normStatus_(s);
    if (n === 'PAGO') return 'st-ok';
    if (n === 'COMPROVANTE ANEXADO') return 'st-warn';
    return 'st-info';
  }

  function copy_(txt){
    const t = String(txt||"");
    if (!t) return toast_('PIX vazio.', 'warn');
    try{
      navigator.clipboard.writeText(t);
      toast_('PIX copiado ✅', 'ok');
      return;
    }catch(_){ }
    try{
      const ta=document.createElement('textarea');
      ta.value=t; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      toast_('PIX copiado ✅', 'ok');
    }catch(e){ toast_('Não consegui copiar automaticamente.', 'warn'); }
  }

  function fileToBase64_(file){
    return new Promise((resolve,reject)=>{
      const rd = new FileReader();
      rd.onload = ()=>{
        const s = String(rd.result||"");
        resolve(s.includes('base64,') ? s.split('base64,')[1] : s);
      };
      rd.onerror = reject;
      rd.readAsDataURL(file);
    });
  }

  MOD.openHome = async function openHome(container, opts = {}){
    const st = { pedidos: [], q:"", filtroStatus:"TODOS", filtroConta:"TODAS", updatedAt:null };

    container.innerHTML = `
      <style>
        /* Base */
        .finRoot{ color:#e5e7eb; }
        .finTop{ display:flex; gap:10px; align-items:flex-start; justify-content:space-between; padding:12px 12px 6px 12px; }
        .finTitle{ font-size:18px; font-weight:900; letter-spacing:.2px; }
        .finSub{ opacity:.82; margin-top:2px; }
        .finTopRight{ display:flex; gap:10px; align-items:center; }
        .finBtn{ height:38px; padding:0 14px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:#0f172a; color:#e5e7eb; cursor:pointer; }
        .finBtn:hover{ border-color: rgba(34,197,94,.55); }

        .finFilters{ display:grid; grid-template-columns: 1fr 220px 240px; gap:10px; padding:0 12px 10px 12px; }
        .finSearch{ height:42px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:#0b1220; color:#e5e7eb; padding:0 12px; }
        .finSelect{ height:42px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:#0f172a; color:#e5e7eb; padding:0 10px; color-scheme:dark; }
        .finSelect option{ background:#0f172a; color:#e5e7eb; }
        .finMetaRow{ display:flex; gap:10px; align-items:center; justify-content:space-between; padding:0 12px; }
        .finHint{ opacity:.8; }
        .finUpdated{ opacity:.65; font-size:12px; }

        /* Cards */
        .finGrid{ padding:12px; display:grid; grid-template-columns: 1fr; gap:12px; }
        .finCard{ background:#0b1220; border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:14px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
        .finHead{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .finCat{ font-weight:900; letter-spacing:.2px; opacity:.95; }
        .finBadge{ display:inline-flex; align-items:center; gap:8px; padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.14); font-size:12px; background:#0f172a; }
        .st-info{ background: rgba(30,58,138,.35); border-color: rgba(30,58,138,.55); }
        .st-warn{ background: rgba(133,77,14,.35); border-color: rgba(133,77,14,.55); }
        .st-ok{ background: rgba(22,101,52,.35); border-color: rgba(22,101,52,.55); }

        .finBody{ margin-top:10px; display:grid; grid-template-columns: 1fr 280px; gap:12px; }
        .finLeft{ min-width:0; }
        .finRight{ min-width:0; background: rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:14px; padding:12px; }

        .finLine{ display:flex; gap:10px; align-items:baseline; }
        .finLbl{ width:110px; opacity:.75; font-weight:700; font-size:12px; }
        .finVal{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .finCode{ font-size:13px; font-weight:900; }
        .finItem{ margin-top:8px; font-weight:800; }
        .finValue{ margin-top:4px; font-size:20px; font-weight:900; color:#22c55e; }
        .finSmall{ font-size:12px; opacity:.8; margin-top:4px; }
        .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; }

        .finPixBox{ background:#0f172a; border:1px solid rgba(255,255,255,.10); border-radius:12px; padding:10px; }
        .finPix{ font-size:12px; opacity:.95; word-break:break-all; }

        .finActions{ display:flex; gap:10px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap; }
        .finAct{ height:38px; padding:0 14px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:#0f172a; color:#e5e7eb; cursor:pointer; }
        .finAct.primary{ background: rgba(22,101,52,.35); border-color: rgba(34,197,94,.55); }
        .finAct.primary:hover{ background: rgba(22,101,52,.55); }

        /* Modal */
        .finModalBg{ position:fixed; inset:0; background: rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:9999; padding:18px; }
        .finModal{ width:min(860px, 96vw); background:#0b1220; border:1px solid rgba(255,255,255,.10); border-radius:18px; box-shadow: 0 20px 60px rgba(0,0,0,.45); overflow:hidden; }
        .finModalHead{ display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background: rgba(255,255,255,.03); border-bottom:1px solid rgba(255,255,255,.08); }
        .finModalTitle{ font-weight:900; }
        .finModalBody{ padding:16px; display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        .finField label{ display:block; font-size:12px; opacity:.8; margin-bottom:6px; font-weight:700; }
        .finField input, .finField select, .finField textarea{ width::100%; width:100%; height:42px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:#0f172a; color:#e5e7eb; padding:0 10px; color-scheme:dark; }
        .finField textarea{ height:92px; padding:10px; resize:vertical; }
        .finModalFoot{ display:flex; justify-content:flex-end; gap:10px; padding:14px 16px; border-top:1px solid rgba(255,255,255,.08); }
        .finFile{ padding-top:10px; }
        .finFile input{ height:auto; padding:10px; }
        @media (max-width: 860px){ .finBody{ grid-template-columns: 1fr; } .finModalBody{ grid-template-columns: 1fr; } .finFilters{ grid-template-columns:1fr; } }
      </style>

      <div class="finRoot">
        <div class="finTop">
          <div>
            <div class="finTitle">Financeiro</div>
            <div class="finSub">Solicitações de pagamento vindas do Compras</div>
          </div>
          <div class="finTopRight">
            <button class="finBtn" id="finReload">Recarregar</button>
            <button class="finBtn" id="finBack">Voltar</button>
          </div>
        </div>

        <div class="finFilters">
          <input class="finSearch" id="finSearch" placeholder="Buscar por código, solicitante, fornecedor, item…" />
          <select class="finSelect" id="finStatus">
            <option value="TODOS">Status: todos</option>
            <option value="SOLICITADO">Status: solicitado</option>
            <option value="COMPROVANTE ANEXADO">Status: comprovante anexado</option>
            <option value="PAGO">Status: pago</option>
          </select>
          <select class="finSelect" id="finConta">
            <option value="TODAS">Conta: todas</option>
          </select>
        </div>

        <div class="finMetaRow">
          <div class="finHint" id="finHint">Carregando…</div>
          <div class="finUpdated" id="finUpdated"></div>
        </div>

        <div class="finGrid" id="finGrid"></div>
      </div>
    `;

    const back = container.querySelector('#finBack');
    back.addEventListener('click', ()=>{ if (opts.onBack) opts.onBack(); });

    container.querySelector('#finSearch').addEventListener('input',(e)=>{
      st.q = String(e.target.value||'').trim().toLowerCase();
      render_();
    });
    container.querySelector('#finStatus').addEventListener('change',(e)=>{
      st.filtroStatus = String(e.target.value||'TODOS');
      render_();
    });
    container.querySelector('#finConta').addEventListener('change',(e)=>{
      st.filtroConta = String(e.target.value||'TODAS');
      render_();
    });
    container.querySelector('#finReload').addEventListener('click', async ()=>{ await load_(); });

    function buildContaOptions_(){
      const sel = container.querySelector('#finConta');
      const cur = st.filtroConta || 'TODAS';
      const set = new Set();
      st.pedidos.forEach(p=>{
        const c = String((p.meta && (p.meta.pgtoConta || p.meta.contaPagante || p.meta.conta)) || '').trim();
        if (c) set.add(c);
      });
      const contas = Array.from(set).sort((a,b)=>a.localeCompare(b,'pt-BR'));
      sel.innerHTML = `<option value="TODAS">Conta: todas</option>` + contas.map(c=>`<option value="${esc(c)}">Conta: ${esc(c)}</option>`).join('');
      // restaura seleção
      try{ sel.value = contas.includes(cur) ? cur : 'TODAS'; st.filtroConta = sel.value; }catch(_){ }
    }

    async function load_(){
      container.querySelector('#finHint').textContent = 'Carregando…';
      container.querySelector('#finGrid').innerHTML = '';
      container.querySelector('#finUpdated').textContent = '';

      const r = await apiAdm_(opts, 'adm_compras_listPedidos', { limit: 2000 });
      const arr = Array.isArray(r.data) ? r.data : Array.isArray(r.pedidos) ? r.pedidos : [];

      st.pedidos = arr.map(p=>{
        const status = String(p.status||p.__status||'').toUpperCase();
        const meta = p.meta || {};
        const codigo = meta.pgtoCodigo || '';
        const pgtoStatus = normStatus_(meta.pgtoStatus || meta.__PgtoStatus || '');
        return { ...p, meta, __status: status, __codigo: codigo, __pgtoStatus: pgtoStatus };
      }).filter(p=>{
        const s = String(p.__status||'');
        return s === 'PAGAMENTO' || String(p.__pgtoStatus||'').toUpperCase().includes('SOLICIT') || String(p.__pgtoStatus||'').toUpperCase().includes('COMPROV') || String(p.__pgtoStatus||'').toUpperCase().includes('PAGO');
      });

      st.updatedAt = new Date();
      buildContaOptions_();
      render_();
    }

    function render_(){
      const hint = container.querySelector('#finHint');
      const updated = container.querySelector('#finUpdated');
      const grid = container.querySelector('#finGrid');

      if (st.updatedAt) updated.textContent = 'Atualizado: ' + fmtDT_(st.updatedAt);

      const q = st.q;
      const fs = st.filtroStatus;
      const fc = st.filtroConta;

      let list = st.pedidos.slice();

      // filtros
      if (fs && fs !== 'TODOS'){
        list = list.filter(p=> normStatus_(p.meta?.pgtoStatus || p.__pgtoStatus) === fs);
      }
      if (fc && fc !== 'TODAS'){
        list = list.filter(p=> String((p.meta && (p.meta.pgtoConta || p.meta.contaPagante || p.meta.conta))||'').trim() === fc);
      }
      if (q){
        list = list.filter(p=>{
          const meta = p.meta || {};
          const itens = Array.isArray(meta.itens) ? meta.itens : Array.isArray(p.itens) ? p.itens : [];
          const itemTxt = itens.map(it=>it.nome||it.item||it.descricao||'').filter(Boolean).join(' ');
          const blob = [
            meta.pgtoCodigo, meta.pgtoStatus, meta.pgtoConta,
            meta.pgtoSolicitante, p.solicitante, p.gestor,
            meta.pgtoFornecedor, meta.fornecedor, p.fornecedor,
            meta.pgtoContato, meta.contato,
            meta.pgtoPix, meta.pix,
            p.resumo, itemTxt
          ].filter(Boolean).join(' ').toLowerCase();
          return blob.includes(q);
        });
      }

      // ordenação: solicitados primeiro
      const w = (p)=>{
        const s = normStatus_(p.meta?.pgtoStatus || p.__pgtoStatus);
        if (s === 'SOLICITADO') return 1;
        if (s === 'COMPROVANTE ANEXADO') return 2;
        if (s === 'PAGO') return 3;
        return 9;
      };
      list.sort((a,b)=> w(a)-w(b));

      if (!list.length){
        hint.textContent = 'Nenhuma solicitação encontrada.';
        grid.innerHTML = '';
        return;
      }

      hint.textContent = `${list.length} solicitação(ões)`;

      grid.innerHTML = list.map(p=>renderCard_(p)).join('');

      // bind actions (delegation)
      grid.querySelectorAll('[data-act="copy"]')?.forEach(btn=>{
        btn.addEventListener('click', ()=> copy_(btn.getAttribute('data-pix')||''));
      });
      grid.querySelectorAll('[data-act="pay"]')?.forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const json = btn.getAttribute('data-json')||'{}';
          try{ openPayModal_(JSON.parse(decodeURIComponent(json))); }catch(e){ toast_('Falha ao abrir pagamento.', 'error'); }
        });
      });
    }

    function renderCard_(p){
      const meta = p.meta || {};
      const itens = Array.isArray(meta.itens) ? meta.itens : Array.isArray(p.itens) ? p.itens : [];
      const qt = meta.pgtoQt ?? meta.qtd ?? (itens.reduce((a,it)=>a + (Number(it.qtd||it.qt||0)||0), 0) || '-');
      const item = meta.pgtoMaterial || meta.material || p.resumo || (itens.map(it=>it.nome||it.item||it.descricao).filter(Boolean).join('; ') || '-');
      const valor = meta.pgtoValor ?? meta.valor ?? meta.valorTotal ?? meta.total;
      const solicitante = meta.pgtoSolicitante || p.solicitante || p.gestor || '-';
      const regional = meta.pgtoRegional || p.regional || p.coordenacao || '-';
      const autorizador = meta.pgtoAutorizador || p.autorizador || meta.autorizador || '-';
      const dataSolic = meta.pgtoDataSolicit || meta.pgtoData || p.dataSolicit || p.timestamp || p.Timestamp;
      const fornecedor = meta.pgtoVendedor || meta.pgtoFornecedor || meta.fornecedor || p.fornecedor || '-';
      const pix = meta.pgtoPix || meta.pgtoLink || meta.pix || meta.link || '';
      const telefone = meta.pgtoContato || meta.contato || meta.telefoneFornecedor || '';
      const conta = meta.pgtoConta || meta.contaPagante || meta.conta || '';
      const compUrl = meta.pgtoComprovanteUrl || meta.comprovanteUrl || '';
      const stt = normStatus_(meta.pgtoStatus || p.__pgtoStatus || 'SOLICITADO');

      const payload = {
        codigo: meta.pgtoCodigo || p.__codigo || '',
        status: stt,
        tipo: (p.tipoLabel || p.tipo || 'PEDIDO'),
        solicitante, regional, autorizador,
        item, qt, valor,
        fornecedor,
        pix,
        telefone,
        conta,
        compraObs: meta.compraObs || '',
        comprovanteUrl: compUrl
      };
      const dataJson = encodeURIComponent(JSON.stringify(payload));

      return `
        <div class="finCard">
          <div class="finHead">
            <div class="finCat">${esc(payload.tipo)}</div>
            <div class="finBadge ${statusCls_(stt)}">${esc(stt)}</div>
          </div>

          <div class="finBody">
            <div class="finLeft">
              <div class="finLine"><div class="finLbl">Código</div><div class="finVal finCode">${esc(payload.codigo || '-')}</div></div>
              <div class="finLine"><div class="finLbl">Solicitante</div><div class="finVal">${esc(solicitante)}</div></div>
              <div class="finLine"><div class="finLbl">Regional</div><div class="finVal">${esc(regional)}</div></div>
              <div class="finLine"><div class="finLbl">Autorizador</div><div class="finVal">${esc(autorizador)}</div></div>
              <div class="finLine"><div class="finLbl">Data</div><div class="finVal">${esc(fmtDate_(dataSolic))}</div></div>

              <div class="finItem">${esc(item)}</div>
              <div class="finSmall">Qt: <b>${esc(qt)}</b></div>
              <div class="finValue">${esc(fmtMoney_(valor))}</div>
              ${meta.compraObs ? `<div class="finSmall"><b>Obs:</b> ${esc(String(meta.compraObs)).slice(0,220)}</div>` : ``}
            </div>

            <div class="finRight">
              <div class="finLine"><div class="finLbl">Fornecedor</div><div class="finVal">${esc(fornecedor)}</div></div>
              <div class="finLine"><div class="finLbl">Telefone</div><div class="finVal">${esc(telefone || '-') }</div></div>
              <div class="finLine"><div class="finLbl">Conta</div><div class="finVal">${esc(conta || '-') }</div></div>
              ${compUrl ? `<div class="finSmall"><b>Comprovante:</b> <a href="${esc(compUrl)}" target="_blank" style="color:#60a5fa">abrir</a></div>` : ``}

              <div class="finSmall" style="margin-top:10px; opacity:.85; font-weight:800;">PIX</div>
              <div class="finPixBox"><div class="finPix mono">${esc(pix || '-')}</div></div>

              <div class="finActions">
                <button class="finAct" data-act="copy" data-pix="${esc(pix)}">Copiar PIX</button>
                <button class="finAct primary" data-act="pay" data-json="${dataJson}">Realizar pagamento</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function openPayModal_(p){
      const bg = document.createElement('div');
      bg.className = 'finModalBg';
      bg.innerHTML = `
        <div class="finModal" role="dialog" aria-modal="true">
          <div class="finModalHead">
            <div>
              <div class="finModalTitle">Realizar pagamento — ${esc(p.codigo || '-') }</div>
              <div style="opacity:.75; font-size:12px; margin-top:2px;">Fornecedor: ${esc(p.fornecedor||'-')}</div>
            </div>
            <button class="finBtn" data-close="1">Fechar</button>
          </div>

          <div class="finModalBody">
            <div class="finField">
              <label>Valor (R$)</label>
              <input id="mValor" placeholder="0,00" value="${esc(String(p.valor ?? '').replace('.',','))}" />
            </div>

            <div class="finField">
              <label>Conta pagante</label>
              <select id="mConta" class="finSelect" style="width:100%">
                <option value="">Selecione…</option>
                <option value="BB - MATRIZ">BB - MATRIZ</option>
                <option value="SICOOB - AGRO">SICOOB - AGRO</option>
                <option value="CAIXA - ADM">CAIXA - ADM</option>
                <option value="OUTRA">Outra…</option>
              </select>
            </div>

            <div class="finField" style="grid-column: 1 / -1;">
              <label>PIX</label>
              <input id="mPix" class="mono" readonly value="${esc(p.pix || '')}" />
              <div style="margin-top:8px; display:flex; gap:10px; justify-content:flex-end;">
                <button class="finAct" type="button" data-copy="1">Copiar PIX</button>
              </div>
            </div>

            <div class="finField finFile" style="grid-column: 1 / -1;">
              <label>Comprovante (PDF/JPG/PNG)</label>
              <input id="mFile" type="file" accept="application/pdf,image/png,image/jpeg" />
              <div class="finSmall" id="mFileHint" style="margin-top:6px;">Anexe o comprovante para enviar.</div>
            </div>

            <div class="finField" style="grid-column: 1 / -1;">
              <label>Telefone do fornecedor (para enviar no BotConversa)</label>
              <input id="mTel" placeholder="(xx) xxxxx-xxxx" value="${esc(p.telefone || '')}" />
            </div>

            <div class="finField" style="grid-column: 1 / -1; display:none;" id="mOutraWrap">
              <label>Outra conta (nome)</label>
              <input id="mOutra" placeholder="Ex.: ITAÚ - FILIAL" />
            </div>
          </div>

          <div class="finModalFoot">
            <button class="finBtn" data-close="1">Cancelar</button>
            <button class="finAct primary" id="mSend">Enviar comprovante</button>
          </div>
        </div>
      `;

      const close = ()=>{ try{ bg.remove(); }catch(_){ } };
      bg.addEventListener('click', (e)=>{ if (e.target === bg) close(); });
      bg.querySelectorAll('[data-close="1"]').forEach(b=> b.addEventListener('click', close));
      bg.querySelector('[data-copy="1"]').addEventListener('click', ()=>copy_(p.pix||''));

      const selConta = bg.querySelector('#mConta');
      const outraWrap = bg.querySelector('#mOutraWrap');
      const inputOutra = bg.querySelector('#mOutra');
      // pré-seleção
      const contaPre = String(p.conta||'').trim();
      if (contaPre){
        const opts = Array.from(selConta.options).map(o=>o.value);
        if (opts.includes(contaPre)) selConta.value = contaPre;
        else { selConta.value = 'OUTRA'; outraWrap.style.display='block'; inputOutra.value = contaPre; }
      }

      selConta.addEventListener('change', ()=>{
        const v = selConta.value;
        if (v === 'OUTRA'){ outraWrap.style.display='block'; }
        else { outraWrap.style.display='none'; inputOutra.value=''; }
      });

      const fileInp = bg.querySelector('#mFile');
      const fileHint = bg.querySelector('#mFileHint');
      fileInp.addEventListener('change', ()=>{
        const f = fileInp.files && fileInp.files[0];
        fileHint.textContent = f ? `Arquivo: ${f.name} (${Math.round(f.size/1024)} KB)` : 'Anexe o comprovante para enviar.';
      });

      bg.querySelector('#mSend').addEventListener('click', async ()=>{
        try{
          const f = fileInp.files && fileInp.files[0];
          if (!f) return toast_('Anexe o comprovante.', 'warn');

          const vSel = String(selConta.value||'').trim();
          let conta = vSel;
          if (!conta) return toast_('Selecione a conta pagante.', 'warn');
          if (conta === 'OUTRA'){
            conta = String(inputOutra.value||'').trim();
            if (!conta) return toast_('Informe o nome da conta.', 'warn');
          }

          const base64 = await fileToBase64_(f);
          const telefoneFornecedor = String(bg.querySelector('#mTel').value||'').trim();

          bg.querySelector('#mSend').disabled = true;
          bg.querySelector('#mSend').textContent = 'Enviando…';

          await apiAdm_(opts, 'financeiro_enviarComprovante', {
            payload: {
              codigo: p.codigo,
              contaPagante: conta,
              telefoneFornecedor,
              valor: bg.querySelector('#mValor').value || '',
              pix: p.pix || '',
              fileName: f.name,
              mimeType: f.type || 'application/octet-stream',
              base64
            }
          });

          toast_('Comprovante enviado ✅', 'ok');
          close();
          await load_();
        }catch(e){
          try{ bg.querySelector('#mSend').disabled = false; bg.querySelector('#mSend').textContent = 'Enviar comprovante'; }catch(_){ }
          toast_(String(e?.message||e), 'error');
        }
      });

      document.body.appendChild(bg);
    }

    await load_();
  };

  window.FINANCEIRO = MOD;
})();
