/**
 * assets/js/modules/compras/module.js
 * Compras — Gestor (funcional)
 *
 * Backend (GAS):
 *  module: "compras"
 *  action:
 *   - carregarContexto
 *   - salvarUniformes
 *   - salvarMateriais
 *   - salvarEPIs
 *   - consultarPatrimonios
 *
 * Requer na página:
 *   - assets/js/config.js
 *   - assets/js/auth_unificado.js  (AUTH.post + AUTH.getToken)
 *   - assets/js/api.js            (window.API.post(payloadObj))
 */

const __mod = {
  state: {
    ctx: null,
    tab: "uniformes",
    carrinho: {
      uniformes: [],
      materiais: [],
      epis: []
    },
    patrimonios: []
  },

  $: (root, sel) => root.querySelector(sel),

  // ---------------------------
  // AUTH + API
  // ---------------------------
  getToken_() {
    // 1) AUTH.getToken()
    try {
      if (window.AUTH && typeof window.AUTH.getToken === "function") {
        const t = window.AUTH.getToken();
        if (t) return String(t).trim();
      }
    } catch (_) {}

    // 2) AUTH.getAuth().token
    try {
      if (window.AUTH && typeof window.AUTH.getAuth === "function") {
        const a = window.AUTH.getAuth();
        const t = a && a.token ? String(a.token).trim() : "";
        if (t) return t;
      }
    } catch (_) {}

    // 3) localStorage padrão
    try {
      const raw = localStorage.getItem("g1000_auth");
      if (raw) {
        const a = JSON.parse(raw);
        const t = a && a.token ? String(a.token).trim() : "";
        if (t) return t;
      }
    } catch (_) {}

    // 4) legados
    try {
      const t = localStorage.getItem("g1000_token") || localStorage.getItem("token") || "";
      if (t) return String(t).trim();
    } catch (_) {}

    return "";
  },

  async post_(action, payload = {}) {
    if (!window.API || typeof window.API.post !== "function") {
      throw new Error("API.post não disponível (carregue assets/js/api.js).");
    }
    const token = payload.token || this.getToken_();
    if (!token) throw new Error("Sessão inválida (sem token).");

    const req = Object.assign({ module: "compras", action, token }, payload);
    const r = await window.API.post(req);

    if (!r || r.ok === false) {
      throw new Error((r && (r.error || r.message)) || "Falha na API");
    }
    return r;
  },

  // ---------------------------
  // Helpers
  // ---------------------------
  pad2_(n) { return String(n).padStart(2, "0"); },

  hojeDMY_() {
    const d = new Date();
    return `${this.pad2_(d.getDate())}/${this.pad2_(d.getMonth() + 1)}/${d.getFullYear()}`;
  },

  esc_(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  },

  toast_(msg) {
    // usa UI se existir, senão alert
    try {
      if (window.UI && typeof window.UI.toast === "function") return window.UI.toast(msg);
    } catch(_) {}
    alert(msg);
  },

  // ---------------------------
  // Contexto
  // ---------------------------
  async carregarContexto_(root) {
    const token = this.getToken_();
    const dataRef = (this.$(root, "#compDataRef")?.value || "").trim() || this.hojeDMY_();

    const r = await this.post_("carregarContexto", { token, dataRef });
    const ctx = r.data || r;

    this.state.ctx = ctx;

    // Pills topo
    const pillGestor = document.getElementById("pillGestor");
    const pillDataRef = document.getElementById("pillDataRef");
    if (pillGestor) pillGestor.textContent = ctx?.gestor?.nome || "—";
    if (pillDataRef) pillDataRef.textContent = ctx?.dataRef || dataRef || "—";

    // Supervisões
    const sups = Array.isArray(ctx?.supervisoes) ? ctx.supervisoes : [];
    const selSup = this.$(root, "#compSup");
    if (selSup) {
      selSup.innerHTML = `<option value="">Selecione</option>` + sups.map(s => {
        const v = String(s || "");
        return `<option value="${this.esc_(v)}">${this.esc_(v)}</option>`;
      }).join("");
      if (sups.length) selSup.value = String(sups[0]);
    }

    // também preenche selects por aba
    const fill = (id, val) => {
      const el = this.$(root, id);
      if (!el) return;
      el.innerHTML = (selSup ? selSup.innerHTML : `<option value="">Selecione</option>`);
      if (val) el.value = val;
    };
    fill("#uniSup", selSup?.value || "");
    fill("#matSupAlvo", selSup?.value || "");
    fill("#matSup", selSup?.value || "");
    fill("#epiSup", selSup?.value || "");

    // colaboradores datalist
    const dl = this.$(root, "#uniColabList");
    if (dl) {
      const cols = Array.isArray(ctx?.colaboradores) ? ctx.colaboradores : [];
      dl.innerHTML = cols.map(c => {
        const nome = String(c?.nome || "").trim();
        return `<option value="${this.esc_(nome)}"></option>`;
      }).join("");
    }

    this.$(root, "#compOut").textContent = "✅ Contexto carregado.";
  },

  getBaseInfo_(root) {
    const ctx = this.state.ctx || {};
    const token = this.getToken_();

    const dataRef = (ctx.dataRef || (this.$(root, "#compDataRef")?.value || "").trim() || this.hojeDMY_());
    const gestor = (ctx?.gestor?.nome || "");
    const coordenacao = (ctx?.gestor?.coordenacao || "");
    const supervisao = (this.$(root, "#compSup")?.value || "").trim();

    return { token, dataRef, gestor, coordenacao, supervisao };
  },

  // ---------------------------
  // Carrinho (Uniformes)
  // ---------------------------
  addUniforme_(root) {
    const b = this.getBaseInfo_(root);
    const sup = (this.$(root, "#uniSup")?.value || b.supervisao).trim();
    if (!sup) throw new Error("Selecione a supervisão.");

    const colaborador = (this.$(root, "#uniColaborador")?.value || "").trim();
    const qtd = Number(this.$(root, "#uniQtd")?.value || 1) || 1;
    const tamanho = (this.$(root, "#uniTamanho")?.value || "").trim();
    const cor = (this.$(root, "#uniCor")?.value || "").trim();

    if (!colaborador) throw new Error("Informe o colaborador.");
    if (!tamanho) throw new Error("Selecione o tamanho.");
    if (!cor) throw new Error("Selecione a cor.");

    this.state.carrinho.uniformes.push({
      Data: b.dataRef,
      Gestor: b.gestor,
      "Coordenação": b.coordenacao,
      "Supervisão": sup,
      Colaborador: colaborador,
      Qtd: qtd,
      Tamanho: tamanho,
      Cor: cor
    });

    this.$(root, "#uniColaborador").value = "";
    this.renderCarrinho_(root);
    this.toast_("✅ Item adicionado em Uniformes.");
  },

  // ---------------------------
  // Carrinho (Materiais)
  // ---------------------------
  addMaterial_(root) {
    const b = this.getBaseInfo_(root);

    const supAlvo = (this.$(root, "#matSupAlvo")?.value || "").trim();
    const sup = (this.$(root, "#matSup")?.value || b.supervisao).trim();
    const material = (this.$(root, "#matMaterial")?.value || "").trim();
    const qtd = Number(String(this.$(root, "#matQtd")?.value || "").replace(",", ".")) || 0;

    if (!supAlvo) throw new Error("Selecione Supervisão Alvo.");
    if (!sup) throw new Error("Selecione Supervisão.");
    if (!material) throw new Error("Informe o material.");
    if (!qtd) throw new Error("Informe a quantidade.");

    // OBS: se sua aba Materiais NÃO tiver coluna Material, o backend ignora automaticamente.
    this.state.carrinho.materiais.push({
      Data: b.dataRef,
      Gestor: b.gestor,
      "Coordenação": b.coordenacao,
      "Supervisão Alvo": supAlvo,
      "Supervisão": sup,
      Qtd: qtd,
      Material: material
    });

    this.$(root, "#matMaterial").value = "";
    this.$(root, "#matQtd").value = "";
    this.renderCarrinho_(root);
    this.toast_("✅ Item adicionado em Materiais.");
  },

  // ---------------------------
  // Carrinho (EPIs)
  // ---------------------------
  addEpi_(root) {
    const b = this.getBaseInfo_(root);

    const sup = (this.$(root, "#epiSup")?.value || b.supervisao).trim();
    const material = (this.$(root, "#epiMaterial")?.value || "").trim();
    const un = (this.$(root, "#epiUn")?.value || "").trim();

    if (!sup) throw new Error("Selecione Supervisão.");
    if (!material) throw new Error("Informe o material.");
    if (!un) throw new Error("Informe Un.");

    this.state.carrinho.epis.push({
      Data: b.dataRef,
      Gestor: b.gestor,
      "Coordenação": b.coordenacao,
      "Supervisão": sup,
      Un: un,
      Material: material
    });

    this.$(root, "#epiMaterial").value = "";
    this.$(root, "#epiUn").value = "";
    this.renderCarrinho_(root);
    this.toast_("✅ Item adicionado em EPIs.");
  },

  removeItem_(tipo, idx) {
    const arr = this.state.carrinho[tipo] || [];
    arr.splice(idx, 1);
  },

  // ---------------------------
  // Salvar
  // ---------------------------
  async salvarUniformes_(root) {
    const b = this.getBaseInfo_(root);
    const itens = this.state.carrinho.uniformes.slice();
    if (!itens.length) throw new Error("Nenhum item em Uniformes.");

    const r = await this.post_("salvarUniformes", { token: b.token, itens });
    this.state.carrinho.uniformes = [];
    this.renderCarrinho_(root);
    this.toast_(`✅ Uniformes gravados: ${(r.data && r.data.gravados) || itens.length}`);
  },

  async salvarMateriais_(root) {
    const b = this.getBaseInfo_(root);
    const itens = this.state.carrinho.materiais.slice();
    if (!itens.length) throw new Error("Nenhum item em Materiais.");

    const r = await this.post_("salvarMateriais", { token: b.token, itens });
    this.state.carrinho.materiais = [];
    this.renderCarrinho_(root);
    this.toast_(`✅ Materiais gravados: ${(r.data && r.data.gravados) || itens.length}`);
  },

  async salvarEPIs_(root) {
    const b = this.getBaseInfo_(root);
    const itens = this.state.carrinho.epis.slice();
    if (!itens.length) throw new Error("Nenhum item em EPIs.");

    const r = await this.post_("salvarEPIs", { token: b.token, itens });
    this.state.carrinho.epis = [];
    this.renderCarrinho_(root);
    this.toast_(`✅ EPIs gravados: ${(r.data && r.data.gravados) || itens.length}`);
  },

  async salvarTudo_(root) {
    const tasks = [];
    if (this.state.carrinho.uniformes.length) tasks.push(this.salvarUniformes_(root));
    if (this.state.carrinho.materiais.length) tasks.push(this.salvarMateriais_(root));
    if (this.state.carrinho.epis.length) tasks.push(this.salvarEPIs_(root));
    if (!tasks.length) throw new Error("Nenhum item para salvar.");
    await Promise.all(tasks);
    this.toast_("✅ Solicitações salvas.");
  },

  // ---------------------------
  // Patrimônios
  // ---------------------------
  async consultarPatrimonios_(root) {
    const b = this.getBaseInfo_(root);
    const sup = (this.$(root, "#patSup")?.value || b.supervisao).trim();
    if (!sup) throw new Error("Selecione Supervisão.");

    const r = await this.post_("consultarPatrimonios", { token: b.token, supervisao: sup });
    const lista = r.data || [];
    this.state.patrimonios = Array.isArray(lista) ? lista : [];
    this.renderPatrimonios_(root);
  },

  // ---------------------------
  // Render
  // ---------------------------
  setTab_(root, tab) {
    this.state.tab = tab;

    root.querySelectorAll("[data-comp-tab]").forEach((btn) => {
      const on = btn.getAttribute("data-comp-tab") === tab;
      btn.classList.toggle("active", on);
    });

    root.querySelectorAll("[data-comp-view]").forEach((v) => {
      const on = v.getAttribute("data-comp-view") === tab;
      v.style.display = on ? "" : "none";
    });
  },

  renderCarrinho_(root) {
    const boxU = this.$(root, "#uniCarrinho");
    const boxM = this.$(root, "#matCarrinho");
    const boxE = this.$(root, "#epiCarrinho");

    const mk = (rows, tipo, cols) => {
      if (!rows.length) return `<div class="muted">Nenhum item adicionado.</div>`;
      return `
        <div class="tableWrap">
          <table class="table">
            <thead><tr>
              ${cols.map(c=>`<th>${this.esc_(c)}</th>`).join("")}
              <th style="width:80px;"></th>
            </tr></thead>
            <tbody>
              ${rows.map((r, i)=>`
                <tr>
                  ${cols.map(c=>`<td>${this.esc_(r[c] ?? "")}</td>`).join("")}
                  <td><button class="btn sm danger" data-rm="${tipo}:${i}">Remover</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    };

    if (boxU) boxU.innerHTML = mk(this.state.carrinho.uniformes, "uniformes",
      ["Colaborador","Qtd","Tamanho","Cor","Supervisão"]);
    if (boxM) boxM.innerHTML = mk(this.state.carrinho.materiais, "materiais",
      ["Material","Qtd","Supervisão Alvo","Supervisão"]);
    if (boxE) boxE.innerHTML = mk(this.state.carrinho.epis, "epis",
      ["Material","Un","Supervisão"]);

    // bind remove
    root.querySelectorAll("button[data-rm]").forEach(btn=>{
      btn.onclick = () => {
        const [tipo, idx] = String(btn.getAttribute("data-rm")).split(":");
        this.removeItem_(tipo, Number(idx));
        this.renderCarrinho_(root);
      };
    });
  },

  renderPatrimonios_(root) {
    const box = this.$(root, "#patLista");
    if (!box) return;

    const rows = this.state.patrimonios || [];
    if (!rows.length) {
      box.innerHTML = `<div class="muted">Nenhum patrimônio encontrado.</div>`;
      return;
    }

    const keys = Object.keys(rows[0] || {});
    box.innerHTML = `
      <div class="tableWrap">
        <table class="table">
          <thead><tr>${keys.map(k=>`<th>${this.esc_(k)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${keys.map(k=>`<td>${this.esc_(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  },

  mountUI_(root) {
    root.innerHTML = `
      <div class="card">
        <div class="row" style="gap:12px; flex-wrap:wrap; align-items:end;">
          <div style="min-width:260px; flex:1;">
            <div class="label">Data referência (dd/MM/aaaa)</div>
            <input id="compDataRef" class="input" placeholder="dd/MM/aaaa" />
          </div>
          <div style="min-width:240px; flex:1;">
            <div class="label">Supervisão</div>
            <select id="compSup" class="input"></select>
          </div>
          <div style="min-width:240px; flex:1;">
            <div class="label">Modo</div>
            <select id="compModo" class="input">
              <option value="novo">Nova solicitação</option>
              <option value="atualizar">Atualizar (em breve)</option>
            </select>
          </div>
          <div style="min-width:210px;">
            <button id="btnCompCtx" class="btn">Carregar contexto</button>
          </div>
        </div>
        <div id="compOut" class="muted" style="margin-top:10px;">Informe a data (opcional) e clique em <b>Carregar contexto</b>.</div>
      </div>

      <div class="card">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <button class="chip active" data-comp-tab="uniformes">Uniformes</button>
          <button class="chip" data-comp-tab="materiais">Materiais</button>
          <button class="chip" data-comp-tab="epis">EPIs</button>

          <div class="spacer"></div>
          <button id="btnSalvarTudo" class="btn">Salvar tudo</button>
        </div>

        <div data-comp-view="uniformes" style="margin-top:14px;">
          <div class="h2">Uniformes</div>
          <div class="muted">Cabeçalhos: Data, Gestor, Coordenação, Supervisão, Colaborador, Qtd, Tamanho, Cor</div>

          <div class="row" style="gap:12px; flex-wrap:wrap; margin-top:12px;">
            <div style="min-width:260px; flex:2;">
              <div class="label">Colaborador</div>
              <input id="uniColaborador" class="input" placeholder="Nome do colaborador" list="uniColabList" />
              <datalist id="uniColabList"></datalist>
            </div>

            <div style="min-width:160px; flex:1;">
              <div class="label">Supervisão</div>
              <select id="uniSup" class="input"></select>
            </div>

            <div style="min-width:110px; flex:0;">
              <div class="label">Qtd</div>
              <select id="uniQtd" class="input">
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>

            <div style="min-width:140px; flex:0;">
              <div class="label">Tamanho</div>
              <select id="uniTamanho" class="input">
                <option>PP</option><option>P</option><option>M</option><option>G</option><option>GG</option><option>XG</option><option>G1</option><option>G2</option><option>G3</option>
              </select>
            </div>

            <div style="min-width:160px; flex:0;">
              <div class="label">Cor</div>
              <select id="uniCor" class="input">
                <option>Verde</option>
                <option>Cinza</option>
              </select>
            </div>

            <div style="min-width:180px; align-self:end;">
              <button id="uniAdd" class="btn">Adicionar</button>
            </div>
          </div>

          <div class="row" style="gap:10px; flex-wrap:wrap; margin-top:10px;">
            <button id="btnSalvarUniformes" class="btn">Salvar Uniformes</button>
          </div>

          <div id="uniCarrinho" style="margin-top:12px;"></div>
        </div>

        <div data-comp-view="materiais" style="margin-top:14px; display:none;">
          <div class="h2">Materiais</div>
          <div class="muted">Cabeçalhos: Data, Gestor, Coordenação, Supervisão Alvo, Supervisão, Qtd</div>

          <div class="row" style="gap:12px; flex-wrap:wrap; margin-top:12px;">
            <div style="min-width:220px; flex:1;">
              <div class="label">Supervisão Alvo</div>
              <select id="matSupAlvo" class="input"></select>
            </div>
            <div style="min-width:220px; flex:1;">
              <div class="label">Supervisão</div>
              <select id="matSup" class="input"></select>
            </div>
            <div style="min-width:260px; flex:2;">
              <div class="label">Material</div>
              <input id="matMaterial" class="input" placeholder="Descrição do material" />
            </div>
            <div style="min-width:140px; flex:0;">
              <div class="label">Qtd</div>
              <input id="matQtd" class="input" inputmode="numeric" placeholder="0" />
            </div>
            <div style="min-width:180px; align-self:end;">
              <button id="matAdd" class="btn">Adicionar</button>
            </div>
          </div>

          <div class="row" style="gap:10px; flex-wrap:wrap; margin-top:10px;">
            <button id="btnSalvarMateriais" class="btn">Salvar Materiais</button>
          </div>

          <div id="matCarrinho" style="margin-top:12px;"></div>
        </div>

        <div data-comp-view="epis" style="margin-top:14px; display:none;">
          <div class="h2">EPIs</div>
          <div class="muted">Cabeçalhos: Data, Gestor, Coordenação, Supervisão, Un, Material</div>

          <div class="row" style="gap:12px; flex-wrap:wrap; margin-top:12px;">
            <div style="min-width:220px; flex:1;">
              <div class="label">Supervisão</div>
              <select id="epiSup" class="input"></select>
            </div>
            <div style="min-width:320px; flex:2;">
              <div class="label">Material</div>
              <input id="epiMaterial" class="input" placeholder="Descrição do EPI" />
            </div>
            <div style="min-width:160px; flex:0;">
              <div class="label">Un</div>
              <input id="epiUn" class="input" placeholder="Ex.: 1, 2, 1 par" />
            </div>
            <div style="min-width:180px; align-self:end;">
              <button id="epiAdd" class="btn">Adicionar</button>
            </div>
          </div>

          <div class="row" style="gap:10px; flex-wrap:wrap; margin-top:10px;">
            <button id="btnSalvarEPIs" class="btn">Salvar EPIs</button>
          </div>

          <div id="epiCarrinho" style="margin-top:12px;"></div>
        </div>
      </div>
    `;

    this.$(root, "#compDataRef").value = this.hojeDMY_();

    root.querySelectorAll("[data-comp-tab]").forEach(btn => {
      btn.addEventListener("click", () => this.setTab_(root, btn.getAttribute("data-comp-tab")));
    });

    this.$(root, "#btnCompCtx").addEventListener("click", async () => {
      try {
        this.$(root, "#compOut").textContent = "Carregando contexto…";
        await this.carregarContexto_(root);
        this.renderCarrinho_(root);
      } catch (e) {
        this.$(root, "#compOut").textContent = "❌ " + (e?.message || e);
      }
    });

    this.$(root, "#uniAdd").addEventListener("click", () => {
      try { this.addUniforme_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#matAdd").addEventListener("click", () => {
      try { this.addMaterial_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#epiAdd").addEventListener("click", () => {
      try { this.addEpi_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#btnSalvarUniformes").addEventListener("click", async () => {
      try { await this.salvarUniformes_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#btnSalvarMateriais").addEventListener("click", async () => {
      try { await this.salvarMateriais_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#btnSalvarEPIs").addEventListener("click", async () => {
      try { await this.salvarEPIs_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#btnSalvarTudo").addEventListener("click", async () => {
      try { await this.salvarTudo_(root); }
      catch(e){ this.toast_("❌ " + (e?.message || e)); }
    });

    this.$(root, "#compSup").addEventListener("change", () => {
      const v = (this.$(root, "#compSup").value || "");
      ["#uniSup","#matSupAlvo","#matSup","#epiSup"].forEach(id=>{
        const el = this.$(root, id);
        if (el) el.value = v;
      });
    });

    try{
      const t = this.getToken_();
      if (t) this.$(root, "#compOut").textContent = "Pronto. Clique em Carregar contexto.";
    }catch(_){}
  },

  async mount(root) {
    this.mountUI_(root);
  },

  async unmount() {}
};

export default __mod;
