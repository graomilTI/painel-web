// Ajuda de custo: a conta Flash da BVGRAIN é outra conta e precisa sair em planilha própria.
// Antes só existiam 'ifood' e 'flash': quem era pago pela Flash da BVGRAIN caía no mesmo
// PGTO_FLASH da GRAOMIL (e uma conta desconhecida sumia da planilha sem aviso).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTAS, assinaturaAjudas, contaDoTexto, montarPlanilhas } from '../assets/js/ajudaCustoShared.js';

const ajuda = (cpf, conta, valor, nome = `Colab ${cpf}`) => ({ colaborador_cpf: cpf, colaborador_nome: nome, conta, valor });

test('contaDoTexto reconhece iFood, Flash e Flash BVGRAIN do cadastro do GRM', () => {
  assert.equal(contaDoTexto('GRAOMIL IFOOD'), 'ifood');
  assert.equal(contaDoTexto('GRAOMIL FLASH'), 'flash');
  assert.equal(contaDoTexto('BVGRAIN FLASH'), 'flash_bvgrain');
  assert.equal(contaDoTexto('  bvgrain   flash '), 'flash_bvgrain');
  assert.equal(contaDoTexto('BVGRAIN ITAU'), '');
  assert.equal(contaDoTexto(''), '');
  assert.equal(contaDoTexto(null), '');
});

test('Flash BVGRAIN aparece nas contas disponíveis', () => {
  assert.equal(CONTAS.flash_bvgrain, 'Flash BVGRAIN');
});

test('montarPlanilhas separa a Flash da BVGRAIN da Flash comum', () => {
  const { flash, flashBvgrain, ifood, ignoradas } = montarPlanilhas([
    ajuda('09460904912', 'flash', 700),
    ajuda('09014242930', 'flash_bvgrain', 349.9),
    ajuda('70435355147', 'flash_bvgrain', 80),
    ajuda('06928832150', 'ifood', 200),
  ]);
  assert.deepEqual(flash.map((l) => l.cpf), ['09460904912']);
  assert.deepEqual(flashBvgrain.map((l) => [l.cpf, l.valor]).sort(), [['09014242930', 349.9], ['70435355147', 80]]);
  assert.deepEqual(ifood.map((l) => [l.cpf, l.livre]), [['06928832150', 200]]);
  assert.equal(ignoradas.length, 0);
});

test('mesmo CPF soma dentro da conta, sem misturar Flash e Flash BVGRAIN', () => {
  const { flash, flashBvgrain } = montarPlanilhas([
    ajuda('09014242930', 'flash_bvgrain', 100),
    ajuda('09014242930', 'flash_bvgrain', 49.9),
    ajuda('09014242930', 'flash', 30),
  ]);
  assert.equal(flashBvgrain.length, 1);
  assert.equal(flashBvgrain[0].valor, 149.9);
  assert.equal(flash.length, 1);
  assert.equal(flash[0].valor, 30);
});

test('conta desconhecida ou CPF inválido não somem da planilha sem aviso', () => {
  const { flash, flashBvgrain, ifood, ignoradas } = montarPlanilhas([
    ajuda('09014242930', 'outra_conta', 50),
    ajuda('123', 'flash_bvgrain', 50),
    ajuda('09014242930', 'flash_bvgrain', 0),
  ]);
  assert.equal(flash.length + flashBvgrain.length + ifood.length, 0);
  assert.equal(ignoradas.length, 3);
});

test('assinaturaAjudas: igual para a mesma lista (em qualquer ordem) e diferente se algo mudar', () => {
  const a = { id: 'a', colaborador_cpf: '09014242930', conta: 'flash_bvgrain', valor: 349.9 };
  const b = { id: 'b', colaborador_cpf: '06928832150', conta: 'ifood', valor: 200 };
  const base = assinaturaAjudas([a, b]);
  assert.equal(assinaturaAjudas([b, a]), base);
  assert.notEqual(assinaturaAjudas([a]), base, 'ajuda excluída');
  assert.notEqual(assinaturaAjudas([a, b, { ...b, id: 'c' }]), base, 'ajuda incluída');
  assert.notEqual(assinaturaAjudas([a, { ...b, valor: 170 }]), base, 'valor alterado');
  assert.notEqual(assinaturaAjudas([a, { ...b, conta: 'flash' }]), base, 'conta alterada');
  assert.equal(assinaturaAjudas([a, { ...b, valor: '200.00' }]), base, 'valor como texto do banco');
  assert.equal(assinaturaAjudas([]), '');
  assert.equal(assinaturaAjudas(null), '');
});
