import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { itensDaResposta, janelaDoSync, localizacao, normalizarResposta, distanciaDePlaca, placaMaisParecida, placaNormalizada, pareceUmaPlaca, resolverVeiculo, tipoDoComponente, urlsDoValor } from '../supabase/functions/_shared/bfleet-checklist-regras.js';

// Frotas > Manutenção > Checklist: respostas do checklist do app da BFleet (OnForms, formulário 7294) via API onforms/getAnswersForms.

const ler = (c) => readFileSync(new URL(c, import.meta.url), 'utf8');

const PERGUNTAS = new Map([
  ['textarea-1772732797515', { rotulo: 'Placa', tipo: 'texto', ordem: 1 }],
  ['multimedia-1772732829805', { rotulo: 'Medição do odômetro', tipo: 'foto', ordem: 2 }],
  ['multimedia-1772732897731', { rotulo: 'Limpeza do interior', tipo: 'foto', ordem: 3 }],
  ['textarea-1772733120695', { rotulo: 'Freios', tipo: 'texto', ordem: 8 }],
  ['jSignature-1772734030420', { rotulo: 'Assinatura', tipo: 'assinatura', ordem: 20 }],
]);

const RESPOSTA = {
  id: '2662499', folio: '160', form_id: '7294', patent: 'RVN 7E53 ', driver_name: 'Nadijailson Gomes Tavares  ',
  date: '2026-10-29', hour: '16:52:34', location: '-17.8760796,-51.6752937',
  general: {
    'jSignature-1772734030420': '["https://newspace1.nyc3.digitaloceanspaces.com/forms_dynamic/80303/100396/jSignature-1.png"]',
    'multimedia-1772732897731': '["https://x.test/limpeza-1.jpg","https://x.test/limpeza-2.jpg"]',
    'textarea-1772733120695': 'bom',
    'multimedia-1772732829805': '["https://x.test/odometro.jpg"]',
    'textarea-1772732797515': 'RVN 7E53 \n',
    'multimedia-1772799999999': '["https://x.test/novo.jpg"]',
    'textarea-1772733931206': '   ',
  },
  categories: {},
  footer: {},
};

test('placaNormalizada tira espaço, hífen e quebra de linha e deixa em maiúsculas', () => {
  assert.equal(placaNormalizada('RVN 7E53 \n'), 'RVN7E53');
  assert.equal(placaNormalizada('bcs8i07 '), 'BCS8I07');
  assert.equal(placaNormalizada('ABC-1D23'), 'ABC1D23');
  assert.equal(placaNormalizada(null), '');
});

test('quando o patent da API é o nome da pessoa, vale a placa digitada no formulário', () => {
  assert.equal(pareceUmaPlaca('RVN 7E53 '), true);
  assert.equal(pareceUmaPlaca('RICHELL'), false);
  assert.equal(pareceUmaPlaca('Rafael Serenato'), false);
  const r = normalizarResposta({ ...RESPOSTA, patent: 'Richell Souza' }, PERGUNTAS);
  assert.equal(r.placa, 'RVN7E53');
  assert.equal(r.motorista, 'Nadijailson Gomes Tavares');
  const nenhuma = normalizarResposta({ ...RESPOSTA, patent: 'Richell Souza', general: { 'textarea-1772732797515': 'sem placa' } }, PERGUNTAS);
  assert.equal(nenhuma.placa, 'RICHELL', 'sem placa válida em lugar nenhum, mantém o que veio');
});

