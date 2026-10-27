'use strict';
// Leitor de NFS-e (DANFSe nacional em PDF e XML): sem rede, sem Supabase.
// O texto é sintético (dados fictícios) no layout do `pdftotext -layout` do DANFSe:
// linha de rótulos em colunas + linha de valores logo abaixo.
const assert = require('assert');
const A = require('./grmserver-lancar-notas-fiscais-api');

A.loadConfig();

const COLS = [0, 45, 91, 136];
const linha = (...celulas) => {
  let s = '';
  celulas.forEach((c, i) => { s = s.padEnd(COLS[i], ' ') + c; });
  return s;
};

function danfse({ numero, emissao, prestador, cnpjPrestador, tomadorCnpj = '29.666.679/0001-34', valor, descricao, retencao = '-' }) {
  const chave = `51034031${'2'}${cnpjPrestador.replace(/\D/g, '')}${'0'.repeat(13 - String(numero).length)}${numero}${'1'.repeat(15)}`;
  return [
    linha('DANFSe v2.0', '', 'Município: Cuiabá - MT'),
    linha('', '', 'Documento Auxiliar da NFS-e'),
    '',
    'CHAVE DE ACESSO DA NFS-E',
    chave.slice(0, 50),
    '',
    linha('NÚMERO DA NFS-E', 'COMPETÊNCIA DA NFS-E', 'DATA E HORA DA EMISSÃO DA NFS-E'),
    linha(String(numero), emissao, `${emissao} 10:29:28`),
    linha('NÚMERO DA DPS', 'SÉRIE DA DPS', 'DATA E HORA DA EMISSÃO DA DPS'),
    linha(String(numero), '70013', '01/01/2000 00:00:00'),
    linha('EMITENTE DA NFS-E', 'SITUAÇÃO DA NFS-E', 'FINALIDADE'),
    linha('Prestador', 'NFS-e gerada', 'NFS-e regular'),
    linha('PRESTADOR / FORNECEDOR', 'CNPJ / CPF / NIF', 'Indicador Municipal (Inscrição)', 'Telefone'),
    linha('', cnpjPrestador, '123456', '(00) 0000-0000'),
    linha('Nome / Nome Empresarial', '', 'Município / Sigla UF', 'Código IBGE / CEP'),
    linha(prestador, '', 'Cuiabá / MT', '5103403 / 78.070-300'),
    linha('Endereço', '', 'E-mail'),
    linha('Avenida Fictícia,100', '', 'contato@exemplo.com'),
    linha('TOMADOR / ADQUIRENTE', 'CNPJ / CPF / NIF', 'Indicador Municipal (Inscrição)', 'Telefone'),
    linha('', tomadorCnpj, '-', '(00) 0000-0000'),
    linha('Nome / Nome Empresarial', '', 'Município / Sigla UF', 'Código IBGE / CEP'),
    linha('GRAOMIL LTDA', '', 'Cascavel / PR', '4104808 / 85.816-294'),
    linha('SERVIÇO PRESTADO', 'Código de Tributação Nacional / Municipal', 'Código da NBS'),
    linha('', '14.01.01', '1.2001.60.00'),
    'Descrição do Serviço',
    descricao,
    '',
    linha('VALOR TOTAL DA NFS-E', 'VALOR DA OPERAÇÃO / SERVIÇO', 'Desconto Incondicionado', 'Desconto Condicionado'),
    linha('', `R$${valor}`, '-', '-'),
    linha('Total das Retenções (ISSQN / Federais)', 'VALOR LÍQUIDO DA NFS-e', 'Total do IBS/CBS', 'VALOR LÍQUIDO DA NFS-e + IBS/CBS'),
    linha(retencao, `R$${valor}`, 'R$75,62', `R$${valor}`),
    'INFORMAÇÕES COMPLEMENTARES',
  ].join('\n');
}

