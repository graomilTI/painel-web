// Financeiro — QR Code / payload PIX (copia e cola) do pagamento.
// Extraído de setor-pagamentos.js em 30/10/2026; o código das funções foi movido sem alteração (só saiu de dentro da fábrica).
// Ao editar, troque o token v=20261030-fin20 em TODOS os imports internos (ver tests/financeiro-modulos-versao.test.mjs).

export function crc16Pix(str) {
  let crc = 0xFFFF;
  for (const ch of str) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc;
}

export function gerarPayloadPix(chave, { valor, nome, cidade } = {}) {
  const tlv = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
  const gui = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', chave);
  const valorStr = valor ? String(parseFloat(valor).toFixed(2)) : '';
  const nomeLimpo = (nome || 'Pagamento PIX').replace(/[^A-Za-z0-9 ]/g, ' ').trim().substring(0, 25);
  const cidadeLimpa = (cidade || 'BRASIL').replace(/[^A-Za-z0-9 ]/g, ' ').trim().substring(0, 15);
  const payload = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('26', gui),
    tlv('52', '0000'),
    tlv('53', '986'),
    valorStr ? tlv('54', valorStr) : '',
    tlv('58', 'BR'),
    tlv('59', nomeLimpo),
    tlv('60', cidadeLimpa),
    tlv('62', tlv('05', '***')),
    '6304',
  ].join('');
  return payload + crc16Pix(payload).toString(16).toUpperCase().padStart(4, '0');
}
