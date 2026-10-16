// Frotas — excessos de velocidade importados (agrupamento e busca).
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261016-frotas-hist1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { state, currentRenderOpts, resolveSupabase, normalizeName, normalizeDriverNameForMatch, isUnknownDriverName, sanitizeFolderName, onlyPlate, formatDateBR, parseSpeed, dedupeHighestSpeedByDate } from './frotas-base.js?v=20261016-frotas-hist1';
import { cleanPossibleDriverName } from './frotas-ocr.js?v=20261016-frotas-hist1';
import { getColaboradores } from './frotas-colaboradores.js?v=20261016-frotas-hist1';

  function getDriverFromExcesso(row) {
    return row?.patrimonio_funcionario || row?.motorista_planilha || '';
  }

  function groupImportedExcessos(rows) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const status = String(row.status_notificacao || '').toUpperCase();
      if (status === 'NOTIFICADO' || status === 'CANCELADO') return;
      const placa = onlyPlate(row.placa);
      if (!placa) return;
      const motorista = getDriverFromExcesso(row);
      const key = `${normalizeName(motorista) || 'SEM MOTORISTA'}|${placa}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          motorista,
          placa,
          coordenacao: row.coordenacao || '',
          supervisao: row.supervisao || '',
          status_cruzamento: row.status_cruzamento || '',
          fonte: String(row.import_hash || '').startsWith('INFLEET|') ? 'INFLEET' : 'BFLEET',
          registros: []
        });
      }
      groups.get(key).registros.push(row);
    });

    return Array.from(groups.values()).map((g) => {
      const ordered = (g.registros || []).sort((a, b) => String(a.data_evento || '').localeCompare(String(b.data_evento || '')) || String(a.hora_evento || '').localeCompare(String(b.hora_evento || '')));
      g.originalRegistros = ordered;
      g.totalRegistrosOriginais = ordered.length;
      g.registros = dedupeHighestSpeedByDate(ordered.map((r) => ({ ...r, data: r.data_evento, velocidade: r.velocidade })));
      g.maxVelocidade = Math.max(...g.registros.map((r) => Number(r.velocidade || 0)));
      g.periodoInicio = g.registros[0]?.data || g.registros[0]?.data_evento || '';
      g.periodoFim = g.registros[g.registros.length - 1]?.data || g.registros[g.registros.length - 1]?.data_evento || '';
      return g;
    }).sort((a, b) => String(a.motorista || a.placa).localeCompare(String(b.motorista || b.placa), 'pt-BR'));
  }

  function buildPrintDriverMap() {
    return groupImportedExcessos(state.importedExcessos).map((g) => {
      const driverName = isUnknownDriverName(g.motorista) ? '' : normalizeName(g.motorista || '');
      return {
        key: g.key || '',
        plate: onlyPlate(g.placa),
        driverName,
        driverFolderName: driverName ? sanitizeFolderName(driverName) : '',
        coordenacao: g.coordenacao || '',
        supervisao: g.supervisao || '',
        registros: (g.registros || []).map((r) => ({
          id: r.id,
          data: formatDateBR(r.data || r.data_evento),
          velocidade: parseSpeed(r.velocidade)
        })).filter((r) => r.id && r.data && r.velocidade)
      };
    }).filter((item) => item.plate);
  }

  function buildKnownDriversForOcr(opts = currentRenderOpts) {
    const byName = new Map();

    const addDriver = (nome, extra = {}) => {
      const cleaned = cleanPossibleDriverName(nome);
      if (!cleaned || isUnknownDriverName(cleaned)) return;
      const key = normalizeDriverNameForMatch(cleaned);
      if (!key || byName.has(key)) return;
      byName.set(key, {
        driverName: cleaned,
        driverFolderName: sanitizeFolderName(cleaned),
        normalized: key,
        cpf: extra.cpf || '',
        coordenacao: extra.coordenacao || '',
        supervisao: extra.supervisao || ''
      });
    };

    getColaboradores(opts).forEach((c) => addDriver(c.nome, c));
    groupImportedExcessos(state.importedExcessos).forEach((g) => addDriver(g.motorista, g));

    return Array.from(byName.values());
  }

  async function fetchImportedExcessos(root, opts = {}) {
    const supabase = resolveSupabase(opts);
    if (!supabase || typeof supabase.from !== 'function') {
      state.importedExcessosLoaded = true;
      return;
    }

    try {
      state.importedExcessosLoaded = false;
      let query = supabase
        .from('frotas_excesso_velocidade')
        .select('id,data_evento,hora_evento,placa,velocidade,endereco,motorista_planilha,patrimonio_funcionario,patrimonio_codigo,coordenacao,supervisao,status_cruzamento,status_notificacao,import_hash,created_at')
        .in('status_notificacao', ['PENDENTE', 'GERADA']);

      const filter = state.activeImportedDateFilter;
      if (filter?.start) query = query.gte('data_evento', filter.start);
      if (filter?.end) query = query.lte('data_evento', filter.end);

      const { data, error } = await query
        .order('data_evento', { ascending: false })
        .limit(1000);
      if (error) throw error;
      state.importedExcessos = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[FROTAS] Não foi possível carregar excessos importados:', err);
      state.importedExcessos = [];
    } finally {
      state.importedExcessosLoaded = true;
    }
  }

export { buildPrintDriverMap, buildKnownDriversForOcr, fetchImportedExcessos };