test('resolverVeiculo prefere a placa que existe no cadastro quando patent e placa digitada divergem', () => {
  const cadastro = new Map([['RVQ6J42', 'v-1'], ['SEH3F18', 'v-2']]);
  assert.deepEqual(resolverVeiculo({ placa: 'SEH3F18', placa_digitada: 'SEH3F18' }, cadastro), { placa: 'SEH3F18', veiculo_id: 'v-2', placa_original: null, placa_aproximada: false });
  assert.deepEqual(resolverVeiculo({ placa: 'RVQ7J42', placa_digitada: 'RVQ6J42' }, cadastro), { placa: 'RVQ6J42', veiculo_id: 'v-1', placa_original: null, placa_aproximada: false });
  assert.deepEqual(resolverVeiculo({ placa: 'ZZZ9Z99', placa_digitada: 'ZZZ9Z99' }, cadastro), { placa: 'ZZZ9Z99', veiculo_id: null, placa_original: null, placa_aproximada: false });
  assert.deepEqual(resolverVeiculo({ placa: '', placa_digitada: '' }, cadastro), { placa: null, veiculo_id: null, placa_original: null, placa_aproximada: false });
});

test('distanciaDePlaca conta troca, falta, sobra e letras trocadas de lugar como 1', () => {
  assert.equal(distanciaDePlaca('IUU6H07', 'IUU6H07'), 0);
  assert.equal(distanciaDePlaca('IIU6H07', 'IUU6H07'), 1);
  assert.equal(distanciaDePlaca('IUU6H0', 'IUU6H07'), 1);
  assert.equal(distanciaDePlaca('IUU6H077', 'IUU6H07'), 1);
  assert.equal(distanciaDePlaca('SEH3E39', 'SEH3E93'), 1);
  assert.equal(distanciaDePlaca('ABC1D23', 'XYZ9W88'), 7);
});

test('placaMaisParecida corrige 1 caractere, mas não adivinha em empate nem com nome de pessoa', () => {
  const cadastro = ['IUU6H07', 'SEH3E93', 'SEH3E94', 'FWY0D00'];
  assert.deepEqual(placaMaisParecida('IIU6H07', cadastro), { placa: 'IUU6H07', distancia: 1 });
  assert.deepEqual(placaMaisParecida('FMY0D00', cadastro), { placa: 'FWY0D00', distancia: 1 });
  assert.equal(placaMaisParecida('SEH3E95', cadastro), null, 'duas placas a 1 caractere: empate, não escolhe');
  assert.equal(placaMaisParecida('IUU6H07', cadastro), null, 'igual não é correção');
  assert.equal(placaMaisParecida('QWE1R23', cadastro), null, 'longe demais');
  assert.equal(placaMaisParecida('RICHELL', cadastro), null);
  assert.equal(placaMaisParecida('AB12', cadastro), null);
  assert.equal(placaMaisParecida('IIU6H07', []), null);
});

test('resolverVeiculo liga a placa errada à mais parecida do cadastro e guarda o que foi digitado', () => {
  const cadastro = new Map([['IUU6H07', 'v-9'], ['SEH3E93', 'v-3'], ['SEH3E94', 'v-4']]);
  assert.deepEqual(resolverVeiculo({ placa: 'IIU6H07', placa_digitada: 'IIU6H07' }, cadastro), { placa: 'IUU6H07', veiculo_id: 'v-9', placa_original: 'IIU6H07', placa_aproximada: true });
  assert.deepEqual(resolverVeiculo({ placa: 'SEH3E95', placa_digitada: 'SEH3E95' }, cadastro), { placa: 'SEH3E95', veiculo_id: null, placa_original: null, placa_aproximada: false });
  assert.deepEqual(resolverVeiculo({ placa: 'RICHELL', placa_digitada: 'IIU6H07' }, cadastro), { placa: 'IUU6H07', veiculo_id: 'v-9', placa_original: 'IIU6H07', placa_aproximada: true });
});

test('a migration da placa aproximada e a tela avisam quando a placa foi corrigida', () => {
  const mig = ler('../supabase/migrations/20261029230000_frotas_checklist_placa_aproximada.sql');
  assert.match(mig, /add column if not exists placa_original text/);
  assert.match(mig, /placa_aproximada boolean not null default false/);
  const ui = ler('../assets/js/modules/frotas-checklist-app.js');
  assert.match(ui, /r\.placa_aproximada/);
  assert.match(ui, /Placa corrigida/);
});

