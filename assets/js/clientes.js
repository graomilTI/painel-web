/* Clientes (ADM/Gestor) — Novo registro + Histórico
   - Worker -> GAS
   - Depende de config.js (API_BASE) + api.js + auth_guard.js
   - ✅ Ajustado: normaliza respostas (wrapper {ok,data} ou direto do GAS)
*/
(function(){
  "use strict";

  const $ = (id)=>document.getElementById(id);

  // 🔐 tenta pegar token do AUTH e de várias chaves usadas no projeto
  function getTokenMaybe(){
    try{
      if (window.AUTH && typeof window.AUTH.getToken === "function") {
        const t = window.AUTH.getToken();
        if (t) return String(t).trim();
      }
      if (window.AUTH && typeof window.AUTH.getAuth === "function") {
        const auth = window.AUTH.getAuth();
        const t = auth && auth.token ? String(auth.token).trim() : "";
        if (t) return t;
      }
    }catch(_){}

    try{
      const rawAuth = localStorage.getItem("g1000_auth");
      if (rawAuth) {
        const parsed = JSON.parse(rawAuth);
        const t = parsed && parsed.token ? String(parsed.token).trim() : "";
        if (t) return t;
      }
    }catch(_){}

    return (
      localStorage.getItem("TOKEN_WEBAPP") ||     // ✅ padrão recomendado
      localStorage.getItem("token") ||
      localStorage.getItem("sessionToken") ||
      localStorage.getItem("g1000_token") ||
      ""
    ).trim();
  }

  function ensureTokenOrRedirect_(){
    const token = getTokenMaybe();
    if (token) return token;

    // tenta mostrar erro no box se existir
    const out = $("cliNovoOut");
    if (out) {
      out.innerHTML = `<div class="mono">❌ Sessão inválida: token ausente. Faça login novamente.</div>`;
    } else {
      alert("Sessão inválida: token ausente. Faça login novamente.");
    }

    // redireciona para o login (ajuste se seu login for outro arquivo)
    setTimeout(()=>{ window.location.href = "index.html"; }, 300);

    throw new Error("Sessão inválida: token ausente.");
  }

  /** Normaliza resposta:
   * - api.js pode retornar {ok:true, data:{...}} OU {ok:false,error,...}
   * - GAS pode retornar direto {ok:true,...} ou {ok:false,error:"..."}
   * - alguns endpoints retornam direto ARRAY (lista) -> preserva tipo
   */
  function normalizeApiResponse_(resp){
    if (!resp) return { ok:false, error:"Sem resposta do servidor." };

    // wrapper padrão do api.js (ou retorno direto)
    const data =
      (resp && resp.data != null) ? resp.data :
      (resp && resp.result != null) ? resp.result :
      resp;

    // ✅ Se o servidor já devolveu um ARRAY (lista), NÃO embrulhar (preserva tipo)
    if (Array.isArray(data)) return data;

    // erro do wrapper do api.js
    if (resp && resp.ok === false) {
      return {
        ok:false,
        error: resp.error || resp.message || "Falha na requisição",
        raw: resp.raw,
        status: resp.status
      };
    }

    // erro do payload (GAS)
    if (data && typeof data === "object" && data.ok === false) {
      return {
        ok:false,
        error: data.error || data.message || "Falha no processamento (GAS).",
        raw: data.raw || resp.raw,
        status: data.status || resp.status
      };
    }

    // ✅ sucesso:
    // - se já for objeto com ok:true/false, devolve como está
    // - se for objeto sem ok, adiciona ok:true (compat)
    if (data && typeof data === "object") {
      if ("ok" in data) return data;
      return Object.assign({ ok:true }, data || {});
    }

    // fallback raro (string/número/etc)
    return { ok:true, value: data };
  }

  // 🔎 Extrai a lista de registros em qualquer formato comum
  // Suporta:
  // - retorno direto: [ ... ]
  // - wrapper: {ok:true, registros:[...]}  ✅ seu caso atual
  // - outros wrappers: {ok:true, data:[...]}, {ok:true, itens:[...]}, {data:{registros:[...]}}
  function extractItens_(r){
    if (!r) return [];
    if (Array.isArray(r)) return r;

    // tenta chaves diretas
    const direct = [
      r.registros, r.itens, r.items, r.rows, r.lista,
      r.data, r.result, r.payload
    ];
    for (const v of direct) if (Array.isArray(v)) return v;

    // tenta dentro de objetos comuns
    const nested = [r.data, r.result, r.payload, r.debug];
    for (const o of nested){
      if (o && typeof o === "object") {
        const inner = [
          o.registros, o.itens, o.items, o.rows, o.lista,
          o.data, o.result, o.payload
        ];
        for (const v of inner) if (Array.isArray(v)) return v;
      }
    }

    // fallback: primeira prop array
    try{
      for (const k in r) if (Array.isArray(r[k])) return r[k];
      for (const o of nested){
        if (o && typeof o === "object") {
          for (const k in o) if (Array.isArray(o[k])) return o[k];
        }
      }
    }catch(_){}

    return [];
  }

  // ✅ pega campo suportando variações de chave (Cliente/cliente etc.)
  function pick_(obj, keys, fallback=""){
    if (!obj || typeof obj !== "object") return fallback;
    for (const k of keys){
      if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
    }
    return fallback;
  }

  // ✅ tenta achar link de PDF em várias chaves usadas no projeto/planilha
  function pickPdfLink_(it){
    return pick_(it, [
      "pdfViewUrl","pdfDownloadUrl","pdfUrl","pdf_link","pdfLink",
      "PDF_Link","PDF","Pdf","pdf",
      "Link_PDF","LinkPdf"
    ], "");
  }

  // ✅ renderiza o histórico no container certo (#historicoLista), mantendo a área de status (#cliHistOut)
  function renderHistorico_(itens){
    const out = $("cliHistOut");
    const list = $("historicoLista");
    if (!out) return;

    // garante lista
    if (list) list.innerHTML = "";

    if (!itens || !itens.length){
      out.innerHTML = `<div class="mono">Nenhum registro encontrado.</div>`;
      return;
    }

    // mantém um wrapper e joga cartões na lista (se existir), senão no out mesmo
    if (list){
      out.innerHTML = `<div class="mono">Encontrados: ${itens.length}</div>`;
    } else {
      out.innerHTML = `<div class="mono">Encontrados: ${itens.length}</div>`;
    }

    const target = list || out;

    const html = itens.map((it)=>{
      const cliente = String(pick_(it, ["cliente","Cliente","NOME_CLIENTE","Nome_Cliente"], "—"));
      const data    = String(pick_(it, ["data","Data","DATA","Data_contato"], "—"));
      const gestor  = String(pick_(it, ["gestor","Gestor","GESTOR","Nome_Gestor"], ""));
      const contato = String(pick_(it, ["contato_nome","Nome_contato","Nome_Contato","Contato","contato"], ""));
      const tel     = String(pick_(it, ["telefone","Telefone","Telefone_Contato","TEL","celular"], ""));
      const pdfLink = String(pickPdfLink_(it));

      const linkHtml = pdfLink
        ? `<a href="${pdfLink}" target="_blank" rel="noopener">📄 Abrir PDF</a>`
        : "";

      const meta = [
        gestor ? `Gestor: ${gestor}` : "",
        contato ? `Contato: ${contato}` : "",
        tel ? `Tel: ${tel}` : ""
      ].filter(Boolean).join(" • ");

      return `
        <div class="card" style="margin-top:10px">
          <div class="inner">
            <div class="label">${cliente} • ${data}</div>
            ${meta ? `<div class="notice">${meta}</div>` : ""}
            ${linkHtml ? `<div class="mono">${linkHtml}</div>` : `<div class="mono">—</div>`}
          </div>
        </div>
      `;
    }).join("");

    target.innerHTML += html;
  }

  async function apiPostCliente(action, payload){
    if(!window.API || typeof window.API.post !== "function"){
      throw new Error("API.post não configurado (assets/js/api.js).");
    }

    const token = ensureTokenOrRedirect_();

    // ✅ compat com seu api.js: API.post(action, payload)
    // e também com API.post({module,action,token,payload}) se você padronizou assim.
    let resp;
    try{
      resp = await window.API.post({
        module: "cliente",
        action,
        token,
        payload
      });
    }catch(e){
      // fallback para API.post(action, payload)
      resp = await window.API.post(action, { token, payload, module:"cliente" });
    }

    const norm = normalizeApiResponse_(resp);

    // ✅ se vier array (lista), retorna direto
    if (Array.isArray(norm)) return norm;

    if (!norm || norm.ok === false) throw new Error((norm && norm.error) || "Falha desconhecida");
    return norm;
  }

  function fmtList(arr){
    if(!arr || !arr.length) return "—";
    return arr.map(x=>`• ${x}`).join("\n");
  }

  function setTab(isNovo){
    const novo = $("cliNovoBox");
    const hist = $("cliHistBox");
    if(!novo || !hist) return;
    novo.classList.toggle("hidden", !isNovo);
    hist.classList.toggle("hidden", isNovo);
    $("cliTabNovo")?.classList.toggle("primary", isNovo);
    $("cliTabHist")?.classList.toggle("primary", !isNovo);
  }

  async function filesToDataUrls(files){
    const out = [];
    const max = Math.min(files.length, 4);
    for(let i=0;i<max;i++){
      const f = files[i];
      const dataUrl = await new Promise((resolve,reject)=>{
        const r = new FileReader();
        r.onload = ()=>resolve(String(r.result||""));
        r.onerror = ()=>reject(new Error("Falha ao ler imagem"));
        r.readAsDataURL(f);
      });
      out.push({ name: f.name, mimeType: f.type, dataUrl });
    }
    return out;
  }

  function init(){
    if(!$("view-clientes")) return;

    // ✅ se não tiver token, já barra no carregamento (evita preencher tudo e perder)
    try { ensureTokenOrRedirect_(); } catch(_) { return; }

    if ($("userName") && window.AUTH && typeof window.AUTH.getNome === "function") {
      $("userName").textContent = window.AUTH.getNome() || "Usuário";
    }

    const user = window.AUTH?.getUser?.() || {};
    if ($("cliCoord") && !$("cliCoord").value) {
      $("cliCoord").value = user.coordenacao || user["Coordenação"] || user.Coordenacao || "";
    }

    $("cliTabNovo")?.addEventListener("click", ()=>setTab(true));
    $("cliTabHist")?.addEventListener("click", ()=>setTab(false));
    setTab(true);

    const toggleOutros = ()=>{
      const show = !!$("cliInterOutros")?.checked;
      const el = $("cliOutrosField");
      if (el) el.style.display = show ? "block" : "none";
    };
    ["cliInterOutros","cliInterVisita","cliInterOnline","cliInterAlmoco"].forEach(id=>{
      $(id)?.addEventListener("change", toggleOutros);
    });
    toggleOutros();

    const partGrao = [];
    const partCli  = [];

    function renderParts(){
      if ($("cliListaGrao")) $("cliListaGrao").textContent = fmtList(partGrao);
      if ($("cliListaCliente")) $("cliListaCliente").textContent = fmtList(partCli);
    }

    $("cliBtnAddGrao")?.addEventListener("click", ()=>{
      const v = ($("cliAddGrao")?.value || "").trim();
      if(!v) return;
      partGrao.push(v);
      if ($("cliAddGrao")) $("cliAddGrao").value = "";
      renderParts();
    });

    $("cliBtnAddCliente")?.addEventListener("click", ()=>{
      const v = ($("cliAddCliente")?.value || "").trim();
      if(!v) return;
      partCli.push(v);
      if ($("cliAddCliente")) $("cliAddCliente").value = "";
      renderParts();
    });

    $("cliFotos")?.addEventListener("change", ()=>{
      const n = ($("cliFotos").files || []).length;
      if ($("cliFotosInfo")) {
        $("cliFotosInfo").textContent = n ? `${n} imagem(ns) selecionada(s). (serão usadas até 4)` : "Nenhuma imagem selecionada.";
      }
    });

    $("cliBtnSalvar")?.addEventListener("click", async ()=>{
      try{
        if ($("cliNovoOut")) $("cliNovoOut").innerHTML = `<div class="mono">Salvando…</div>`;

        const cliente = ($("cliCliente")?.value||"").trim();
        const data = ($("cliData")?.value||"").trim();
        if(!cliente) throw new Error("Cliente é obrigatório.");
        if(!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) throw new Error("Data inválida (use dd/MM/aaaa).");

        const interacoes = {
          visita: !!$("cliInterVisita")?.checked,
          online: !!$("cliInterOnline")?.checked,
          almoco: !!$("cliInterAlmoco")?.checked,
          outros: !!$("cliInterOutros")?.checked
        };
        const outros_desc = ($("cliOutrosDesc")?.value||"").trim();
        if(interacoes.outros && !outros_desc) throw new Error("Descreva o campo 'Outros'.");

        const fotosFiles = $("cliFotos")?.files ? Array.from($("cliFotos").files) : [];
        const fotos = await filesToDataUrls(fotosFiles);

        const payload = {
          cliente,
          contato_nome: ($("cliContatoNome")?.value||"").trim(),
          telefone: ($("cliTelefone")?.value||"").trim(),
          data,
          interacoes,
          outros_desc,
          participantesGrao: partGrao.slice(),
          participantesCliente: partCli.slice(),
          resumo: ($("cliResumo")?.value||"").trim(),
          providencias: ($("cliProvidencias")?.value||"").trim(),
          fotos,
          supervisao: ($("cliSup")?.value||"").trim(),
          coordenacao: ($("cliCoord")?.value||"").trim(),
          gestorNome: (document.getElementById("userName")?.textContent || "").trim()
        };

        // ✅ action compatível com seu router: "registrarContato"
        const r = await apiPostCliente("registrarContato", payload);

        const msg = (r && (r.message || r.msg)) ? String(r.message || r.msg) : "Salvo com sucesso.";

        // ✅ links (compat com retornos antigos e novos)
        const pastaUrl = r.pastaUrl || r.pastaLink || r.pasta || "";
        const pdfUrl   = r.pdfUrl   || r.pdfLink   || r.pdfViewUrl || r.pdfDownloadUrl || "";

        const pastaLink = pastaUrl ? `<a href="${pastaUrl}" target="_blank" rel="noopener">abrir</a>` : "—";
        const pdfLink   = pdfUrl   ? `<a href="${pdfUrl}" target="_blank" rel="noopener">abrir</a>` : "—";

        const pdfWarn = (!pdfUrl)
          ? `<div class="mono">⚠️ PDF não retornado. Verifique permissões da pasta no Drive.</div>`
          : "";

        if ($("cliNovoOut")) {
          $("cliNovoOut").innerHTML = `
            <div class="mono">✅ ${msg}</div>
            <div class="mono">Pasta: ${pastaLink}</div>
            <div class="mono">PDF: ${pdfLink}</div>
            ${pdfWarn}
          `;
        }
      } catch(err){
        if ($("cliNovoOut")) $("cliNovoOut").innerHTML = `<div class="mono">❌ ${String(err.message||err)}</div>`;
      }
    });

    $("cliBtnBuscar")?.addEventListener("click", async ()=>{
      try{
        if ($("cliHistOut")) $("cliHistOut").innerHTML = `<div class="mono">Buscando…</div>`;

        const payload = {
          cliente: ($("cliFiltroCliente")?.value||"").trim(),
          dataIni: ($("cliFiltroIni")?.value||"").trim(),
          dataFim: ($("cliFiltroFim")?.value||"").trim(),
          limit: 200
        };
        if(!payload.dataIni) delete payload.dataIni;
        if(!payload.dataFim) delete payload.dataFim;

        const r = await apiPostCliente("listarRegistros", payload);

        // ✅ blindado: pega lista em qualquer chave (registros/itens/data/array)
        const itens = extractItens_(r);

        if(!itens.length){
          if ($("cliHistOut")) $("cliHistOut").innerHTML = `<div class="mono">Nenhum registro encontrado.</div>`;
          return;
        }

        renderHistorico_(itens);

      } catch(err){
        if ($("cliHistOut")) $("cliHistOut").innerHTML = `<div class="mono">❌ ${String(err.message||err)}</div>`;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
