import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FILTROS_PREVENTIVA, categoriasDisponiveis, filtrarServicos, grupoDoServico, gruposDoPainel, nomeCurto, montarLista, pendentesDoVeiculo, proximoPrazo, restanteCelula, somarPrazo,
  validarPasso1, validarPasso2, validarPasso3, validarRegistroPreventiva,
} from '../assets/js/modules/frotas-manutencao-preventiva-regras.js';

const lin = (extra) => ({
  veiculo_id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', coordenacao: 'MT', supervisao: 'SORRISO', hodometro: 46000,
  plano_id: 'p-oleo', plano_codigo: 'oleo_motor', plano_nome: 'Troca de óleo', tipo: 'servico', categoria_codigo: 2, categoria_nome: 'Lubrificação',
  data_ultima: null, km_ultima: null, vencimento_km: null, vencimento_data: null, km_restante: null, dias_restantes: null, em_andamento: false, status: 'sem_historico', ...extra,
});

const linhas = [
  lin({ status: 'vencida', vencimento_km: 45000, km_restante: -1000, data_ultima: '2026-04-01', km_ultima: 40000 }),
  lin({ plano_id: 'p-pastilha', plano_codigo: 'pastilhas_freio', plano_nome: 'Troca de pastilhas', categoria_codigo: 9, categoria_nome: 'Freios', status: 'em_dia', vencimento_km: 60000, km_restante: 14000 }),
  lin({ plano_id: 'p-cal', plano_codigo: 'pneus_calibragem', plano_nome: 'Calibragem dos pneus', tipo: 'verificacao', categoria_codigo: 13, categoria_nome: 'Pneus', status: 'proxima', dias_restantes: 2, vencimento_data: '2026-10-18' }),
  lin({ veiculo_id: 'v2', placa: 'RMS1E45', marca_modelo: 'VW Saveiro', coordenacao: 'GO', hodometro: 30000, status: 'sem_historico' }),
  lin({ veiculo_id: 'v2', placa: 'RMS1E45', marca_modelo: 'VW Saveiro', coordenacao: 'GO', plano_id: 'p-pastilha', plano_codigo: 'pastilhas_freio', plano_nome: 'Troca de pastilhas', categoria_codigo: 9, categoria_nome: 'Freios', status: 'em_dia', vencimento_km: 55000 }),
];

