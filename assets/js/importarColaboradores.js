import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function setSummary(summary = {}) {
  document.getElementById('sumLinhas').textContent = summary.lidas ?? 0;
  document.getElementById('sumValidas').textContent = summary.validas ?? 0;
  document.getElementById('sumStatus').textContent = summary.status ?? 'Aguardando';
}

initProtectedPage('Importar Colaboradores', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Importar Colaboradores</h2>
          <p class="section-subtitle">Envie a planilha diária de colaboradores para registrar o histórico da base no Supabase.</p>
        </div>
        <div class="inline-nav">
          <a class="active" href="${toPanelUrl('importar-colaboradores')}">Importar</a>
          <a href="${toPanelUrl('consultar-colaboradores')}">Consultar</a>
          <a href="${toPanelUrl('historico-colaboradores')}">Histórico</a>
          <a href="${toPanelUrl('consultar-colaboradores')}#exportar">Exportar</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-actions-row compact">
          <div>
            <label class="base-label" for="dataReferencia">Data de referência</label>
            <input class="base-input" type="date" id="dataReferencia" />
          </div>
          <div>
            <label class="base-label" for="arquivoExcel">Arquivo</label>
            <input class="base-input" type="file" id="arquivoExcel" accept=".xlsx,.xls,.csv" />
          </div>
          <div>
            <label class="base-label" for="origemCarga">Origem</label>
            <select class="base-select" id="origemCarga">
              <option value="upload_manual">upload_manual</option>
              <option value="integracao">integracao</option>
            </select>
          </div>
          <div>
            <label class="base-label" for="observacoes">Observações</label>
            <input class="base-input" type="text" id="observacoes" placeholder="Observações da carga" />
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary inline" id="btnImportar">Importar planilha</button>
          <button class="base-button secondary inline" id="btnLimpar">Limpar</button>
        </div>

        <div class="base-summary">
          <div class="base-mini">
            <div class="base-mini-label">Linhas lidas</div>
            <div class="base-mini-value" id="sumLinhas">0</div>
          </div>
          <div class="base-mini">
            <div class="base-mini-label">Linhas válidas</div>
            <div class="base-mini-value" id="sumValidas">0</div>
          </div>
          <div class="base-mini">
            <div class="base-mini-label">Status</div>
            <div class="base-mini-value" id="sumStatus">Aguardando</div>
          </div>
        </div>
      </div>

      <div class="base-card">
        <h3 style="margin-top:0">Retorno da importação</h3>
        <div id="feedback" class="base-status">Selecione um arquivo e clique em "Importar planilha".</div>
      </div>
    </section>
  `;

  const dataInput = document.getElementById('dataReferencia');
  const fileInput = document.getElementById('arquivoExcel');
  const origemInput = document.getElementById('origemCarga');
  const obsInput = document.getElementById('observacoes');
  const feedback = document.getElementById('feedback');
  const btnImportar = document.getElementById('btnImportar');
  const btnLimpar = document.getElementById('btnLimpar');

  if (!dataInput.value) dataInput.value = new Date().toISOString().slice(0, 10);

  btnLimpar.addEventListener('click', () => {
    fileInput.value = '';
    origemInput.value = 'upload_manual';
    obsInput.value = '';
    feedback.textContent = 'Selecione um arquivo e clique em "Importar planilha".';
    setSummary({});
  });

  btnImportar.addEventListener('click', async () => {
    try {
      btnImportar.disabled = true;
      const file = fileInput.files?.[0];
      if (!file) throw new Error('Selecione um arquivo para importar.');

      feedback.textContent = 'Importação preparada. Use a rotina atual do painel para concluir o processamento.';
      setSummary({ lidas: 0, validas: 0, status: 'Preparado' });
    } catch (err) {
      console.error(err);
      feedback.textContent = err.message || 'Erro ao importar.';
      setSummary({ status: 'Erro' });
    } finally {
      btnImportar.disabled = false;
    }
  });
});
