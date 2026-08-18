import { supabase } from './supabaseClient.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
let saving = false;
let observer = null;

function iconPlus() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
}

function ensureStyles() {
  if ($('#hospAddHotelCss')) return;
  const style = document.createElement('style');
  style.id = 'hospAddHotelCss';
  style.textContent = `
    [data-hosp-add-hotel]{display:inline-flex!important;align-items:center;gap:7px;white-space:nowrap}
    [data-hosp-add-hotel] svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    #hospAddHotelModal{position:fixed;inset:0;z-index:10160;display:none;place-items:center;padding:18px;background:rgba(0,8,5,.82);backdrop-filter:blur(6px)}
    #hospAddHotelModal.open{display:grid}
    .hah-card{width:min(820px,100%);max-height:92vh;overflow:auto;padding:22px;border:1px solid rgba(74,222,128,.25);border-radius:18px;background:#061610;box-shadow:0 25px 70px #0008}
    .hah-head{display:flex;justify-content:space-between;gap:15px;margin-bottom:16px}.hah-head h3{margin:0;color:#effff5}.hah-head p{margin:5px 0 0;color:#8fa399;font-size:12px}
    .hah-close{border:0;background:transparent;color:#c7d8d0;font-size:24px;cursor:pointer}
    .hah-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hah-field{display:flex;flex-direction:column;gap:6px}.hah-field.full{grid-column:1/-1}
    .hah-field label{font-size:11px;font-weight:900;color:#9eb1a7;text-transform:uppercase}.hah-field input,.hah-field select{box-sizing:border-box;width:100%;border:1px solid #ffffff18;border-radius:11px;background:#0b2118;color:#effff5;padding:10px 11px;outline:none;color-scheme:dark}
    .hah-section{margin-top:16px;padding-top:14px;border-top:1px solid #ffffff12}.hah-section h4{margin:0 0 10px;color:#dff9ea;font-size:12px;text-transform:uppercase}
    .hah-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px;padding-top:14px;border-top:1px solid #ffffff12}.hah-actions button{border:1px solid #ffffff18;border-radius:10px;background:#0b2118;color:#dcebe4;padding:10px 14px;font-weight:850;cursor:pointer}.hah-actions .primary{background:#16a34a;border-color:#22c55e;color:#04180d}.hah-actions button:disabled{opacity:.5}
    .hah-toast{position:fixed;right:22px;bottom:22px;z-index:10180;padding:12px 15px;border-radius:11px;background:#092319;color:#eafff1;border:1px solid #4ade8055;opacity:0;transform:translateY(8px);transition:.18s;pointer-events:none}.hah-toast.show{opacity:1;transform:none}.hah-toast.err{background:#2a1010;color:#fecaca;border-color:#f8717166}
    @media(max-width:680px){.hah-grid{grid-template-columns:1fr}.hah-field.full{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function toast(message, isError = false) {
  let el = $('#hospAddHotelToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hospAddHotelToast';
    el.className = 'hah-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('err', isError);
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function markup() {
  return `<div class="hah-card">
    <div class="hah-head"><div><h3>Adicionar hotel</h3><p>Novo hotel disponível para cotação, reserva e controle financeiro.</p></div><button class="hah-close" type="button" data-hah-close>×</button></div>
    <div class="hah-grid">
      <div class="hah-field"><label>Nome fantasia *</label><input id="hahNome" autocomplete="off"></div>
      <div class="hah-field"><label>CNPJ</label><input id="hahCnpj" autocomplete="off"></div>
      <div class="hah-field"><label>Razão social</label><input id="hahRazao" autocomplete="off"></div>
      <div class="hah-field"><label>Contato / WhatsApp</label><input id="hahContato" autocomplete="off"></div>
      <div class="hah-field"><label>Cidade *</label><input id="hahCidade" autocomplete="off"></div>
      <div class="hah-field"><label>UF *</label><select id="hahUf"><option value="">Selecione...</option>${UFS.map((uf) => `<option value="${uf}">${uf}</option>`).join('')}</select></div>
      <div class="hah-field full"><label>Endereço</label><input id="hahEndereco" autocomplete="off"></div>
      <div class="hah-field"><label>PIX</label><input id="hahPix" autocomplete="off"></div>
      <div class="hah-field"><label>Emite NF?</label><select id="hahNf"><option value="true">Sim</option><option value="false">Não</option></select></div>
    </div>
    <div class="hah-section"><h4>Valores de diária</h4><div class="hah-grid">
      <div class="hah-field"><label>Individual</label><input id="hahIndividual" type="number" min="0" step="0.01"></div>
      <div class="hah-field"><label>Duplo</label><input id="hahDuplo" type="number" min="0" step="0.01"></div>
      <div class="hah-field"><label>Triplo</label><input id="hahTriplo" type="number" min="0" step="0.01"></div>
      <div class="hah-field"><label>Quádruplo</label><input id="hahQuad" type="number" min="0" step="0.01"></div>
    </div></div>
    <div class="hah-actions"><button type="button" data-hah-close>Cancelar</button><button type="button" class="primary" id="hahSave">Adicionar hotel</button></div>
  </div>`;
}

function openModal() {
  let modal = $('#hospAddHotelModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hospAddHotelModal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = markup();
  modal.classList.add('open');
  setTimeout(() => $('#hahNome')?.focus(), 30);
}

function closeModal() {
  $('#hospAddHotelModal')?.classList.remove('open');
}

function numberOrNull(selector) {
  const raw = $(selector)?.value;
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function saveHotel() {
  if (saving) return;
  const nome = $('#hahNome')?.value.trim();
  const cidade = $('#hahCidade')?.value.trim();
  const uf = $('#hahUf')?.value;
  const cnpj = $('#hahCnpj')?.value.trim() || null;
  if (!nome || !cidade || !uf) return toast('Informe nome, cidade e UF.', true);

  saving = true;
  const button = $('#hahSave');
  if (button) {
    button.disabled = true;
    button.textContent = 'Adicionando...';
  }

  try {
    if (cnpj) {
      const { data: existingByCnpj, error: cnpjError } = await supabase
        .from('hospedagem_hoteis')
        .select('id,nome')
        .eq('cnpj_cpf', cnpj)
        .limit(1);
      if (cnpjError) throw cnpjError;
      if (existingByCnpj?.length) throw new Error(`Já existe hotel cadastrado com este CNPJ: ${existingByCnpj[0].nome}.`);
    }

    const { data: sameName, error: nameError } = await supabase
      .from('hospedagem_hoteis')
      .select('id,nome,cidade,uf')
      .ilike('nome', nome)
      .ilike('cidade', cidade)
      .eq('uf', uf)
      .limit(1);
    if (nameError) throw nameError;
    if (sameName?.length) throw new Error('Já existe um hotel com o mesmo nome nesta cidade/UF.');

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    const pix = $('#hahPix')?.value.trim() || null;
    const contato = $('#hahContato')?.value.trim() || null;
    const individual = numberOrNull('#hahIndividual');
    const payload = {
      nome,
      razao_social: $('#hahRazao')?.value.trim() || null,
      cnpj_cpf: cnpj,
      cidade,
      uf,
      endereco: $('#hahEndereco')?.value.trim() || null,
      telefone: contato,
      whatsapp: contato,
      chave_pix: pix,
      pix_chave: pix,
      emite_nota_fiscal: $('#hahNf')?.value !== 'false',
      valor_diaria_padrao: individual,
      valor_diaria_individual: individual,
      valor_diaria_duplo: numberOrNull('#hahDuplo'),
      valor_diaria_triplo: numberOrNull('#hahTriplo'),
      valor_diaria_quadruplo: numberOrNull('#hahQuad'),
      status: 'ATIVO',
      recebe_cotacao: true,
      criado_por: userId,
      atualizado_por: userId,
    };

    const { error } = await supabase.from('hospedagem_hoteis').insert(payload);
    if (error) throw error;

    closeModal();
    toast(`Hotel ${nome} adicionado.`);
    setTimeout(() => document.querySelector('[data-hosp-rd-action="refresh"]')?.click(), 80);
  } catch (error) {
    console.error('[hosp-add-hotel]', error);
    toast(error.message || 'Não foi possível adicionar o hotel.', true);
  } finally {
    saving = false;
    if (button) {
      button.disabled = false;
      button.textContent = 'Adicionar hotel';
    }
  }
}

function ensureButton() {
  const panel = $('#hospRdHoteis');
  if (!panel) return;
  const toolbarRight = $('.hosp-rd-toolbar-right', panel);
  if (!toolbarRight || $('[data-hosp-add-hotel]', toolbarRight)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hosp-rd-btn primary';
  button.setAttribute('data-hosp-add-hotel', '');
  button.innerHTML = `${iconPlus()} Adicionar hotel`;
  const cashflow = $('[data-hosp-rd-action="cashflow"]', toolbarRight);
  toolbarRight.insertBefore(button, cashflow || toolbarRight.firstChild);
}

async function init() {
  let attempts = 0;
  while (!$('#hospRedesignRoot') && attempts < 100) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts += 1;
  }
  if (!$('#hospRedesignRoot')) return;
  ensureStyles();
  ensureButton();

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-hosp-add-hotel]')) {
      event.preventDefault();
      openModal();
      return;
    }
    if (event.target.closest('[data-hah-close]') || event.target.id === 'hospAddHotelModal') closeModal();
    if (event.target.closest('#hahSave')) saveHotel();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  const panel = $('#hospRdHoteis');
  if (panel) {
    observer = new MutationObserver(() => ensureButton());
    observer.observe(panel, { childList: true, subtree: true });
  }
  console.info('[hosp-add-hotel] ativo');
}

init();
