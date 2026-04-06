import { initProtectedPage } from './pageInit.js';
import { flattenAllowedMenu } from './menuBuilder.js';

function getVisibleMenuItems(userContext) {
  const items = flattenAllowedMenu(userContext);
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.code || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderModuleList(items) {
  if (!items.length) {
    return '<p class="empty-state">Nenhum módulo liberado no momento.</p>';
  }

  return `
    <div class="chips">
      ${items.map((m) => `<span class="chip">${m.label || m.name || m.code}</span>`).join('')}
    </div>
  `;
}

initProtectedPage('Dashboard', (content, userContext) => {
  const visibleItems = getVisibleMenuItems(userContext);
  const totalLiberados = visibleItems.length;

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Ambiente autenticado</div>
        <h2>Bem-vindo, ${userContext.user.name}</h2>
        <p>
          Seu painel já está com login real, sessão persistida, proteção de páginas,
          menu dinâmico e logout funcional.
        </p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">${userContext.user.is_master ? 'MASTER' : (userContext.user.role || 'USUÁRIO')}</span>
      </div>
    </section>

    <div class="grid-cards mt-16">
      <article class="card">
        <h3>Usuário</h3>
        <p><strong>Nome:</strong> ${userContext.user.name}</p>
        <p><strong>Email:</strong> ${userContext.user.email || '-'}</p>
        <p><strong>ID:</strong> ${userContext.user.id}</p>
      </article>

      <article class="card">
        <h3>Estrutura</h3>
        <p><strong>Setor:</strong> ${userContext.department?.name || 'Não definido'}</p>
        <p><strong>Perfil:</strong> ${userContext.user.role || 'Não definido'}</p>
        <p><strong>Status:</strong> ${userContext.user.active ? 'Ativo' : 'Inativo'}</p>
      </article>

      <article class="card">
        <h3>Módulos liberados</h3>
        <p class="metric">${totalLiberados}</p>
        <p class="muted">Quantidade visível no menu conforme o contexto do usuário.</p>
      </article>
    </div>

    <article class="card mt-16">
      <h3>Acessos disponíveis</h3>
      ${renderModuleList(visibleItems)}
    </article>

    <article class="card mt-16">
      <h3>Próximos passos recomendados</h3>
      <div class="grid-cards compact-grid">
        <div class="mini-card">
          <strong>RH</strong>
          <span>Ligar telas de férias e histórico ao fluxo real.</span>
        </div>
        <div class="mini-card">
          <strong>Base</strong>
          <span>Conectar importação diária e histórico de colaboradores.</span>
        </div>
        <div class="mini-card">
          <strong>Produção</strong>
          <span>Trazer indicadores e filtros direto do Supabase.</span>
        </div>
        <div class="mini-card">
          <strong>Permissões</strong>
          <span>Refinar módulo por perfil ADM, Gestor e Master.</span>
        </div>
      </div>
    </article>
  `;
});
