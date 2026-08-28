// Programação: correções pontuais carregadas antes do módulo de ajuste do gestor.
//
// 1) Programação → Hospedagem: normaliza o vínculo de colaboradores.
//    O fluxo automático antigo enviava colaborador_nome/colaborador_cpf, mas o
//    módulo de Hospedagem e a view usam nome_colaborador/cpf.
//
// 2) Programação → Embarque: Auditor e Administrativo não podem entrar como
//    sugestão/candidato de O.S. Suporte, Supervisor e Coordenador da regional
//    permanecem autorizáveis. A regra atua em 4 pontos:
//    - filtra a RPC de candidatos antes do auto-preencher;
//    - se o top da RPC ficar vazio após o filtro, injeta colaboradores elegíveis
//      da regional para o gestor sempre conseguir escolher alguém;
//    - filtra a lista completa do dropdown de troca;
//    - limpa, em segundo plano, os vínculos antigos já salvos no banco.
//
// 3) Programação → Alojamento: quando o gestor escolhe ALOJAMENTO, o select passa
//    a priorizar o alojamento mais próximo do ponto de embarque. Usa latitude/
//    longitude quando existir, tenta extrair do link do Maps e, se só houver
//    endereço textual, tenta geocodificar em memória para calcular a distância.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoAjustesPontuaisFixV6';
const colaboradoresElegiveisCache = new Map();
const alojamentosDistanciaCache = { rows: null, loading: null };
const geocodeCache = new Map();
let alojamentoSortScheduled = false;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpfNorm(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(row) {
  const cpf = cpfNorm(row?.cpf || row?.colaborador_id || row?.colaboradorId);
  return cpf || String(row?.nome || row?.colaborador_nome || '').trim();
}

function isCargoBloqueadoEmbarque(value) {
  const cargo = normalizeText(value);
  return cargo.includes('AUDITOR') || cargo.includes('ADMINISTRATIVO');
}

function isSituacaoInativa(value) {
  const s = normalizeText(value);
  return ['NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'].includes(s);
}

function normalizeUF(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function ufFromEmbarque(value) {
  const m = /^([A-Z]{2})\s*[–-]/i.exec(String(value || '').trim());
  return m ? normalizeUF(m[1]) : '';
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function num(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function kmEntre(aLat, aLng, bLat, bLng) {
  if (!hasGeo(aLat, aLng) || !hasGeo(bLat, bLng)) return null;
  const R = 6371;
  const rad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = rad(Number(bLat) - Number(aLat));
  const dLng = rad(Number(bLng) - Number(aLng));
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))) * 10) / 10;
}

function parseMapsCoords(value) {
  const text = String(value || '');
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m && hasGeo(m[1], m[2])) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

function normalizeHospedagemColaboradorRow(row) {
  const out = { ...(row || {}) };

  if (out.colaborador_nome && !out.nome_colaborador) out.nome_colaborador = out.colaborador_nome;
  if (out.colaborador_cpf && !out.cpf) out.cpf = out.colaborador_cpf;

  delete out.colaborador_nome;
  delete out.colaborador_cpf;

  if (out.nome_colaborador != null) out.nome_colaborador = String(out.nome_colaborador).trim();
  if (out.cpf != null) out.cpf = cpfNorm(out.cpf) || null;
  if (!out.status_colaborador) out.status_colaborador = 'ATIVO';

  return out;
}

function unique(values) {
  return [...new Set((values || []).filter((v) => v !== null && v !== undefined && String(v) !== '').map(String))];
}