test('lista: um veículo por linha, do mais urgente para o menos, com os serviços ordenados por urgência', () => {
  const m = montarLista(linhas, { tipo: 'servico' });
  assert.deepEqual(m.veiculos.map((v) => v.placa), ['ABC1D23', 'RMS1E45'], 'quem tem vencida vem primeiro');
  const v1 = m.veiculos[0];
  assert.deepEqual(v1.servicos.map((s) => s.plano_codigo), ['oleo_motor', 'pastilhas_freio'], 'só serviços; vencida antes de em dia');
  assert.equal(v1.maisUrgente.plano_codigo, 'oleo_motor');
  assert.deepEqual(v1.resumo, { vencida: 1, proxima: 0, em_dia: 1, sem_historico: 0, sem_hodometro: 0, documentos: 0 });
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
  assert.deepEqual(FILTROS_PREVENTIVA.map((f) => f.id), ['atencao', 'vencida', 'proxima', 'sem_historico', 'documentos', 'todos']);
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

test('cards: nome sem o "Troca de" e pesquisa por serviço ou sistema', () => {
  assert.equal(nomeCurto('Troca de óleo e filtro de óleo do motor'), 'Óleo e filtro de óleo do motor');
  assert.equal(nomeCurto('Troca de pastilhas de freio'), 'Pastilhas de freio');
  assert.equal(nomeCurto('Troca do filtro de ar do motor'), 'Filtro de ar do motor');
  assert.equal(nomeCurto('Troca dos pneus'), 'Pneus');
  assert.equal(nomeCurto('Troca da correia'), 'Correia');
  assert.equal(nomeCurto('Alinhamento, balanceamento e rodízio'), 'Alinhamento, balanceamento e rodízio', 'sem "Troca" fica como está');
  assert.equal(nomeCurto('Limpeza do sistema e troca do aditivo'), 'Limpeza do sistema e troca do aditivo', 'só o início conta');
  const v = montarLista(linhas, { tipo: 'todos' }).veiculos[0];
  assert.deepEqual(filtrarServicos(v.servicos, {}).map((s) => s.plano_codigo), ['oleo_motor', 'pastilhas_freio'], 'sem verificações por padrão');
  assert.deepEqual(filtrarServicos(v.servicos, { verificacoes: true }).map((s) => s.plano_codigo).sort(), ['oleo_motor', 'pastilhas_freio', 'pneus_calibragem']);
  assert.deepEqual(filtrarServicos(v.servicos, { busca: 'FREIOS' }).map((s) => s.plano_codigo), ['pastilhas_freio'], 'pelo sistema, sem caixa');
  assert.deepEqual(filtrarServicos(v.servicos, { busca: 'lubrificacao' }).map((s) => s.plano_codigo), ['oleo_motor'], 'pelo sistema do guia');
  assert.deepEqual(filtrarServicos(v.servicos, { busca: 'calibragem', selecionados: new Set(['p-cal']) }).map((s) => s.plano_codigo), ['pneus_calibragem'], 'verificação selecionada continua visível');
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

test('hub: Painel, Corretiva, Preventiva, Veículos e Agenda; Vencimentos e Troca de Óleo saíram; Preventiva usa o módulo novo', () => {
  const hub = readFileSync(new URL('../assets/js/frotas-manutencao-grupo.js', import.meta.url), 'utf8');
  const ids = [...hub.matchAll(/^\s{4}id: '([\w-]+)'/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['painel', 'manutencao', 'preventiva', 'veiculos', 'agenda', 'custos', 'pecas', 'oficinas', 'checklists']);
  assert.match(hub, /id: 'manutencao',\s+titulo: 'Corretiva'/);
  assert.match(hub, /id: 'preventiva',\s+titulo: 'Preventiva'/);
  assert.doesNotMatch(hub, /Troca de Óleo|titulo: 'Vencimentos'/);
  assert.match(hub, /FROTAS_MANUT_PREVENTIVA\.openHome/);
});

test('módulo Preventiva: lista + janela com os ícones dos grupos + assistente em passos; barra de ações fora de .fm-head', () => {
  const mod = readFileSync(new URL('../assets/js/modules/frotas-manutencao-preventiva.js', import.meta.url), 'utf8');
  assert.match(mod, /data-abrir-veic=/);
  assert.match(mod, /'fm-mod', 'fm-modal-largo', 'fm-modal-orc'/, 'o painel do veículo é uma janela');
  assert.doesNotMatch(mod, /fm-drawer/, 'sem a gaveta lateral');
  assert.match(mod, /data-pgrupo/, 'ícone de cada grupo do guia');
  assert.match(mod, /htmlCardServico/, 'cards selecionáveis');
  assert.doesNotMatch(mod, /data-painel-busca/, 'sem campo de pesquisa: os serviços ficam nos grupos');
  assert.match(mod, /planosIniciais/, 'Registrar leva os selecionados');
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

test('vencimentos: lê todas as páginas (a API corta em 1.000 linhas; 200 veículos x 24 serviços passam de 5.000)', async () => {
  const { carregarVencimentos, carregarManutencoes } = await import('../assets/js/modules/frotas-manutencao-dados.js');
  const total = 5040;
  const chamadas = [];
  const supabase = {
    from: (tabela) => {
      const q = { tabela, ordens: [] };
      const api = {
        select: () => api, order: (c) => { q.ordens.push(c); return api; }, limit: () => api, eq: () => api,
        range: (a, b) => {
          chamadas.push([tabela, a, b, q.ordens.join(',')]);
          const n = Math.max(0, Math.min(b + 1, total) - a);
          return Promise.resolve({ data: Array.from({ length: Math.min(n, 1000) }, (_, i) => ({ i: a + i })), error: null });
        },
        then: (res) => res({ data: [], error: null }),
      };
      return api;
    },
  };
  const linhas = await carregarVencimentos(supabase);
  assert.equal(linhas.length, total);
  assert.equal(linhas[4999].i, 4999);
  assert.deepEqual(chamadas.map((c) => c[1]), [0, 1000, 2000, 3000, 4000, 5000], 'uma consulta por página, até a última incompleta');
  assert.match(chamadas[0][3], /placa,plano_codigo,plano_id/, 'ordem estável com desempate');
  chamadas.length = 0;
  const base = await carregarManutencoes(supabase);
  assert.equal(base.manutencoes.length, total, 'manutenções, itens, orçamentos e notas também vêm completos');
  assert.equal(base.itens.length, total);
});

test('opções de prazo: faixas do guia viram escolha rápida (5.000 ou 10.000 km, 6 ou 12 meses)', async () => {
  const { opcoesDePrazo, kmMais } = await import('../assets/js/modules/frotas-manutencao-preventiva-regras.js');
  assert.deepEqual(opcoesDePrazo({ intervalo_km: 5000, intervalo_km_max: 10000, intervalo_meses: 6, intervalo_meses_max: 12 }), { kms: [5000, 10000], meses: [6, 12], dias: [] });
  assert.deepEqual(opcoesDePrazo({ intervalo_km: 10000, intervalo_meses: 12 }), { kms: [10000], meses: [12], dias: [] }, 'sem faixa = uma só opção');
  assert.deepEqual(opcoesDePrazo({ intervalo_dias: 15 }), { kms: [], meses: [], dias: [15] });
  assert.deepEqual(opcoesDePrazo({ intervalo_km: 5000, intervalo_km_max: 5000 }).kms, [5000], 'sem repetir');
  assert.equal(kmMais(313590, 10000), 323590);
  assert.equal(kmMais('', 5000), null);
  assert.equal(kmMais(null, 5000), null);
  const reg = readFileSync(new URL('../assets/js/modules/frotas-manutencao-preventiva-registro.js', import.meta.url), 'utf8');
  assert.match(reg, /data-pz-km-add/);
  assert.match(reg, /data-pz-meses/);
});

test('o que falta em uma preventiva registrada: NF, envio, comprovante e quem paga', async () => {
  const { pendenciasDoRegistro, registroComPendencias } = await import('../assets/js/modules/frotas-manutencao-preventiva-regras.js');
  const m = { responsavel_pagamento: 'empresa', pendencia_dispensada_em: null };
  const nota = (extra) => ({ anexo_url: 'nf', enviada_em: null, comprovante_url: null, pago_em: null, ...extra });
  const ids = (reg) => pendenciasDoRegistro(reg).itens.map((i) => i.id);
  assert.deepEqual(ids(registroComPendencias(m, [])), ['nf', 'comprovante'], 'sem nenhuma nota: falta NF e comprovante');
  assert.deepEqual(ids(registroComPendencias(m, [nota({ anexo_url: null, comprovante_url: 'c', pago_em: 'x' })])), ['nf'], 'só o comprovante chegou');
  assert.deepEqual(ids(registroComPendencias(m, [nota({})])), ['enviar', 'comprovante'], 'NF chegou, falta enviar e pagar');
  assert.deepEqual(ids(registroComPendencias(m, [nota({ enviada_em: 'x' })])), ['comprovante'], 'enviada, aguardando o comprovante/pagamento');
  assert.deepEqual(ids(registroComPendencias(m, [nota({ enviada_em: 'x', pago_em: 'x', comprovante_url: 'c' })])), []);
  assert.equal(pendenciasDoRegistro(registroComPendencias(m, [nota({ enviada_em: 'x', pago_em: 'x', comprovante_url: 'c' })])).id, 'completo');
  assert.deepEqual(ids(registroComPendencias({ ...m, responsavel_pagamento: null }, [])), ['responsavel', 'nf', 'comprovante']);
  const locadora = pendenciasDoRegistro(registroComPendencias({ ...m, responsavel_pagamento: 'locadora' }, []));
  assert.equal(locadora.texto, 'Pago por Locadora');
  assert.equal(locadora.itens.length, 0, 'outro pagador não tem pendência de documento');
  assert.equal(pendenciasDoRegistro(registroComPendencias({ ...m, pendencia_dispensada_em: '2026-10-16' }, [])).id, 'dispensada');
  // a linha da view traz os mesmos indicadores prontos
  assert.deepEqual(ids({ ...m, falta_nf: true, falta_comprovante: true }), ['nf', 'comprovante']);
});

test('nota: a NF é obrigatória na ficha; na preventiva basta a NF ou o comprovante', async () => {
  const { validarNota } = await import('../assets/js/modules/frotas-manutencao-regras.js');
  assert.match(validarNota({ valor: 10, fornecedor: 'A', arquivo: null })[0], /arquivo da nota fiscal/, 'ficha da Corretiva');
  assert.deepEqual(validarNota({ valor: 10, fornecedor: 'A', arquivo: null, comprovante: { name: 'pix.pdf' } }), []);
  assert.deepEqual(validarNota({ valor: 10, fornecedor: 'A', arquivo: { name: 'nf.pdf' }, comprovante: null }), []);
  assert.match(validarNota({ valor: 10, fornecedor: 'A', arquivo: null, comprovante: null })[0], /NF\/NFS-e ou o comprovante/);
});

test('lista: veículos com preventiva pendente de documento entram no filtro "Documentos pendentes"', () => {
  const pend = [{ veiculo_id: 'v2', manutencao_id: 'm1' }, { veiculo_id: 'v2', manutencao_id: 'm2' }];
  const m = montarLista(linhas, { tipo: 'servico', pendencias: pend });
  assert.equal(m.contagem.documentos, 1);
  assert.equal(m.veiculos.find((v) => v.placa === 'RMS1E45').resumo.documentos, 2);
  assert.deepEqual(montarLista(linhas, { tipo: 'servico', pendencias: pend, filtro: 'documentos' }).veiculos.map((v) => v.placa), ['RMS1E45']);
  assert.equal(montarLista(linhas, { tipo: 'servico' }).contagem.documentos, 0);
});

test('painel do veículo: registros feitos com o que falta; modal Pagamento e NF anexa depois e dispensa', () => {
  const lerArq = (c) => readFileSync(new URL(c, import.meta.url), 'utf8');
  const painel = lerArq('../assets/js/modules/frotas-manutencao-preventiva.js');
  assert.match(painel, /Registros feitos/);
  assert.match(painel, /data-pagamento=/);
  assert.match(painel, /frotas-manutencao-preventiva-pagamento\.js/);
  assert.match(painel, /carregarPendenciasPreventivas/);
  assert.match(painel, /documento pendente/);
  const pag = lerArq('../assets/js/modules/frotas-manutencao-preventiva-pagamento.js');
  assert.match(pag, /atualizarManutencao/);
  assert.match(pag, /enviarNfFinanceiro/);
  assert.match(pag, /criarEditorNotas/);
  assert.match(pag, /data-anexar-nf/);
  assert.match(pag, /comprovanteTardio/);
  assert.match(pag, /dispensarPendencias/);
  assert.match(lerArq('../assets/js/modules/frotas-manutencao-preventiva-registro.js'), /criarEditorNotas/);
  const dados = lerArq('../assets/js/modules/frotas-manutencao-dados.js');
  assert.match(dados, /frotas_preventiva_pendencias_v/);
  assert.match(dados, /frotas_manutencao_nota_comprovante/);
  const sql = lerArq('../supabase/migrations/20261016270000_frotas_preventiva_pendencias.sql');
  assert.match(sql, /frotas_preventiva_pendencias_v/);
  assert.match(sql, /sem_nf/);
});

test('lista rápida: o jsonb compacto da RPC volta ao formato da view e a tela lê tudo em uma consulta', async () => {
  const { expandirPainel } = await import('../assets/js/modules/frotas-manutencao-preventiva-regras.js');
  const planos = new Map([['p1', { id: 'p1', codigo: 'oleo_motor', nome: 'Troca de óleo', tipo: 'servico', categoria_codigo: 2 }], ['p2', { id: 'p2', codigo: 'x', nome: 'Outro', tipo: 'verificacao', categoria_codigo: 9 }]]);
  const painel = [{ v: 'v1', placa: 'ABC1D23', mm: 'Fiat Strada', km: 46000, s: [{ p: 'p1', st: 'vencida', du: '2026-04-01', ku: 40000, vk: 45000, kr: -1000, dr: -15, ea: true }, { p: 'p2', st: 'sem_historico', ea: false }, { p: 'inexistente', st: 'em_dia' }] }];
  const linhas = expandirPainel(painel, planos, new Map([[2, 'Lubrificação'], [9, 'Freios']]));
  assert.equal(linhas.length, 2, 'serviço sem plano ativo é ignorado');
  assert.deepEqual(linhas[0], {
    veiculo_id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', coordenacao: null, supervisao: null, hodometro: 46000,
    plano_id: 'p1', plano_codigo: 'oleo_motor', plano_nome: 'Troca de óleo', tipo: 'servico', categoria_codigo: 2, categoria_nome: 'Lubrificação',
    status: 'vencida', data_ultima: '2026-04-01', km_ultima: 40000, vencimento_km: 45000, vencimento_data: null, km_restante: -1000, dias_restantes: -15, em_andamento: true,
  });
  assert.equal(linhas[1].data_ultima, null, 'campo omitido vira null');
  assert.equal(linhas[1].em_andamento, false);
  assert.equal(montarLista(linhas, { tipo: 'todos' }).veiculos[0].resumo.vencida, 1);
  const mod = readFileSync(new URL('../assets/js/modules/frotas-manutencao-preventiva.js', import.meta.url), 'utf8');
  assert.match(mod, /carregarPainelPreventiva/);
  assert.match(mod, /let cache = null/, 'lista aparece na hora ao voltar para a aba');
  assert.match(readFileSync(new URL('../assets/js/modules/frotas-manutencao-dados.js', import.meta.url), 'utf8'), /frotas_preventiva_painel/);
});

test('grupos do painel: serviços agrupados pelo grupo do guia (ordem do guia), status mais urgente e "Outros" para o que não tem grupo', () => {
  const categorias = [{ codigo: 2, grupo_codigo: 6 }, { codigo: 9, grupo_codigo: 2 }, { codigo: 99, grupo_codigo: null }];
  const grupos = [{ codigo: 7, nome: 'Pneus' }, { codigo: 2, nome: 'Freios' }, { codigo: 6, nome: 'Óleo e filtros' }];
  const servicos = [
    lin({ plano_id: 'a', categoria_codigo: 2, status: 'em_dia' }), lin({ plano_id: 'b', categoria_codigo: 2, status: 'vencida' }),
    lin({ plano_id: 'c', categoria_codigo: 9, status: 'proxima' }), lin({ plano_id: 'd', categoria_codigo: 99, status: 'sem_historico' }),
  ];
  const r = gruposDoPainel(servicos, { categorias, grupos });
  assert.deepEqual(r.map((g) => [g.codigo, g.nome, g.total, g.status]), [[2, 'Freios', 1, 'proxima'], [6, 'Óleo e filtros', 2, 'vencida'], [0, 'Outros', 1, 'sem_historico']]);
  assert.equal(grupoDoServico(servicos[2], { categorias }), 2);
  assert.equal(grupoDoServico(servicos[3], { categorias }), 0);
});
