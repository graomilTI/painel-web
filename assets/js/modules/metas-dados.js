// Metas — leitura e gravação no Supabase (carregar dados, salvar metas, dados do fechamento).
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import { fetchAllRows, normalizarTexto, getMonthRange } from './metas-util.js?v=20261015-metas1';
import { isMonthClosed, regionaisTemplateAnterior, montarRegionaisDaProducao, montarEstadosDasRegionais, montarHistoricoMensalProducao, mesAnterior, calcMultiplicadorLeitura } from './metas-calculo.js?v=20261015-metas1';

  async function loadData(state, supabase) {
    state.loading = true;
    state.erro = null;

    try {
      const range = getMonthRange(Number(state.ano), Number(state.mes));

      let metasQuery = supabase
        .from('metas_producao')
        .select('*')
        .eq('ano', Number(state.ano))
        .eq('mes', Number(state.mes))
        .order('estado', { ascending: true })
        .order('regional', { ascending: true });

      if (state.estado) metasQuery = metasQuery.eq('estado', state.estado);
      if (state.regional) metasQuery = metasQuery.eq('regional', state.regional);

      const producaoQuery = supabase
        .from('relatorio_resultado_diario')
        .select('data,coordenacao,toneladas')
        .gte('data', range.start)
        .lt('data', range.next)
        .order('data', { ascending: true });

      const [metasCadastro, metasHistorico, producaoRows] = await Promise.all([
        fetchAllRows(metasQuery),
        fetchAllRows(
          supabase
            .from('metas_producao')
            .select('ano,mes,regional,estado,meta_tons')
            .order('ano', { ascending: true })
            .order('mes', { ascending: true })
        ),
        fetchAllRows(producaoQuery).catch(err => {
          console.warn('[METAS] Não foi possível carregar Resultado Diário:', err);
          return [];
        })
      ]);

      let regionais = montarRegionaisDaProducao(producaoRows, metasCadastro, {
        estado: state.estado,
        regional: state.regional
      });

      // Mês novo ainda sem produção/meta cadastrada: usa a lista de regionais do mês anterior como modelo,
      // para o usuário conseguir digitar a meta antes da produção diária começar a ser sincronizada.
      if (!regionais.length && !producaoRows.length && !metasCadastro.length && !state.estado && !state.regional) {
        const template = regionaisTemplateAnterior(metasHistorico, state.ano, state.mes)
          .map(r => ({ regional: r.regional, estado: r.estado, meta_tons: 0, ativo: true }));
        if (template.length) {
          regionais = montarRegionaisDaProducao([], template, { estado: state.estado, regional: state.regional });
        }
      }

      state.regionais = regionais;
      state.estados = montarEstadosDasRegionais(regionais);
      state.metasCadastro = metasCadastro;
      state.mensal = montarHistoricoMensalProducao(producaoRows, metasHistorico, Number(state.ano), Number(state.mes));
      state.producaoCoordenacoes = regionais.map(row => ({
        regional: row.regional,
        estado: row.estado,
        produzido_tons: row.produzido_tons
      }));

      state.gestores = await fetchAllRows(
        supabase.from('metas_gestores')
          .select('id,coordenacao,gestor,supervisao,salario,grat40,ativo')
          .eq('ativo', true)
          .order('coordenacao', { ascending: true })
          .order('gestor', { ascending: true })
      ).catch(() => []);

      const m1 = mesAnterior(Number(state.ano), Number(state.mes));
      state.custosRegional = await fetchAllRows(
        supabase.from('dre_despesas_mensal')
          .select('coordenacao, total_coordenacao, rateio, total_com_rateio, total_geral, total_todas_regionais, ano, mes')
          .eq('ano', m1.ano)
          .eq('mes', m1.mes)
          .order('coordenacao', { ascending: true })
      ).catch(() => []);

      state.auditoria = await fetchAllRows(
        supabase.from('metas_auditoria')
          .select('ano,mes,regional,valor_auditoria,total_embarcado,percentual_limite,apto,nome_arquivo')
          .eq('ano', Number(state.ano))
          .eq('mes', Number(state.mes))
          .order('regional', { ascending: true })
      ).catch(() => []);
    } catch (err) {
      console.error('[METAS] Erro ao carregar dados:', err);
      state.erro = err && err.message ? err.message : String(err);
    } finally {
      state.loading = false;
    }
  }

  // O Dashboard lê a meta de um cache de 1h (dashboard_cache + localStorage);
  // sem invalidar, a meta recém-salva só aparece lá depois que o cache vence.
  async function invalidarCacheDashboard(supabase) {
    try {
      Object.keys(localStorage || {}).forEach((key) => {
        if (key.startsWith('grao1000:gestor-dash')) localStorage.removeItem(key);
      });
    } catch {}
    try {
      const { error } = await supabase.rpc('invalidar_dashboard_cache_segmentado', { p_origem: 'metas' });
      if (error) throw error;
    } catch (error) {
      console.warn('[METAS] Não foi possível invalidar o cache do dashboard:', error?.message || error);
    }
  }

  async function salvarMeta(form, state, supabase, rerender) {
    const fd = new FormData(form);

    const payload = {
      ano: Number(fd.get('ano')),
      mes: Number(fd.get('mes')),
      estado: String(fd.get('estado') || '').trim().toUpperCase(),
      regional: String(fd.get('regional') || '').trim(),
      meta_tons: Number(fd.get('meta_tons') || 0),
      ativo: true,
      updated_at: new Date().toISOString()
    };

    if (!payload.ano || !payload.mes || !payload.estado || !payload.regional) {
      alert('Preencha ano, mês, estado e regional.');
      return;
    }

    const { error } = await supabase
      .from('metas_producao')
      .upsert(payload, { onConflict: 'ano,mes,regional' });

    if (error) {
      console.error('[METAS] Erro ao salvar meta:', error);
      alert('Erro ao salvar meta: ' + error.message);
      return;
    }

    await invalidarCacheDashboard(supabase);

    state.ano = payload.ano;
    state.mes = payload.mes;
    state.estado = '';
    state.regional = '';

    await loadData(state, supabase);
    rerender();
  }

  async function salvarListaMetas(container, state, supabase, rerender) {
    if (isMonthClosed(state)) {
      alert('Esta meta já foi fechada. Não é possível alterar a lista do mês selecionado.');
      return;
    }

    const rows = Array.from(container.querySelectorAll('[data-metas-meta-row]'));
    const payloads = rows.map(tr => {
      const estado = tr.querySelector('[data-meta-field="estado"]');
      const regional = tr.querySelector('[data-meta-field="regional"]');
      const meta = tr.querySelector('[data-meta-field="meta_tons"]');
      return {
        ano: Number(state.ano),
        mes: Number(state.mes),
        estado: String(estado && estado.value ? estado.value : '').trim().toUpperCase(),
        regional: String(regional && regional.value ? regional.value : '').trim(),
        meta_tons: Number(meta && meta.value ? meta.value : 0),
        ativo: true,
        updated_at: new Date().toISOString()
      };
    }).filter(row => row.regional && row.meta_tons > 0);

    if (!payloads.length) {
      alert('Informe ao menos uma coordenação com meta maior que zero.');
      return;
    }

    const { error } = await supabase
      .from('metas_producao')
      .upsert(payloads, { onConflict: 'ano,mes,regional' });

    if (error) {
      console.error('[METAS] Erro ao salvar lista de metas:', error);
      alert('Erro ao salvar lista de metas: ' + error.message);
      return;
    }

    await invalidarCacheDashboard(supabase);

    state.estado = '';
    state.regional = '';
    await loadData(state, supabase);
    rerender();
  }

  async function enrichGestoresParaFechamento(state, supabase, anoMeta, mesMeta) {
    const m1 = mesAnterior(anoMeta, mesMeta);
    const m1Start = `${m1.ano}-${String(m1.mes).padStart(2, '0')}-01`;
    const metaStart = `${anoMeta}-${String(mesMeta).padStart(2, '0')}-01`;

    const [leituraRes, resultadoRows, despesaRows] = await Promise.all([
      supabase.from('v_leitura_supervisao').select('coordenacao,supervisao,leitura_pct,total_ativos,lidos_30d,data_referencia'),
      fetchAllRows(
        supabase.from('relatorio_resultado_diario').select('coordenacao,toneladas').gte('data', m1Start).lt('data', metaStart)
      ).catch(() => []),
      fetchAllRows(
        supabase.from('dre_despesas_mensal')
          .select('coordenacao,total_com_rateio,total_geral,total_todas_regionais')
          .eq('ano', m1.ano).eq('mes', m1.mes)
      ).catch(() => [])
    ]);

    // Leitura map: supervisão normalizada → pct
    const leituraMap = new Map();
    for (const r of (leituraRes.data || [])) {
      leituraMap.set(normalizarTexto(r.supervisao || ''), { pct: Number(r.leitura_pct || 0), total: r.total_ativos, lidos: r.lidos_30d, dataRef: r.data_referencia });
    }

    // Volume Classificado M-1: toneladas por coordenação (igual ao DRE — denominador do custo por ton)
    const volClassMap = new Map();
    let volClassGeral = 0;
    for (const r of resultadoRows) {
      const k = normalizarTexto(r.coordenacao || '');
      if (k === 'GERAL') continue;
      volClassMap.set(k, (volClassMap.get(k) || 0) + Number(r.toneladas || 0));
      volClassGeral += Number(r.toneladas || 0);
    }

    // Despesa M-1 (dre_despesas_mensal): total_com_rateio por regional
    const despesaMap = new Map(); // coord → total_com_rateio
    let despesaTotalEmpresa = 0;
    for (const r of despesaRows) {
      const k = normalizarTexto(r.coordenacao || '');
      despesaMap.set(k, Number(r.total_com_rateio || 0));
    }
    if (despesaRows.length) {
      const ref = despesaRows[0];
      despesaTotalEmpresa = Number(ref.total_todas_regionais || 0) + Number(ref.total_geral || 0);
    }

    // cptGeral = custo por tonelada do volume classificado da empresa (igual à linha do DRE)
    const cptGeral = volClassGeral > 0 ? despesaTotalEmpresa / volClassGeral : 0;
    const temDespesas = despesaMap.size > 0;

    return (state.gestores || []).map(g => {
      const key  = normalizarTexto(g.coordenacao || '');
      const supK = normalizarTexto(g.supervisao  || '');

      const sal = Number(g.salario || 0);
      const gr  = Number(g.grat40  || 0);
      const bonusInicial = (sal + gr) * 0.1;

      // Leitura
      const leit = leituraMap.get(supK) || null;
      const leituraPct  = leit ? leit.pct : null;
      const multLeitura = calcMultiplicadorLeitura(leituraPct ?? 0);
      const valorLeitura = multLeitura * bonusInicial * 0.3;

      // Custo: fator = cptGeral / cptCoord  (custo/ton geral ÷ custo/ton da coordenação)
      const volClassCoord = volClassMap.get(key) || 0;
      const despesaCoord  = despesaMap.get(key)  || 0;
      let fatorCusto = 0;
      let valorCusto = 0;
      let cptCoord = 0;
      if (cptGeral > 0 && volClassCoord > 0 && despesaCoord > 0) {
        cptCoord = despesaCoord / volClassCoord;
        fatorCusto = cptCoord > 0 ? cptGeral / cptCoord : 0;
        valorCusto = fatorCusto * bonusInicial * 0.3;
      }

      return {
        ...g,
        _key: key,
        bonusInicial,
        leituraPct, multLeitura, valorLeitura,
        volClassCoord, despesaCoord, fatorCusto, valorCusto,
        cptGeral, cptCoord,
        temDespesas,
        m1Ref: `${String(m1.mes).padStart(2,'0')}/${m1.ano}`
      };
    });
  }

export { loadData, salvarMeta, salvarListaMetas, enrichGestoresParaFechamento };
