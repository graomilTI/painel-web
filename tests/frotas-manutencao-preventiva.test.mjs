import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FILTROS_PREVENTIVA, agruparPorSistema, categoriasDisponiveis, montarLista, pendentesDoVeiculo, proximoPrazo, restanteCelula, somarPrazo,
  validarPasso1, validarPasso2, validarPasso3, validarRegistroPreventiva,
} from '../assets/js/modules/frotas-manutencao-preventiva-regras.js';

const lin = (extra) => ({
  veiculo_id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', coordenacao: 'MT', supervisao: 'SORRISO', hodometro: 46000,
  plano_id: 'p-oleo', plano_codigo: 'oleo_motor', plano_nome: 'Troca de óleo', tipo: 'servico', categoria_codigo: 2, categoria_nome: 'Lubrificação',
  data_ultima: null, km_ultima: null, vencimento_km: null, vencimento_data: null, km_restante: null, dias_restantes: null, em_andamento: false, status: 'sem_historico', ...extra,
});

const linhas = [
  lin({ status: 'vencida', vencimento_km: 45000, km_restante: -1000, data_ultima: '2026-04-01', km_ultima: 40000 }),
  lin({ plano_id: 'p-pastilha', plano_codigo: 'pastilhas_freio', plano_nome: 'Troca de pastilhas', categoria_codigo: 9, status: 'em_dia', vencimento_km: 60000, km_restante: 14000 }),
  lin({ plano_id: 'p-cal', plano_codigo: 'pneus_calibragem', plano_nome: 'Calibragem dos pneus', tipo: 'verificacao', categoria_codigo: 13, status: 'proxima', dias_restantes: 2, vencimento_data: '2026-10-18' }),
  lin({ veiculo_id: 'v2', placa: 'RMS1E45', marca_modelo: 'VW Saveiro', coordenacao: 'GO', hodometro: 30000, status: 'sem_historico' }),
  lin({ veiculo_id: 'v2', placa: 'RMS1E45', marca_modelo: 'VW Saveiro', coordenacao: 'GO', plano_id: 'p-pastilha', plano_codigo: 'pastilhas_freio', plano_nome: 'Troca de pastilhas', categoria_codigo: 9, status: 'em_dia', vencimento_km: 55000 }),
];

test('lista: um veículo por linha, do mais urgente para o menos, com os serviços ordenados por urgência', () => {
  const m = montarLista(linhas, { tipo: 'servico' });
  assert.deepEqual(m.veiculos.map((v) => v.placa), ['ABC1D23', 'RMS1E45'], 'quem tem vencida vem primeiro');
  const v1 = m.veiculos[0];
  assert.deepEqual(v1.servicos.map((s) => s.plano_codigo), ['oleo_motor', 'pastilhas_freio'], 'só serviços; vencida antes de em dia');
  assert.equal(v1.maisUrgente.plano_codigo, 'oleo_motor');
  assert.deepEqual(v1.resumo, { vencida: 1, proxima: 0, em_dia: 1, sem_historico: 0, sem_hodometro: 0 });
  assert.equal(m.veiculos[1].maisUrgente, null, 'sem vencida nem próxima não há "mais urgente"');
  assert.deepEqual(montarLista(linhas, { tipo: 'verificacao' }).veiculos[0].servicos.map((s) => s.plano_codigo), ['pneus_calibragem']);
  assert.equal(montarLista(linhas, { tipo: 'todos' }).veiculos[0].servicos.length, 3);
});

test('lista: mais urgente é o mais atrasado; próximas vêm depois das vencidas', () => {
  const ls = [
    lin({ plano_codigo: 'a', plano_nome: 'A', status: 'proxima', dias_restantes: 3 }),
    lin({ plano_codigo: 'b', plano_nome: 'B', status: 'vencida', dias_restantes: -2, km_restante: -10 }),
    lin({ plano_codigo: 'c', plano_nome: 'C', status: 'vencida', dias_restantes: -20, km_restante: -5 }),
  ];
  const v = montarLista(ls).veiculos[0];
  assert.deepEqual(v.servicos.map((s) => s.plano_codigo), ['c', 'b', 'a']);
  assert.equal(v.maisUrgente.plano_codigo, 'c');
});

