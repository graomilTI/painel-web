import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETAPAS, proximaEtapa, etapaAnterior, encerrado, paraInputDataHora, deInputDataHora, podeEditarSinistros, itensChecklist,
  resumoChecklist, prazoSituacao, filtrarSinistros, ordenarSinistros, contarPorFiltro, codigoSinistro,
} from '../assets/js/modules/frotas-sinistros-regras.js';

// Mesmo conteúdo semeado pela migration 20261029180000_frotas_sinistros.sql (o que a Ana usa hoje no Incicle).
const MODELO = [
  { codigo: 'cnh_condutor', grupo: 'empresa', rotulo: 'CNH do colaborador', campos: null, so_se_ferido: false, obrigatorio_quando: 'sempre', ordem: 10, ativo: true },
  { codigo: 'telefone_condutor', grupo: 'empresa', rotulo: 'Telefone do colaborador', campos: ['condutor_telefone'], so_se_ferido: false, obrigatorio_quando: 'sempre', ordem: 20, ativo: true },
  { codigo: 'data_hora_local', grupo: 'empresa', rotulo: 'Data, hora e local', campos: ['ocorrido_em', 'local_texto'], so_se_ferido: false, obrigatorio_quando: 'sempre', ordem: 50, ativo: true },
  { codigo: 'boletim_ocorrencia', grupo: 'empresa', rotulo: 'Boletim de ocorrência', campos: null, so_se_ferido: false, obrigatorio_quando: 'terceiro', ordem: 60, ativo: true },
  { codigo: 'prontuario_medico', grupo: 'empresa', rotulo: 'Prontuário médico', campos: null, so_se_ferido: true, obrigatorio_quando: 'sempre', ordem: 80, ativo: true },
  { codigo: 't_cnh', grupo: 'terceiro', rotulo: 'CNH do condutor', campos: null, so_se_ferido: false, obrigatorio_quando: 'sempre', ordem: 10, ativo: true },
  { codigo: 't_seguro', grupo: 'terceiro', rotulo: 'Verificar se possui seguro', campos: ['tem_seguro'], so_se_ferido: false, obrigatorio_quando: 'sempre', ordem: 70, ativo: true },
];
const sin = (extra = {}) => ({ id: 's1', numero: 7, etapa: 'preparando', houve_terceiro: false, houve_ferido: false, ...extra });
const cod = (itens) => itens.map((i) => i.codigo);

test('etapas seguem o fluxo da corretora: preparando > solicitado > aberto > reparo > concluído', () => {
  assert.deepEqual(ETAPAS.map((e) => e.id), ['preparando', 'solicitado', 'aberto', 'reparo', 'concluido']);
  assert.equal(proximaEtapa('preparando').id, 'solicitado');
  assert.equal(proximaEtapa('reparo').id, 'concluido');
  assert.equal(proximaEtapa('concluido'), null);
  assert.equal(proximaEtapa('cancelado'), null);
  assert.equal(etapaAnterior('aberto').id, 'solicitado');
  assert.equal(etapaAnterior('preparando'), null);
  assert.ok(encerrado('concluido') && encerrado('cancelado') && !encerrado('aberto'));
});

test('hora de Brasília: ida e volta do campo datetime-local', () => {
  assert.equal(deInputDataHora('2026-10-15T14:30'), '2026-10-15T14:30:00-03:00');
  assert.equal(deInputDataHora(''), null);
  assert.equal(paraInputDataHora('2026-10-15T17:30:00Z'), '2026-10-15T14:30');
  assert.equal(paraInputDataHora(deInputDataHora('2026-01-02T23:45')), '2026-01-02T23:45');
  assert.equal(paraInputDataHora(null), '');
});

test('código do sinistro tem 4 dígitos', () => {
  assert.equal(codigoSinistro({ numero: 7 }), 'SIN-0007');
});

test('edição: master ou quem tem Sinistros/Manutenção com permissão de editar', () => {
  assert.equal(podeEditarSinistros({ user: { is_master: true } }), true);
  assert.equal(podeEditarSinistros({ modules: [{ code: 'frotas_sinistros', can_edit: true }] }), true);
  assert.equal(podeEditarSinistros({ modules: [{ code: 'FROTAS_MANUTENCAO', pode_editar: 'sim' }] }), true);
  assert.equal(podeEditarSinistros({ modules: [{ code: 'frotas_sinistros', can_edit: false }] }), false);
  assert.equal(podeEditarSinistros({ modules: [{ code: 'frotas_multas', can_edit: true }] }), false);
  assert.equal(podeEditarSinistros({}), false);
});

