// Regra pura (sem acesso a banco) da validação "Supervisão x local de embarque" da abertura de O.S.
// A consulta ao cadastro fica em logistica-supervisao-embarque.js; aqui só se decide, a partir dos
// pontos já carregados, qual supervisão o cadastro interno espera pro local escolhido.

// Mesma normalização do agente (grmserver-abrir-os-api.js): sem acento, maiúsculas, espaços únicos.
export function chaveSupervisao(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toUpperCase().trim();
}

function chaveTexto(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// pontos: linhas de operacional_pontos_embarque da UF+cidade ({ nome_local, tipo_local, supervisao }).
// 1) a supervisão do próprio ponto; 2) se o ponto não tem (ou não está no cadastro), a da cidade quando TODOS
// os pontos do MESMO tipo de local que têm supervisão concordam. Tipo diferente não vale: o GRM atribui
// supervisão por cidade+tipo (Fazenda em Diamantino/MT herdou a de um Armazém e saiu fora da regional pedida).
// tipoFallback: tipo do local quando ele não está no cadastro (vem do espelho do GRM).
// Devolve o nome da supervisão esperada, ou null quando o cadastro não permite afirmar nada.
export function supervisaoEsperada(pontos, nome, tipoFallback) {
  const lista = Array.isArray(pontos) ? pontos : [];
  const alvo = chaveTexto(nome);
  const ponto = alvo ? lista.find((p) => chaveTexto(p.nome_local) === alvo) : null;
  if (ponto && String(ponto.supervisao ?? '').trim()) return String(ponto.supervisao).trim();

  const tipo = chaveTexto((ponto && ponto.tipo_local) || tipoFallback);
  if (!tipo) return null;
  const nomes = new Map();
  lista.forEach((p) => {
    if (chaveTexto(p.tipo_local) !== tipo) return;
    const chave = chaveSupervisao(p.supervisao);
    if (chave) nomes.set(chave, String(p.supervisao).trim());
  });
  return nomes.size === 1 ? [...nomes.values()][0] : null;
}

// { ok:true } quando bate (ou o cadastro não afirma nada); { ok:false, esperada, motivo } quando diverge.
// Só avisa: o cadastro é incompleto (~9% dos pontos têm supervisão) e às vezes genérico (Campo Mourão cadastrado
// como "CASCAVEL - GERAL" quando existe "CASCAVEL - Campo Mourão" no GRM), então quem decide é o solicitante.
export function avaliarSupervisao({ pontos, nome, tipoFallback, regional, cidade, uf }) {
  const escolhida = String(regional ?? '').trim();
  const esperada = supervisaoEsperada(pontos, nome, tipoFallback);
  if (!esperada || !escolhida || chaveSupervisao(esperada) === chaveSupervisao(escolhida)) return { ok: true, esperada };
  return {
    ok: false,
    esperada,
    motivo: `Pelo cadastro, "${nome}" (${cidade}/${uf}) é da supervisão "${esperada}", mas você escolheu "${escolhida}". `
      + 'A O.S. será aberta no GRM exatamente na supervisão escolhida. Enviar mesmo assim?',
  };
}
