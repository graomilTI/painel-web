import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anexarTermoAssinado, nomeArquivoTermo, termoAnexado, tipoDoArquivo } from '../assets/js/modules/frotas-motoristas-termo.js';

// Frotas > Cadastros > Motoristas: termo de utilização (gerar / anexar o assinado no Drive do condutor).

test('o arquivo anexado se chama "Termo de Utilização de Veiculos - NOME DO CONDUTOR"', () => {
  assert.equal(nomeArquivoTermo('João da Silva Souza'), 'Termo de Utilização de Veiculos - JOÃO DA SILVA SOUZA.pdf');
  assert.equal(nomeArquivoTermo('  MARCOS   ROSA ALVES ', 'jpg'), 'Termo de Utilização de Veiculos - MARCOS ROSA ALVES.jpg');
  // barra no nome não pode virar subpasta/erro no Drive
  assert.equal(nomeArquivoTermo('ANA/BIA'), 'Termo de Utilização de Veiculos - ANA-BIA.pdf');
});

test('aceita só PDF, JPG e PNG (por tipo ou, na falta, pela extensão)', () => {
  assert.deepEqual(tipoDoArquivo({ type: 'application/pdf', name: 'x' }), { ext: 'pdf', mime: 'application/pdf' });
  assert.deepEqual(tipoDoArquivo({ type: 'image/jpeg', name: 'x' }), { ext: 'jpg', mime: 'image/jpeg' });
  assert.deepEqual(tipoDoArquivo({ type: '', name: 'Scan.PNG' }), { ext: 'png', mime: 'image/png' });
  assert.deepEqual(tipoDoArquivo({ type: '', name: 'foto.jpeg' }), { ext: 'jpg', mime: 'image/jpeg' });
  assert.equal(tipoDoArquivo({ type: 'application/zip', name: 'a.zip' }), null);
});

test('termo anexado = tem data de anexo', () => {
  assert.equal(termoAnexado({ termo_anexado_em: '2026-10-16T12:00:00Z' }), true);
  assert.equal(termoAnexado({ termo_anexado_em: null }), false);
  assert.equal(termoAnexado({}), false);
});

test('anexar envia à pasta mãe dos condutores (ação do Apps Script) e grava a referência no cadastro', async () => {
  const chamadas = [];
  const salvos = [];
  globalThis.window = { FROTAS_CONFIG: {} };
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:application/pdf;base64,QUJD'; setTimeout(() => this.onload()); } };
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url, body: JSON.parse(init.body) });
    return { status: 200, text: async () => JSON.stringify({ ok: true, fileId: 'F1', fileUrl: 'https://drive.google.com/file/d/F1/view', folderName: 'JOAO DA SILVA' }) };
  };
  const supabase = { from: (t) => ({ update: (campos) => ({ eq: async (c, v) => { salvos.push({ t, campos, c, v }); return { error: null }; } }) }) };
  const arquivo = { name: 'assinado.pdf', type: 'application/pdf', size: 1234 };

  const r = await anexarTermoAssinado(supabase, { id: 'M1', nome: 'João da Silva' }, arquivo, 'Fulano');

  const corpo = chamadas[0].body;
  assert.equal(corpo.action, 'upload_multa_dossie');
  assert.equal(corpo.parentFolderId, '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr'); // pasta mãe "CONDUTORES FROTA"
  assert.equal(corpo.driverName, 'João da Silva');
  assert.equal(corpo.fileName, 'Termo de Utilização de Veiculos - JOÃO DA SILVA.pdf');
  assert.equal(corpo.base64, 'QUJD');
  assert.equal(corpo.replaceExisting, true);
  assert.equal(salvos[0].t, 'frotas_motoristas');
  assert.equal(salvos[0].v, 'M1');
  assert.equal(salvos[0].campos.termo_drive_file_id, 'F1');
  assert.equal(salvos[0].campos.termo_origem, 'painel');
  assert.equal(salvos[0].campos.termo_anexado_por, 'Fulano');
  assert.ok(salvos[0].campos.termo_anexado_em);
  assert.equal(r.pasta, 'JOAO DA SILVA');
});

test('arquivo de tipo inválido ou grande demais não chega ao Drive', async () => {
  globalThis.fetch = async () => { throw new Error('não deveria chamar o Drive'); };
  const sb = {};
  await assert.rejects(anexarTermoAssinado(sb, { id: 'M1', nome: 'A' }, { name: 'a.zip', type: 'application/zip', size: 10 }), /PDF, JPG ou PNG/);
  await assert.rejects(anexarTermoAssinado(sb, { id: 'M1', nome: 'A' }, { name: 'a.pdf', type: 'application/pdf', size: 16 * 1024 * 1024 }), /15 MB/);
});

test('se o Apps Script recusar, nada é gravado no cadastro', async () => {
  let gravou = false;
  globalThis.window = { FROTAS_CONFIG: {} };
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:;base64,QQ=='; setTimeout(() => this.onload()); } };
  globalThis.fetch = async () => ({ status: 200, text: async () => JSON.stringify({ ok: false, message: 'Ação inválida.' }) });
  const sb = { from: () => ({ update: () => ({ eq: async () => { gravou = true; return { error: null }; } }) }) };
  await assert.rejects(anexarTermoAssinado(sb, { id: 'M1', nome: 'A B' }, { name: 'a.pdf', type: 'application/pdf', size: 10 }), /Ação inválida/);
  assert.equal(gravou, false);
});

test('a tela de Motoristas: sem coluna de endereço, ações em ícones e status de CNH, termo e app em colunas próprias', () => {
  const src = readFileSync(new URL('../assets/js/modules/frotas-motoristas.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /data-sort="endereco"/);
  assert.doesNotMatch(src, /contatoBadge/);
  assert.match(src, /data-gerar-termo/);
  assert.match(src, /data-anexar-termo/);
  assert.match(src, /<td>\$\{cnhBadge\(m\)\}<\/td>\s*<td>\$\{termoBadge\(m\)\}<\/td>\s*<td>\$\{appBadge\(m\)\}<\/td>/);
  for (const k of ['st_cnh', 'st_termo', 'st_app']) assert.match(src, new RegExp(`data-sort="${k}"`)); // CNH, Termo e App também ordenam
  assert.doesNotMatch(src, /Situação \(CNH/);
  // o botão de texto "Editar"/"Excluir" virou ícone
  assert.doesNotMatch(src, />Editar<\/button>/);
  assert.doesNotMatch(src, />Excluir<\/button>/);
});

test('os imports do termo usam o mesmo ?v= nas três pontas', () => {
  const ler = (c) => readFileSync(new URL(c, import.meta.url), 'utf8');
  const tokens = new Set();
  for (const f of ['../assets/js/frotas-cadastros.js', '../assets/js/frotas-motoristas.js', '../assets/js/modules/frotas-motoristas.js', '../assets/js/modules/frotas-motoristas-termo.js', '../assets/js/modules/frotas-termo-veiculos.js', '../frotas-cadastros.html']) {
    for (const m of ler(f).matchAll(/(?:frotas-motoristas|frotas-termo-veiculos|frotas-termo-pdf|frotas-motoristas-termo|frotas-cadastros)\.js\?v=([\w-]+)/g)) tokens.add(m[1]);
  }
  const roteador = ler('../assets/js/router.js').match(/frotas-cadastros\.js\?v=([\w-]+)/)[1];
  tokens.add(roteador);
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});