test('checklist da empresa: prontuário só aparece se o colaborador foi socorrido', () => {
  assert.deepEqual(cod(itensChecklist({ modelo: MODELO, sinistro: sin() })), ['cnh_condutor', 'telefone_condutor', 'data_hora_local', 'boletim_ocorrencia']);
  assert.ok(cod(itensChecklist({ modelo: MODELO, sinistro: sin({ houve_ferido: true }) })).includes('prontuario_medico'));
});

test('BO é obrigatório só quando há terceiro', () => {
  const bo = (s) => itensChecklist({ modelo: MODELO, sinistro: s }).find((i) => i.codigo === 'boletim_ocorrencia');
  assert.equal(bo(sin()).obrigatorio, false);
  assert.equal(bo(sin({ houve_terceiro: true })).obrigatorio, true);
});

test('item por campo: feito quando todos os campos estão preenchidos', () => {
  const item = (s) => itensChecklist({ modelo: MODELO, sinistro: s }).find((i) => i.codigo === 'data_hora_local');
  assert.equal(item(sin({ ocorrido_em: '2026-10-15T17:00:00Z' })).situacao, 'pendente');
  const ok = item(sin({ ocorrido_em: '2026-10-15T17:00:00Z', local_texto: 'BR-163' }));
  assert.equal(ok.situacao, 'ok');
  assert.equal(ok.origem, 'campo');
});

test('item de documento: arquivo anexado, conferido à mão ou dispensado', () => {
  const base = { modelo: MODELO, sinistro: sin() };
  const cnh = (extra) => itensChecklist({ ...base, ...extra }).find((i) => i.codigo === 'cnh_condutor');
  assert.equal(cnh({}).situacao, 'pendente');
  assert.equal(cnh({ anexos: [{ sinistro_id: 's1', terceiro_id: null, item_codigo: 'cnh_condutor' }] }).origem, 'arquivo');
  assert.equal(cnh({ marcas: [{ sinistro_id: 's1', terceiro_id: null, codigo: 'cnh_condutor', status: 'ok' }] }).origem, 'marca');
  assert.equal(cnh({ marcas: [{ sinistro_id: 's1', terceiro_id: null, codigo: 'cnh_condutor', status: 'dispensado' }] }).situacao, 'dispensado');
  // arquivo de outro sinistro ou de um terceiro não conta para a empresa
  assert.equal(cnh({ anexos: [{ sinistro_id: 's2', terceiro_id: null, item_codigo: 'cnh_condutor' }, { sinistro_id: 's1', terceiro_id: 't1', item_codigo: 'cnh_condutor' }] }).situacao, 'pendente');
});

test('terceiro: "tem seguro = Não" conta como informado (false não é vazio)', () => {
  const s = sin({ houve_terceiro: true });
  const t = { id: 't1', sinistro_id: 's1', nome: 'João', tem_seguro: false };
  const seguro = itensChecklist({ modelo: MODELO, sinistro: s, terceiro: t }).find((i) => i.codigo === 't_seguro');
  assert.equal(seguro.situacao, 'ok');
  assert.equal(itensChecklist({ modelo: MODELO, sinistro: s, terceiro: { ...t, tem_seguro: null } }).find((i) => i.codigo === 't_seguro').situacao, 'pendente');
  assert.deepEqual(cod(itensChecklist({ modelo: MODELO, sinistro: s, terceiro: t })), ['t_cnh', 't_seguro']);
});

test('resumo: conta só o obrigatório e lista o que falta, inclusive por terceiro', () => {
  const s = sin({ houve_terceiro: true, condutor_telefone: '(65) 99999-0000', ocorrido_em: '2026-10-15T17:00:00Z', local_texto: 'BR-163' });
  const terceiros = [{ id: 't1', sinistro_id: 's1', nome: 'João', tem_seguro: true }];
  const r = resumoChecklist({ modelo: MODELO, sinistro: s, terceiros, anexos: [{ sinistro_id: 's1', terceiro_id: null, item_codigo: 'cnh_condutor' }] });
  // empresa: cnh(ok), telefone(ok), data/local(ok), BO(obrigatório, falta) | terceiro: CNH (falta), seguro (ok)
  assert.equal(r.total, 6);
  assert.equal(r.feitos, 4);
  assert.deepEqual(r.faltam.map((f) => [f.codigo, f.quem]), [['boletim_ocorrencia', null], ['t_cnh', 'João']]);
  assert.equal(r.pct, 67);
  // sem terceiro, o BO deixa de ser obrigatório
  assert.equal(resumoChecklist({ modelo: MODELO, sinistro: sin({ condutor_telefone: '1', ocorrido_em: 'x', local_texto: 'y' }), anexos: [{ sinistro_id: 's1', item_codigo: 'cnh_condutor' }] }).pct, 100);
});

