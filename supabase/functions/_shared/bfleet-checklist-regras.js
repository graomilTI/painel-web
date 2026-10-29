// Regras puras do checklist de Frotas que vem do app da BFleet/RedGPS (OnForms, API onforms/getAnswersForms).
// Sem Deno nem rede: testado em tests/frotas-checklist-app.test.mjs.
//
// Cada resposta da API traz placa (patent), condutor (driver_name), data/hora, local ("lat,lng") e as respostas em
// general/categories como { "<tipo>-<timestamp>": valor }, onde o tipo é textarea, multimedia (fotos: array JSON de URLs)
// ou jSignature (assinatura). A API não traz o texto das perguntas: o rótulo vem de frotas_checklist_perguntas.

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function placaNormalizada(v) {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

// Placa brasileira (Mercosul ou antiga): 3 letras, 1 dígito, 1 letra/dígito, 2 dígitos.
export function pareceUmaPlaca(v) {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placaNormalizada(v));
}

export function tipoDoComponente(componente) {
  const c = String(componente ?? '').toLowerCase();
  if (c.startsWith('multimedia')) return 'foto';
  if (c.startsWith('jsignature')) return 'assinatura';
  return 'texto';
}

// "[\"https://a.jpg\",\"https://b.jpg\"]" (ou uma URL solta) -> ['https://a.jpg', 'https://b.jpg']. Só http(s).
export function urlsDoValor(valor) {
  let lista = [];
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === 'string') {
    const t = valor.trim();
    if (t.startsWith('[')) {
      try { const j = JSON.parse(t); lista = Array.isArray(j) ? j : []; } catch { lista = []; }
    } else if (t) lista = [t];
  }
  return lista.map((u) => String(u ?? '').trim()).filter((u) => /^https?:\/\//i.test(u));
}

export function localizacao(v) {
  const m = String(v ?? '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return { latitude: null, longitude: null };
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return { latitude: null, longitude: null };
  return { latitude: lat, longitude: lng };
}

// perguntas: Map<componente, { rotulo, ordem, tipo }>. Componente desconhecido (formulário novo) entra com o código no lugar do rótulo.
export function itensDaResposta(resposta, perguntas) {
  const fontes = [resposta?.general, resposta?.categories, resposta?.footer];
  const itens = [];
  for (const fonte of fontes) {
    if (!fonte || typeof fonte !== 'object' || Array.isArray(fonte)) continue;
    for (const [componente, valor] of Object.entries(fonte)) {
      const conhecida = perguntas?.get?.(componente);
      const tipo = conhecida?.tipo || tipoDoComponente(componente);
      const base = { componente, rotulo: conhecida?.rotulo || componente, tipo, ordem: Number.isFinite(Number(conhecida?.ordem)) ? Number(conhecida.ordem) : 9999 };
      if (tipo === 'texto') {
        const t = texto(valor);
        if (t) itens.push({ ...base, valor: t });
      } else {
        const urls = urlsDoValor(valor);
        if (urls.length) itens.push({ ...base, urls });
      }
    }
  }
  return itens.sort((a, b) => a.ordem - b.ordem || a.componente.localeCompare(b.componente));
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

// Linha de frotas_checklist_respostas, ou null se a resposta não tiver id/data válidos.
export function normalizarResposta(resposta, perguntas) {
  const respostaId = texto(resposta?.id);
  const data = texto(resposta?.date).slice(0, 10);
  if (!respostaId || !DATA.test(data)) return null;
  const itens = itensDaResposta(resposta, perguntas);
  const digitada = itens.find((i) => i.tipo === 'texto' && /placa/i.test(i.rotulo))?.valor || '';
  // O "patent" da API é o ativo do usuário do app: às vezes é o nome da pessoa. Vale o que tem formato de placa
  // (primeiro o patent, depois a placa digitada no formulário); sem nenhum, fica o que existir.
  const candidatas = [resposta?.patent, digitada];
  const placa = placaNormalizada(candidatas.find(pareceUmaPlaca) || candidatas.find((c) => placaNormalizada(c)) || '');
  const hora = texto(resposta?.hour);
  const { latitude, longitude } = localizacao(resposta?.location);
  return {
    resposta_id: respostaId,
    form_id: texto(resposta?.form_id) || null,
    folio: texto(resposta?.folio) || null,
    placa: placa || null,
    placa_digitada: texto(digitada) || null,
    motorista: texto(resposta?.driver_name) || null,
    data_execucao: data,
    hora_execucao: HORA.test(hora) ? (hora.length === 5 ? `${hora}:00` : hora) : null,
    latitude,
    longitude,
    itens,
    total_fotos: itens.filter((i) => i.tipo === 'foto').reduce((n, i) => n + i.urls.length, 0),
    tem_assinatura: itens.some((i) => i.tipo === 'assinatura'),
  };
}

// Janela padrão do sync: os últimos dias até amanhã (a API aceita data final inclusiva; um dia a mais não custa).
export function janelaDoSync(hojeIso, dias = 3) {
  const base = new Date(`${hojeIso}T00:00:00Z`);
  const soma = (n) => new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
  return { inicio: soma(-Math.max(0, dias)), fim: soma(1) };
}

// Liga a resposta a um veículo do cadastro. Se o patent e a placa digitada divergem, vale a que existe no cadastro
// (veiculoPorPlaca: Map<placa normalizada, id>); sem nenhuma no cadastro, mantém a placa da resposta e veiculo_id nulo.
export function resolverVeiculo(linha, veiculoPorPlaca) {
  const digitada = placaNormalizada(linha?.placa_digitada);
  const atual = linha?.placa || '';
  if (atual && veiculoPorPlaca.has(atual)) return { placa: atual, veiculo_id: veiculoPorPlaca.get(atual) };
  if (digitada && veiculoPorPlaca.has(digitada)) return { placa: digitada, veiculo_id: veiculoPorPlaca.get(digitada) };
  return { placa: atual || null, veiculo_id: null };
}