// ---- NFS-e de empresa: número, emissão, prestador e valor pelas colunas ----
{
  const texto = danfse({
    numero: 886, emissao: '05/10/2026', prestador: 'EMPRESA FICTICIA EQUIPAMENTOS LTDA', cnpjPrestador: '12.345.678/0001-95',
    valor: '7.959,98', descricao: 'MANUTENÇÃO PREVENTIVA OS3687 R$ 1.184,98 VALOR TOTAL R$ 7.959,98 VENCIMENTO BOLETO 26/10/2026',
  });
  const r = A.extractFromText(texto, '.pdf');
  assert.equal(r.tipo_documento, 'NFS-e');
  assert.equal(r.numero_documento, '886', 'número da NFS-e, não pedaço da chave de acesso');
  assert.equal(r.data_emissao, '05/10/2026');
  assert.equal(r.data_conta, '05/10/2026');
  assert.equal(r.fornecedor, 'EMPRESA FICTICIA EQUIPAMENTOS LTDA');
  assert.equal(r.fornecedor_cnpj, '12345678000195');
  assert.equal(r.destinatario_cnpj, '29666679000134');
  assert.equal(r.valor_total, 7959.98);
  assert.equal(r.data_vencimento, '26/10/2026', 'vencimento escrito na descrição do serviço');
  assert.equal(r.chave_acesso.length, 50);

  // ponta a ponta nas regras: data_conta e rateio.data_participacao preenchidos
  const d = A.applyInvoiceRules(r, { arquivo_nome: 'NFs_886.pdf', setor: 'COMPRAS' });
  assert.equal(d.data_conta, '05/10/2026');
  assert.equal(d.rateio.data_participacao, '05/10/2026');
  assert.equal(d.numero_documento, '886');
  assert.match(d.identificacao, /^NF 886 - EMPRESA FICTICIA/);
  assert.ok(d.fingerprint, 'impressão digital da NF (antiduplicidade) calculada');
}

// ---- NFS-e de MEI: nome com CNPJ base na frente, sem vencimento no texto, valor pequeno ----
{
  const texto = danfse({
    numero: 9, emissao: '24/10/2026', prestador: '98.765.432 FULANO DE TAL SILVA', cnpjPrestador: '98.765.432/0001-10',
    valor: '221,00', descricao: 'MARCAÇÃO DE CALADORES',
  });
  const r = A.extractFromText(texto, '.pdf');
  assert.equal(r.numero_documento, '9');
  assert.equal(r.data_conta, '24/10/2026');
  assert.equal(r.fornecedor_cnpj, '98765432000110');
  assert.match(r.fornecedor, /FULANO DE TAL SILVA/);
  assert.equal(r.valor_total, 221);
  assert.equal(r.data_vencimento, null);
}

// ---- valor líquido (com retenção) é o que se paga ----
{
  const texto = danfse({
    numero: 5, emissao: '01/10/2026', prestador: 'FORNECEDOR X LTDA', cnpjPrestador: '11.222.333/0001-81',
    valor: '950,00', descricao: 'SERVIÇO', retencao: 'R$50,00',
  });
  assert.equal(A.extractFromText(texto, '.pdf').valor_total, 950);
}

// ---- DANFe comum e texto sem campos não são tratados como DANFSe ----
assert.equal(A.extractNfseFields('DANFE\nNF-e 123\nEMISSÃO: 01/10/2026'), null);
assert.equal(A.extractNfseFields('DANFSe v2.0\nDocumento Auxiliar da NFS-e\n(sem campos)'), null);

// ---- XML nacional ----
{
  const xml = `<NFSe><infNFSe Id="NFS${'1'.repeat(50)}"><nNFSe>77</nNFSe>
    <emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA FICTICIA LTDA</xNome></emit>
    <valores><vLiq>1500.50</vLiq></valores>
    <DPS><infDPS><dhEmi>2026-10-05T10:29:28-03:00</dhEmi>
      <toma><CNPJ>29666679000134</CNPJ><xNome>GRAOMIL LTDA</xNome></toma>
      <serv><cServ><xDescServ>Manutenção</xDescServ></cServ></serv></infDPS></DPS></infNFSe></NFSe>`;
  const r = A.extractNfseXml(xml);
  assert.equal(r.numero_documento, '77');
  assert.equal(r.data_conta, '05/10/2026');
  assert.equal(r.fornecedor_cnpj, '12345678000195');
  assert.equal(r.destinatario_cnpj, '29666679000134');
  assert.equal(r.valor_total, 1500.5);
  assert.equal(r.tipo_documento, 'NFS-e');
}

console.log('test-nf-nfse: ok');
