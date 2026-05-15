import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://xyzpnuumdqhegxakkyws.supabase.co';
const SUPABASE_ANON = 'sb_publishable_YDjKfceWqANbNVMaHte2Kw_Dy4_i471';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true } });

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (v) => BRL.format(Number(v) || 0);
const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let sharedFile  = null;
let uploadedUrl = null;
let selectedRow = null;
let pendingPayments = [];

// ─── Auth ────────────────────────────────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.replace('/painel/login.html');
    return false;
  }
  return true;
}

// ─── Upload ──────────────────────────────────────────────────────────────────
async function uploadFile(file) {
  const ano    = new Date().getFullYear();
  const ts     = Date.now();
  const safe   = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path   = `financeiro/comprovantes/${ano}/mobile/${ts}_${safe}`;
  const { error } = await supabase.storage.from('notas-fiscais').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  const { data } = supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl || path;
}

// ─── Pagamentos pendentes ─────────────────────────────────────────────────────
async function loadPendingPayments() {
  const { data, error } = await supabase
    .from('financeiro_pagamentos')
    .select('id,origem,setor,modulo_origem,descricao,conteudo,valor,valor_total,total,forma_pagamento,dados_pagamento,status,created_at,fornecedor,favorecido')
    .in('status', ['PENDENTE', 'pendente', 'Pendente'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── Vincular comprovante ─────────────────────────────────────────────────────
async function linkComprovante(row, url) {
  const isCompra = String(row.id || '').startsWith('compra_');
  if (isCompra) {
    const rawId = String(row.id).replace('compra_', '');
    const { error } = await supabase.from('compras_itens').update({ status: 'aguardando_nf', comprovante_url: url }).eq('id', rawId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('financeiro_pagamentos').update({ status: 'PAGO', pago_em: new Date().toISOString(), comprovante_url: url }).eq('id', row.id);
    if (error) throw new Error(error.message);
  }
}

// ─── Telas ────────────────────────────────────────────────────────────────────
function show(stepId) {
  document.querySelectorAll('.step').forEach((el) => el.classList.remove('active'));
  const el = document.getElementById(stepId);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function setFile(file) {
  if (!file) return;
  sharedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('preview-img');
    if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
    const pdfBadge = document.getElementById('pdf-badge');
    if (pdfBadge) pdfBadge.style.display = file.type === 'application/pdf' ? 'block' : 'none';
  };
  if (file.type === 'application/pdf') {
    reader.readAsDataURL(file);
  } else {
    reader.readAsDataURL(file);
  }
  document.getElementById('file-name').textContent = file.name;
  show('step-preview');
}

function renderPaymentList() {
  const list = document.getElementById('payment-list');
  if (!pendingPayments.length) {
    list.innerHTML = '<div class="empty-state">Nenhum pagamento pendente encontrado.</div>';
    return;
  }
  list.innerHTML = pendingPayments.map((row) => {
    const valor = row.valor || row.valor_total || row.total || 0;
    const origem = row.origem || row.setor || row.modulo_origem || 'Financeiro';
    const desc = (row.descricao || row.conteudo || '').split('\n')[0].slice(0, 60);
    const fav = row.fornecedor || row.favorecido || '';
    return `<div class="pay-card" data-id="${esc(String(row.id))}">
      <div class="pay-card-top">
        <span class="pay-tag">${esc(origem)}</span>
        <span class="pay-value">${money(valor)}</span>
      </div>
      ${desc ? `<div class="pay-desc">${esc(desc)}</div>` : ''}
      ${fav ? `<div class="pay-fav">${esc(fav)}</div>` : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.pay-card').forEach((card) => {
    card.addEventListener('click', () => {
      list.querySelectorAll('.pay-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedRow = pendingPayments.find((r) => String(r.id) === card.dataset.id) || null;
      document.getElementById('btn-confirm').disabled = !selectedRow;
    });
  });
}

// ─── Fluxo principal ──────────────────────────────────────────────────────────
async function init() {
  const ok = await checkAuth();
  if (!ok) return;

  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/painel/sw.js', { scope: '/painel/' }).catch(() => {});
  }

  // Verificar se veio via Web Share Target
  const params = new URLSearchParams(location.search);
  if (params.get('shared') === '1') {
    try {
      const cache = await caches.open('g1000-shared-file');
      const resp = await cache.match('/g1000-shared-file');
      if (resp) {
        const blob = await resp.blob();
        const name = decodeURIComponent(resp.headers.get('X-File-Name') || 'comprovante.jpg');
        setFile(new File([blob], name, { type: blob.type }));
        await cache.delete('/g1000-shared-file');
        history.replaceState(null, '', '/painel/comprovante-mobile.html');
        return;
      }
    } catch {}
  }

  show('step-capture');

  // Câmera / galeria
  const inputCamera  = document.getElementById('input-camera');
  const inputGallery = document.getElementById('input-gallery');
  document.getElementById('btn-camera').addEventListener('click', () => inputCamera.click());
  document.getElementById('btn-gallery').addEventListener('click', () => inputGallery.click());
  inputCamera.addEventListener('change',  (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });
  inputGallery.addEventListener('change', (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

  // Refazer
  document.getElementById('btn-retry').addEventListener('click', () => {
    sharedFile = null; uploadedUrl = null; selectedRow = null;
    document.getElementById('input-camera').value = '';
    document.getElementById('input-gallery').value = '';
    show('step-capture');
  });

  // Continuar → upload + lista
  document.getElementById('btn-continue').addEventListener('click', async () => {
    if (!sharedFile) return;
    show('step-loading');
    document.getElementById('loading-msg').textContent = 'Enviando comprovante...';
    try {
      uploadedUrl = await uploadFile(sharedFile);
      document.getElementById('loading-msg').textContent = 'Buscando pagamentos pendentes...';
      pendingPayments = await loadPendingPayments();
      renderPaymentList();
      show('step-select');
    } catch (err) {
      show('step-preview');
      alert('Erro: ' + err.message);
    }
  });

  // Confirmar vínculo
  document.getElementById('btn-confirm').addEventListener('click', async () => {
    if (!selectedRow || !uploadedUrl) return;
    show('step-loading');
    document.getElementById('loading-msg').textContent = 'Vinculando comprovante...';
    try {
      await linkComprovante(selectedRow, uploadedUrl);
      const valor = selectedRow.valor || selectedRow.valor_total || selectedRow.total || 0;
      document.getElementById('success-value').textContent = money(valor);
      document.getElementById('success-origin').textContent = selectedRow.origem || selectedRow.setor || 'Financeiro';
      show('step-success');
    } catch (err) {
      show('step-select');
      alert('Erro ao vincular: ' + err.message);
    }
  });

  // Salvar sem vincular
  document.getElementById('link-sem-vinculo')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!uploadedUrl) return;
    const origem = 'Salvo sem vínculo';
    document.getElementById('success-value').textContent = '—';
    document.getElementById('success-origin').textContent = origem;
    show('step-success');
  });

  // Novo comprovante
  document.getElementById('btn-new').addEventListener('click', () => {
    sharedFile = null; uploadedUrl = null; selectedRow = null; pendingPayments = [];
    document.getElementById('input-camera').value = '';
    document.getElementById('input-gallery').value = '';
    show('step-capture');
  });
}

init();
