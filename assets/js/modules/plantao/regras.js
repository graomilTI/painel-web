// Plantão (Início): regras puras. Datas, plantonistas, cobertura dos dias, cópia entre fins de semana e o modelo da imagem.
// Sem DOM e sem Supabase: é o que os testes (tests/plantao-fim-semana-regras.test.mjs) exercitam.
// Datas são sempre "AAAA-MM-DD" e calculadas ao meio-dia local, para o fuso nunca puxar o dia para o lado.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ── texto ───────────────────────────────────────────────────────────────────
export function normalizar(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

export function formatarTelefone(valor) {
  let d = soDigitos(valor);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(valor ?? '').trim();
}

export function primeiroNome(nome) {
  return String(nome ?? '').trim().split(/\s+/)[0] || '';
}

export function apelidoPadrao(nome) {
  return primeiroNome(nome).toUpperCase();
}

// Mesma chave que a escala antiga usa: CPF só com dígitos; sem CPF, o nome sem acento em maiúsculas.
export function chaveColaborador({ cpf, nome } = {}) {
  const digitos = soDigitos(cpf);
  if (digitos) return digitos;
  return normalizar(nome).toUpperCase();
}

// ── datas ───────────────────────────────────────────────────────────────────
export function dataDeISO(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d, 12, 0, 0);
}