test('lista: filtros contam veículos; busca e sistema restringem', () => {
  const m = montarLista(linhas, { tipo: 'servico' });
  assert.deepEqual(FILTROS_PREVENTIVA.map((f) => f.id), ['atencao', 'vencida', 'proxima', 'sem_historico', 'todos']);
  assert.equal(m.contagem.todos, 2);
  assert.equal(m.contagem.vencida, 1);
  assert.equal(m.contagem.proxima, 0, 'a calibragem (verificação) não conta quando só serviços são exibidos');
  assert.equal(m.contagem.sem_historico, 1, 'só a Saveiro tem serviço sem histórico');
  assert.equal(montarLista(linhas, { tipo: 'todos' }).contagem.proxima, 1);
  assert.deepEqual(montarLista(linhas, { tipo: 'servico', filtro: 'vencida' }).veiculos.map((v) => v.placa), ['ABC1D23']);
  assert.deepEqual(montarLista(linhas, { tipo: 'servico', busca: 'saveiro' }).veiculos.map((v) => v.placa), ['RMS1E45']);
  assert.deepEqual(montarLista(linhas, { tipo: 'servico', busca: 'go' }).veiculos.map((v) => v.placa), ['RMS1E45']);
  const freios = montarLista(linhas, { tipo: 'servico', categoria: '9' });
  assert.deepEqual(freios.veiculos[0].servicos.map((s) => s.plano_codigo), ['pastilhas_freio'], 'filtro de sistema deixa só os serviços dele');
  assert.equal(freios.contagem.vencida, 0, 'o óleo vencido não conta no filtro de freios');
  assert.deepEqual(categoriasDisponiveis(linhas, 'servico').map((c) => c.codigo), [2, 9]);
  assert.deepEqual(categoriasDisponiveis(linhas, 'todos').map((c) => c.codigo), [2, 9, 13]);
});

test('painel: serviços agrupados por sistema, com os que pedem atenção primeiro', () => {
  const v = montarLista(linhas, { tipo: 'todos' }).veiculos[0];
  const g = agruparPorSistema(v.servicos);
  assert.deepEqual(g.map((x) => x.categoria_codigo), [2, 13, 9], 'óleo (vencida) e pneus (próxima) antes de freios (em dia)');
  assert.equal(g[0].atencao, true);
  assert.equal(g[0].vencida, 1);
  assert.equal(g[1].proxima, 1);
  assert.equal(g[2].atencao, false);
});

test('solicitar: só serviços vencidos ou próximos e sem outra solicitação em andamento', () => {
  const v = montarLista([...linhas, lin({ plano_id: 'p-x', plano_codigo: 'filtro_ar_motor', plano_nome: 'Filtro de ar', categoria_codigo: 23, status: 'proxima', em_andamento: true })], { tipo: 'servico' }).veiculos[0];
  assert.deepEqual(pendentesDoVeiculo(v).map((c) => c.plano_codigo), ['oleo_motor']);
});

test('prazos: soma de meses limitada ao fim do mês, como o Postgres', () => {
  assert.equal(somarPrazo('2026-01-31', { meses: 1 }), '2026-02-28');
  assert.equal(somarPrazo('2024-01-31', { meses: 1 }), '2024-02-29');
  assert.equal(somarPrazo('2026-10-16', { meses: 6 }), '2027-04-16');
  assert.equal(somarPrazo('2026-10-16', { meses: 36 }), '2029-10-16');
  assert.equal(somarPrazo('2026-10-16', { dias: 15 }), '2026-10-31');
  assert.equal(somarPrazo('2026-12-20', { meses: 2, dias: 15 }), '2027-03-07');
  assert.equal(somarPrazo('', { meses: 1 }), null);
});

test('próximos prazos sugeridos pelo intervalo do plano', () => {
  const oleo = { intervalo_km: 5000, intervalo_meses: 6 };
  assert.deepEqual(proximoPrazo(oleo, '2026-10-16', 46000), { proximo_km: 51000, proxima_data: '2027-04-16' });
  assert.deepEqual(proximoPrazo({ intervalo_km: 10000 }, '2026-10-16', '46000'), { proximo_km: 56000, proxima_data: null });
  assert.deepEqual(proximoPrazo({ intervalo_meses: 12 }, '2026-10-16', null), { proximo_km: null, proxima_data: '2027-10-16' });
  assert.deepEqual(proximoPrazo(oleo, '2026-10-16', ''), { proximo_km: null, proxima_data: '2027-04-16' });
});