async function carregarColaboradoresElegiveis(originalFrom, supervisao) {
  const sup = String(supervisao || '').trim();
  if (!sup) return [];
  if (colaboradoresElegiveisCache.has(sup)) return colaboradoresElegiveisCache.get(sup);

  try {
    const { data, error } = await originalFrom('colaboradores_atuais')
      .select('cpf,nome,cargo,coordenacao,supervisao,situacao,ativo,desligamento')
      .eq('supervisao', sup)
      .limit(5000);

    if (error) throw error;

    const seen = new Set();
    const rows = (data || [])
      .filter((r) => r?.nome)
      .filter((r) => r.ativo !== false)
      // Readmitido mantém no GRM a data do desligamento ANTERIOR (só
      // `situacao` vira "Ativo" na volta) — sem o "&& situação != ATIVO" ele
      // fica fora do embarque pra sempre mesmo já reativado.
      .filter((r) => !r.desligamento || normalizeText(r.situacao) === 'ATIVO')
      .filter((r) => !isSituacaoInativa(r.situacao))
      .filter((r) => !isCargoBloqueadoEmbarque(r.cargo))
      .map((r) => ({
        colaborador_id: colaboradorKey(r),
        nome: r.nome,
        cargo: r.cargo || null,
        coordenacao: r.coordenacao || null,
        supervisao: r.supervisao || sup,
      }))
      .filter((r) => {
        const key = String(r.colaborador_id || r.nome || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    colaboradoresElegiveisCache.set(sup, rows);
    return rows;
  } catch (error) {
    console.warn('[programacao] colaboradores elegíveis:', error);
    colaboradoresElegiveisCache.set(sup, []);
    return [];
  }
}

async function limparConfirmadosBloqueados(originalFrom, rows) {
  const ids = unique(rows.map((r) => r.id));
  const osIds = unique(rows.map((r) => r.os_id));
  const pares = rows
    .filter((r) => r.programacao_id && r.colaborador_id)
    .map((r) => ({ programacaoId: r.programacao_id, colaboradorId: String(r.colaborador_id) }));

  try {
    if (ids.length) await originalFrom('programacao_equipe').delete().in('id', ids);
    if (osIds.length) await originalFrom('operacional_os_colaboradores').delete().in('os_id', osIds);
    await Promise.all(pares.map((p) => originalFrom('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', p.programacaoId)
      .eq('colaborador_id', p.colaboradorId)
      .in('disponibilidade', ['OK', 'LOGISTICA'])));
  } catch (error) {
    console.warn('[programacao] limpeza supervisor/coordenador/auditor:', error);
  }
}

function patchProgramacaoEquipeQuery(query, originalFrom) {
  if (!query || query.__progEquipeCargoPatch || typeof query.then !== 'function') return query;

  const originalThen = query.then.bind(query);
  query.then = function patchedThen(resolve, reject) {
    const wrappedResolve = async (payload) => {
      if (!payload || !Array.isArray(payload.data) || !payload.data.length) return payload;

      try {
        const rows = payload.data;
        const programacaoIds = unique(rows.map((r) => r.programacao_id));
        const colaboradorIds = unique(rows.map((r) => r.colaborador_id));
        if (!programacaoIds.length || !colaboradorIds.length) return payload;

        const { data: espelhos, error } = await originalFrom('programacao_colaboradores')
          .select('programacao_id,colaborador_id,nome_colaborador,cargo,disponibilidade')
          .in('programacao_id', programacaoIds)
          .in('colaborador_id', colaboradorIds);

        if (error || !Array.isArray(espelhos)) return payload;

        const cargoPorChave = new Map();
        espelhos.forEach((row) => {
          cargoPorChave.set(`${row.programacao_id}|${String(row.colaborador_id)}`, row.cargo || '');
        });

        const bloqueados = [];
        const filtrados = rows.filter((row) => {
          const cargo = cargoPorChave.get(`${row.programacao_id}|${String(row.colaborador_id)}`) || row.cargo || '';
          const bloqueado = isCargoBloqueadoEmbarque(cargo);
          if (bloqueado) bloqueados.push(row);
          return !bloqueado;
        });

        if (bloqueados.length) limparConfirmadosBloqueados(originalFrom, bloqueados);
        return { ...payload, data: filtrados };
      } catch (error) {
        console.warn('[programacao] filtro supervisor/coordenador/auditor:', error);
        return payload;
      }
    };

    return originalThen(
      (payload) => Promise.resolve(wrappedResolve(payload)).then(resolve),
      reject,
    );
  };

  query.__progEquipeCargoPatch = true;
  return query;
}

function patchFrom(originalFrom) {
  return function patchedFrom(table) {
    const builder = originalFrom(table);

    if (table === 'hospedagem_solicitacao_colaboradores' && !builder.__hospColabInsertPatched) {
      const originalInsert = builder.insert.bind(builder);
      builder.insert = function patchedInsert(values, options) {
        const normalized = Array.isArray(values)
          ? values.map(normalizeHospedagemColaboradorRow).filter((row) => row.nome_colaborador)
          : normalizeHospedagemColaboradorRow(values);

        if (Array.isArray(normalized) && !normalized.length) {
          throw new Error('A solicitação de hospedagem precisa ter pelo menos um colaborador.');
        }
        if (!Array.isArray(normalized) && !normalized.nome_colaborador) {
          throw new Error('A solicitação de hospedagem precisa ter o nome do colaborador.');
        }

        return originalInsert(normalized, options);
      };
      builder.__hospColabInsertPatched = true;
    }

    if (table === 'programacao_equipe' && !builder.__progEquipeSelectPatched) {
      const originalSelect = builder.select.bind(builder);
      builder.select = function patchedSelect(...args) {
        return patchProgramacaoEquipeQuery(originalSelect(...args), originalFrom);
      };
      builder.__progEquipeSelectPatched = true;
    }

    return builder;
  };
}

function fallbackCandidatosRows(osPayload, colaboradores, excluirIds, dataFiltrada) {
  const porOs = new Map();
  (dataFiltrada || []).forEach((row) => {
    const key = String(row.os_id || '');
    if (!porOs.has(key)) porOs.set(key, []);
    porOs.get(key).push(row);
  });

  const excluidos = new Set(unique(excluirIds));
  const disponiveis = (colaboradores || []).filter((c) => !excluidos.has(String(c.colaborador_id))).slice(0, 20);
  if (!disponiveis.length) return dataFiltrada || [];

  const out = [...(dataFiltrada || [])];
  (osPayload || []).forEach((osItem) => {
    const osId = String(osItem?.os_id || '');
    const atuais = porOs.get(osId) || [];
    if (atuais.length >= 8) return;

    const jaNaOs = new Set(atuais.map((r) => String(r.colaborador_id)));
    disponiveis
      .filter((c) => !jaNaOs.has(String(c.colaborador_id)))
      .slice(0, 8 - atuais.length)
      .forEach((c, idx) => {
        out.push({
          os_id: osItem.os_id,
          colaborador_id: c.colaborador_id,
          nome: c.nome,
          cargo: c.cargo || null,
          coordenacao: c.coordenacao || null,
          supervisao: c.supervisao || null,
          tipo_contrato: null,
          km: null,
          auditorias_qtd: null,
          auditorias_peso: null,
          veiculo_id: null,
          veiculo_placa: null,
          colab_lat: null,
          colab_lng: null,
          custo_total: null,
          score: 0.01 - idx * 0.0001,
          score_contrato: 0,
          score_distancia: 0,
          score_auditoria: 0,
        });
      });
  });
  return out;
}

function patchRpc(originalRpc, originalFrom) {
  return function patchedRpc(fn, params, options) {
    const result = originalRpc(fn, params, options);

    if (fn === 'programacao_colaboradores_supervisao') {
      return Promise.resolve(result).then(async (payload) => {
        if (!payload || !Array.isArray(payload.data)) return payload;
        const sup = params?.p_supervisao;
        const elegiveis = await carregarColaboradoresElegiveis(originalFrom, sup);
        if (elegiveis.length) return { ...payload, data: elegiveis };
        return { ...payload, data: payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo)) };
      });
    }

    if (fn !== 'programacao_etapa_b_candidatos') return result;

    return Promise.resolve(result).then(async (payload) => {
      if (!payload || !Array.isArray(payload.data)) return payload;
      const filtrada = payload.data.filter((row) => !isCargoBloqueadoEmbarque(row?.cargo));
      const elegiveis = await carregarColaboradoresElegiveis(originalFrom, params?.p_supervisao);
      return {
        ...payload,
        data: fallbackCandidatosRows(params?.p_os || [], elegiveis, params?.p_excluir_colaborador_ids || [], filtrada),
      };
    });
  };
}

async function carregarAlojamentosDistancia() {
  if (alojamentosDistanciaCache.rows) return alojamentosDistanciaCache.rows;
  if (alojamentosDistanciaCache.loading) return alojamentosDistanciaCache.loading;

  alojamentosDistanciaCache.loading = supabase
    .from('hospedagem_alojamentos')
    .select('*')
    .then(({ data, error }) => {
      if (error) throw error;
      alojamentosDistanciaCache.rows = (data || [])
        .filter((a) => normalizeText(a.status || 'ATIVO') === 'ATIVO')
        .map((a) => ({
          ...a,
          _nome: firstValue(a, ['nome', 'alojamento', 'nome_alojamento']) || 'Alojamento sem nome',
          _cidade: firstValue(a, ['cidade', 'cidade_alojamento']) || '',
          _uf: normalizeUF(firstValue(a, ['uf', 'estado', 'uf_alojamento']) || ''),
        }));
      return alojamentosDistanciaCache.rows;
    })
    .catch((error) => {
      console.warn('[programacao] alojamentos/distância:', error);
      alojamentosDistanciaCache.rows = [];
      return [];
    });

  return alojamentosDistanciaCache.loading;
}

function coordsAlojamento(row) {
  const lat = num(firstValue(row, ['latitude', 'lat', 'geo_latitude', 'endereco_latitude']));
  const lng = num(firstValue(row, ['longitude', 'lng', 'lon', 'geo_longitude', 'endereco_longitude']));
  if (hasGeo(lat, lng)) return { lat, lng, fonte: 'coord' };

  const maps = [firstValue(row, ['link_maps', 'maps', 'google_maps', 'url_maps', 'localizacao']), firstValue(row, ['endereco', 'endereco_completo'])]
    .filter(Boolean)
    .map(parseMapsCoords)
    .find(Boolean);
  if (maps) return { ...maps, fonte: 'maps' };

  return null;
}

function enderecoAlojamento(row) {
  const endereco = firstValue(row, ['endereco', 'endereco_completo', 'logradouro', 'localizacao']);
  if (String(endereco || '').startsWith('http')) return '';
  return [endereco, row._cidade || row.cidade, row._uf || row.uf, 'Brasil']
    .filter(Boolean)
    .join(', ');
}

async function geocodeAlojamento(row) {
  const direct = coordsAlojamento(row);
  if (direct) return direct;

  const endereco = enderecoAlojamento(row);
  if (!endereco || endereco.length < 8) return null;
  const cacheKey = normalizeText(endereco);
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const p = fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`)
    .then((r) => r.ok ? r.json() : [])
    .then((data) => {
      const first = Array.isArray(data) ? data[0] : null;
      const lat = num(first?.lat);
      const lng = num(first?.lon);
      return hasGeo(lat, lng) ? { lat, lng, fonte: 'endereco' } : null;
    })
    .catch(() => null);

  geocodeCache.set(cacheKey, p);
  return p;
}

async function carregarOsParaAlojamento(osIds) {
  if (!osIds.length) return new Map();
  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,embarque,ponto_embarque_id,ponto1_latitude,ponto1_longitude')
    .in('id', osIds);
  if (error) throw error;

  const rows = data || [];
  const pontosIds = unique(rows.filter((o) => !hasGeo(o.ponto1_latitude, o.ponto1_longitude)).map((o) => o.ponto_embarque_id));
  const pontos = new Map();
  if (pontosIds.length) {
    const p = await supabase
      .from('operacional_pontos_embarque')
      .select('id,latitude,longitude,nome_local')
      .in('id', pontosIds);
    (p.data || []).forEach((item) => pontos.set(String(item.id), item));
  }

  return new Map(rows.map((os) => {
    const ponto = pontos.get(String(os.ponto_embarque_id));
    const lat = num(os.ponto1_latitude) ?? num(ponto?.latitude);
    const lng = num(os.ponto1_longitude) ?? num(ponto?.longitude);
    return [String(os.id), { ...os, lat, lng, uf: ufFromEmbarque(os.embarque) }];
  }));
}

async function ordenarSelectAlojamento(select, os, alojamentos) {
  if (!select || select.dataset.distanciaOrdenando === '1') return;
  if (!os || !hasGeo(os.lat, os.lng)) return;

  select.dataset.distanciaOrdenando = '1';
  try {
    const selected = select.value;
    const uf = normalizeUF(os.uf || ufFromEmbarque(os.embarque));
    const ativos = alojamentos || [];
    const porUf = uf ? ativos.filter((a) => normalizeUF(a._uf || a.uf) === uf) : [];
    const base = (porUf.length ? porUf : ativos).slice(0, 80);

    const enriquecidos = await Promise.all(base.map(async (a) => {
      const geo = await geocodeAlojamento(a);
      const km = geo ? kmEntre(geo.lat, geo.lng, os.lat, os.lng) : null;
      return { a, geo, km };
    }));

    enriquecidos.sort((x, y) => {
      const dx = x.km == null ? 999999 : x.km;
      const dy = y.km == null ? 999999 : y.km;
      return dx - dy
        || String(x.a._cidade || '').localeCompare(String(y.a._cidade || ''), 'pt-BR')
        || String(x.a._nome || '').localeCompare(String(y.a._nome || ''), 'pt-BR');
    });

    const opts = ['<option value="">Sugerir alojamento mais próximo…</option>'];
    enriquecidos.forEach(({ a, km }) => {
      const id = String(a.id);
      const dist = km != null ? ` · ${km} km` : ' · sem km';
      const cidadeUf = [a._cidade || a.cidade || '-', a._uf || a.uf || ''].filter(Boolean).join('/');
      opts.push(`<option value="${String(id).replaceAll('"', '&quot;')}">${String(`${a._nome} · ${cidadeUf}${dist}`).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}</option>`);
    });
    select.innerHTML = opts.join('');

    const existeSelecionado = selected && enriquecidos.some(({ a }) => String(a.id) === String(selected));
    if (existeSelecionado) {
      select.value = selected;
    } else if (!selected && enriquecidos[0]?.a?.id) {
      select.value = String(enriquecidos[0].a.id);
      select.dataset.sugeridoDistancia = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const wrap = select.closest('[data-estadia-destino]');
    let hint = wrap?.querySelector('[data-aloj-dist-hint]');
    if (wrap && !hint) {
      hint = document.createElement('small');
      hint.dataset.alojDistHint = '1';
      hint.style.cssText = 'display:block;margin-top:3px;color:#8ba79a;font-size:10.5px;font-weight:800';
      wrap.appendChild(hint);
    }
    if (hint) {
      const best = enriquecidos.find((x) => x.km != null);
      hint.textContent = best ? `Mais próximo do embarque: ${best.km} km` : 'Alojamentos sem coordenada/endereço geocodificado.';
    }
  } catch (error) {
    console.warn('[programacao] ordenar alojamentos por distância:', error);
  } finally {
    select.dataset.distanciaOrdenando = '0';
  }
}