test('tipoDoComponente reconhece foto, assinatura e texto pelo prefixo do código', () => {
  assert.equal(tipoDoComponente('multimedia-1772732829805'), 'foto');
  assert.equal(tipoDoComponente('jSignature-1772734030420'), 'assinatura');
  assert.equal(tipoDoComponente('textarea-1772733120695'), 'texto');
  assert.equal(tipoDoComponente('qualquer-coisa'), 'texto');
});

test('urlsDoValor lê o array JSON de links, uma URL solta e ignora o que não é http(s)', () => {
  assert.deepEqual(urlsDoValor('["https://a/1.jpg","https://a/2.jpg"]'), ['https://a/1.jpg', 'https://a/2.jpg']);
  assert.deepEqual(urlsDoValor('https://a/solta.jpg'), ['https://a/solta.jpg']);
  assert.deepEqual(urlsDoValor('["javascript:alert(1)","data:text/html,x","https://ok/1.jpg"]'), ['https://ok/1.jpg']);
  assert.deepEqual(urlsDoValor('[quebrado'), []);
  assert.deepEqual(urlsDoValor(null), []);
  assert.deepEqual(urlsDoValor(['https://a/x.jpg', 5]), ['https://a/x.jpg']);
});

test('localizacao lê "lat,lng" e descarta coordenada vazia ou impossível', () => {
  assert.deepEqual(localizacao('-17.8760796,-51.6752937'), { latitude: -17.8760796, longitude: -51.6752937 });
  assert.deepEqual(localizacao('0,0'), { latitude: null, longitude: null });
  assert.deepEqual(localizacao('120,10'), { latitude: null, longitude: null });
  assert.deepEqual(localizacao(''), { latitude: null, longitude: null });
});

test('itensDaResposta segue a ordem do formulário, usa o rótulo e mantém componente novo com o código', () => {
  const itens = itensDaResposta(RESPOSTA, PERGUNTAS);
  assert.deepEqual(itens.map((i) => i.rotulo), ['Placa', 'Medição do odômetro', 'Limpeza do interior', 'Freios', 'Assinatura', 'multimedia-1772799999999']);
  assert.deepEqual(itens[2].urls, ['https://x.test/limpeza-1.jpg', 'https://x.test/limpeza-2.jpg']);
  assert.equal(itens[0].valor, 'RVN 7E53');
  assert.equal(itens.at(-1).tipo, 'foto');
  assert.ok(!itens.some((i) => i.componente === 'textarea-1772733931206'), 'texto em branco não vira item');
});

test('normalizarResposta monta a linha de frotas_checklist_respostas', () => {
  const r = normalizarResposta(RESPOSTA, PERGUNTAS);
  assert.equal(r.resposta_id, '2662499');
  assert.equal(r.folio, '160');
  assert.equal(r.placa, 'RVN7E53');
  assert.equal(r.motorista, 'Nadijailson Gomes Tavares');
  assert.equal(r.data_execucao, '2026-10-29');
  assert.equal(r.hora_execucao, '16:52:34');
  assert.equal(r.latitude, -17.8760796);
  assert.equal(r.total_fotos, 4); // odômetro 1 + limpeza 2 + item novo 1; a assinatura não conta
  assert.equal(r.tem_assinatura, true);
  assert.equal(r.itens.length, 6);
});

test('normalizarResposta usa a placa digitada quando a API não manda patent e descarta resposta sem id ou data', () => {
  const sem = normalizarResposta({ ...RESPOSTA, patent: '' }, PERGUNTAS);
  assert.equal(sem.placa, 'RVN7E53');
  assert.equal(normalizarResposta({ ...RESPOSTA, id: '' }, PERGUNTAS), null);
  assert.equal(normalizarResposta({ ...RESPOSTA, date: 'ontem' }, PERGUNTAS), null);
  const curta = normalizarResposta({ ...RESPOSTA, hour: '09:30' }, PERGUNTAS);
  assert.equal(curta.hora_execucao, '09:30:00');
  assert.equal(normalizarResposta({ id: '9', date: '2026-10-01' }, PERGUNTAS).itens.length, 0);
});

