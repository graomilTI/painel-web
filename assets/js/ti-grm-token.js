// TI · Integrações — cartão "Token de sessão do GRM".
//
// Desde 30/09/2026 o login do GRM exige Cloudflare Turnstile, então só uma pessoa, num
// navegador, consegue um token novo (vale até 23:59:59 de Brasília). Este cartão leva o
// token do navegador até os agentes, sem SSH:
//   1) favorito "Enviar token GRM" (clicado dentro do GRM, já logado): abre o painel numa
//      janela e entrega o token por postMessage (o token nunca vai em URL);
//   2) botão "Colar e enviar" (token copiado, p.ex. pelo favorito antigo "Copiar token GRM").
// O painel chama a RPC grm_token_entregar; o grm-token-cache.js do servidor busca a entrega,
// confere no GRM, grava no cache e apaga o token da tabela. Os agentes retomam sozinhos.

const GRM_ORIGIN = 'https://www.grmserver.com.br';
const MSG_PRONTO = 'painel-grm-token-pronto';
const MSG_TOKEN = 'painel-grm-token';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function brasilia(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return String(value); }
}

// Roda DENTRO do site do GRM (vira o favorito). Precisa ser autocontida.
function bookmarkletGrm(painelOrigin, painelUrl) {
  var t = null;
  try { var u = JSON.parse(localStorage.getItem('1e467a08-19f3') || 'null'); t = u && u.userToken; } catch (e) { /* segue */ }
  var jwt = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
  if (!t || !jwt.test(t)) {
    t = null;
    for (var i = 0; i < localStorage.length; i++) {
      var m = (localStorage.getItem(localStorage.key(i)) || '').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      if (m) { t = m[0]; break; }
    }
  }
  if (!t) { alert('Token nao encontrado. Entre no GRM e espere o painel abrir.'); return; }
  try {
    var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (p.exp * 1000 < Date.now()) { alert('Este token JA VENCEU. Saia do GRM, entre de novo e clique outra vez.'); return; }
  } catch (e) { /* sem exp legivel: o servidor confere */ }
  var w = window.open(painelUrl + '?grm-token=' + Date.now() + '#grm-token', 'painel_grm_token');
  if (!w) { alert('O navegador bloqueou a janela. Permita pop-ups para este site e clique de novo.'); return; }
  function ouvir(ev) {
    if (ev.origin !== painelOrigin || ev.source !== w || !ev.data || ev.data.tipo !== 'painel-grm-token-pronto') return;
    w.postMessage({ tipo: 'painel-grm-token', token: t }, painelOrigin);
    t = null;
    window.removeEventListener('message', ouvir);
  }
  window.addEventListener('message', ouvir);
  setTimeout(function () { window.removeEventListener('message', ouvir); t = null; }, 180000);
}

function hrefDoFavorito() {
  const url = new URL('ti-integracoes.html', window.location.href);
  const codigo = `(${bookmarkletGrm.toString()})(${JSON.stringify(window.location.origin)},${JSON.stringify(url.origin + url.pathname)})`;
  return `javascript:${encodeURIComponent(codigo)}`;
}

const ROTULO = {
  pendente: ['Aguardando o servidor', '#f59e0b'],
  processando: ['Conferindo no GRM', '#f59e0b'],
  aplicado: ['Aplicado', '#22c55e'],
  recusado: ['Recusado', '#ef4444'],
  expirado: ['Vencido', '#ef4444'],
  substituido: ['Substituído', '#94a3b8'],
};

// Se a tela for redesenhada, o cartão anterior é desmontado: senão cada mensagem do favorito
// dispararia um envio por cartão antigo.
let desmontarAnterior = null;

