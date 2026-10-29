// Frotas · Manutenção › Preventiva › Importar histórico: planilha com a última vez que cada plano do guia foi feito
// em cada veículo (placa, plano, data, km). Sem esse histórico todo plano fica "sem histórico" e nada vence.
// A importação roda pela RPC frotas_manutencao_importar_historico (cria manutenções concluídas, sem custo e sem NF).
import { closeModal, esc, openModal, toast } from '../core/ui.js';
import { COLUNAS_HISTORICO, descreverIntervalo, normalizarLinhaHistorico } from './frotas-manutencao-regras.js?v=20261029-frotas-manut71';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
const MODAL = 'fmHistorico';
const LOTE = 500;

async function carregarXlsx() {
  return import(/* @vite-ignore */ XLSX_URL);
}

async function baixarModelo(supabase) {
  const XLSX = await carregarXlsx();
  const { data: planos } = await supabase.from('frotas_manutencao_planos').select('codigo,nome,categoria_codigo,tipo,intervalo_km,intervalo_km_max,intervalo_meses,intervalo_meses_max,intervalo_dias,veiculo_id,ativo')
    .order('categoria_codigo', { ascending: true });
  const padrao = (planos || []).filter((p) => !p.veiculo_id && p.ativo !== false && p.tipo === 'servico');
  const modelo = XLSX.utils.aoa_to_sheet([
    COLUNAS_HISTORICO,
    ['ABC1D23', padrao[0]?.codigo || 'oleo_motor', '10/05/2026', 41200],
    ['ABC1D23', padrao[1]?.codigo || 'pastilhas_freio', '10/05/2026', 41200],
  ]);
  const lista = XLSX.utils.aoa_to_sheet([
    ['Código (use na coluna Plano)', 'Nome', 'Categoria do guia', 'Intervalo'],
    ...padrao.map((p) => [p.codigo, p.nome, p.categoria_codigo, descreverIntervalo(p)]),
  ]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, modelo, 'HISTORICO');
  XLSX.utils.book_append_sheet(livro, lista, 'PLANOS');
  XLSX.writeFile(livro, 'modelo_historico_manutencao.xlsx', { compression: true });
}

async function lerPlanilha(arquivo) {
  const XLSX = await carregarXlsx();
  const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array', cellDates: true });
  const aba = livro.Sheets.HISTORICO || livro.Sheets[livro.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(aba, { defval: '', raw: true });
  const lidas = [];
  linhas.forEach((row, i) => {
    const l = normalizarLinhaHistorico(row);
    if (l) lidas.push({ ...l, __linha: i + 2 });
  });
  return lidas;
}

export function abrirImportacaoHistorico({ supabase, aoConcluir = () => {} }) {
  const ov = openModal({
    id: MODAL,
    conteudoHtml: `<div class="fm-mod-head"><div><h3>Importar histórico de manutenção</h3><p>Informe a última vez que cada serviço foi feito em cada veículo. Daí em diante o painel calcula os vencimentos e abre as solicitações sozinho.</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
      <div class="fm-sec"><h4>1. Planilha</h4>
        <div class="fm-mm" style="font-size:12px;line-height:1.6">Colunas: <strong>Placa</strong>, <strong>Plano</strong> (código ou nome, como na aba PLANOS do modelo), <strong>Data</strong> (dd/mm/aaaa) e <strong>Km</strong> do veículo na data. Várias linhas da mesma placa, data e km viram uma única manutenção. Reimportar a mesma linha não duplica.</div>
        <div class="fm-acoes" style="justify-content:flex-start"><button class="fm-btn soft" type="button" data-acao="modelo">Baixar modelo</button><input class="fm-input" type="file" accept=".xlsx,.xls,.csv" data-arquivo style="max-width:360px"></div></div>
      <div class="fm-sec" data-previa style="display:none"><h4>2. Conferência</h4><div data-previa-texto class="fm-ro"></div>
        <div class="fm-acoes"><button class="fm-btn primary" type="button" data-acao="importar" disabled>Importar</button></div></div>
      <div data-resultado></div>`,
  });
  ov.classList.add('fm-mod');
  let linhas = [];

  ov.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-acao]'); if (!a) return;
    if (a.dataset.acao === 'fechar') return closeModal(MODAL);
    if (a.dataset.acao === 'modelo') {
      try { await baixarModelo(supabase); } catch (err) { toast(err.message || 'Erro ao gerar o modelo.', 'err'); }
      return;
    }
    if (a.dataset.acao === 'importar') {
      const botao = a; botao.disabled = true; botao.textContent = 'Importando...';
      let criadas = 0; let ignoradas = 0; const erros = [];
      try {
        for (let i = 0; i < linhas.length; i += LOTE) {
          const lote = linhas.slice(i, i + LOTE);
          const { data, error } = await supabase.rpc('frotas_manutencao_importar_historico', {
            p_linhas: lote.map(({ placa, plano, data: d, km }) => ({ placa, plano, data: d, km })),
          });
          if (error) throw new Error(error.message);
          criadas += data.criadas; ignoradas += data.ignoradas;
          for (const er of data.erros || []) erros.push({ linha: lote[er.linha - 1]?.__linha ?? er.linha, motivo: er.motivo });
        }
        ov.querySelector('[data-resultado]').innerHTML = `<div class="fm-sec"><h4>Resultado</h4>
          <div class="fm-ro">${criadas} manutenção(ões) criada(s) · ${ignoradas} item(ns) já existiam · ${erros.length} linha(s) com erro</div>
          ${erros.length ? `<ul class="fm-erros">${erros.slice(0, 40).map((x) => `<li>Linha ${x.linha}: ${esc(x.motivo)}</li>`).join('')}${erros.length > 40 ? `<li>… e mais ${erros.length - 40}</li>` : ''}</ul>` : ''}</div>`;
        botao.textContent = 'Importado';
        toast(`${criadas} manutenção(ões) importada(s).`);
        aoConcluir();
      } catch (err) {
        botao.disabled = false; botao.textContent = 'Importar';
        ov.querySelector('[data-resultado]').innerHTML = `<ul class="fm-erros"><li>${esc(err.message || 'Erro ao importar.')}</li></ul>`;
      }
    }
  });

  ov.querySelector('[data-arquivo]').addEventListener('change', async (e) => {
    const arquivo = e.target.files?.[0]; if (!arquivo) return;
    const previa = ov.querySelector('[data-previa]');
    try {
      linhas = await lerPlanilha(arquivo);
      const placas = new Set(linhas.map((l) => String(l.placa).toUpperCase().replace(/[^A-Z0-9]/g, '')));
      previa.style.display = '';
      ov.querySelector('[data-previa-texto]').textContent = linhas.length
        ? `${linhas.length} linha(s) lida(s), ${placas.size} veículo(s). Placas ou planos desconhecidos voltam como erro e não impedem as demais linhas.`
        : 'Nenhuma linha encontrada. Confira os cabeçalhos: Placa, Plano, Data e Km.';
      ov.querySelector('[data-acao="importar"]').disabled = !linhas.length;
    } catch (err) {
      previa.style.display = '';
      ov.querySelector('[data-previa-texto]').textContent = `Não consegui ler a planilha: ${err.message || err}`;
      ov.querySelector('[data-acao="importar"]').disabled = true;
    }
  });
}
