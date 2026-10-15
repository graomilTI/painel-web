// Relatórios — importação — detecção do tipo de relatório pelo nome do arquivo e do período pelo conteúdo.
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.
import { loadXlsx, normalizeHeader, toIsoDate, headerMatches, findHeaderRow } from './relatorios-planilha.js?v=20261015-relatorios1';

  function extractPeriodFromRows(rows, tipo) {
    const dates = [];
    if (!Array.isArray(rows) || !rows.length) return null;

    if (tipo === 'despesas') {
      const first = rows[0] || [];
      first.forEach((cell) => {
        const iso = toIsoDate(cell);
        if (iso) dates.push(iso);
      });
    } else if (tipo === 'financeiro_contas_receber' || tipo === 'financeiro_contas_pagar') {
      const hrow = findHeaderRow(rows, ['Vencimento', 'Valor']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['vencimento', 'data vencimento', 'dt vencimento'].some((alias) => headerMatches(h, alias)));
      if (idxData >= 0) rows.slice(hrow + 1).forEach((row) => { const iso = toIsoDate(row?.[idxData]); if (iso) dates.push(iso); });
    } else if (tipo === 'uber_corridas') {
      const hrow = findHeaderRow(rows, ['NOME', 'Data da solicitação (local)', 'Endereço de partida']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['data da solicitação local', 'data da solicitacao local', 'data solicitacao local', 'data'].some((alias) => headerMatches(h, alias)));
      if (idxData >= 0) {
        rows.slice(hrow + 1).forEach((row) => {
          const iso = toIsoDate(row?.[idxData]);
          if (iso) dates.push(iso);
        });
      }
    } else {
      const hrow = findHeaderRow(rows, ['Data']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['data', 'data n.f.', 'data nf', 'data da nf', 'data nota'].some((alias) => headerMatches(h, alias)));
      if (idxData >= 0) {
        rows.slice(hrow + 1).forEach((row) => {
          const iso = toIsoDate(row?.[idxData]);
          if (iso) dates.push(iso);
        });
      }
    }

    const unique = [...new Set(dates)].sort();
    if (!unique.length) return null;
    return {
      inicio: unique[0],
      fim: unique[unique.length - 1],
      totalDatas: unique.length,
    };
  }

  async function detectFilePeriod(file, tipo) {
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return null;
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const preferred = workbook.SheetNames.find((name) => normalizeHeader(name).includes('resultado')) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[preferred];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      return extractPeriodFromRows(rows, tipo);
    } catch (err) {
      console.warn('[RELATORIOS] Não foi possível detectar período:', err);
      return null;
    }
  }

  function detectRelatorio(fileName) {
    const rawName = String(fileName || '').toLowerCase();
    const n = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ç/g, 'c');

    if ((n.includes('excesso') || n.includes('excesos') || n.includes('velocidade') || n.includes('velocidad')) && !n.includes('patrimonio') && !n.includes('patrimônio')) {
      return { tipo: 'frotas_excesso_velocidade', titulo: 'Excesso de Velocidade - Frotas' };
    }

    if (n.includes('uber') || n.includes('corridas')) {
      return { tipo: 'uber_corridas', titulo: 'Relatório Uber' };
    }

    if (
      (n.includes('funcionario') || n.includes('funcionarios') || n.includes('funcionário') || n.includes('funcionários') || n.includes('colaboradores') || n.includes('colaborador')) &&
      !(n.includes('endereco') || n.includes('endereço') || n.includes('gps') || n.includes('auditoria') || n.includes('auditorias'))
    ) {
      return { tipo: 'colaboradores_rh', titulo: 'Base de Funcionários / Colaboradores' };
    }


    if (n.includes('btg') || n.includes('pactual') || n.includes('sertrading')) {
      return { tipo: 'logistica_btg', titulo: 'Logística BTG · Solicitações' };
    }
    if ((n.includes('distribuicao') || n.includes('distribuição')) && (n.includes('os') || n.includes('o.s') || n.includes('ordem'))) {
      return { tipo: 'operacional_os_distribuicao', titulo: 'Distribuição de O.S. · Colaboradores' };
    }

    if ((n.includes('auditoria') || n.includes('auditorias')) && (n.includes('relatorio') || n.includes('relatório') || n.includes('lista') || n.includes('auditoria'))) {
      return { tipo: 'auditorias_operacional', titulo: 'Auditorias Operacionais por Colaborador' };
    }
    if (n.includes('lista de oss') || n.includes('lista-de-oss') || n.includes('lista_de_oss') || n.includes('lista de os') || n.includes('lista-de-os') || n.includes('lista_de_os') || n.includes('ordem de servico') || n.includes('ordem de serviço') || n.includes('relatorio os') || n.includes('relatório os') || n.includes('operacional os') || n.includes('o.s')) {
      return { tipo: 'operacional_os', titulo: 'Lista de O.S. Operacional' };
    }


    if ((n.includes('endereco') || n.includes('endereço') || n.includes('gps')) && (n.includes('colaborador') || n.includes('colaboradores'))) {
      return { tipo: 'colaboradores_operacional', titulo: 'Endereços dos Colaboradores Operacional' };
    }

    if ((n.includes('mapa') && n.includes('g1000')) || n.includes('ponto-embarque') || n.includes('pontos-embarque') || n.includes('pontos_de_embarque') || n.includes('pontos de embarque')) {
      return { tipo: 'pontos_embarque', titulo: 'Pontos de Embarque Operacional' };
    }

    if (
      (n.includes('movimento') && n.includes('diario')) ||
      (n.includes('mapa') && n.includes('embarque')) ||
      (n.includes('embarque') && n.includes('laudo')) ||
      n.includes('mapa_embarque') ||
      n.includes('mapa-de-embarque')
    ) {
      return { tipo: 'logistica_mapa_embarque', titulo: 'Logística · Mapa de Embarque' };
    }

    if ((n.includes('producao') || n.includes('produção')) && (n.includes('diaria') || n.includes('diária') || n.includes('diario') || n.includes('diário'))) {
      return { tipo: 'producao', titulo: 'Produção Diária' };
    }

    if ((n.includes('historico') || n.includes('histórico') || n.includes('producao') || n.includes('produção') || n.includes('planilha')) && (n.includes('hospedagem') || n.includes('hospedagens') || n.includes('hotel') || n.includes('hoteis') || n.includes('hotéis'))) {
      return { tipo: 'hospedagem_historico', titulo: 'Hospedagem · Histórico de Colaboradores' };
    }

    if (n.includes('hotel') || n.includes('hoteis') || n.includes('hotéis') || n.includes('hospedagem') || n.includes('hospedagens')) {
      return { tipo: 'hoteis', titulo: 'Banco de Hotéis' };
    }

    if ((n.includes('contas') || n.includes('conta')) && n.includes('receber')) {
      return { tipo: 'financeiro_contas_receber', titulo: 'Financeiro · Contas a Receber' };
    }
    if ((n.includes('contas') || n.includes('conta') || n.includes('lista')) && n.includes('pagar')) {
      return { tipo: 'financeiro_contas_pagar', titulo: 'Financeiro · Contas a Pagar' };
    }

    if (n.includes('nota') || n.includes('fiscal') || n.includes('nfse') || n.includes('nfe')) {
      return { tipo: 'notas_fiscais', titulo: 'Notas Fiscais' };
    }
    if (n.includes('despesa')) {
      return { tipo: 'despesas', titulo: 'Relatório de Despesas' };
    }
    if ((n.includes('resultado') && (n.includes('diario') || n.includes('diário'))) || n.includes('resultado-diario')) {
      return { tipo: 'resultado-diario', titulo: 'Relatório Resultado Diário' };
    }
    if (n.includes('gavilon')) {
      return { tipo: 'resultado-diario-gavilon', titulo: 'Relatório Resultado Diário Gavilon' };
    }
    if (n.includes('resultado')) {
      return { tipo: 'resultado-diario', titulo: 'Relatório Resultado Diário' };
    }
    if (n.includes('producao') || n.includes('produção')) {
      return { tipo: 'producao', titulo: 'Produção Diária' };
    }
    if (n.includes('patrimonio') || n.includes('patrimônio')) {
      return { tipo: 'patrimonios', titulo: 'Relatório de Patrimônios' };
    }
    if (n.includes('caixa') || n.includes('fornecedor')) {
      return { tipo: 'caixa_fornecedor', titulo: 'Caixa Fornecedor' };
    }
    if (n.includes('carga')) {
      return { tipo: 'cargas', titulo: 'Relatório de Cargas' };
    }
    if (n.includes('faturado') || n.includes('faturamento')) {
      return { tipo: 'servicos_faturados', titulo: 'Serviços Faturados' };
    }
    if (n.includes('clinica') || n.includes('clínica')) {
      return { tipo: 'clinicas_sst', titulo: 'Clínicas SST (Segurança do Trabalho)' };
    }

    return { tipo: 'outros', titulo: 'Outros Relatórios' };
  }

export { detectFilePeriod, detectRelatorio };
