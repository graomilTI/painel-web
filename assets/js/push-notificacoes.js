// Notificações push do painel (celular e computador), mesmo com o painel fechado.
// O envio é feito pela edge function push-notify quando uma linha é gravada em
// painel_notificacoes; aqui só cuidamos de pedir permissão e inscrever o aparelho.
import { supabase, SUPABASE_URL } from './supabaseClient.js';

// Chave pública VAPID (a privada fica só nos segredos da edge function).
const VAPID_PUBLIC_KEY = 'BEQNOF0T1C9nyDD2SxlkGcpKEuPwHysb9AI6-z5S2bCg6Hc0CGvYfLKCf-X9qPyvgsnEFV3fzvopV5evOLfrO9w';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing.active ? existing : navigator.serviceWorker.ready;
  await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
}

async function salvarInscricao(userId, subscription) {
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

// 'nao-suportado' | 'ios-instalar' | 'bloqueado' | 'inativo' | 'ativo'
export async function estadoPush() {
  if (!pushSuportado()) return isIos() && !isStandalone() ? 'ios-instalar' : 'nao-suportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission !== 'granted') return 'inativo';
  try {
    const reg = await getRegistration();
    return (await reg.pushManager.getSubscription()) ? 'ativo' : 'inativo';
  } catch {
    return 'inativo';
  }
}

export async function ativarPush(userId) {
  if (!pushSuportado()) throw new Error('Este navegador não suporta notificações push.');
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Permissão de notificação não concedida.');

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await salvarInscricao(userId, sub);
  return sub;
}

export async function desativarPush() {
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function enviarTestePush() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Sessão expirada.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ teste: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'Falha ao enviar o teste.');
  return body;
}

// Se a permissão já foi dada, garante que a inscrição deste aparelho continue
// salva (o navegador pode renovar o endpoint) sem pedir nada ao usuário.
export async function sincronizarPush(userId) {
  try {
    if (!userId || !pushSuportado() || Notification.permission !== 'granted') return;
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await salvarInscricao(userId, sub);
  } catch (err) {
    console.warn('[push] sincronização', err);
  }
}

const TEXTOS = {
  'nao-suportado': 'Este navegador não suporta notificações push.',
  'ios-instalar': 'No iPhone: toque em Compartilhar › "Adicionar à Tela de Início", abra o painel por esse ícone e ative aqui.',
  bloqueado: 'Notificações bloqueadas neste navegador. Libere nas configurações do site (cadeado ao lado do endereço).',
  inativo: 'Receba avisos de O.S., correções e outros no celular e no computador, mesmo com o painel fechado.',
  ativo: 'Avisos ativados neste aparelho.',
};

// Desenha o controle (texto + botões) dentro de `container`.
export async function renderControlePush(container, userId) {
  if (!container) return;
  const estado = await estadoPush();
  const podeAtivar = estado === 'inativo';
  container.innerHTML = `
    <div class="push-ctl" data-estado="${estado}">
      <div class="push-ctl-txt">${TEXTOS[estado]}</div>
      <div class="push-ctl-acoes">
        ${podeAtivar ? '<button type="button" class="btn btn-primary" data-push-ativar>Ativar avisos</button>' : ''}
        ${estado === 'ativo' ? '<button type="button" class="btn btn-secondary" data-push-teste>Enviar teste</button><button type="button" class="btn btn-secondary" data-push-desativar>Desativar</button>' : ''}
      </div>
      <div class="push-ctl-msg" data-push-msg></div>
    </div>`;

  const msg = container.querySelector('[data-push-msg]');
  const say = (t) => { if (msg) msg.textContent = t || ''; };
  const run = async (btn, fn, ok) => {
    btn.disabled = true;
    say('');
    try {
      await fn();
      if (ok) say(ok);
    } catch (err) {
      say(err?.message || 'Não foi possível concluir.');
    } finally {
      btn.disabled = false;
    }
  };

  container.querySelector('[data-push-ativar]')?.addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      await ativarPush(userId);
      await renderControlePush(container, userId);
    }));
  container.querySelector('[data-push-desativar]')?.addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      await desativarPush();
      await renderControlePush(container, userId);
    }));
  container.querySelector('[data-push-teste]')?.addEventListener('click', (e) =>
    run(e.currentTarget, () => enviarTestePush(), 'Teste enviado — a notificação deve aparecer em instantes.'));
}
