import { supabase } from './supabaseClient.js';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function todayIso() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function brDate(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(iso);
}

function parseEmbarque(embarque) {
  const texto = String(embarque || '').trim();
  if (!texto) return { cidade: '', local: '' };
  const semUf = texto.replace(/^[A-Za-z]{2}\s*[–-]\s*/, '').trim();
  const partes = semUf.match(/^([^(]+?)\s*\(([^)]*)\)\s*$/);
  return {
    cidade: (partes ? partes[1] : semUf).trim(),
    local: partes ? partes[2].trim() : '',
  };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function detalheMap(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = `${String(row.os_id)}|${String(row.colaborador_id)}`;
    if (!map.has(key)) map.set(key, { ALIMENTACAO: null, ESTADIA: null, DESLOCAMENTO: null, EXTRA: [] });
    const alvo = map.get(key);
    if (row.tipo_registro === 'EXTRA') alvo.EXTRA.push(row.detalhes || {});
    else alvo[row.tipo_registro] = row.detalhes || {};
  });
  return map;
}

function resumoDespesas(despesas) {
  if (!despesas) return [];
  const partes = [];
  const ali = despesas.ALIMENTACAO || {};
  const refeicoes = [ali.cafe ? 'Café' : '', ali.almoco ? 'Almoço' : '', ali.janta ? 'Janta' : ''].filter(Boolean);
  if (refeicoes.length) partes.push(refeicoes.join('/'));

  const est = despesas.ESTADIA || {};
  const tipoEstadia = normalizeText(est.tipo_estadia || '');
  if (tipoEstadia && tipoEstadia !== 'CASA') {
    let label = ({ PERNOITE: 'Pernoite', ALOJAMENTO: 'Alojamento', HOTEL: 'Hotel' })[tipoEstadia] || est.tipo_estadia;
    if (est.alojamento_nome) label += ` ${est.alojamento_nome}`;
    partes.push(label);
  }

  const des = despesas.DESLOCAMENTO || {};
  const tipoDes = normalizeText(des.tipo_deslocamento || '');
  if (tipoDes && tipoDes !== 'NAO PRECISA') {
    const label = ({
      'MOTORISTA FROTA': 'Motorista Frota',
      'CARONA FROTA': 'Carona Frota',
      'UBER TAXI': 'Uber/Táxi',
      'REEMBOLSO KM': 'Reembolso KM',
    })[tipoDes] || des.tipo_deslocamento;
    partes.push(des.placa_veiculo ? `${label} ${des.placa_veiculo}` : label);
  }

  (despesas.EXTRA || []).forEach((extra) => {
    const nome = extra.tipo_despesa || extra.descricao || 'Extra';
    partes.push(Number(extra.valor) > 0 ? `${nome} ${formatMoney(extra.valor)}` : nome);
  });
  return partes;
}