function agendarOrdenacaoAlojamentos() {
  if (alojamentoSortScheduled) return;
  alojamentoSortScheduled = true;
  setTimeout(async () => {
    alojamentoSortScheduled = false;
    try {
      const selects = [...document.querySelectorAll('.peqb-os2 select[data-fld="alojamento_id"]')]
        .filter((s) => s.offsetParent !== null);
      if (!selects.length) return;

      const osIds = unique(selects.map((s) => s.closest('.peqb-os2')?.dataset.osId));
      const [osMap, alojamentos] = await Promise.all([
        carregarOsParaAlojamento(osIds),
        carregarAlojamentosDistancia(),
      ]);

      await Promise.all(selects.map((select) => {
        const osId = String(select.closest('.peqb-os2')?.dataset.osId || '');
        return ordenarSelectAlojamento(select, osMap.get(osId), alojamentos);
      }));
    } catch (error) {
      console.warn('[programacao] sugestão de alojamento:', error);
    }
  }, 120);
}

function iniciarAlojamentosPorDistancia() {
  const boot = () => {
    agendarOrdenacaoAlojamentos();
    new MutationObserver(agendarOrdenacaoAlojamentos).observe(document.body || document.documentElement, { childList: true, subtree: true });
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('select[data-fld="tipo_estadia"]')) agendarOrdenacaoAlojamentos();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = patchFrom(originalFrom);
  supabase.rpc = patchRpc(supabase.rpc.bind(supabase), originalFrom);
  iniciarAlojamentosPorDistancia();
  supabase[PATCH_FLAG] = true;
}
