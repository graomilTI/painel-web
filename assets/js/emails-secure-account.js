import { supabase } from './supabaseClient.js';

// Keep credentials out of browser queries while preserving the legacy screen API.
const originalFrom = supabase.from.bind(supabase);
supabase.from = (relation) => {
  const safeRelation = relation === 'email_accounts' ? 'email_accounts_public' : relation;
  const builder = originalFrom(safeRelation);

  return builder;
};

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
