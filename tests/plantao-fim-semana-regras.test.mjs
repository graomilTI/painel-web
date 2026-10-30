import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  agruparPlantonistas, apelidoPadrao, assinatura, buscarColaboradores, chaveColaborador, coberturaSetor, copiarPlantonistas,
  eventoDoDia, expandirLinhas, formatarTelefone, horarioTexto, listarFinsDeSemana, mapearDias, montarModeloImagem,
  nomeArquivoImagem, novoPlantonista, periodoData, periodoFimDeSemana, periodosExtras, resumoPeriodo, rotuloCurto,
  rotuloExtenso, rotuloSemana, sabadoDaVez, somarDias, validarPlantonista,
} from '../assets/js/modules/plantao/regras.js';

const FDS = periodoFimDeSemana('2026-11-07'); // sábado 07/11 e domingo 08/11/2026
const horario = { hora_inicio: '08:00', hora_fim: '12:00', hora_inicio_2: '13:30', hora_fim_2: '18:00' };
const pessoa = (nome, extra = {}) => novoPlantonista({ colaborador: { nome, cpf: '' }, horario, dias: FDS.dias, ...extra });

test('o fim de semana da vez: segunda a sexta aponta o próximo sábado; sábado é hoje; domingo ainda é o de ontem', () => {
  assert.equal(sabadoDaVez('2026-10-30'), '2026-10-31'); // sexta
  assert.equal(sabadoDaVez('2026-11-02'), '2026-11-07'); // segunda
  assert.equal(sabadoDaVez('2026-11-07'), '2026-11-07'); // sábado
  assert.equal(sabadoDaVez('2026-11-08'), '2026-11-07'); // domingo
});

test('a lista de fins de semana avança de 7 em 7 dias, sempre sábado e domingo', () => {
  const lista = listarFinsDeSemana('2026-10-30', 4);
  assert.deepEqual(lista.map((p) => p.dias[0]), ['2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21']);
  assert.ok(lista.every((p) => p.dias[1] === somarDias(p.dias[0], 1)));
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
});

test('rótulos do período', () => {
  assert.equal(rotuloCurto(FDS), '07 e 08 nov');
  assert.equal(rotuloCurto(periodoFimDeSemana('2026-10-31')), '31 out e 01 nov');
  assert.equal(rotuloCurto(periodoData('2026-11-15')), '15 nov');
  assert.equal(rotuloSemana(FDS), 'Sáb e Dom');
  assert.equal(rotuloSemana(periodoData('2026-11-15', 'Proclamação da República')), 'Proclamação da República');
  assert.equal(rotuloExtenso(FDS), 'Sábado e Domingo • 07 e 08/11/2026');
  assert.equal(rotuloExtenso(periodoData('2026-11-15', 'Proclamação')), 'Proclamação • Domingo • 15/11/2026');
});

test('datas fora do sábado/domingo que já têm escala viram períodos próprios, com o evento como título', () => {
  const linhas = [
    { data_plantao: '2026-11-07', evento: 'Sábado' },
    { data_plantao: '2026-11-20', evento: 'Consciência Negra' },
    { data_plantao: '2026-11-20', evento: 'Consciência Negra' },
    { data_plantao: '2026-12-25', evento: 'Natal' },
  ];
  const extras = periodosExtras(linhas, [FDS]);
  assert.deepEqual(extras.map((p) => [p.id, p.titulo]), [['2026-11-20', 'Consciência Negra'], ['2026-12-25', 'Natal']]);
});

test('o evento gravado segue a escala antiga: dia da semana no fim de semana, título nas outras datas', () => {
  assert.equal(eventoDoDia(FDS, '2026-11-07'), 'Sábado');
  assert.equal(eventoDoDia(periodoData('2026-11-20', 'Consciência Negra'), '2026-11-20'), 'Consciência Negra');
  assert.equal(eventoDoDia(periodoData('2026-11-20'), '2026-11-20'), 'Sexta');
});

test('telefone formatado e chave do colaborador (CPF, senão o nome sem acento em maiúsculas)', () => {
  assert.equal(formatarTelefone('45998420389'), '(45) 99842-0389');
  assert.equal(formatarTelefone('554533221100'), '(45) 3322-1100');
  assert.equal(formatarTelefone('4533221100'), '(45) 3322-1100');
  assert.equal(formatarTelefone('55 45 99842-0389'), '(45) 99842-0389');
  assert.equal(chaveColaborador({ cpf: '123.456.789-09', nome: 'x' }), '12345678909');
  assert.equal(chaveColaborador({ nome: 'José Conceição' }), 'JOSE CONCEICAO');
  assert.equal(apelidoPadrao('ana carolina ducatti'), 'ANA');
});

