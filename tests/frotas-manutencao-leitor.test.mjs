import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dadosDoComprovante, dadosDoXml, dataEmissaoDaNf, tipoDaNota, valorDaNf } from '../assets/js/modules/frotas-manutencao-leitor.js';
import { htmlNotaIcones, htmlNotaLeitura } from '../assets/js/modules/frotas-manutencao-html.js';

// Notas da manutenção: só os anexos (NF e comprovante); o sistema lê os arquivos e preenche os dados.

test('valor da NF só por rótulo conhecido (errar o valor é pior do que pedir ao usuário)', () => {
  assert.equal(valorDaNf('DANFE ... VALOR TOTAL DA NOTA 1.234,56 ...'), 1234.56);
  assert.equal(valorDaNf('Valor Líquido da NFS-e: R$ 980,00'), 980);
  assert.equal(valorDaNf('Valor dos serviços R$ 2.500,10 ISS 3%'), 2500.1);
  assert.equal(valorDaNf('Total geral sem rótulo conhecido 12,00'), null);
  assert.equal(valorDaNf(''), null);
});

test('data de emissão pelo rótulo e comprovante com valor e data', () => {
  assert.equal(dataEmissaoDaNf('Data de Emissão: 20/10/2026 10:30'), '2026-10-20');
  assert.equal(dataEmissaoDaNf('sem data'), null);
  assert.deepEqual(dadosDoComprovante('Comprovante PIX Valor: R$ 1.500,00 Data 21/10/2026 Favorecido X'), { valor: 1500, data: '2026-10-21' });
  assert.deepEqual(dadosDoComprovante('Transferência de R$ 80,50 realizada'), { valor: 80.5, data: null });
});

test('XML de NF-e e de NFS-e: emitente, número, valor e emissão', () => {
  const nfe = '<nfeProc><NFe><infNFe><ide><nNF>4521</nNF><dhEmi>2026-10-20T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000190</CNPJ><xNome>AUTO PECAS BRASIL LTDA</xNome></emit><total><ICMSTot><vNF>1234.56</vNF></ICMSTot></total></infNFe></NFe></nfeProc>';
  assert.deepEqual(dadosDoXml(nfe), { origem: 'xml', fornecedor: 'AUTO PECAS BRASIL LTDA', cnpj: '12345678000190', numero: '4521', valor: 1234.56, data_emissao: '2026-10-20' });
  const nfse = '<CompNfse><Nfse><InfNfse><Numero>88</Numero><DataEmissao>2026-10-18T09:00:00</DataEmissao><ValorLiquidoNfse>980.00</ValorLiquidoNfse><PrestadorServico><RazaoSocial>OFICINA SILVA ME</RazaoSocial></PrestadorServico></InfNfse></Nfse></CompNfse>';
  const r = dadosDoXml(nfse);
  assert.equal(r.fornecedor, 'OFICINA SILVA ME'); assert.equal(r.numero, '88'); assert.equal(r.valor, 980); assert.equal(r.data_emissao, '2026-10-18');
});

test('tipo da nota vem dos itens da manutenção (peças, serviço ou os dois)', () => {
  assert.equal(tipoDaNota([{ tipo_item: 'servico' }]), 'servico');
  assert.equal(tipoDaNota([{ tipo_item: 'peca' }, { tipo_item: 'peca' }]), 'peca');
  assert.equal(tipoDaNota([{ tipo_item: 'peca' }, { tipo_item: 'servico' }]), 'misto');
});

test('entrada da nota: só ícones de anexar (NF e comprovante); o valor só aparece se a leitura falhar', () => {
  const html = htmlNotaIcones() + htmlNotaLeitura();
  assert.match(html, /class="fm-ic-act fm-arq"[^>]*><svg[^]*data-nt-arquivo/, 'NF é um ícone');
  assert.match(html, /class="fm-ic-act fm-arq"[^>]*><svg[^]*data-nt-comprovante/, 'comprovante é um ícone');
  assert.match(html, /data-nt-valor-wrap hidden/);
  assert.doesNotMatch(html, /data-nt="tipo"|data-nt="fornecedor"|data-nt="numero"|data-nt="pago_em"|type="date"/);
  const ctrl = readFileSync(new URL('../assets/js/modules/frotas-manutencao.js', import.meta.url), 'utf8');
  assert.match(ctrl, /lerNf\(arquivo\)[^]*lerComprovante\(comprovante\)/, 'o controlador lê os arquivos antes de salvar');
  assert.doesNotMatch(ctrl, /data-anexar-data/);
  const servico = readFileSync(new URL('../assets/js/modules/notas-fiscais/service.js', import.meta.url), 'utf8');
  assert.match(servico, /export async function lerTextoDoArquivo/, 'usa o mesmo leitor (pdf.js + OCR) de Notas Fiscais');
});