test('registro: exige data, km e ao menos um serviço; próximos prazos precisam ser depois do serviço', () => {
  const ok = { data: '2026-10-16', km: 46000, itens: [{ nome: 'Óleo', proximo_km: 51000, proxima_data: '2027-04-16' }] };
  assert.deepEqual(validarRegistroPreventiva(ok, '2026-10-16'), []);
  assert.equal(validarRegistroPreventiva({ ...ok, data: '' }, '2026-10-16').length, 1);
  assert.match(validarRegistroPreventiva({ ...ok, data: '2026-10-17' }, '2026-10-16')[0], /futura/);
  assert.match(validarRegistroPreventiva({ ...ok, km: '' }, '2026-10-16')[0], /km do veículo/);
  assert.match(validarRegistroPreventiva({ ...ok, itens: [] }, '2026-10-16')[0], /ao menos um serviço/);
  assert.match(validarRegistroPreventiva({ ...ok, itens: [{ nome: 'Óleo', proximo_km: 40000 }] }, '2026-10-16')[0], /maior que o km do serviço/);
  assert.match(validarRegistroPreventiva({ ...ok, itens: [{ nome: 'Óleo', proxima_data: '2026-10-01' }] }, '2026-10-16')[0], /depois da data/);
  assert.deepEqual(validarRegistroPreventiva({ ...ok, itens: [{ nome: 'Óleo' }] }, '2026-10-16'), [], 'próximos prazos são opcionais');
});

test('registro por passo: 1 = o que foi feito, 2 = prazos, 3 = pagamento', () => {
  const hoje = '2026-10-16';
  assert.equal(validarPasso1({ data: '', km: 1, itens: [{}] }, hoje).length, 1);
  assert.match(validarPasso1({ data: '2026-10-17', km: 1, itens: [{}] }, hoje)[0], /futura/);
  assert.match(validarPasso1({ data: hoje, km: '', itens: [{}] }, hoje)[0], /km do veículo/);
  assert.match(validarPasso1({ data: hoje, km: 1000, itens: [] }, hoje)[0], /ao menos um serviço/);
  assert.deepEqual(validarPasso1({ data: hoje, km: 1000, itens: [{}] }, hoje), []);
  assert.match(validarPasso2({ data: hoje, km: 1000, itens: [{ nome: 'Óleo', proximo_km: 900 }] })[0], /maior que o km/);
  assert.match(validarPasso2({ data: hoje, km: 1000, itens: [{ nome: 'Óleo', proxima_data: '2026-10-01' }] })[0], /depois da data/);
  assert.deepEqual(validarPasso2({ data: hoje, km: 1000, itens: [{ nome: 'Óleo' }] }), [], 'prazos são opcionais');
  assert.deepEqual(validarPasso3({}), [], 'pagamento é opcional');
  assert.match(validarPasso3({ notas: [{ valor: 5 }], custo: 5, responsavel: '' })[0], /quem paga/);
});

test('célula: mostra km e dias restantes', () => {
  assert.equal(restanteCelula({ km_restante: -1000, dias_restantes: -15 }), '1.000 km acima · 15 d atrasado');
  assert.equal(restanteCelula({ km_restante: 14000, dias_restantes: null }), 'faltam 14.000 km');
  assert.equal(restanteCelula({ km_restante: null, dias_restantes: 0 }), 'vence hoje');
  assert.equal(restanteCelula({}), '');
});

