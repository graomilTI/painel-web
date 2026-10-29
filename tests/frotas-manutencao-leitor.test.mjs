import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dadosDoComprovante, dadosDoXml, dataEmissaoDaNf, tipoDaNota, valorDaNf } from '../assets/js/modules/frotas-manutencao-leitor.js';
import { htmlEntradaNota } from '../assets/js/modules/frotas-manutencao-html.js';

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

test('entrada da nota: só os campos de anexar (NF e comprovante); o valor só aparece se a leitura falhar', () => {
  const html = htmlEntradaNota();
  assert.match(html, /data-nt-arquivo/);
  assert.match(html, /data-nt-comprovante/);
  assert.match(html, /data-nt-valor-wrap hidden/);
  assert.doesNotMatch(html, /data-nt="tipo"|data-nt="fornecedor"|data-nt="numero"|data-nt="pago_em"|type="date"/);
  const ctrl = readFileSync(new URL('../assets/js/modules/frotas-manutencao.js', import.meta.url), 'utf8');
  assert.match(ctrl, /lerNf\(arquivo\)[^]*lerComprovante\(comprovante\)/, 'o controlador lê os arquivos antes de salvar');
  assert.doesNotMatch(ctrl, /data-anexar-data/);
  const servico = readFileSync(new URL('../assets/js/modules/notas-fiscais/service.js', import.meta.url), 'utf8');
  assert.match(servico, /export async function lerTextoDoArquivo/, 'usa o mesmo leitor (pdf.js + OCR) de Notas Fiscais');
});