// DANFSe nacional (PDF do portal oficial): grade de rótulos em uma linha e valores na linha de baixo. O texto é fictício, no mesmo
// layout usado nos testes do agente que lança as NFs no GRM (colunas em 0, 45, 91 e 136 caracteres; 4 pt por caractere).
import { agruparCelulas, dadosDoDanfse } from '../assets/js/modules/frotas-manutencao-leitor.js';

const COLS = [0, 45, 91, 136];
function itensDe(linhas) {
  const itens = [];
  linhas.forEach((celulas, i) => celulas.forEach((c, k) => { if (c !== null && c !== '') itens.push({ str: c, x: COLS[k] * 4, y: 800 - i * 12, w: c.length * 4 }); }));
  return itens;
}
const danfse = ({ numero, emissao, prestador, cnpj, valor }) => itensDe([
  ['DANFSe v2.0', '', 'Município: Cuiabá - MT'],
  ['', '', 'Documento Auxiliar da NFS-e'],
  ['NÚMERO DA NFS-E', 'COMPETÊNCIA DA NFS-E', 'DATA E HORA DA EMISSÃO DA NFS-E'],
  [String(numero), emissao, `${emissao} 10:29:28`],
  ['EMITENTE DA NFS-E', 'SITUAÇÃO DA NFS-E', 'FINALIDADE'],
  ['Prestador', 'NFS-e gerada', 'NFS-e regular'],
  ['PRESTADOR / FORNECEDOR', 'CNPJ / CPF / NIF', 'Indicador Municipal (Inscrição)', 'Telefone'],
  ['', cnpj, '123456', '(00) 0000-0000'],
  ['Nome / Nome Empresarial', '', 'Município / Sigla UF', 'Código IBGE / CEP'],
  [prestador, '', 'Cuiabá / MT', '5103403 / 78.070-300'],
  ['TOMADOR / ADQUIRENTE', 'CNPJ / CPF / NIF', 'Indicador Municipal (Inscrição)', 'Telefone'],
  ['', '29.666.679/0001-34', '-', '(00) 0000-0000'],
  ['Nome / Nome Empresarial', '', 'Município / Sigla UF', 'Código IBGE / CEP'],
  ['GRAOMIL LTDA', '', 'Cascavel / PR', '4104808 / 85.816-294'],
  ['VALOR TOTAL DA NFS-E', 'VALOR DA OPERAÇÃO / SERVIÇO', 'Desconto Incondicionado', 'Desconto Condicionado'],
  ['', `R$${valor}`, '-', '-'],
  ['Total das Retenções (ISSQN / Federais)', 'VALOR LÍQUIDO DA NFS-e', 'Total do IBS/CBS', 'VALOR LÍQUIDO DA NFS-e + IBS/CBS'],
  ['-', `R$${valor}`, 'R$75,62', `R$${valor}'`],
]);

test('DANFSe nacional: número, emissão, prestador, CNPJ e valor pela coluna do rótulo (não pelo tomador nem pela chave)', () => {
  const r = dadosDoDanfse(agruparCelulas(danfse({ numero: 886, emissao: '05/10/2026', prestador: 'EMPRESA FICTICIA EQUIPAMENTOS LTDA', cnpj: '12.345.678/0001-95', valor: '7.959,98' })));
  assert.deepEqual(r, { origem: 'danfse', fornecedor: 'EMPRESA FICTICIA EQUIPAMENTOS LTDA', cnpj: '12345678000195', numero: '886', valor: 7959.98, data_emissao: '2026-10-05' });
});

test('PDF que não é DANFSe devolve null (cai no leitor de DANFe/genérico)', () => {
  assert.equal(dadosDoDanfse(agruparCelulas(itensDe([['DANFE', 'NF-e Nº 123'], ['VALOR TOTAL DA NOTA', 'R$100,00']]))), null);
});