export function montarCartaoTokenGrm(container, { supabase }) {
  if (desmontarAnterior) desmontarAnterior();
  const raiz = document.createElement('div');
  raiz.className = 'ti-panel';
  raiz.style.marginBottom = '16px';
  raiz.innerHTML = `
    <h3>Token de sessão do GRM</h3>
    <p class="ti-subtitle" style="margin:0 0 12px">O login do GRM exige captcha, então os agentes usam o token da sua sessão no navegador, que vence todo dia às 23:59 (Brasília). Depois da meia-noite: entre no GRM e clique no favorito abaixo; os agentes retomam sozinhos em até 2 minutos. Nada é digitado no servidor.</p>
    <div data-grm-resumo style="margin-bottom:12px"></div>
    <div class="ti-actions" style="margin-bottom:10px">
      <a class="ti-btn ti-btn-primary" data-grm-favorito href="#" draggable="true" style="text-decoration:none;cursor:grab" title="Arraste para a barra de favoritos">Enviar token GRM</a>
      <button class="ti-btn ti-btn-soft" type="button" data-grm-colar>Colar da área de transferência e enviar</button>
    </div>
    <div class="ti-note" style="margin-bottom:10px"><strong>Primeira vez:</strong> arraste o botão verde <em>Enviar token GRM</em> para a barra de favoritos (Ctrl+Shift+B mostra a barra). Depois, com o GRM aberto e logado, é só clicar nesse favorito; uma janela do painel abre, envia o token e mostra o resultado. Se o navegador bloquear a janela, permita pop-ups para o GRM.</div>
    <details style="margin-bottom:10px"><summary style="cursor:pointer;color:#cbd5e1;font-weight:700">Colar o token manualmente</summary>
      <div class="ti-field" style="margin-top:8px"><textarea class="ti-input ti-textarea" rows="3" data-grm-texto placeholder="Cole aqui o token (com ou sem “Bearer”)" autocomplete="off" spellcheck="false"></textarea></div>
      <div class="ti-actions"><button class="ti-btn ti-btn-soft" type="button" data-grm-enviar>Enviar token colado</button></div>
    </details>
    <div data-grm-msg style="min-height:20px;margin-bottom:8px;font-size:13px"></div>
    <div data-grm-lista></div>`;

  const alvo = container.querySelector('.ti-shell .ti-header');
  if (alvo) alvo.after(raiz); else container.prepend(raiz);

  const q = (sel) => raiz.querySelector(sel);
  const msg = (texto, erro = false) => {
    const el = q('[data-grm-msg]');
    el.textContent = texto || '';
    el.style.color = erro ? '#fca5a5' : '#86efac';
  };

  q('[data-grm-favorito]').setAttribute('href', hrefDoFavorito());
  q('[data-grm-favorito]').addEventListener('click', (ev) => {
    ev.preventDefault();
    msg('Este botão é para arrastar até a barra de favoritos; clique nele lá, com o GRM aberto.', true);
  });

  let timer = null;
  let aguardando = false;

  function pintar(linhas) {
    const lista = Array.isArray(linhas) ? linhas : [];
    const agora = Date.now();
    const vigente = lista.find((l) => l.status === 'aplicado' && l.token_exp && new Date(l.token_exp).getTime() > agora);
    q('[data-grm-resumo]').innerHTML = vigente
      ? `<span class="ti-badge" style="background:#14532d;color:#bbf7d0">Em dia</span> Último token enviado pelo painel vale até <strong>${esc(brasilia(vigente.token_exp))}</strong> (Brasília).`
      : '<span class="ti-badge" style="background:#78350f;color:#fde68a">Sem envio válido</span> Nenhum token enviado pelo painel está valendo agora (um token gravado direto no servidor não aparece aqui).';
    q('[data-grm-lista]').innerHTML = lista.length
      ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:4px">Últimos envios</div>${lista.map((l) => {
        const [rotulo, cor] = ROTULO[l.status] || [l.status, '#94a3b8'];
        return `<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:6px 0;border-top:1px solid rgba(148,163,184,.14);font-size:12px">
          <span style="color:#cbd5e1;min-width:130px">${esc(brasilia(l.enviado_em))}</span>
          <strong style="color:${cor}">${esc(rotulo)}</strong>
          <span style="color:#94a3b8">${esc(l.user_email || '')}</span>
          <span style="color:#94a3b8;flex:1">${esc(l.mensagem || '')}</span></div>`;
      }).join('')}`
      : '';
    return lista;
  }

  async function atualizar() {
    const { data, error } = await supabase.rpc('grm_token_entregas_status', { p_limite: 5 });
    if (error) { msg(`Não consegui ler o status: ${error.message}`, true); return []; }
    return pintar(data);
  }

  // Depois de enviar, acompanha até o servidor aplicar/recusar (os agentes buscam a cada ~2 min).
  function acompanhar(idEnviado) {
    clearInterval(timer);
    aguardando = true;
    const limite = Date.now() + 5 * 60 * 1000;
    const volta = async () => {
      const linhas = await atualizar();
      const minha = linhas.find((l) => l.id === idEnviado);
      if (minha && minha.status === 'aplicado') { msg('Pronto: o servidor aplicou o token. Os agentes já podem trabalhar.'); }
      else if (minha && ['recusado', 'expirado', 'substituido'].includes(minha.status)) { msg(minha.mensagem || 'O servidor não aceitou este token.', true); }
      else if (Date.now() < limite) return;
      else msg('O servidor ainda não buscou o token. Se nenhum agente estiver rodando, tente de novo em instantes ou grave direto no servidor (grm-token-cache.js salvar).', true);
      clearInterval(timer);
      aguardando = false;
    };
    timer = setInterval(() => volta().catch(() => {}), 4000);
  }

  async function enviar(token) {
    const limpo = String(token || '').trim();
    if (!limpo) { msg('Não há token para enviar.', true); return false; }
    msg('Enviando…');
    const { data, error } = await supabase.rpc('grm_token_entregar', { p_token: limpo });
    if (error) { msg(error.message, true); return false; }
    msg(`Token recebido${data && data.user_email ? ` (conta ${data.user_email})` : ''}. Aguardando o servidor aplicar…`);
    await atualizar();
    acompanhar(data && data.id);
    return true;
  }

  q('[data-grm-colar]').addEventListener('click', async () => {
    let texto = '';
    try { texto = await navigator.clipboard.readText(); } catch { /* sem permissão: usa o campo manual */ }
    if (!texto || !texto.trim()) {
      q('details').open = true;
      q('[data-grm-texto]').focus();
      msg('Não consegui ler a área de transferência. Cole o token no campo abaixo.', true);
      return;
    }
    await enviar(texto);
  });

  q('[data-grm-enviar]').addEventListener('click', async () => {
    const campo = q('[data-grm-texto]');
    const ok = await enviar(campo.value);
    if (ok) campo.value = '';
  });

  // Entrega pelo favorito: só aceita mensagem do site do GRM, vinda da janela que abriu esta.
  const aoReceber = async (ev) => {
    if (!window.opener || ev.origin !== GRM_ORIGIN || ev.source !== window.opener) return;
    if (!ev.data || ev.data.tipo !== MSG_TOKEN || typeof ev.data.token !== 'string') return;
    await enviar(ev.data.token);
  };
  window.addEventListener('message', aoReceber);
  if (window.opener && window.location.hash === '#grm-token') {
    try { window.opener.postMessage({ tipo: MSG_PRONTO }, GRM_ORIGIN); } catch { /* aba de origem fechada */ }
    msg('Aguardando o token do GRM…');
  }

  desmontarAnterior = () => {
    clearInterval(timer);
    window.removeEventListener('message', aoReceber);
    raiz.remove();
    desmontarAnterior = null;
  };

  atualizar().catch(() => {});
  return { destruir: desmontarAnterior, get aguardando() { return aguardando; } };
}