test('novo plantonista: os dois dias marcados, horário do setor, apelido pelo primeiro nome', () => {
  const p = pessoa('Bruna Boeing Dallagnol', { contato: { telefone: '45998390522', email: 'conferencia@grao1000.com.br' } });
  assert.deepEqual(p.dias, FDS.dias);
  assert.equal(p.apelido, 'BRUNA');
  assert.equal(p.telefone, '(45) 99839-0522');
  assert.equal(horarioTexto(p), '08:00 às 12:00 | 13:30 às 18:00');
});

test('as linhas do banco viram um plantonista por pessoa/horário e voltam iguais ao salvar', () => {
  const linhas = [
    { data_plantao: '2026-11-07', colaborador_key: 'A', nome: 'ANA', apelido: 'ANA', telefone: '45998420389', ordem: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00', hora_inicio_2: '13:30:00', hora_fim_2: '18:00:00' },
    { data_plantao: '2026-11-08', colaborador_key: 'A', nome: 'ANA', apelido: 'ANA', telefone: '45998420389', ordem: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00', hora_inicio_2: '13:30:00', hora_fim_2: '18:00:00' },
    { data_plantao: '2026-11-07', colaborador_key: 'B', nome: 'BIA', ordem: 2, hora_inicio: '08:00', hora_fim: '12:00' },
  ];
  const entradas = agruparPlantonistas(linhas);
  assert.equal(entradas.length, 2);
  assert.deepEqual(entradas[0].dias, ['2026-11-07', '2026-11-08']);
  assert.deepEqual(entradas[1].dias, ['2026-11-07']);
  assert.equal(entradas[0].hora_fim_2, '18:00');

  const volta = expandirLinhas({ entradas, periodo: FDS });
  assert.equal(volta.length, 3);
  assert.deepEqual(volta.map((l) => [l.data_plantao, l.colaborador_key, l.ordem, l.evento]),
    [['2026-11-07', 'A', 1, 'Sábado'], ['2026-11-07', 'B', 2, 'Sábado'], ['2026-11-08', 'A', 1, 'Domingo']]);
  assert.equal(volta[0].telefone, '45998420389');
  assert.equal(volta[1].hora_inicio_2, null);
  assert.equal(volta[1].email_corporativo, null);
  assert.equal(assinatura(agruparPlantonistas(volta)), assinatura(entradas));
});

test('mesma pessoa com horários diferentes continua sendo dois plantonistas (nada se perde)', () => {
  const base = { colaborador_key: 'A', nome: 'ANA', ordem: 1 };
  const entradas = agruparPlantonistas([
    { ...base, data_plantao: '2026-11-07', hora_inicio: '08:00', hora_fim: '12:00' },
    { ...base, data_plantao: '2026-11-08', hora_inicio: '09:00', hora_fim: '13:00' },
  ]);
  assert.equal(entradas.length, 2);
});

test('a assinatura muda quando algo muda e ignora o uid e a ordem dos dias', () => {
  const a = pessoa('Ana');
  const b = { ...a, uid: 'outro', dias: [...a.dias].reverse() };
  assert.equal(assinatura([a]), assinatura([b]));
  assert.notEqual(assinatura([a]), assinatura([{ ...a, telefone: '(45) 99999-0000' }]));
  assert.notEqual(assinatura([a]), assinatura([{ ...a, dias: ['2026-11-07'] }]));
});

test('validação do plantonista', () => {
  assert.deepEqual(validarPlantonista(pessoa('Ana')), []);
  assert.ok(validarPlantonista({ ...pessoa('Ana'), dias: [] }).includes('Marque ao menos um dia.'));
  assert.ok(validarPlantonista({ ...pessoa('Ana'), telefone: '123' }).some((m) => m.startsWith('Telefone')));
  assert.ok(validarPlantonista({ ...pessoa('Ana'), email: 'sem-arroba' }).includes('E-mail inválido.'));
  assert.ok(validarPlantonista({ ...pessoa('Ana'), hora_inicio: '12:00', hora_fim: '08:00' }).includes('A saída deve ser depois da entrada.'));
  assert.ok(validarPlantonista({ ...pessoa('Ana'), hora_inicio: '', hora_fim: '' }).some((m) => m.startsWith('Informe o horário')));
  assert.ok(validarPlantonista({ ...pessoa('Ana'), hora_inicio_2: '13:00', hora_fim_2: '' }).some((m) => m.startsWith('Preencha entrada e saída do segundo')));
  assert.deepEqual(validarPlantonista({ ...pessoa('Ana'), hora_inicio_2: '', hora_fim_2: '' }), []);
  assert.deepEqual(validarPlantonista({ ...pessoa('Ana'), telefone: '(45) 99842-0389', email: 'a@b.com' }), []);
});

test('cobertura: completo, falta um dia ou vazio; resumo conta os setores completos', () => {
  const sab = { ...pessoa('Ana'), dias: ['2026-11-07'] };
  assert.equal(coberturaSetor([], FDS).situacao, 'vazio');
  assert.deepEqual(coberturaSetor([sab], FDS), { situacao: 'parcial', cobertos: ['2026-11-07'], faltam: ['2026-11-08'] });
  assert.equal(coberturaSetor([sab, { ...pessoa('Bia'), dias: ['2026-11-08'] }], FDS).situacao, 'completo');
  const resumo = resumoPeriodo({ RH: [pessoa('Ana')], Frotas: [sab], Caixas: [] }, ['RH', 'Frotas', 'Caixas'], FDS);
  assert.equal(resumo.completos, 1);
  assert.equal(resumo.total, 3);
});

test('copiar para outro fim de semana casa sábado com sábado e domingo com domingo', () => {
  const origem = ['2026-11-07', '2026-11-08'];
  const destino = ['2026-11-14', '2026-11-15'];
  assert.deepEqual([...mapearDias(origem, destino)], [['2026-11-07', '2026-11-14'], ['2026-11-08', '2026-11-15']]);
  const sabadoSo = { ...pessoa('Ana'), dias: ['2026-11-07'] };
  const copia = copiarPlantonistas([pessoa('Bia'), sabadoSo], origem, destino);
  assert.deepEqual(copia[0].dias, destino);
  assert.deepEqual(copia[1].dias, ['2026-11-14']);
  assert.notEqual(copia[0].uid, pessoa('Bia').uid);
});

test('copiar para um feriado de uma data só leva o primeiro dia casado; sem dia da semana igual, o primeiro dia', () => {
  const feriadoSabado = ['2026-11-21'];
  assert.deepEqual([...mapearDias(['2026-11-07', '2026-11-08'], feriadoSabado)], [['2026-11-07', '2026-11-21']]);
  const feriadoSexta = ['2026-11-20'];
  assert.deepEqual([...mapearDias(['2026-11-07', '2026-11-08'], feriadoSexta)], [['2026-11-07', '2026-11-20']]);
  assert.deepEqual(copiarPlantonistas([{ ...pessoa('Ana'), dias: ['2026-11-08'] }], ['2026-11-07', '2026-11-08'], feriadoSexta), []);
});

test('busca de colaboradores: todas as palavras, sem acento, preferidos primeiro, sem repetir quem já está', () => {
  const base = [
    { colaborador_key: '1', nome: 'ANA CAROLINA DUCATTI' },
    { colaborador_key: '2', nome: 'MARIA ANA SOUZA' },
    { colaborador_key: '3', nome: 'JOSÉ ANACLETO' },
    { colaborador_key: '4', nome: 'BRUNA BOEING' },
  ];
  assert.deepEqual(buscarColaboradores(base, 'ana').map((c) => c.colaborador_key), ['1', '3', '2']);
  assert.deepEqual(buscarColaboradores(base, 'jose ana').map((c) => c.colaborador_key), ['3']);
  assert.deepEqual(buscarColaboradores(base, 'ana', { preferidos: new Set(['2']) }).map((c) => c.colaborador_key), ['2', '1', '3']);
  assert.deepEqual(buscarColaboradores(base, 'ana', { excluir: new Set(['1']) }).map((c) => c.colaborador_key), ['3', '2']);
  assert.deepEqual(buscarColaboradores(base, '   '), []);
});

test('modelo da imagem: só setores com gente, apelido no lugar do nome, rótulo de dia só quando não cobre o período', () => {
  const ana = pessoa('Ana Carolina', { contato: { telefone: '45998420389', email: 'frota@grao1000.com.br' } });
  const bia = { ...pessoa('Bia Lima'), dias: ['2026-11-08'], apelido: '' };
  const modelo = montarModeloImagem({
    periodo: FDS,
    setores: [{ setor: 'Frotas', entradas: [ana, bia] }, { setor: 'RH', entradas: [] }],
  });
  assert.equal(modelo.titulo, 'Escala de Plantão');
  assert.equal(modelo.periodo, 'Sábado e Domingo • 07 e 08/11/2026');
  assert.equal(modelo.cartoes.length, 1);
  const [a, b] = modelo.cartoes[0].pessoas;
  assert.deepEqual([a.nome, a.dias, a.telefone, a.email], ['ANA', '', '(45) 99842-0389', 'frota@grao1000.com.br']);
  assert.deepEqual([b.nome, b.dias], ['Bia Lima', 'Domingo • 08/11/2026']);

  const semContato = montarModeloImagem({ periodo: FDS, setores: [{ setor: 'Frotas', entradas: [ana] }], mostrarTelefone: false, mostrarEmail: false });
  assert.deepEqual([semContato.cartoes[0].pessoas[0].telefone, semContato.cartoes[0].pessoas[0].email], ['', '']);
  assert.equal(nomeArquivoImagem(FDS, 'vertical'), 'plantao_2026-11-07_2026-11-08_vertical.png');
});

// ── a página, o menu e o banco ──────────────────────────────────────────────
const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

test('todos os imports internos do Plantão usam o mesmo ?v= e o carregador também', () => {
  const tokens = new Set();
  for (const arquivo of readdirSync(new URL('assets/js/modules/plantao/', raiz))) {
    for (const m of ler(`assets/js/modules/plantao/${arquivo}`).matchAll(/from '\.\/[a-z-]+\.js\?v=([^']+)'/g)) tokens.add(m[1]);
  }
  for (const m of ler('assets/js/plantao-fim-semana.js').matchAll(/plantao\/tela\.js\?v=([^'"]+)/g)) tokens.add(m[1]);
  for (const m of ler('plantao-fim-semana.html').matchAll(/plantao-fim-semana\.js\?v=([^"]+)/g)) tokens.add(m[1]);
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('o menu Plantão do INÍCIO é um módulo à parte: não herda nem concede o Plantão do RH', async () => {
  const { MENU_CONFIG } = await import('../assets/js/menuConfig.js');
  const inicio = MENU_CONFIG.find((s) => s.grupo === 'INÍCIO').itens.find((i) => i.code === 'plantao_inicio');
  const rh = MENU_CONFIG.flatMap((s) => s.itens).find((i) => i.code === 'rh_plantao');
  assert.ok(inicio && rh);
  assert.equal(inicio.path, 'plantao-fim-semana');
  const codigos = (i) => [i.code, ...i.aliases].map((c) => c.toLowerCase());
  assert.ok(!codigos(inicio).some((c) => codigos(rh).includes(c)), 'os dois menus não podem compartilhar código nem alias');
});

test('o perfil Gestor só recebe o Plantão se o módulo estiver liberado', async () => {
  const { allowedItemsForContext, canOpenPath } = await import('../assets/js/authGuard.js');
  const gestor = (modules) => ({ user: { role: 'gestor', is_master: false }, modules });
  assert.ok(!canOpenPath(gestor([{ code: 'dashboard' }]), 'plantao-fim-semana'));
  assert.ok(canOpenPath(gestor([{ code: 'plantao_inicio' }]), 'plantao-fim-semana'));
  assert.ok(canOpenPath({ user: { is_master: true } }, 'plantao-fim-semana'));
  const comum = { user: { role: 'usuario' }, modules: [{ code: 'rh_plantao' }] };
  assert.ok(!allowedItemsForContext(comum).some((i) => i.path === 'plantao-fim-semana'), 'rh_plantao não abre o menu do INÍCIO');
  assert.ok(allowedItemsForContext(comum).some((i) => i.path === 'plantao'));
});

test('a migration cadastra o módulo, abre a leitura dos setores e grava o setor numa transação', () => {
  const sql = ler('supabase/migrations/20261030170000_plantao_inicio.sql');
  assert.match(sql, /'plantao_inicio', 'Plantão', 'inicio', 'plantao-fim-semana'/);
  assert.match(sql, /painel_has_module\(array\['equipe', 'rh_plantao', 'plantao_inicio'\], false\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /rh_plantao_pode_editar_setor\(p_setor\)/);
});
