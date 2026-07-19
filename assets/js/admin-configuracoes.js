// Configurações — hub de administração do sistema.
//
// As configurações reais do painel vivem em telas dedicadas (Usuários e
// Acessos, TI > Integrações, TI > Contatos de Notificação, Central de
// E-mails, TI > Agentes). Esta tela NÃO duplica esses CRUDs — ela é o mapa:
// mostra onde cada coisa é configurada, com contadores ao vivo do banco pra
// diretoria enxergar o estado do sistema num lugar só.
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function countSafe(builder) {
  try {
    const { count, error } = await builder;
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    console.warn('[Configurações]', e);
    return null;
  }
}

const CARDS = [
  {
    id: 'usuarios',
    titulo: 'Usuários e Acessos',
    desc: 'Contas do painel, perfis e módulos liberados por usuário.',
    url: 'admin-usuarios',
    icone: '👥',
    contador: () => countSafe(supabase.from('app_usuarios').select('id', { count: 'exact', head: true }).eq('ativo', true)),
    contadorLabel: 'usuários ativos',
  },
  {
    id: 'modulos',
    titulo: 'Módulos do sistema',
    desc: 'Catálogo de módulos/permissões atribuíveis aos perfis.',
    url: 'admin-usuarios',
    icone: '🧩',
    contador: () => countSafe(supabase.from('app_modulos').select('id', { count: 'exact', head: true })),
    contadorLabel: 'módulos cadastrados',
  },
  {
    id: 'integracoes',
    titulo: 'Integrações e segredos',
    desc: 'APIs externas (BFleet, DETRAN, BotConversa, Correios…) e suas chaves.',
    url: 'ti-integracoes',
    icone: '🔌',
    contador: () => countSafe(supabase.from('ti_integracoes').select('id', { count: 'exact', head: true }).eq('ativo', true)),
    contadorLabel: 'integrações ativas',
  },
  {
    id: 'notificacoes',
    titulo: 'Contatos de notificação',
    desc: 'Quem recebe avisos de Compras/Financeiro por WhatsApp (BotConversa).',
    url: 'ti-contatos',
    icone: '📣',
    contador: () => countSafe(supabase.from('compras_notificacoes_config').select('id', { count: 'exact', head: true }).eq('ativo', true)),
    contadorLabel: 'contatos ativos',
  },
  {
    id: 'emails',
    titulo: 'Contas de e-mail',
    desc: 'Contas cPanel conectadas à Central de E-mails.',
    url: 'emails',
    icone: '✉️',
    contador: () => countSafe(supabase.from('email_accounts').select('id', { count: 'exact', head: true })),
    contadorLabel: 'contas conectadas',
  },
  {
    id: 'agentes',
    titulo: 'Agentes de sincronização',
    desc: 'Monitor dos syncs GRM/BFleet/BotConversa (worker + Edge Functions).',
    url: 'ti-agentes',
    icone: '🤖',
    contador: () => countSafe(supabase.from('grm_sync_jobs').select('id', { count: 'exact', head: true }).gte('created_at', `${new Date().toISOString().slice(0, 10)}T00:00:00`)),
    contadorLabel: 'jobs hoje',
  },
];

function styles() {
  return `<style>
    .cfg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
    .cfg-card{display:flex;flex-direction:column;gap:10px;background:rgba(8,22,17,.68);border:1px solid var(--line);border-radius:20px;padding:20px;text-decoration:none;color:inherit;transition:.15s ease}
    .cfg-card:hover{border-color:rgba(111,208,165,.45);background:rgba(15,35,27,.72)}
    .cfg-card-head{display:flex;align-items:center;gap:10px}
    .cfg-card-head .ico{font-size:22px}
    .cfg-card-head h3{margin:0;font-size:15px;color:#f8fafc}
    .cfg-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.45;flex:1}
    .cfg-count{display:flex;align-items:baseline;gap:7px}
    .cfg-count b{font-size:26px;font-weight:900;color:#dcfce7;line-height:1}
    .cfg-count span{font-size:12px;color:var(--muted)}
    .cfg-go{font-size:12.5px;font-weight:800;color:#86efac}
  </style>`;
}

export async function renderContent(content) {
  content.innerHTML = `${styles()}
  <section class="hero-card"><div><div class="eyebrow">Diretoria</div><h2>Configurações</h2><p>Mapa das configurações do sistema — cada área é gerenciada na própria tela; aqui você vê o estado geral e navega direto.</p></div><div class="hero-badge-wrap"><span class="hero-badge">ADMIN</span></div></section>
  <div class="cfg-grid mt-16">
    ${CARDS.map((c) => `<a class="cfg-card" href="./${esc(c.url)}" data-cfg-card="${esc(c.id)}">
      <div class="cfg-card-head"><span class="ico">${c.icone}</span><h3>${esc(c.titulo)}</h3></div>
      <p>${esc(c.desc)}</p>
      <div class="cfg-count"><b data-cfg-count="${esc(c.id)}">…</b><span>${esc(c.contadorLabel)}</span></div>
      <span class="cfg-go">Abrir ${esc(c.titulo)} →</span>
    </a>`).join('')}
  </div>`;

  // Contadores em paralelo, sem travar o render — cada card atualiza quando
  // a própria consulta responde ("—" quando a consulta falhar/sem permissão).
  CARDS.forEach(async (c) => {
    const n = await c.contador();
    const el = content.querySelector(`[data-cfg-count="${c.id}"]`);
    if (el) el.textContent = n == null ? '—' : String(n);
  });
}

initProtectedPage('Configurações', renderContent);
