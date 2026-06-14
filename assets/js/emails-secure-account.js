import { supabase } from './supabaseClient.js';

function value(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function checked(id) {
  return document.getElementById(id)?.checked === true;
}

// Capture the account form before the legacy direct-table handler runs.
document.addEventListener('submit', async (event) => {
  if (event.target?.id !== 'emAccountForm') return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const submit = event.target.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Salvando com segurança...';
  }

  const payload = {
    id: value('accId') || null,
    nome: value('accNome'),
    email: value('accEmail'),
    username: value('accUsername'),
    password: document.getElementById('accPassword')?.value || '',
    imap_host: value('accImapHost'),
    imap_port: Number(value('accImapPort') || 993),
    imap_secure: checked('accImapSecure'),
    smtp_host: value('accSmtpHost'),
    smtp_port: Number(value('accSmtpPort') || 465),
    smtp_secure: checked('accSmtpSecure'),
    limite_por_sync: Number(value('accLimit') || 30),
    ativo: checked('accAtivo'),
    auto_responder: checked('accAuto'),
  };

  try {
    const { data, error } = await supabase.functions.invoke('email-account-save', { body: payload });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível salvar a conta.');
    alert('Conta salva com a credencial protegida.');
    window.location.reload();
  } catch (error) {
    alert(error?.message || 'Não foi possível salvar a conta de e-mail.');
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Salvar conta';
    }
  }
}, true);