async function montarTextoCompartilharPorOs() {
  const programacaoIdMap = window.__progGetProgramacaoIdMap?.();
  const programacaoId = window.__progGetProgramacaoId?.();
  const temMapa = programacaoIdMap instanceof Map && programacaoIdMap.size > 0;
  const ids = temMapa ? [...programacaoIdMap.values()].filter(Boolean) : [programacaoId].filter(Boolean);
  if (!ids.length) throw new Error('Carregue um contexto antes de compartilhar.');

  const dataReferencia = window.__progGetDataReferencia?.()
    || document.getElementById('progDataRef')?.value
    || todayIso();

  const { data: equipe, error: equipeError } = await supabase
    .from('programacao_equipe')
    .select('programacao_id,os_id,colaborador_id,nome_colaborador,confirmado')
    .in('programacao_id', ids)
    .eq('confirmado', true)
    .not('os_id', 'is', null);
  if (equipeError) throw equipeError;

  const equipeRows = equipe || [];
  const osIds = [...new Set(equipeRows.map((row) => row.os_id).filter(Boolean))];
  if (!osIds.length) return `📋 Programação — ${brDate(dataReferencia)}\n\nNenhuma O.S. com equipe confirmada.`;

  const [osRes, despesasRes] = await Promise.all([
    supabase
      .from('operacional_os')
      .select('id,numero_os,cliente,embarque')
      .in('id', osIds),
    supabase
      .from('programacao_despesas_os_compartilhadas')
      .select('tipo_registro,colaborador_id,nome_colaborador,os_id,detalhes')
      .eq('data_referencia', dataReferencia)
      .in('os_id', osIds),
  ]);
  if (osRes.error) throw osRes.error;
  if (despesasRes.error) throw despesasRes.error;

  const osPorId = new Map((osRes.data || []).map((os) => [String(os.id), os]));
  const despesasPorVinculo = detalheMap(despesasRes.data || []);
  const grupos = new Map();

  equipeRows.forEach((row) => {
    const os = osPorId.get(String(row.os_id));
    if (!os) return;
    const { cidade, local } = parseEmbarque(os.embarque);
    const chaveGrupo = `${os.cliente || ''}|${cidade}|${local}`;
    if (!grupos.has(chaveGrupo)) grupos.set(chaveGrupo, { cliente: os.cliente || '-', cidade, local, os: new Map() });
    const grupo = grupos.get(chaveGrupo);
    const osKey = String(os.id);
    if (!grupo.os.has(osKey)) grupo.os.set(osKey, { numero: os.numero_os || '-', colaboradores: [] });

    const despesas = despesasPorVinculo.get(`${osKey}|${String(row.colaborador_id)}`);
    grupo.os.get(osKey).colaboradores.push({
      nome: row.nome_colaborador || row.colaborador_id,
      despesas: resumoDespesas(despesas),
      deslocamento: despesas?.DESLOCAMENTO || {},
    });
  });

  const blocos = [];
  const motoristas = new Map();
  const caronas = new Map();

  for (const grupo of grupos.values()) {
    const rotuloLocal = [grupo.local, grupo.cidade].filter(Boolean).join(' - ') || '-';
    const linhas = [`Cliente: ${grupo.cliente}`, `Local: ${rotuloLocal}`];

    for (const osInfo of grupo.os.values()) {
      linhas.push(`O.S.: ${osInfo.numero}`);
      linhas.push('Colaboradores:');
      for (const colab of osInfo.colaboradores) {
        linhas.push(`• ${colab.nome}${colab.despesas.length ? ` — ${colab.despesas.join(', ')}` : ''}`);
        const tipo = normalizeText(colab.deslocamento.tipo_deslocamento || '');
        const placa = String(colab.deslocamento.placa_veiculo || '').trim().toUpperCase();
        if (tipo === 'MOTORISTA FROTA' && placa) motoristas.set(placa, colab.nome);
        if (tipo === 'CARONA FROTA' && placa) {
          if (!caronas.has(placa)) caronas.set(placa, []);
          if (!caronas.get(placa).includes(colab.nome)) caronas.get(placa).push(colab.nome);
        }
      }
    }
    blocos.push(linhas.join('\n'));
  }

  const placas = new Set([...motoristas.keys(), ...caronas.keys()]);
  if (placas.size) {
    blocos.push([...placas].map((placa) => {
      const motorista = motoristas.get(placa) || `Placa ${placa}`;
      const passageiros = caronas.get(placa) || [];
      return `Motorista: ${motorista}\nPlaca: ${placa}\nCaronas:\n${passageiros.length ? passageiros.map((nome) => `• ${nome}`).join('\n') : '-'}`;
    }).join('\n\n'));
  }

  const { data: disponiveis, error: disponiveisError } = await supabase
    .from('programacao_colaboradores')
    .select('colaborador_id,nome_colaborador')
    .in('programacao_id', ids)
    .eq('disponibilidade', 'DISPONIVEL');
  if (disponiveisError) console.warn('[compartilhar-os] disponíveis:', disponiveisError);
  if ((disponiveis || []).length) {
    blocos.push(`Disponíveis:\n${disponiveis.map((row) => `• ${row.nome_colaborador || row.colaborador_id}`).join('\n')}`);
  }

  return [`📋 Programação — ${brDate(dataReferencia)}`, ...blocos].join('\n\n');
}

async function compartilhar(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Montando...';
  try {
    const texto = await montarTextoCompartilharPorOs();
    window.location.assign(`https://wa.me/?text=${encodeURIComponent(texto)}`);
  } catch (error) {
    console.error('[compartilhar-os]', error);
    const feedback = document.getElementById('progCtxFeedback');
    if (feedback) {
      feedback.className = 'feedback mt-16 prog-feedback-error';
      feedback.textContent = error?.message || 'Falha ao montar a mensagem de compartilhamento.';
    } else {
      alert(error?.message || 'Falha ao montar a mensagem de compartilhamento.');
    }
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// Este listener é carregado antes do patch legado de PDF/Compartilhar.
// Captura o clique primeiro e impede que a rotina antiga (que podia retornar
// somente a data quando o roster ficava vazio/stale) seja executada.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#progCompartilhar');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void compartilhar(button);
}, true);