test('hub: abas Corretiva e Preventiva; Vencimentos e Troca de Óleo saíram; Preventiva usa o módulo novo', () => {
  const hub = readFileSync(new URL('../assets/js/frotas-manutencao-grupo.js', import.meta.url), 'utf8');
  const ids = [...hub.matchAll(/^\s{4}id: '([\w-]+)'/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['manutencao', 'preventiva', 'custos', 'oficinas', 'checklists']);
  assert.match(hub, /id: 'manutencao',\s+titulo: 'Corretiva'/);
  assert.match(hub, /id: 'preventiva',\s+titulo: 'Preventiva'/);
  assert.doesNotMatch(hub, /Troca de Óleo|vencimentos/);
  assert.match(hub, /FROTAS_MANUT_PREVENTIVA\.openHome/);
});

test('módulo Preventiva: lista + painel lateral + assistente em passos; barra de ações fora de .fm-head', () => {
  const mod = readFileSync(new URL('../assets/js/modules/frotas-manutencao-preventiva.js', import.meta.url), 'utf8');
  assert.match(mod, /data-abrir-veic=/);
  assert.match(mod, /fm-drawer/);
  assert.match(mod, /data-reg-plano=/, '+ por serviço no painel');
  assert.match(mod, /\+ Registrar/);
  assert.match(mod, /frotas-manutencao-preventiva-registro\.js/);
  assert.match(mod, /class="fm-topo"/);
  assert.doesNotMatch(mod, /class="fm-head"/);
  assert.doesNotMatch(mod, /fm-mx|montarMatriz/, 'a matriz saiu');
  const reg = readFileSync(new URL('../assets/js/modules/frotas-manutencao-preventiva-registro.js', import.meta.url), 'utf8');
  assert.match(reg, /O que foi feito/);
  assert.match(reg, /Próximos prazos/);
  assert.match(reg, /Pagamento e NF/);
  assert.match(reg, /registrarPreventiva/);
  const dados = readFileSync(new URL('../assets/js/modules/frotas-manutencao-dados.js', import.meta.url), 'utf8');
  assert.match(dados, /frotas_manutencao_registrar_preventiva/);
  const sql = readFileSync(new URL('../supabase/migrations/20261016250000_frotas_manutencao_preventiva_registro.sql', import.meta.url), 'utf8');
  assert.match(sql, /coalesce\(u\.proximo_km/);
});

test('registro com notas: exige quem paga e custo que cubra a soma das notas', () => {
  const base = { data: '2026-10-16', km: 46000, itens: [{ nome: 'Óleo' }] };
  const notas = [{ valor: 100 }, { valor: 200 }];
  assert.deepEqual(validarRegistroPreventiva({ ...base, notas, custo: 300, responsavel: 'empresa' }, '2026-10-16'), []);
  assert.match(validarRegistroPreventiva({ ...base, notas, custo: 300, responsavel: '' }, '2026-10-16')[0], /quem paga/);
  assert.match(validarRegistroPreventiva({ ...base, notas, custo: 250, responsavel: 'empresa' }, '2026-10-16')[0], /menor que a soma/);
  assert.match(validarRegistroPreventiva({ ...base, custo: -1 }, '2026-10-16')[0], /negativo/);
  assert.deepEqual(validarRegistroPreventiva({ ...base, custo: 0 }, '2026-10-16'), [], 'sem notas o custo é opcional');
});

test('Preventiva e ficha da Corretiva aceitam NF e comprovante de pagamento; o banco manda o pagamento já pago', () => {
  const lerArq = (c) => readFileSync(new URL(c, import.meta.url), 'utf8');
  const mod = lerArq('../assets/js/modules/frotas-manutencao-preventiva-registro.js');
  assert.match(mod, /Pagamento e NF/);
  assert.match(mod, /htmlEntradaNota/);
  assert.match(mod, /enviarNfFinanceiro/);
  assert.match(mod, /'comprovante'/);
  const html = lerArq('../assets/js/modules/frotas-manutencao-html.js');
  assert.match(html, /data-nt-comprovante/);
  assert.match(html, /Comprovante anexado/);
  assert.match(lerArq('../assets/js/modules/frotas-manutencao.js'), /comprovante_url: urlComprovante/);
  const sql = lerArq('../supabase/migrations/20261016260000_frotas_manutencao_nota_comprovante.sql');
  assert.match(sql, /case when n\.comprovante_url is not null then 'PAGO' else 'PENDENTE' end/);
  assert.match(sql, /p_custo numeric default 0, p_responsavel text default null/);
});