test('janelaDoSync cobre os últimos dias até amanhã', () => {
  assert.deepEqual(janelaDoSync('2026-10-29', 3), { inicio: '2026-10-26', fim: '2026-10-30' });
  assert.deepEqual(janelaDoSync('2026-03-01', 0), { inicio: '2026-03-01', fim: '2026-03-02' });
  assert.deepEqual(janelaDoSync('2026-12-31', 1), { inicio: '2026-12-30', fim: '2027-01-01' });
});

test('a migration semeia as 20 perguntas do formulário 7294, protege as tabelas e agenda o sync', () => {
  const mig = ler('../supabase/migrations/20261029220000_frotas_checklist_app.sql');
  const comps = [...mig.matchAll(/\('7294', '((?:textarea|multimedia|jSignature)-\d+)'/g)].map((m) => m[1]);
  assert.equal(comps.length, 20);
  assert.equal(new Set(comps).size, 20);
  assert.equal(comps.filter((c) => c.startsWith('multimedia')).length, 16);
  assert.equal(comps.filter((c) => c.startsWith('textarea')).length, 3);
  assert.equal((mig.match(/enable row level security/g) || []).length, 2);
  assert.equal((mig.match(/\(select public\.frotas_usuario_tem_acesso\(\)\)/g) || []).length, 2);
  assert.match(mig, /cron\.schedule\(\s*'sync-bfleet-checklists'/);
  assert.match(mig, /resposta_id text not null unique/);
});

test('o sync protege a chamada, grava por upsert e não apaga respostas', () => {
  const fn = ler('../supabase/functions/sync-bfleet-checklists/index.ts');
  assert.match(fn, /authorizeRequest\(req, \["frotas"\]\)/);
  assert.match(fn, /bearer === serviceKey/);
  assert.match(fn, /onConflict: "resposta_id"/);
  assert.doesNotMatch(fn, /\.delete\(/);
});

test('a aba Checklist fica em Cadastros (não em Manutenção), monta a tela das respostas do app e a tela só aceita fotos http(s)', () => {
  const cadastros = ler('../assets/js/frotas-cadastros.js');
  assert.match(cadastros, /id: 'checklists',\s+titulo: 'Checklist'/);
  assert.match(cadastros, /frotas-checklist-app\.js\?v=[\w-]+'\);\s*\n\s*window\.FROTAS_CHECKLIST_APP\.openHome/);
  const ids = [...cadastros.matchAll(/^\s{4}id: '([\w-]+)'/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ['motoristas', 'veiculos', 'rastreadores', 'checklists', 'termo-veiculos']);
  assert.doesNotMatch(ler('../assets/js/frotas-manutencao-grupo.js'), /checklist/i);
  const menu = ler('../assets/js/menuConfig.js');
  const linha = (id) => menu.split('\n').find((l) => l.includes(`item("${id}"`)) || '';
  assert.match(linha('frotas_cadastros'), /FROTAS_CHECKLISTS/);
  assert.doesNotMatch(linha('frotas_manutencao_grupo'), /CHECKLISTS/);
  const ui = ler('../assets/js/modules/frotas-checklist-app.js');
  assert.match(ui, /from\('frotas_checklist_respostas'\)/);
  assert.match(ui, /rel="noopener noreferrer"/);
  assert.doesNotMatch(ui, /innerHTML = [^;]*\$\{(?!esc\()[a-z.]*valor\}/);
});

test('os cabeçalhos da lista de checklists ordenam (data, veículo, motorista, fotos, observações, assinatura)', () => {
  const ui = ler('../assets/js/modules/frotas-checklist-app.js');
  for (const k of ['data', 'veiculo', 'motorista', 'fotos', 'obs', 'assinatura']) assert.ok(ui.includes(`['${k}','`), `falta o cabeçalho ${k}`);
  assert.match(ui, /data-sort="\$\{k\}"/);
  assert.match(ui, /\[\.\.\.rows\]\.sort\(compareRows\)/);
  assert.match(ui, /sortKey: 'data', sortDir: 'desc'/);
});

