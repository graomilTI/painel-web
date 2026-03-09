// assets/js/modules/correios.js
// Padrão: expõe window.CORREIOS.openHome(container, opts)

(function(){
  if (window.CORREIOS && window.CORREIOS.openHome) return;

  const THEME = {
    bg: '#0b1220',
    card: '#0f172a',
    line: 'rgba(255,255,255,.12)',
    text: '#e5e7eb',
    muted: 'rgba(229,231,235,.75)',
    green: '#16a34a',
    greenDark: '#166534'
  };

  function el(tag, attrs={}, children=[]) {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of (Array.isArray(children)?children:[children])) {
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function css(){
    return `
      .correios-root{padding:14px;color:${THEME.text}}
      .correios-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      .correios-title{font-size:18px;font-weight:800}
      .correios-sub{font-size:12px;opacity:.85}

      .correios-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
      .correios-tab{height:34px;padding:0 12px;border-radius:10px;border:1px solid ${THEME.line};background:${THEME.card};color:${THEME.text};cursor:pointer}
      .correios-tab.on{border-color:${THEME.green};box-shadow:0 0 0 2px rgba(22,163,74,.18) inset}

      .correios-card{background:${THEME.card};border:1px solid ${THEME.line};border-radius:14px;padding:12px}
      .correios-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:10px}
      .correios-col-12{grid-column:span 12}
      .correios-col-6{grid-column:span 6}
      .correios-col-4{grid-column:span 4}
      .correios-col-3{grid-column:span 3}
      .correios-col-2{grid-column:span 2}
      @media(max-width:980px){
        .correios-col-6,.correios-col-4,.correios-col-3,.correios-col-2{grid-column:span 12}
      }

      .correios-label{font-size:12px;opacity:.9;margin-bottom:6px}
      .correios-input,.correios-select,.correios-textarea{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid ${THEME.line};background:${THEME.bg};color:${THEME.text};padding:10px 10px;outline:none}
      .correios-textarea{min-height:80px;resize:vertical}

      /* Padrão de dropdown escuro */
      .correios-select{color-scheme: dark;}
      .correios-select option{background:${THEME.bg};color:${THEME.text}}
      .correios-select option:checked{background:${THEME.greenDark};}

      .correios-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px}
      .correios-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid ${THEME.line};background:${THEME.bg};color:${THEME.text};cursor:pointer}
      .correios-btn.primary{background:${THEME.green};border-color:${THEME.green};color:#05210f;font-weight:800}

      .correios-table{width:100%;border-collapse:collapse;overflow:hidden;border-radius:12px;border:1px solid ${THEME.line}}
      .correios-table th,.correios-table td{padding:10px;border-bottom:1px solid ${THEME.line};font-size:12px;text-align:left}
      .correios-table th{background:rgba(255,255,255,.04)}
      .correios-table tr:hover td{background:rgba(22,163,74,.08)}

      .correios-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid ${THEME.line};font-size:12px;opacity:.95}
      .correios-pill.ok{border-color:rgba(22,163,74,.5)}
      .correios-pill.warn{border-color:rgba(245,158,11,.5)}
      .correios-pill.bad{border-color:rgba(239,68,68,.5)}

      .correios-muted{color:${THEME.muted}}
      .correios-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace}
    `;
  }

  function baseFromAuth(opts){
    const apiBase = (opts?.auth?.API_BASE || window.API_BASE || '').trim();
    return apiBase.replace(/\/+$/, '');
  }

  async function jfetch(url, opts={}){
    const r = await fetch(url, opts);
    const txt = await r.text();
    try{ return JSON.parse(txt); } catch { return { ok: r.ok, raw: txt, status: r.status }; }
  }

  function setView(root, name){
    root.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('on', b.getAttribute('data-tab')===name));
    root.querySelectorAll('[data-view]').forEach(v=>v.style.display = (v.getAttribute('data-view')===name)?'block':'none');
  }

  function pillStatus(status){
    const s = String(status||'').toUpperCase();
    let cls = 'correios-pill';
    if (s.includes('OK') || s.includes('APROVADO')) cls += ' ok';
    else if (s.includes('PENDENTE')) cls += ' warn';
    else if (s.includes('ERRO') || s.includes('RECUS')) cls += ' bad';
    return el('span', { class: cls }, [status || '—']);
  }

  async function loadServicos_(base){
    // Worker (correios-cfw-v6+): GET /correios/services -> { ok:true, services:[{id,label,...}] }
    const r = await jfetch(base + '/correios/services');
    if (!r?.ok) throw new Error(r?.error || 'Falha ao listar serviços');
    const list = r.services || r.items || [];
    return list.map(it => ({
      code: it.code || it.id,
      label: it.label || it.name || String(it.id || it.code || '—')
    }));
  }

  async function loadPedidos_(base){
    // OBS: no Worker atual, pedidos ainda são responsabilidade do GAS.
    // Para não travar o painel com 404, retornamos lista vazia quando não existir.
    const r = await jfetch(base + '/correios/pedidos');
    if (!r?.ok) return [];
    const keys = r.keys || [];
    const last = keys.slice(-30).reverse();
    const out = [];
    for (const k of last){
      const d = await jfetch(base + '/correios/pedido?id=' + encodeURIComponent(k));
      if (d?.ok) out.push({ key:k, ...d.value });
    }
    return out;
  }

  async function loadWebhooks_(base){
    const r = await jfetch(base + '/correios/events');
    if (!r?.ok) return [];
    const keys = (r.keys || []).slice(-30).reverse();
    const out = [];
    for (const k of keys){
      const d = await jfetch(base + '/correios/event?id=' + encodeURIComponent(k));
      if (d?.ok) out.push({ key:k, ...d.value });
    }
    return out;
  }

  function buildHome(container, opts){
    container.innerHTML = '';
    const base = baseFromAuth(opts);

    const style = el('style', { html: css() });

    const root = el('div', { class:'correios-root' }, [
      style,
      el('div', { class:'correios-header' }, [
        el('div', {}, [
          el('div', { class:'correios-title' }, ['📦 Correios (PPN)']),
          el('div', { class:'correios-sub correios-muted' }, ['PAC / Carta Registrada (AR) / SEDEX (Diretoria) / Outros'])
        ]),
        el('button', { class:'correios-btn', onclick: () => opts?.onBack?.() }, ['← Voltar'])
      ]),

      el('div', { class:'correios-tabs' }, [
        el('button', { class:'correios-tab on', 'data-tab':'postagem', onclick: () => setView(root,'postagem') }, ['Postagem']),
        el('button', { class:'correios-tab', 'data-tab':'acompanhar', onclick: () => { setView(root,'acompanhar'); refreshPedidos(); } }, ['Acompanhar envio']),
        el('button', { class:'correios-tab', 'data-tab':'precos', onclick: () => setView(root,'precos') }, ['Preços e prazos']),
        el('button', { class:'correios-tab', 'data-tab':'notifs', onclick: () => { setView(root,'notifs'); refreshWebhooks(); } }, ['Notificações']),
      ]),

      // ===== Postagem =====
      el('div', { class:'correios-card', 'data-view':'postagem' }, [
        el('div', { class:'correios-grid' }, [
          fieldSelect('Serviço', 'servico', []),
          fieldDestinatario(),
          fieldArea('Conteúdo', 'conteudo', 'Descreva o que está indo (EPI / Documento / etc.)'),

          field('Endereço', 'endereco', ''),
          field('CEP', 'cep', ''),
          field('Cidade', 'cidade', ''),
          field('UF', 'uf', ''),
          field('Telefone', 'telefone', ''),
          field('Email', 'email', ''),

          el('div', { class:'correios-col-12', id:'motivoWrap', style:'display:none' }, [
            el('div', { class:'correios-label' }, ['Motivo do SEDEX (obrigatório para aprovação)']),
            el('textarea', { class:'correios-textarea', id:'motivoSedex', placeholder:'Explique o motivo do SEDEX…' })
          ]),

          el('div', { class:'correios-col-12' }, [
            el('div', { class:'correios-actions' }, [
              el('button', { class:'correios-btn', onclick: clearForm }, ['Limpar']),
              el('button', { class:'correios-btn primary', onclick: submitPedido }, ['Salvar pedido'])
            ])
          ])
        ]),
        el('div', { class:'correios-muted', style:'margin-top:10px;font-size:12px' }, [
          'SEDEX: fica como ',
          el('span', { class:'correios-pill warn' }, ['PENDENTE_DIRETORIA']),
          ' e só segue após aprovação.'
        ])
      ]),

      // ===== Acompanhar =====
      el('div', { class:'correios-card', 'data-view':'acompanhar', style:'display:none' }, [
        el('div', { class:'correios-actions', style:'justify-content:space-between;margin-top:0' }, [
          el('div', { class:'correios-muted', id:'pedCount' }, ['—']),
          el('button', { class:'correios-btn', onclick: refreshPedidos }, ['Atualizar'])
        ]),
        el('div', { style:'margin-top:10px;overflow:auto' }, [
          el('table', { class:'correios-table' }, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', {}, ['Data']),
                el('th', {}, ['Status']),
                el('th', {}, ['Serviço']),
                el('th', {}, ['Destinatário']),
                el('th', {}, ['Etiqueta']),
              ])
            ]),
            el('tbody', { id:'pedTbody' })
          ])
        ])
      ]),

      // ===== Preços =====
      el('div', { class:'correios-card', 'data-view':'precos', style:'display:none' }, [
        el('div', { class:'correios-muted' }, [
          'Aqui entra a consulta de preços/prazos (API 34). Deixei a aba pronta.'
        ])
      ]),

      // ===== Notificações =====
      el('div', { class:'correios-card', 'data-view':'notifs', style:'display:none' }, [
        el('div', { class:'correios-actions', style:'justify-content:space-between;margin-top:0' }, [
          el('div', { class:'correios-muted', id:'evtCount' }, ['—']),
          el('button', { class:'correios-btn', onclick: refreshWebhooks }, ['Atualizar'])
        ]),
        el('div', { style:'margin-top:10px;overflow:auto' }, [
          el('table', { class:'correios-table' }, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', {}, ['Quando']),
                el('th', {}, ['Path']),
                el('th', {}, ['Resumo']),
                el('th', {}, ['Key']),
              ])
            ]),
            el('tbody', { id:'evtTbody' })
          ])
        ])
      ]),

    ]);

    container.appendChild(root);

    // ===== helpers internos =====
    function field(label, id, ph){
      return el('div', { class:'correios-col-4' }, [
        el('div', { class:'correios-label' }, [label]),
        el('input', { class:'correios-input', id, placeholder: ph || '' })
      ]);
    }
    function fieldArea(label, id, ph){
      return el('div', { class:'correios-col-12' }, [
        el('div', { class:'correios-label' }, [label]),
        el('textarea', { class:'correios-textarea', id, placeholder: ph || '' })
      ]);
    }
    
    function fieldDestinatario(){
      const input = el('input', { class:'correios-input', id:'destinatario', placeholder:'Selecionar destinatário', readonly:'true' });
      const btn = el('button', { class:'correios-btn', type:'button', onclick: openDestinatarioPicker_ }, ['🔎']);
      return el('div', { class:'correios-col-4' }, [
        el('div', { class:'correios-label' }, ['Destinatário']),
        el('div', { style:'display:flex;gap:6px;align-items:stretch' }, [input, btn])
      ]);
    }

    async function validarCepAuto_(root){
      const cepEl = root.querySelector('#cep');
      const cep = String(cepEl?.value || '').replace(/\D/g,'');
      if (cep.length !== 8) throw new Error('CEP inválido. Informe 8 dígitos.');

      // Fonte de CEP (rápida e estável). Se quiser trocar para endpoint Correios, altere aqui.
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!resp.ok) throw new Error('Falha ao validar CEP.');
      const d = await resp.json();
      if (d.erro) throw new Error('CEP não encontrado.');

      // Preenche cidade/UF para garantir etiqueta correta
      const cidadeEl = root.querySelector('#cidade');
      const ufEl = root.querySelector('#uf');
      if (cidadeEl) cidadeEl.value = d.localidade || '';
      if (ufEl) ufEl.value = d.uf || '';

      return cep;
    }

    async function openDestinatarioPicker_(){
      if (!base) return alert('API_BASE não encontrado.');

      const nome = prompt('Buscar destinatário pelo nome:');
      if (!nome) return;

      // Worker sugerido: GET /correios/searchDestinatario?q=...
      const r = await jfetch(base + '/correios/searchDestinatario?q=' + encodeURIComponent(nome));

      if (!r?.ok) return alert(r?.error || 'Falha ao buscar destinatário.');
      const items = r.items || r.list || r.data || [];
      if (!items.length) return alert('Nenhum destinatário encontrado.');

      // Por enquanto escolhe o 1º. (Podemos evoluir p/ modal com lista)
      const it = items[0] || {};

      const set = (id, val) => {
        const elx = root.querySelector('#'+id);
        if (elx) elx.value = (val == null ? '' : String(val));
      };

      set('destinatario', it.nome || it.destinatario || '');
      set('endereco', it.endereco || it.logradouro || '');
      set('cep', (it.cep || '').toString().replace(/\D/g,''));
      set('cidade', it.cidade || '');
      set('uf', it.uf || '');
      set('telefone', it.telefone || '');
      set('email', it.email || '');

      // Se veio CEP, valida e garante cidade/UF corretos
      try{
        if (root.querySelector('#cep')?.value) await validarCepAuto_(root);
      }catch(e){
        alert(e.message || 'CEP inválido.');
      }
    }

    function v(elect(label, id, items){
      return el('div', { class:'correios-col-4' }, [
        el('div', { class:'correios-label' }, [label]),
        el('select', { class:'correios-select', id })
      ]);
    }

    function v(id){
      const e = root.querySelector('#'+id);
      return (e && (e.value||'').trim()) || '';
    }

    function clearForm(){
      ['destinatario','conteudo','endereco','cep','cidade','uf','telefone','email','motivoSedex'].forEach(id=>{
        const e = root.querySelector('#'+id);
        if (e) e.value='';
      });
      root.querySelector('#servico').value = 'CARTA_REGISTRADA';
      root.querySelector('#motivoWrap').style.display = 'none';
    }

    async function submitPedido(){
      if (!base) return alert('API_BASE não encontrado.');

      const servico = v('servico');
      const motivoSedex = v('motivoSedex');
      if (!servico) return alert('Selecione um serviço.');

      if (String(servico).toUpperCase()==='SEDEX' && !motivoSedex) {
        return alert('Motivo do SEDEX é obrigatório.');
      }

      let cep;
      try{
        cep = await validarCepAuto_(root);
      }catch(e){
        return alert(e.message || 'CEP inválido.');
      }

      const payload = {
        servico,
        motivoSedex,
        destinatario: v('destinatario'),
        conteudo: v('conteudo'),
        endereco: v('endereco'),
        cep,
        cidade: v('cidade'),
        uf: v('uf'),
        telefone: v('telefone'),
        email: v('email'),
        origem: 'PAINEL_ADM'
      };

      if (!payload.destinatario) return alert('Destinatário é obrigatório.');

      // Worker: POST /correios/prepostagem -> encaminha para o GAS
      const r = await jfetch(base + '/correios/prepostagem', {
        method:'POST',
        headers: {
          'content-type':'application/json',
          // usa token do painel se existir (vai para o GAS registrar)
          'x-erp-token': (opts?.auth?.token || '')
        },
        body: JSON.stringify(payload)
      });

      if (!r?.ok) return alert(r?.error || 'Erro ao salvar pedido.');

      // Notificar equipe (responsável vem do login do painel)
      try{
        await jfetch(base + '/correios/notifyPostagem', {
          method:'POST',
          headers:{
            'content-type':'application/json',
            'x-erp-token': (opts?.auth?.token || '')
          },
          body: JSON.stringify({
            responsavelCpf: (opts?.auth?.user?.cpf || opts?.auth?.cpf || ''),
            responsavelNome: (opts?.auth?.user?.nome || opts?.auth?.nome || ''),
            data: new Date().toISOString(),
            destinatario: payload.destinatario,
            cidade: payload.cidade,
            uf: payload.uf
          })
        });
      }catch(e){
        console.warn('Falha ao notificar equipe:', e);
      }

      // Worker devolve { ok:true, upstreamStatus, data:{...} }
      const data = r.data || {};
      const status = data.status || data.__status || data?.pedido?.status || '—';
      const etiqueta = data.codigoObjeto || data.etiqueta || data?.pedido?.etiqueta || '';
      alert('Pedido enviado! Status: ' + status + (etiqueta ? (' | Etiqueta: ' + etiqueta) : ''));
      clearForm();
      setView(root,'acompanhar');
      refreshPedidos();
    }

    async function refreshPedidos(){
      if (!base) return;
      const tbody = root.querySelector('#pedTbody');
      const count = root.querySelector('#pedCount');
      tbody.innerHTML = '';
      count.textContent = 'Carregando…';

      const items = await loadPedidos_(base);
      count.textContent = items.length ? `${items.length} últimos pedidos` : 'Nenhum pedido ainda.';

      for (const it of items){
        const tr = el('tr', {}, [
          el('td', { class:'correios-mono' }, [new Date(it.ts||Date.now()).toLocaleString('pt-BR')]),
          el('td', {}, [pillStatus(it.status)]),
          el('td', {}, [it.servico || '—']),
          el('td', {}, [it.destinatario || '—']),
          el('td', { class:'correios-mono' }, [it.etiqueta || '—']),
        ]);
        tbody.appendChild(tr);
      }
    }

    async function refreshWebhooks(){
      if (!base) return;
      const tbody = root.querySelector('#evtTbody');
      const count = root.querySelector('#evtCount');
      tbody.innerHTML='';
      count.textContent='Carregando…';

      const items = await loadWebhooks_(base);
      count.textContent = items.length ? `${items.length} últimos webhooks` : 'Nenhum webhook ainda.';

      for (const it of items){
        const resumo = it?.payload?.tipo || it?.payload?.status || it?.payload?.evento || '—';
        const tr = el('tr', {}, [
          el('td', { class:'correios-mono' }, [new Date(it.ts||Date.now()).toLocaleString('pt-BR')]),
          el('td', { class:'correios-mono' }, [it.path || '—']),
          el('td', {}, [String(resumo)]),
          el('td', { class:'correios-mono' }, [it.key || '—']),
        ]);
        tbody.appendChild(tr);
      }
    }

    // init servicos
    (async () => {
      try{
        const items = await loadServicos_(base);
        const sel = root.querySelector('#servico');
        sel.innerHTML = '';
        for (const it of items){
          sel.appendChild(el('option', { value: it.code }, [it.label]));
        }
        sel.value = 'CARTA_REGISTRADA';
        sel.addEventListener('change', () => {
          const isSedex = (sel.value||'').toUpperCase()==='SEDEX';
          root.querySelector('#motivoWrap').style.display = isSedex ? 'block' : 'none';
        });
      } catch(e){
        console.error(e);
        alert('Falha ao carregar serviços. Verifique API_BASE do painel (Worker).');
      }

    // valida CEP ao sair do campo (preenche Cidade/UF)
    (function(){
      const cepEl = root.querySelector('#cep');
      if (!cepEl) return;
      cepEl.addEventListener('blur', async () => {
        const raw = String(cepEl.value||'').replace(/\D/g,'');
        if (!raw) return;
        if (raw.length !== 8) return;
        try{ await validarCepAuto_(root); }catch(e){ /* silencioso */ }
      });
    })();

    })();
  }

  window.CORREIOS = {
    openHome(container, opts){
      buildHome(container, opts || {});
    }
  };
})();
