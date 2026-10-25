import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXTRAS_OUTROS, REGIMES, TIPOS_QUARTO, UFS } from '../assets/js/cotacaoHotelRegras.js';

// Fila v3 com as quatro ações pedidas (Cotar · Agrupar · Reservar · Cancelar) e link do hotel com as perguntas de empresa,
// endereço, os quatro tipos de quarto e os extras inclusos em caixas de seleção (24/10/2026).

const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

test('cada linha em aberto tem os quatro botões e a barra repete as ações para os marcados', () => {
  const fila = le('assets/js/modules/hospedagem/fila-ui.js');
  for (const attr of ['data-v3-cotar', 'data-v3-agrupar', 'data-v3-reservar', 'data-v3-recusar']) assert.ok(fila.includes(`iconBtn('${attr}'`), `a linha perdeu ${attr}`);
  for (const acao of ['cotar', 'agrupar', 'reservar', 'cancelar']) assert.ok(fila.includes(`data-v3-bar="${acao}"`), `a barra perdeu ${acao}`);
  assert.match(fila, /data-v3-select-todos/);
  assert.match(fila, /'Cancelar a solicitação'/);
  assert.doesNotMatch(fila, /'Recusar|Recusar a|>Recusar/, 'o texto visível da fila fala em cancelar');
});

test('agrupar marca só quem pode ir junto e cotar/reservar exigem o mesmo grupo', () => {
  const fila = le('assets/js/modules/hospedagem/fila-ui.js');
  assert.match(fila, /i\.solicitacao_id === ref\.solicitacao_id && elegiveisJuntos\(ref, i\)/);
  assert.match(fila, /data-agr-item/, 'agrupar abre uma janela com os colaboradores para escolher');
  assert.match(fila, /mesmoGrupo\(sel\)/);
  assert.match(le('assets/js/modules/hospedagem/cotacao-ui.js'), /return \{ acoesDoItem, ligar, abrirCotar \}/);
});

test('Agrupar fica verde quando há com quem agrupar e vermelho quando não há ninguém', () => {
  const fila = le('assets/js/modules/hospedagem/fila-ui.js');
  assert.match(fila, /juntos \? 'termo' : 'danger'/, 'o ícone da linha troca de cor');
  assert.match(fila, /classList\.toggle\('fm-agr-ok'/);
  assert.match(fila, /classList\.toggle\('fm-agr-sem'/);
  const css = le('assets/css/adm-hotel.css');
  assert.match(css, /\.fm-btn\.fm-agr-ok:not\(:disabled\)/);
  assert.match(css, /\.fm-btn\.fm-agr-sem:not\(:disabled\)/);
});

test('o link do hotel pergunta empresa, endereço, os quatro quartos e os extras em caixas', () => {
  const pagina = le('assets/js/cotacao-hotel.js');
  for (const id of ['cnpj', 'razao', 'regime', 'atendente', 'telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']) assert.ok(pagina.includes(`id="${id}"`), `falta o campo ${id}`);
  assert.match(pagina, /Object\.keys\(TIPOS_QUARTO\)\.map\(quartoHtml\)/, 'os quatro tipos de quarto aparecem sempre');
  assert.match(pagina, /data-extra=/);
  assert.match(pagina, /Extras inclusos na diária/);
  assert.deepEqual(Object.keys(TIPOS_QUARTO), ['INDIVIDUAL', 'DUPLO', 'TRIPLO', 'QUADRUPLO']);
  assert.deepEqual(Object.keys(REGIMES), ['simples_nacional', 'lucro_presumido', 'lucro_real']);
  assert.equal(UFS.length, 27);
  assert.ok(Object.keys(EXTRAS_OUTROS).length >= 8);
});

test('o ?v= do html e o do import das regras na página pública são o mesmo', () => {
  const html = le('cotacao-hotel.html').match(/cotacao-hotel\.js\?v=([^"']+)/)[1];
  assert.match(le('assets/js/cotacao-hotel.js'), new RegExp(`cotacaoHotelRegras\\.js\\?v=${html}'`));
});

test('migration e função gravam empresa, endereço e extras sem sobrescrever o cadastro do hotel', () => {
  const sql = le('supabase/migrations/20261024220000_hospedagem_cotacao_empresa_endereco_extras.sql');
  for (const coluna of ['empresa_dados jsonb', 'extras_outros text[]', 'extras_outros_texto text', 'regime_tributario text']) assert.ok(sql.includes(coluna), `migration sem ${coluna}`);
  const fn = le('supabase/functions/hospedagem-cotacao-publica/index.ts');
  assert.match(fn, /empresa_dados: d\.empresa \? \{ \.\.\.d\.empresa, endereco: d\.endereco \} : null/);
  assert.match(fn, /if \(vazio\(h\.cnpj_cpf\)\) novo\.cnpj_cpf/, 'o cadastro só é completado onde estava vazio');
  assert.match(fn, /cadastro,/, 'o GET devolve o cadastro para pré-preencher');
});
