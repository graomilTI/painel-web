// assets/js/modules/notas-fiscais/components/modal.js
// Modal de consulta da NF, com leitura automática (XML/OCR) dos dados.

import { openModal, closeModal, esc, dinheiro, dataBR, badge } from '../../../core/ui.js';
import { extractFromNfFile, salvarDadosExtraidos, descricaoItens, formatCnpj, isUrl } from '../service.js';

export async function abrirModalNf(grupo, { pagamentos, aoLancar }) {
  const overlay = openModal({
    id: 'nfModal',
    conteudoHtml: '<div style="padding:32px;text-align:center;color:#94a3b8">Lendo arquivo da NF...</div>',
  });

  let fornecedor = grupo.fornecedor;
  let cnpj = grupo.cnpj;
  let numero = grupo.numero || '-';
  let ocrStatus = '';

  if (isUrl(grupo.nf_url)) {
    const extracted = await extractFromNfFile(grupo.nf_url);
    if (!document.getElementById('nfModal')) return; // usuário fechou durante a leitura
    if (extracted) {
      if (extracted.fornecedor) fornecedor = extracted.fornecedor;
      if (extracted.cnpj) cnpj = formatCnpj(extracted.cnpj);
      if (extracted.numero) numero = extracted.numero;
      await salvarDadosExtraidos(grupo, extracted, pagamentos);
      ocrStatus = extracted.origem === 'xml' ? 'Lido pelo XML da NF' : 'Lido por OCR da NF';
    } else {
      ocrStatus = 'OCR não conseguiu identificar todos os campos';
    }
  }

  const card = overlay.querySelector('.ds-modal-card');
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px">
      <div>
        <h3 class="ds-modal-title">Detalhes da compra</h3>
        <p style="margin:0;color:#94a3b8;font-size:13px">${dataBR(grupo.comprado_em)}</p>
        ${ocrStatus ? `<p style="margin:6px 0 0;color:#94a3b8;font-size:12px">${esc(ocrStatus)}</p>` : ''}
      </div>
      <button class="ds-btn" id="nfModalClose" type="button" style="flex-shrink:0">Fechar</button>
    </div>
    <div class="ds-modal-grid">
      <div><div class="ds-modal-label">Data</div><div class="ds-modal-value">${dataBR(grupo.comprado_em)}</div></div>
      <div><div class="ds-modal-label">Regional</div><div class="ds-modal-value">${esc(grupo.regional)}</div></div>
      <div><div class="ds-modal-label">Solicitante</div><div class="ds-modal-value">${esc(grupo.solicitante)}</div></div>
      <div><div class="ds-modal-label">Fornecedor</div><div class="ds-modal-value">${esc(fornecedor)}</div></div>
      <div><div class="ds-modal-label">CNPJ do Fornecedor</div><div class="ds-modal-value">${esc(cnpj)}</div></div>
      <div><div class="ds-modal-label">Número do Documento</div><div class="ds-modal-value">${esc(numero)}</div></div>
      <div><div class="ds-modal-label">Valor</div><div class="ds-modal-value" style="font-size:18px;font-weight:700;color:#bbf7d0">${dinheiro(grupo.valor_total)}</div></div>
      <div class="ds-modal-full"><div class="ds-modal-label">Descrição</div><div class="ds-modal-value">${esc(descricaoItens(grupo.itens))}</div></div>
      <div class="ds-modal-full" style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
        ${isUrl(grupo.nf_url) ? `<a class="ds-btn" href="${esc(grupo.nf_url)}" target="_blank" rel="noopener">Baixar NF</a>` : `<span style="color:#94a3b8;font-size:13px">NF: ${esc(grupo.nf_url || '-')}</span>`}
        ${isUrl(grupo.comprovante_url) ? `<a class="ds-btn" href="${esc(grupo.comprovante_url)}" target="_blank" rel="noopener">Baixar Comprovante</a>` : ''}
        ${!grupo.nf_lancado
          ? `<button class="ds-btn ds-btn-primary" id="nfModalLancar" type="button">Lançado</button>`
          : badge(`Lançado ${dataBR(grupo.nf_lancado_em)}`, 'ok')}
      </div>
    </div>`;

  card.querySelector('#nfModalClose').addEventListener('click', () => closeModal('nfModal'));
  const btnLancar = card.querySelector('#nfModalLancar');
  if (btnLancar) {
    btnLancar.addEventListener('click', async () => {
      btnLancar.disabled = true;
      btnLancar.textContent = 'Salvando...';
      const ok = await aoLancar(grupo);
      if (ok) closeModal('nfModal');
      else { btnLancar.disabled = false; btnLancar.textContent = 'Lançado'; }
    });
  }
}
