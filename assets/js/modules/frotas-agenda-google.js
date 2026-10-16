// Frotas > Rastreadores > Agenda: "Sincronizar com Google Agenda".
// Cada usuário que quiser gera um link pessoal (feed .ics) e o Google passa a atualizar sozinho a agenda de
// instalações e manutenções. O link e o conteúdo vêm da Edge Function frotas-agenda-ics; quem tem o link lê a agenda.
const FUNCAO = 'frotas-agenda-ics';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

// Botão "Adicionar ao Google Agenda": o Google abre a tela de assinatura já com o link preenchido.
export function linkGoogleAgenda(webcal) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
}

async function chamar(supabase, acao) {
  const { data, error } = await supabase.functions.invoke(FUNCAO, { body: { acao } });
  if (error) {
    let msg = error.message || 'Falha ao falar com o servidor.';
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* mantém a mensagem padrão */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data || {};
}

function textoCorpo(estado) {
  if (!estado.ativo) {
    return `
      <p class="fr-sub" style="margin:0 0 12px">Receba as <strong>instalações e manutenções agendadas</strong> direto no seu Google Agenda. É opcional e pessoal: só quem ativar recebe.</p>
      <ul style="margin:0 0 14px;padding-left:18px;color:#cbd5e1;font-size:13px;line-height:1.7">
        <li>O Google atualiza sozinho de tempos em tempos (pode levar algumas horas para uma mudança aparecer).</li>
        <li>Entram os compromissos dos últimos 120 dias em diante; cancelados não aparecem.</li>
        <li>Você pode parar quando quiser.</li>
      </ul>
      <button type="button" class="fr-btn primary" data-gs-ativar>Ativar sincronização</button>`;
  }
  return `
    <p class="fr-sub" style="margin:0 0 12px">Sincronização <strong style="color:#86efac">ativa</strong>. Adicione a agenda ao seu Google Agenda:</p>
    <a class="fr-btn primary" href="${esc(linkGoogleAgenda(estado.webcal))}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex">📅 Adicionar ao Google Agenda</a>
    <div class="fr-field full" style="margin-top:16px">
      <label>Ou cole este link em Google Agenda › Outras agendas › ＋ › De um URL</label>
      <div style="display:flex;gap:8px"><input class="fr-input" readonly value="${esc(estado.url)}" data-gs-url style="flex:1;min-width:0"><button type="button" class="fr-btn ghost" data-gs-copiar>Copiar</button></div>
    </div>
    <div class="fr-ag-aviso" style="margin-top:14px">⚠️ Este link é <strong>pessoal</strong>: quem o tiver vê a agenda. Não compartilhe. Se vazar, gere um novo (o antigo para de funcionar).</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button type="button" class="fr-btn ghost" data-gs-novo>Gerar novo link</button>
      <button type="button" class="fr-btn ghost" data-gs-parar>Parar de sincronizar</button>
    </div>`;
}

export async function abrirSincronizacaoGoogle({ supabase, toast = () => {} }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'fr-modal-backdrop';
  backdrop.innerHTML = `
    <div class="fr-modal" role="dialog" aria-modal="true" aria-label="Sincronizar com Google Agenda" style="width:min(560px,96vw)">
      <div class="fr-modal-head"><div><h3>Sincronizar com Google Agenda</h3><p>Agenda de instalações e manutenções de rastreadores.</p></div><button class="fr-btn ghost fr-mini" data-gs-fechar aria-label="Fechar">✕</button></div>
      <div class="fr-modal-body" data-gs-corpo><p class="fr-sub">Carregando...</p></div>
    </div>`;
  document.body.appendChild(backdrop);
  const corpo = backdrop.querySelector('[data-gs-corpo]');
  const fechar = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-gs-fechar]')) fechar(); });

  const mostrar = (estado) => { corpo.innerHTML = textoCorpo(estado); };
  const executar = async (acao, btn, aviso) => {
    if (btn) btn.disabled = true;
    try {
      const estado = await chamar(supabase, acao);
      mostrar(estado);
      if (aviso) toast(aviso);
    } catch (err) {
      console.error('[agenda-google]', err);
      toast(err?.message || 'Não foi possível concluir.', true);
      if (btn) btn.disabled = false;
    }
  };

  corpo.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-gs-ativar]')) return executar('obter', b, 'Sincronização ativada.');
    if (b.matches('[data-gs-parar]')) {
      if (b.dataset.confirma !== '1') { b.dataset.confirma = '1'; b.textContent = 'Clique de novo para confirmar'; setTimeout(() => { b.dataset.confirma = '0'; b.textContent = 'Parar de sincronizar'; }, 4000); return; }
      return executar('cancelar', b, 'Sincronização desativada. Remova a agenda no Google Agenda também.');
    }
    if (b.matches('[data-gs-novo]')) {
      if (b.dataset.confirma !== '1') { b.dataset.confirma = '1'; b.textContent = 'Clique de novo: o link atual deixa de funcionar'; setTimeout(() => { b.dataset.confirma = '0'; b.textContent = 'Gerar novo link'; }, 4000); return; }
      return executar('regenerar', b, 'Novo link gerado. Atualize a agenda no Google Agenda com o link novo.');
    }
    if (b.matches('[data-gs-copiar]')) {
      const url = corpo.querySelector('[data-gs-url]')?.value || '';
      try { await navigator.clipboard.writeText(url); toast('Link copiado.'); }
      catch { corpo.querySelector('[data-gs-url]')?.select(); toast('Selecione e copie o link (Ctrl+C).'); }
    }
  });

  try { mostrar(await chamar(supabase, 'status')); }
  catch (err) { corpo.innerHTML = `<p class="fr-sub" style="color:#fca5a5">${esc(err?.message || 'Não foi possível carregar.')}</p>`; }
}

export const __teste = { linkGoogleAgenda, textoCorpo };
