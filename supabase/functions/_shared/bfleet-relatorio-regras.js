// Regras puras para ler relatórios do portal web da BFleet (relatorios.bfleet.com.br) e separar os celulares do app.
// Sem Deno nem rede: testado em tests/bfleet-app-motoristas.test.mjs.

// O portal devolve os dados como literal de array JavaScript ([['a','b',1],[...]], aspas simples), não como JSON.
// Leitor próprio: só entende arrays aninhados de textos, números, null e booleanos. Nunca executa o texto recebido.
export function lerArrayLiteral(texto) {
  const t = String(texto ?? '').trim();
  if (!t.startsWith('[')) return null;
  let i = 0;
  const espaco = () => { while (i < t.length && /\s/.test(t[i])) i += 1; };
  const valor = () => {
    espaco();
    const c = t[i];
    if (c === '[') {
      i += 1;
      const lista = [];
      espaco();
      if (t[i] === ']') { i += 1; return lista; }
      for (;;) {
        lista.push(valor());
        espaco();
        if (t[i] === ',') { i += 1; espaco(); if (t[i] === ']') { i += 1; return lista; } continue; }
        if (t[i] === ']') { i += 1; return lista; }
        throw new Error('array inválido');
      }
    }
    if (c === "'" || c === '"') {
      i += 1;
      let out = '';
      while (i < t.length && t[i] !== c) {
        if (t[i] === '\\' && i + 1 < t.length) { out += t[i + 1]; i += 2; continue; }
        out += t[i];
        i += 1;
      }
      if (t[i] !== c) throw new Error('texto sem fechamento');
      i += 1;
      return out;
    }
    const m = t.slice(i).match(/^(-?\d+(?:\.\d+)?|null|true|false)/);
    if (!m) throw new Error('valor inválido');
    i += m[0].length;
    return m[0] === 'null' ? null : m[0] === 'true' ? true : m[0] === 'false' ? false : Number(m[0]);
  };
  try {
    const r = valor();
    espaco();
    return Array.isArray(r) && i >= t.length ? r : null;
  } catch {
    return null;
  }
}

const PLACA = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
const DATA_HORA = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const dataHora = (v) => {
  const m = texto(v).match(DATA_HORA);
  return m ? `${m[1]} ${m[2]}` : null;
};

// Relatório "Equipamentos sem relatório" (OnReports): [Activo, Equipo, Último reporte, Atraso, Última conexão].
// Rastreador veicular = IMEI de 15 dígitos. Qualquer outro identificador é um celular com o aplicativo (Android ID de 16 hex).
// Itens cujo "Activo" é uma placa são veículos rastreados pelo app, não pessoas: ficam de fora.
export function aparelhosDoRelatorio(linhas) {
  const vistos = new Map();
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    if (!Array.isArray(linha) || linha.length < 2) continue;
    const ativo = texto(linha[0]);
    const equipo = texto(linha[1]);
    if (!ativo || !equipo || /^\d{15}$/.test(equipo)) continue;
    if (PLACA.test(ativo.replace(/[^A-Za-z0-9]/g, '').toUpperCase())) continue;
    vistos.set(equipo, {
      equipo,
      ativo,
      ultimo_reporte: dataHora(linha[2]),
      atraso: texto(linha[3]) || null,
      ultima_conexao: dataHora(linha[4]),
    });
  }
  return [...vistos.values()];
}

// Chave de comparação de nomes: sem acento, caixa ou pontuação, espaços colapsados.
export function chaveNome(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
