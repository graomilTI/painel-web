import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compras = readFileSync(new URL('../assets/js/compras.js', import.meta.url), 'utf8');
const alojamentos = readFileSync(new URL('../assets/js/adm-hotel-alojamentos-compras.js', import.meta.url), 'utf8');
const pagamentos = readFileSync(new URL('../assets/js/adm-hotel-alojamentos-pagamentos.js', import.meta.url), 'utf8');
const deferred = readFileSync(new URL('../assets/js/adm-hotel-deferred.js', import.meta.url), 'utf8');

test('Gestor envia compras de alojamento pelo fluxo compartilhado de Compras', () => {
  assert.match(compras, /data-mode="alojamento"/);
  assert.match(compras, /salvarSolicitacao\(ctx,'Alojamento',itens\)/);
  assert.match(compras, /tipo:'Alojamento'/);
  assert.match(compras, /Hospedagem > Alojamentos > Compras/);
  assert.match(compras, /\.cmp-header-box\{grid-template-columns:minmax\(0,1fr\) 64px!important\}/);
});

test('Hospedagem carrega menu e fila filtrada de compras de alojamento', () => {
  assert.match(pagamentos, /data-aloj-pay-mode="compras"/);
  assert.match(deferred, /adm-hotel-alojamentos-compras\.js/);
  assert.match(alojamentos, /\.eq\('tipo_solicitacao','Alojamento'\)/);
  assert.match(alojamentos, /data-aloj-buy-filter="pendente"/);
  assert.match(alojamentos, /data-aloj-buy-purchase/);
});
