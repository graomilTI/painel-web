// Frotas > Cadastros > Checklist: regras puras (sem DOM nem rede) da lista por placa, dos vencidos e das ações
// (notificar o condutor e pedir manutenção). Testadas em tests/frotas-checklist-app.test.mjs.

// Checklist vencido = o mais recente do veículo foi feito há mais de 30 dias.
export const LIMITE_VENCIDO_DIAS = 30;

// Dias corridos entre duas datas ISO (AAAA-MM-DD), sem depender de fuso nem horário de verão.
export function diasEntre(deIso, ateIso) {
  const a = String(deIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const b = String(ateIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!a || !b) return null;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
}

const chaveDeData = (r) => `${r?.data_execucao || ''} ${r?.hora_execucao || ''}`;

// Agrupa os checklists por placa. O motorista, a data e as fotos da lista são do checklist mais recente.
export function agruparPorPlaca(registros, hojeIso, limite = LIMITE_VENCIDO_DIAS) {
  const grupos = new Map();
  for (const r of Array.isArray(registros) ? registros : []) {
    const placa = String(r?.placa || '').trim() || '(sem placa)';
    if (!grupos.has(placa)) grupos.set(placa, []);
    grupos.get(placa).push(r);
  }
  return [...grupos.entries()].map(([placa, lista]) => {
    const registrosDaPlaca = [...lista].sort((a, b) => chaveDeData(b).localeCompare(chaveDeData(a)));
    const ultimo = registrosDaPlaca[0];
    const dias = diasEntre(ultimo.data_execucao, hojeIso);
    return {
      placa,
      veiculo_id: registrosDaPlaca.find((r) => r.veiculo_id)?.veiculo_id || null,
      registros: registrosDaPlaca,
      ultimo,
      dias: dias == null ? null : Math.max(0, dias),
      vencido: dias != null && dias > limite,
    };
  });
}

export const textosDe = (registro) => (Array.isArray(registro?.itens) ? registro.itens : [])
  .filter((i) => i && i.tipo === 'texto' && String(i.valor || '').trim() && !/placa/i.test(i.rotulo || ''));

// O que o motorista escreveu em "Condição geral do veículo".
export function condicaoGeral(registro) {
  const item = (Array.isArray(registro?.itens) ? registro.itens : []).find((i) => i && i.tipo === 'texto' && /condi[cç][aã]o/i.test(i.rotulo || ''));
  return String(item?.valor || '').trim();
}

// Todas as fotos do checklist em uma lista só (a grade de 3 colunas mostra uma por vez, com o nome do item embaixo).
export function fotosDoRegistro(registro) {
  const fotos = [];
  for (const i of Array.isArray(registro?.itens) ? registro.itens : []) {
    if (!i || i.tipo !== 'foto') continue;
    const urls = Array.isArray(i.urls) ? i.urls : [];
    urls.forEach((url, n) => fotos.push({ url, rotulo: urls.length > 1 ? `${i.rotulo} (${n + 1}/${urls.length})` : i.rotulo }));
  }
  return fotos;
}

export function assinaturasDoRegistro(registro) {
  return (Array.isArray(registro?.itens) ? registro.itens : []).filter((i) => i && i.tipo === 'assinatura').flatMap((i) => i.urls || []);
}

// Pré-preenchimento da solicitação na Manutenção Corretiva. Quem decide se e quando a manutenção será feita é a equipe de
// Manutenção; aqui só vai o que o motorista descreveu na condição geral do veículo. Sem veículo no cadastro ou sem texto: null.
export function presetManutencao(grupo, { dataBr = '' } = {}) {
  const condicao = condicaoGeral(grupo?.ultimo);
  if (!grupo?.veiculo_id || !condicao) return null;
  const motorista = String(grupo.ultimo?.motorista || '').trim();
  return {
    veiculo_id: grupo.veiculo_id,
    origem: 'checklist',
    prioridade: 'normal',
    motorista,
    descricao: `Checklist${dataBr ? ` de ${dataBr}` : ''}${motorista ? ` (${motorista})` : ''} - condição do veículo: ${condicao}`,
  };
}

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

// DDI 55 quando vier só DDD+número; vazio se não parecer um telefone brasileiro.
export function normalizarFone(v) {
  const d = soDigitos(v);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return '';
}

export function primeiroNome(nome) {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

// Mensagem de WhatsApp pedindo ao condutor que atualize o checklist do veículo.
export function mensagemNotificacao({ motorista = '', placa = '', dias = null, dataBr = '', vencido = false } = {}) {
  const nome = primeiroNome(motorista);
  const quando = dataBr ? `O último foi feito em ${dataBr}${dias != null ? ` (há ${dias} ${dias === 1 ? 'dia' : 'dias'})` : ''}.` : 'Não encontramos nenhum checklist recente.';
  return [
    `Olá${nome ? `, ${nome}` : ''}!`,
    '',
    `O checklist do veículo ${placa} ${vencido ? 'está vencido' : 'precisa ser atualizado'}. ${quando}`,
    '',
    'Por favor, preencha o checklist no aplicativo (fotos de todos os itens e assinatura) o quanto antes.',
    '',
    'Obrigado!',
  ].join('\n');
}
