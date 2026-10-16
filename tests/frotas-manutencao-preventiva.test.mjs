import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FILTROS_PREVENTIVA, montarMatriz, pendentesDoVeiculo, proximoPrazo, restanteCelula, somarPrazo, validarRegistroPreventiva,
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

test('matriz: um veículo por linha (placa) e um serviço por coluna, na ordem do guia', () => {
  const m = montarMatriz(linhas, { tipo: 'servico' });
  assert.deepEqual(m.colunas.map((c) => c.codigo), ['oleo_motor', 'pastilhas_freio'], 'só serviços, por categoria do guia');
  assert.deepEqual(m.veiculos.map((v) => v.placa), ['ABC1D23', 'RMS1E45']);
  assert.equal(m.veiculos[0].celulas.get('oleo_motor').status, 'vencida');
  assert.equal(m.veiculos[1].celulas.get('oleo_motor').status, 'sem_historico');
  assert.deepEqual(montarMatriz(linhas, { tipo: 'verificacao' }).colunas.map((c) => c.codigo), ['pneus_calibragem']);
  assert.equal(montarMatriz(linhas, { tipo: 'todos' }).colunas.length, 3);
});

test('matriz: filtros contam veículos e a busca acha por placa, modelo ou coordenação', () => {
  const m = montarMatriz(linhas, { tipo: 'servico' });
  assert.deepEqual(FILTROS_PREVENTIVA.map((f) => f.id), ['atencao', 'vencida', 'proxima', 'sem_historico', 'todos']);
  assert.equal(m.contagem.todos, 2);
  assert.equal(m.contagem.vencida, 1);
  assert.equal(m.contagem.proxima, 0, 'a calibragem (verificação) não conta quando só serviços são exibidos');
  assert.equal(m.contagem.sem_historico, 1, 'só a Saveiro tem serviço sem histórico');
  assert.equal(montarMatriz(linhas, { tipo: 'todos' }).contagem.proxima, 1);
  assert.deepEqual(montarMatriz(linhas, { tipo: 'servico', filtro: 'vencida' }).veiculos.map((v) => v.placa), ['ABC1D23']);
  assert.deepEqual(montarMatriz(linhas, { tipo: 'servico', busca: 'saveiro' }).veiculos.map((v) => v.placa), ['RMS1E45']);
  assert.deepEqual(montarMatriz(linhas, { tipo: 'servico', busca: 'go' }).veiculos.map((v) => v.placa), ['RMS1E45']);
});

test('solicitar: só serviços vencidos ou próximos e sem outra solicitação em andamento', () => {
  const v = montarMatriz([...linhas, lin({ plano_id: 'p-x', plano_codigo: 'filtro_ar_motor', plano_nome: 'Filtro de ar', categoria_codigo: 23, status: 'proxima', em_andamento: true })], { tipo: 'servico' }).veiculos[0];
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

test('módulo Preventiva: "+" por célula e por veículo, registra pela RPC e a barra de ações fica fora de .fm-head', () => {
  const mod = readFileSync(new URL('../assets/js/modules/frotas-manutencao-preventiva.js', import.meta.url), 'utf8');
  assert.match(mod, /data-reg=/);
  assert.match(mod, /\+ Registrar/);
  assert.match(mod, /registrarPreventiva/);
  assert.match(mod, /class="fm-topo"/);
  assert.doesNotMatch(mod, /class="fm-head"/);
  const dados = readFileSync(new URL('../assets/js/modules/frotas-manutencao-dados.js', import.meta.url), 'utf8');
  assert.match(dados, /frotas_manutencao_registrar_preventiva/);
  const sql = readFileSync(new URL('../supabase/migrations/20261016250000_frotas_manutencao_preventiva_registro.sql', import.meta.url), 'utf8');
  assert.match(sql, /proximo_km/);
  assert.match(sql, /coalesce\(u\.proximo_km/);
});
