// Metas — regras de cálculo: status do mês, metas por regional/estado, projeção, sugestões e multiplicador do bônus (sem HTML nem DOM).
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import { normalizarTexto } from './metas-util.js?v=20261015-metas1';

  function rowKey(row) {
    return normalizarTexto(row.regional || row.coordenacao || row.coordenação || '');
  }

  function isClosedRow(row) {
    return Boolean(row && (row.fechado || row.status_fechamento));
  }

  function isMonthClosed(state) {
    return state.metasCadastro.some(isClosedRow);
  }

  function getRowStatus(row) {
    const explicit = normalizarTexto(row.status_fechamento || '');
    if (explicit === 'ATINGIU' || explicit === 'OK') return 'ATINGIU';
    if (explicit === 'NAO_ATINGIU' || explicit === 'NÃO ATINGIU' || explicit === 'PENDENTE') return 'NAO_ATINGIU';

    const meta = Number(row.meta_tons || 0);
    const produzido = Number(row.produzido_tons || row.produzido_fechamento || 0);
    if (meta <= 0) return 'SEM_META';
    return produzido >= meta ? 'ATINGIU' : 'NAO_ATINGIU';
  }

  function mergeCoordenacoes(state) {
    const map = new Map();

    function put(row, source) {
      const key = rowKey(row);
      if (!key) return;
      const old = map.get(key) || {};
      map.set(key, {
        ...old,
        ...row,
        source: old.source || source,
        estado: row.estado || old.estado || '',
        regional: row.regional || row.coordenacao || old.regional || '',
        meta_tons: row.meta_tons ?? old.meta_tons ?? 0,
        produzido_tons: row.produzido_tons ?? old.produzido_tons ?? 0,
        restante_tons: row.restante_tons ?? old.restante_tons ?? Math.max(0, Number(row.meta_tons || old.meta_tons || 0) - Number(row.produzido_tons || old.produzido_tons || 0)),
        percentual_atingido: row.percentual_atingido ?? old.percentual_atingido ?? 0,
        ativo: row.ativo ?? old.ativo ?? true,
        fechado: row.fechado ?? old.fechado ?? false,
        status_fechamento: row.status_fechamento ?? old.status_fechamento ?? null,
        fechado_em: row.fechado_em ?? old.fechado_em ?? null
      });
    }

    state.producaoCoordenacoes.forEach(row => put(row, 'producao'));
    state.regionais.forEach(row => put(row, 'view'));
    state.metasCadastro.forEach(row => put(row, 'meta'));

    return Array.from(map.values()).sort((a, b) => String(a.regional || '').localeCompare(String(b.regional || ''), 'pt-BR'));
  }

  function contarDiasUteisAte(ano, mes, ateDia) {
    let total = 0;
    for (let d = 1; d <= ateDia; d++) {
      const dow = new Date(ano, mes - 1, d).getDay();
      if (dow !== 0 && dow !== 6) total++;
    }
    return total;
  }

  function projetarProducaoMes(rows, ano, mes) {
    const hoje = new Date();
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const ateDia = (ano === hoje.getFullYear() && mes === hoje.getMonth() + 1)
      ? Math.min(hoje.getDate(), ultimoDia)
      : ultimoDia;

    const diasDecorridos = contarDiasUteisAte(ano, mes, ateDia);
    const diasTotais = contarDiasUteisAte(ano, mes, ultimoDia);
    const fator = diasDecorridos > 0 ? diasTotais / diasDecorridos : 1;

    const producaoTotal = rows.reduce((acc, row) => acc + Number(row.produzido_tons || 0), 0);
    return Math.round(producaoTotal * fator * 100) / 100;
  }

  function calcularSugestoesDistribuicao(rows, totalEstimado) {
    const total = Number(totalEstimado || 0);
    if (!rows.length || !total) return new Map();

    const producaoTotal = rows.reduce((acc, row) => acc + Number(row.produzido_tons || 0), 0);
    const pesoIgual = 1 / rows.length;
    const out = new Map();

    rows.forEach(row => {
      const peso = producaoTotal > 0 ? Number(row.produzido_tons || 0) / producaoTotal : pesoIgual;
      out.set(rowKey(row), Math.round(total * peso * 100) / 100);
    });

    return out;
  }

  function fechamentoResumo(rows) {
    const atingiram = [];
    const naoAtingiram = [];
    const semMeta = [];

    rows.forEach(row => {
      const status = getRowStatus(row);
      if (status === 'ATINGIU') atingiram.push(row);
      else if (status === 'NAO_ATINGIU') naoAtingiram.push(row);
      else semMeta.push(row);
    });

    return { atingiram, naoAtingiram, semMeta };
  }

  function totalsFromRegional(rows) {
    const meta = rows.reduce((acc, r) => acc + Number(r.meta_tons || 0), 0);
    const produzido = rows.reduce((acc, r) => acc + Number(r.produzido_tons || 0), 0);
    const restante = Math.max(0, meta - produzido);
    const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
    const best = [...rows].sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0))[0];
    const bestEstado = rows.reduce((map, row) => {
      const estado = row.estado || 'Sem estado';
      map[estado] = (map[estado] || 0) + Number(row.produzido_tons || 0);
      return map;
    }, {});
    const estadoTop = Object.entries(bestEstado).sort((a, b) => b[1] - a[1])[0];

    return { meta, produzido, restante, percentual, best, estadoTop };
  }

  function calcularLinhaMeta(row) {
    const meta = Number(row.meta_tons || 0);
    const produzido = Number(row.produzido_tons || 0);
    return {
      ...row,
      restante_tons: Math.max(0, meta - produzido),
      percentual_atingido: meta > 0 ? (produzido / meta) * 100 : 0
    };
  }

  function regionaisTemplateAnterior(metasHistorico, ano, mes) {
    const atual = Number(ano) * 12 + Number(mes);
    const porChave = new Map();
    (metasHistorico || []).forEach(row => {
      const chave = Number(row.ano) * 12 + Number(row.mes);
      if (chave >= atual) return;
      if (!porChave.has(chave)) porChave.set(chave, new Map());
      const grupo = porChave.get(chave);
      const key = normalizarTexto(row.regional || '');
      if (key && !grupo.has(key)) grupo.set(key, { regional: row.regional, estado: row.estado });
    });
    const chaves = Array.from(porChave.keys()).sort((a, b) => b - a);
    if (!chaves.length) return [];
    return Array.from(porChave.get(chaves[0]).values());
  }

  function montarRegionaisDaProducao(producaoRows, metasCadastro, filtros = {}) {
    const map = new Map();

    producaoRows.forEach(row => {
      const regional = String(row.coordenacao || row.regional || '').trim();
      const key = normalizarTexto(regional);
      if (!key) return;
      const old = map.get(key) || {
        estado: '',
        regional,
        produzido_tons: 0,
        meta_tons: 0,
        ativo: true
      };
      old.produzido_tons += Number(row.tons || row.toneladas || 0);
      map.set(key, old);
    });

    metasCadastro.forEach(meta => {
      const regional = String(meta.regional || meta.coordenacao || '').trim();
      const key = normalizarTexto(regional);
      if (!key) return;
      const old = map.get(key) || {
        estado: '',
        regional,
        produzido_tons: 0,
        meta_tons: 0,
        ativo: true
      };
      map.set(key, {
        ...old,
        ...meta,
        regional: meta.regional || old.regional || regional,
        estado: meta.estado || old.estado || '',
        produzido_tons: old.produzido_tons || 0,
        meta_tons: Number(meta.meta_tons || old.meta_tons || 0),
        ativo: meta.ativo ?? old.ativo ?? true,
        fechado: meta.fechado ?? old.fechado ?? false,
        status_fechamento: meta.status_fechamento ?? old.status_fechamento ?? null,
        fechado_em: meta.fechado_em ?? old.fechado_em ?? null
      });
    });

    return Array.from(map.values())
      .map(calcularLinhaMeta)
      .filter(row => !filtros.estado || String(row.estado || '') === String(filtros.estado))
      .filter(row => !filtros.regional || rowKey(row) === normalizarTexto(filtros.regional))
      .sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0));
  }

  function montarEstadosDasRegionais(regionais) {
    const map = new Map();
    regionais.forEach(row => {
      const estado = String(row.estado || 'Sem estado').trim() || 'Sem estado';
      const old = map.get(estado) || {
        estado,
        meta_tons: 0,
        produzido_tons: 0,
        restante_tons: 0,
        percentual_atingido: 0
      };
      old.meta_tons += Number(row.meta_tons || 0);
      old.produzido_tons += Number(row.produzido_tons || 0);
      map.set(estado, old);
    });
    return Array.from(map.values())
      .map(calcularLinhaMeta)
      .sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0));
  }

  function montarHistoricoMensalProducao(producaoRows, metasCadastro, anoAtual, mesAtual) {
    const map = new Map();

    metasCadastro.forEach(row => {
      const key = `${row.ano}-${String(row.mes).padStart(2, '0')}`;
      const old = map.get(key) || { ano: Number(row.ano), mes: Number(row.mes), meta_total_tons: 0, produzido_total_tons: 0 };
      old.meta_total_tons += Number(row.meta_tons || 0);
      map.set(key, old);
    });

    const currentKey = `${anoAtual}-${String(mesAtual).padStart(2, '0')}`;
    const current = map.get(currentKey) || { ano: Number(anoAtual), mes: Number(mesAtual), meta_total_tons: 0, produzido_total_tons: 0 };
    current.produzido_total_tons = producaoRows.reduce((acc, row) => acc + Number(row.tons || row.toneladas || 0), 0);
    map.set(currentKey, current);

    return Array.from(map.values())
      .map(row => {
        const meta = Number(row.meta_total_tons || 0);
        const produzido = Number(row.produzido_total_tons || 0);
        return {
          ...row,
          restante_total_tons: Math.max(0, meta - produzido),
          percentual_atingido: meta > 0 ? (produzido / meta) * 100 : 0
        };
      })
      .sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes)));
  }

  function mesAnterior(ano, mes) {
    return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  }

  function calcMultiplicadorLeitura(pct) {
    if (pct >= 100) return 1.8;
    if (pct >= 90)  return 1.6;
    if (pct >= 80)  return 1.4;
    if (pct >= 70)  return 1.2;
    if (pct >= 60)  return 1.0;
    return 0;
  }

export { rowKey, isMonthClosed, getRowStatus, mergeCoordenacoes, projetarProducaoMes, calcularSugestoesDistribuicao, fechamentoResumo, totalsFromRegional, regionaisTemplateAnterior, montarRegionaisDaProducao, montarEstadosDasRegionais, montarHistoricoMensalProducao, mesAnterior, calcMultiplicadorLeitura };