test('prazo do próximo passo: vencido, hoje, próximo e encerrado não conta', () => {
  const hoje = '2026-10-29';
  assert.equal(prazoSituacao(sin({ proxima_acao_em: '2026-10-28' }), hoje), 'vencido');
  assert.equal(prazoSituacao(sin({ proxima_acao_em: '2026-10-29' }), hoje), 'hoje');
  assert.equal(prazoSituacao(sin({ proxima_acao_em: '2026-11-01' }), hoje), 'proximo');
  assert.equal(prazoSituacao(sin({ proxima_acao_em: '2026-11-02' }), hoje), 'futuro');
  assert.equal(prazoSituacao(sin({ proxima_acao_em: '2026-10-01', etapa: 'concluido' }), hoje), null);
  assert.equal(prazoSituacao(sin(), hoje), null);
});

test('lista: filtro por etapa, por prazo e busca sem acento', () => {
  const linhas = [
    { id: 'a', etapa: 'preparando', placa: 'ABC1D23', condutor_nome: 'José Antônio', numero: 1, __prazo: 'vencido' },
    { id: 'b', etapa: 'aberto', placa: 'XYZ9K88', condutor_nome: 'Maria', protocolo: '55123', numero: 2, __prazo: null },
    { id: 'c', etapa: 'concluido', placa: 'QWE2R34', numero: 3, __prazo: null },
  ];
  assert.deepEqual(filtrarSinistros(linhas, 'aberto').map((l) => l.id), ['b']);
  assert.deepEqual(filtrarSinistros(linhas, 'prazo').map((l) => l.id), ['a']);
  assert.deepEqual(filtrarSinistros(linhas, 'todos', 'jose antonio').map((l) => l.id), ['a']);
  assert.deepEqual(filtrarSinistros(linhas, 'todos', '55123').map((l) => l.id), ['b']);
  assert.deepEqual(filtrarSinistros(linhas, 'todos', 'sin-0003').map((l) => l.id), ['c']);
  assert.deepEqual(contarPorFiltro(linhas), { todos: 3, preparando: 1, solicitado: 0, aberto: 1, reparo: 0, concluido: 1, cancelado: 0, prazo: 1 });
});

test('ordem: em andamento primeiro (prazo mais próximo no topo), encerrados no fim', () => {
  const linhas = [
    { id: 'enc', etapa: 'concluido', created_at: '2026-10-01' },
    { id: 'sem', etapa: 'aberto', created_at: '2026-10-10' },
    { id: 'tarde', etapa: 'solicitado', proxima_acao_em: '2026-11-10', created_at: '2026-10-02' },
    { id: 'cedo', etapa: 'preparando', proxima_acao_em: '2026-10-30', created_at: '2026-10-03' },
  ];
  assert.deepEqual(ordenarSinistros(linhas).map((l) => l.id), ['cedo', 'tarde', 'sem', 'enc']);
});

// O navegador identifica cada módulo pela URL completa (com ?v=): um import com token diferente carregaria duas cópias do mesmo módulo.
test('o ?v= dos módulos de Sinistros é o mesmo em todos os imports, na rota e na página', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const raiz = new URL('../', import.meta.url);
  const arquivos = [
    'assets/js/frotas-sinistros.js', 'assets/js/router.js', 'frotas-sinistros.html',
    ...readdirSync(new URL('assets/js/modules/', raiz)).filter((f) => f.startsWith('frotas-sinistros')).map((f) => `assets/js/modules/${f}`),
  ];
  const tokens = new Set();
  for (const f of arquivos) {
    for (const m of readFileSync(new URL(f, raiz), 'utf8').matchAll(/(?:frotas-sinistros[\w-]*|frotas-ui-lista)\.js\?v=([\w-]+)/g)) tokens.add(m[1]);
  }
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});