export function isoDeData(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return '';
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${m}-${d}`;
}

export const hojeISO = (agora = new Date()) => isoDeData(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12));

export function somarDias(iso, quantidade) {
  const data = dataDeISO(iso);
  if (!data) return '';
  data.setDate(data.getDate() + quantidade);
  return isoDeData(data);
}

export const diaDaSemana = (iso) => dataDeISO(iso)?.getDay() ?? -1;
export const nomeDia = (iso) => DIAS[diaDaSemana(iso)] || '';
export const nomeDiaCurto = (iso) => DIAS_CURTOS[diaDaSemana(iso)] || '';
export const ehFimDeSemana = (iso) => [0, 6].includes(diaDaSemana(iso));

export function dataCurta(iso) {
  const [, m, d] = String(iso || '').split('-');
  return m && d ? `${d}/${m}` : '';
}

export function dataBR(iso) {
  const [a, m, d] = String(iso || '').split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

// ── períodos (fim de semana, feriado ou outra data) ─────────────────────────
// Sábado do fim de semana "da vez": no domingo ainda é o de ontem; de segunda a sexta é o próximo.
export function sabadoDaVez(hoje) {
  const dia = diaDaSemana(hoje);
  if (dia === 0) return somarDias(hoje, -1);
  return somarDias(hoje, (6 - dia + 7) % 7);
}

export function periodoFimDeSemana(sabado) {
  return { id: sabado, tipo: 'fds', dias: [sabado, somarDias(sabado, 1)], titulo: '' };
}

export function periodoData(iso, titulo = '') {
  return { id: iso, tipo: 'data', dias: [iso], titulo: String(titulo || '').trim() };
}

export function listarFinsDeSemana(hoje, quantidade = 12) {
  const primeiro = sabadoDaVez(hoje);
  return Array.from({ length: quantidade }, (_, i) => periodoFimDeSemana(somarDias(primeiro, i * 7)));
}

// Datas que já têm escala no banco e não caem em nenhum período da lista viram períodos próprios (feriados, por exemplo).
export function periodosExtras(linhas, periodos) {
  const cobertas = new Set(periodos.flatMap((p) => p.dias));
  const porData = new Map();
  for (const l of linhas || []) {
    const d = String(l.data_plantao || '').slice(0, 10);
    if (!d || cobertas.has(d)) continue;
    if (!porData.has(d)) porData.set(d, l.evento || '');
  }
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, evento]) => periodoData(d, evento));
}

export function ordenarPeriodos(periodos) {
  return [...periodos].sort((a, b) => a.dias[0].localeCompare(b.dias[0]));
}

// "07 e 08 nov" · "31 out e 01 nov" · "15 nov"
export function rotuloCurto(periodo) {
  const partes = periodo.dias.map((iso) => ({ dia: iso.slice(8, 10), mes: MESES[Number(iso.slice(5, 7)) - 1] }));
  if (partes.length === 1) return `${partes[0].dia} ${partes[0].mes}`;
  const ultimo = partes[partes.length - 1];
  const primeiro = partes[0];
  return primeiro.mes === ultimo.mes
    ? `${partes.slice(0, -1).map((p) => p.dia).join(', ')} e ${ultimo.dia} ${ultimo.mes}`
    : `${primeiro.dia} ${primeiro.mes} e ${ultimo.dia} ${ultimo.mes}`;
}

// "Sáb e Dom" · "Feriado Nacional" · "Sexta"
export function rotuloSemana(periodo) {
  if (periodo.titulo) return periodo.titulo;
  return periodo.dias.map(nomeDiaCurto).join(' e ');
}

// "Sábado e Domingo • 07 e 08/11/2026"
export function rotuloExtenso(periodo) {
  const dias = periodo.dias;
  const nomes = dias.map(nomeDia).join(' e ');
  if (dias.length === 1) return `${periodo.titulo ? `${periodo.titulo} • ` : ''}${nomes} • ${dataBR(dias[0])}`;
  const ultimo = dias[dias.length - 1];
  const mesmoMes = dias.every((d) => d.slice(0, 7) === ultimo.slice(0, 7));
  const iniciais = dias.slice(0, -1).map((d) => (mesmoMes ? d.slice(8, 10) : dataCurta(d))).join(', ');
  return `${nomes} • ${iniciais} e ${mesmoMes ? `${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}` : dataCurta(ultimo)}/${ultimo.slice(0, 4)}`;
}

// Evento que vai na coluna `evento` do banco: o dia da semana no fim de semana (como a escala antiga), o título nas demais datas.
export function eventoDoDia(periodo, iso) {
  return periodo.tipo === 'fds' ? nomeDia(iso) : (periodo.titulo || nomeDia(iso));
}

// ── horário ─────────────────────────────────────────────────────────────────
export const hora = (valor) => (valor ? String(valor).slice(0, 5) : '');

export function horarioTexto(e) {
  const partes = [];
  if (hora(e.hora_inicio) && hora(e.hora_fim)) partes.push(`${hora(e.hora_inicio)} às ${hora(e.hora_fim)}`);
  if (hora(e.hora_inicio_2) && hora(e.hora_fim_2)) partes.push(`${hora(e.hora_inicio_2)} às ${hora(e.hora_fim_2)}`);
  return partes.join(' | ');
}

export function horarioPadraoDoSetor(config) {
  return {
    hora_inicio: hora(config?.hora_inicio) || '08:00',
    hora_fim: hora(config?.hora_fim) || '12:00',
    hora_inicio_2: hora(config?.hora_inicio_2),
    hora_fim_2: hora(config?.hora_fim_2),
  };
}

// ── plantonistas ────────────────────────────────────────────────────────────
let sequencia = 0;
export const novoUid = () => `p${Date.now().toString(36)}${(sequencia += 1)}`;

export function novoPlantonista({ colaborador = {}, contato = {}, horario = {}, dias = [] } = {}) {
  const nome = String(colaborador.nome || '').trim();
  return {
    uid: novoUid(),
    colaborador_key: colaborador.colaborador_key || chaveColaborador({ cpf: colaborador.cpf, nome }),
    cpf: soDigitos(colaborador.cpf),
    nome,
    apelido: String(contato.apelido || '').trim() || apelidoPadrao(nome),
    telefone: formatarTelefone(contato.telefone || colaborador.telefone || ''),
    email: String(contato.email || colaborador.email || '').trim(),
    dias: [...dias],
    hora_inicio: hora(horario.hora_inicio),
    hora_fim: hora(horario.hora_fim),
    hora_inicio_2: hora(horario.hora_inicio_2),
    hora_fim_2: hora(horario.hora_fim_2),
    observacoes: '',
  };
}

// Linhas do banco (um setor, um período) → plantonistas. Mesma pessoa com o mesmo horário em dias diferentes vira UM plantonista.
export function agruparPlantonistas(linhas) {
  const ordenadas = [...(linhas || [])].sort((a, b) =>
    String(a.data_plantao).localeCompare(String(b.data_plantao)) || (a.ordem ?? 1) - (b.ordem ?? 1));
  const mapa = new Map();
  for (const l of ordenadas) {
    const h = [hora(l.hora_inicio), hora(l.hora_fim), hora(l.hora_inicio_2), hora(l.hora_fim_2)];
    const chave = [l.colaborador_key, ...h].join('|');
    const dia = String(l.data_plantao).slice(0, 10);
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        uid: novoUid(),
        colaborador_key: l.colaborador_key,
        cpf: soDigitos(l.cpf),
        nome: l.nome || '',
        apelido: l.apelido || '',
        telefone: formatarTelefone(l.telefone || ''),
        email: l.email_corporativo || '',
        dias: [],
        hora_inicio: h[0], hora_fim: h[1], hora_inicio_2: h[2], hora_fim_2: h[3],
        observacoes: l.observacoes || '',
      });
    }
    const p = mapa.get(chave);
    if (!p.dias.includes(dia)) p.dias.push(dia);
  }
  return [...mapa.values()];
}

// Plantonistas → linhas para a função rh_plantao_salvar_setor. A ordem recomeça em 1 a cada dia.
export function expandirLinhas({ entradas, periodo }) {
  const linhas = [];
  for (const dia of periodo.dias) {
    let ordem = 0;
    for (const e of entradas) {
      if (!e.dias.includes(dia)) continue;
      ordem += 1;
      linhas.push({
        data_plantao: dia,
        evento: eventoDoDia(periodo, dia),
        colaborador_key: e.colaborador_key,
        cpf: e.cpf || null,
        nome: e.nome,
        apelido: String(e.apelido || '').trim() || null,
        telefone: soDigitos(e.telefone) || null,
        email_corporativo: String(e.email || '').trim() || null,
        hora_inicio: e.hora_inicio || null,
        hora_fim: e.hora_fim || null,
        hora_inicio_2: e.hora_inicio_2 || null,
        hora_fim_2: e.hora_fim_2 || null,
        observacoes: e.observacoes || null,
        ordem,
      });
    }
  }
  return linhas;
}

// Fotografia estável para saber se o setor mudou desde a última leitura/gravação.
export function assinatura(entradas) {
  return JSON.stringify((entradas || []).map((e) => [
    e.colaborador_key, e.nome, String(e.apelido || '').trim(), soDigitos(e.telefone), String(e.email || '').trim(),
    [...e.dias].sort(), e.hora_inicio, e.hora_fim, e.hora_inicio_2, e.hora_fim_2, e.observacoes || '',
  ]));
}

export function validarPlantonista(e) {
  const erros = [];
  if (!String(e.nome || '').trim()) erros.push('Informe o nome.');
  if (!e.dias.length) erros.push('Marque ao menos um dia.');
  const tel = soDigitos(e.telefone);
  const tel11 = (tel.length === 12 || tel.length === 13) && tel.startsWith('55') ? tel.slice(2) : tel;
  if (tel && ![10, 11].includes(tel11.length)) erros.push('Telefone deve ter DDD + número.');
  const email = String(e.email || '').trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) erros.push('E-mail inválido.');
  if (!e.hora_inicio || !e.hora_fim) erros.push('Informe o horário de entrada e saída.');
  else if (e.hora_inicio >= e.hora_fim) erros.push('A saída deve ser depois da entrada.');
  if (Boolean(e.hora_inicio_2) !== Boolean(e.hora_fim_2)) erros.push('Preencha entrada e saída do segundo horário (ou deixe os dois vazios).');
  else if (e.hora_inicio_2 && e.hora_inicio_2 >= e.hora_fim_2) erros.push('No segundo horário, a saída deve ser depois da entrada.');
  return erros;
}

// ── cobertura ───────────────────────────────────────────────────────────────
// 'completo' = todos os dias do período têm plantonista; 'parcial' = só alguns; 'vazio' = nenhum.
export function coberturaSetor(entradas, periodo) {
  const cobertos = periodo.dias.filter((d) => entradas.some((e) => e.dias.includes(d)));
  const faltam = periodo.dias.filter((d) => !cobertos.includes(d));
  const situacao = !cobertos.length ? 'vazio' : faltam.length ? 'parcial' : 'completo';
  return { situacao, cobertos, faltam };
}

export function resumoPeriodo(entradasPorSetor, setores, periodo) {
  const itens = setores.map((setor) => ({ setor, ...coberturaSetor(entradasPorSetor[setor] || [], periodo) }));
  return { itens, completos: itens.filter((i) => i.situacao === 'completo').length, total: itens.length };
}

// ── copiar entre períodos ───────────────────────────────────────────────────
// Casa os dias pela posição na semana (sábado→sábado, domingo→domingo). Um período de uma data só recebe o primeiro dia casado.
export function mapearDias(diasOrigem, diasDestino) {
  const mapa = new Map();
  for (const o of diasOrigem) {
    const igual = diasDestino.find((d) => diaDaSemana(d) === diaDaSemana(o));
    if (igual) mapa.set(o, igual);
  }
  if (!mapa.size && diasDestino.length === 1 && diasOrigem.length) mapa.set(diasOrigem[0], diasDestino[0]);
  return mapa;
}

export function copiarPlantonistas(entradas, diasOrigem, diasDestino) {
  const mapa = mapearDias(diasOrigem, diasDestino);
  return entradas
    .map((e) => {
      const dias = [...new Set(e.dias.map((d) => mapa.get(d)).filter(Boolean))];
      return dias.length ? { ...e, uid: novoUid(), dias } : null;
    })
    .filter(Boolean);
}

// ── busca de colaboradores ──────────────────────────────────────────────────
// Todas as palavras digitadas precisam aparecer no nome. Quem já fez plantão no setor vem primeiro.
// `excluir` aceita chaves e nomes normalizados: a escala antiga guardou chaves por apelido, e o CPF da base não casa com elas.
export function buscarColaboradores(colaboradores, termo, { preferidos = new Set(), excluir = new Set(), limite = 8 } = {}) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const achados = [];
  for (const c of colaboradores) {
    if (excluir.has(c.colaborador_key) || excluir.has(normalizar(c.nome))) continue;
    const nome = normalizar(c.nome);
    if (!palavras.every((p) => nome.includes(p))) continue;
    const comeca = nome.startsWith(palavras[0]) ? 0 : 1;
    achados.push({ c, peso: (preferidos.has(c.colaborador_key) ? 0 : 2) + comeca });
  }
  achados.sort((a, b) => a.peso - b.peso || a.c.nome.localeCompare(b.c.nome, 'pt-BR'));
  return achados.slice(0, limite).map((a) => a.c);
}

// ── modelo da imagem ────────────────────────────────────────────────────────
// Só entram setores com plantonista. Cada pessoa leva o rótulo dos dias quando não cobre o período inteiro.
export function montarModeloImagem({ periodo, setores, mostrarTelefone = true, mostrarEmail = true }) {
  const cartoes = [];
  for (const { setor, entradas } of setores) {
    const pessoas = entradas
      .filter((e) => e.dias.some((d) => periodo.dias.includes(d)))
      .map((e) => {
        const dias = periodo.dias.filter((d) => e.dias.includes(d));
        return {
          nome: String(e.apelido || '').trim() || e.nome,
          telefone: mostrarTelefone ? formatarTelefone(e.telefone) : '',
          email: mostrarEmail ? String(e.email || '').trim() : '',
          horario: horarioTexto(e),
          dias: dias.length === periodo.dias.length ? '' : dias.map((d) => `${nomeDia(d)} • ${dataBR(d)}`).join(' e '),
        };
      });
    if (pessoas.length) cartoes.push({ setor, pessoas });
  }
  return { titulo: 'Escala de Plantão', periodo: rotuloExtenso(periodo), cartoes };
}

export function nomeArquivoImagem(periodo, formato) {
  return `plantao_${periodo.dias[0]}${periodo.dias.length > 1 ? `_${periodo.dias[periodo.dias.length - 1]}` : ''}_${formato}.png`;
}
