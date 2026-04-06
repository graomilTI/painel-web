import { initProtectedPage } from './pageInit.js';
import { toPanelUrl } from './paths.js';

initProtectedPage('Patrimônio ADM', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Patrimônio ADM</h2>
          <p class="section-subtitle">
            Central do módulo de patrimônios para operar relatórios, importar a base diária e seguir a lógica herdada da planilha.
          </p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('adm-patrimonio')}" class="active">Painel de Patrimônios</a>
          <a href="${toPanelUrl('patrimonio-relatorios')}">Relatórios</a>
          <a href="${toPanelUrl('importar-patrimonios')}">Importar arquivo</a>
        </div>
      </div>

      <div class="grid-cards">
        <article class="card">
          <h3>Relatórios PDF / ZIP</h3>
          <p class="muted">Página operacional para gerar Patrimônios, Equipamentos e Status Grãomil com filtros de coordenação, atraso e situação.</p>
          <p class="mt-16"><a href="${toPanelUrl('patrimonio-relatorios')}" class="base-button primary" style="display:inline-flex;width:auto;text-decoration:none;">Abrir relatórios</a></p>
        </article>

        <article class="card">
          <h3>Importação diária</h3>
          <p class="muted">A rotina de upload permanece em <strong>RELATÓRIOS</strong>, mas pode ser acessada daqui para manter o fluxo do time.</p>
          <p class="mt-16"><a href="${toPanelUrl('importar-patrimonios')}" class="base-button secondary" style="display:inline-flex;width:auto;text-decoration:none;">Ir para importação</a></p>
        </article>

        <article class="card">
          <h3>Regras herdadas da planilha</h3>
          <ul class="muted" style="margin:0;padding-left:18px;line-height:1.8;">
            <li>Ignorar itens Baixado e Manutenção</li>
            <li>Limite de 10 dias, ou 30 dias para Administrativo</li>
            <li>Relatórios por coordenação, com opção TODAS</li>
            <li>Filtro de ativos / inativos com base de colaboradores</li>
          </ul>
        </article>
      </div>

      <article class="base-card">
        <h3 style="margin-top:0">Próximas rotinas do módulo</h3>
        <div class="base-grid">
          <div class="base-field half">
            <div class="base-mini">
              <div class="base-mini-label">Consulta individual</div>
              <div class="muted">A lógica do script Consulta.js já foi considerada na estrutura. O próximo passo pode transformar isso em busca por colaborador com retorno pronto para WhatsApp/Bot.</div>
            </div>
          </div>
          <div class="base-field half">
            <div class="base-mini">
              <div class="base-mini-label">Desligados</div>
              <div class="muted">A rotina de desligados também pode virar uma tela própria depois, usando a base importada de equipamentos e colaboradores.</div>
            </div>
          </div>
        </div>
      </article>
    </section>
  `;
});
