import assert from 'node:assert/strict';
import test from 'node:test';

import {
  criarGeocodificador,
  embaralhar,
  limparLocal,
  nomeCompativel,
  photonEhACidade,
  photonEhOLocal,
} from '../supabase/functions/_shared/geocode-localidade.ts';

// ---- doubles -------------------------------------------------------------------------------

const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

const nominatimItem = (lat, lon, nome = 'Local, Brasil') => [{ lat: String(lat), lon: String(lon), display_name: nome }];

const ftPhoton = (props, lon = -50, lat = -15) => ({ properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
const photonCidade = (name, state, lon = -51, lat = -17) =>
  ftPhoton({ name, state, country: 'Brasil', countrycode: 'BR', type: 'city', osm_value: 'municipality' }, lon, lat);
const photonFazenda = (name, city, state, lon = -50.5, lat = -15.5) =>
  ftPhoton({ name, city, state, country: 'Brasil', countrycode: 'BR', type: 'locality', osm_value: 'farm' }, lon, lat);

/** fetch falso: `nominatim` e `photon` são funções (url URL) => resposta | Error. */
function ambiente({ nominatim, photon }) {
  const chamadas = { nominatim: [], photon: [] };
  const fetchFn = async (url) => {
    const u = new URL(url);
    const quem = u.hostname.includes('nominatim') ? 'nominatim' : 'photon';
    chamadas[quem].push(u);
    const r = (quem === 'nominatim' ? nominatim : photon)(u, chamadas[quem].length);
    if (r instanceof Error) throw r;
    return r;
  };
  const geo = criarGeocodificador({
    userAgent: 'teste',
    fetchFn,
    delayMs: 0,
    dormir: async () => {},
    estado: { nominatimIndisponivelAte: 0, bloqueado: false, motivo: '' },
  });
  return { geo, chamadas };
}

const nominatimNegado = () => resposta(403, 'Access denied');

// ---- helpers puros -------------------------------------------------------------------------

test('nomeCompativel tolera acento, caixa e pontuação, mas não troca de município por 1 letra', () => {
  assert.equal(nomeCompativel('LUÍS EDUARDO MAGALHÃES', 'Luís Eduardo Magalhães'), true);
  assert.equal(nomeCompativel('ENTRE-IJUÍS', 'Entre Ijuís'), true);
  assert.equal(nomeCompativel('Guaraniaçu', 'Guaraniacu'), true);
  assert.equal(nomeCompativel('Formosa', 'Formoso'), false); // municípios diferentes (ambos em GO)
  assert.equal(nomeCompativel('Cristalina', 'Cristalino'), false);
  assert.equal(nomeCompativel('Santa Helena de Goiás', 'Santa Helena'), false);
  assert.equal(nomeCompativel('', 'Jataí'), false);
});

test('limparLocal tira a cidade repetida no fim do nome do local', () => {
  assert.equal(limparLocal('FAZENDA SANTA IZABEL - LUÍS EDUARDO MAGALHÃES', 'LUÍS EDUARDO MAGALHÃES'), 'FAZENDA SANTA IZABEL');
  assert.equal(limparLocal('FAZENDA SUBLIME - COOP DOS PRODUTORES RURAIS - AGUA BOA', 'ÁGUA BOA'), 'FAZENDA SUBLIME - COOP DOS PRODUTORES RURAIS');
  assert.equal(limparLocal('FAZENDA PEROLA', 'BARREIRAS'), 'FAZENDA PEROLA');
});

test('photonEhACidade exige município, nome e estado iguais', () => {
  assert.equal(photonEhACidade(photonCidade('Jataí', 'Goiás'), 'JATAÍ', 'GO'), true);
  assert.equal(photonEhACidade(photonCidade('Jataí', 'Minas Gerais'), 'JATAÍ', 'GO'), false); // outro estado
  assert.equal(photonEhACidade(photonCidade('Cruz Alta', 'Rio Grande do Sul'), 'Cruz', 'RS'), false);
  assert.equal(photonEhACidade(ftPhoton({ name: 'Jataí', state: 'Goiás', countrycode: 'BR', type: 'district' }), 'Jataí', 'GO'), false); // distrito, não município
  assert.equal(photonEhACidade(ftPhoton({ name: 'Jataí', state: 'Goiás', countrycode: 'PT', type: 'city' }), 'Jataí', 'GO'), false);
  assert.equal(photonEhACidade(photonCidade('Jataí', 'Goiás'), 'JATAÍ', 'XX'), false); // UF desconhecida
});

test('photonEhOLocal só aceita o mesmo nome, na mesma cidade e estado', () => {
  const certo = photonFazenda('Fazenda Sete Campos', 'Formosa do Rio Preto', 'Bahia');
  assert.equal(photonEhOLocal(certo, 'FAZENDA SETE CAMPOS - FORMOSA DO RIO PRETO', 'FORMOSA DO RIO PRETO', 'BA'), true);
  // palavra do nome faltando
  assert.equal(photonEhOLocal(photonFazenda('Fazenda Rio Preto', 'Formosa do Rio Preto', 'Bahia'), 'FAZENDA SETE CAMPOS', 'FORMOSA DO RIO PRETO', 'BA'), false);
  // mesmo nome em outra cidade ou estado
  assert.equal(photonEhOLocal(photonFazenda('Fazenda Sete Campos', 'Barreiras', 'Bahia'), 'FAZENDA SETE CAMPOS', 'FORMOSA DO RIO PRETO', 'BA'), false);
  assert.equal(photonEhOLocal(photonFazenda('Fazenda Sete Campos', 'Formosa do Rio Preto', 'Goiás'), 'FAZENDA SETE CAMPOS', 'FORMOSA DO RIO PRETO', 'BA'), false);
  // sem cidade no resultado: recusa (não dá pra conferir)
  assert.equal(photonEhOLocal(ftPhoton({ name: 'Fazenda Sete Campos', state: 'Bahia', countrycode: 'BR' }), 'FAZENDA SETE CAMPOS', 'FORMOSA DO RIO PRETO', 'BA'), false);
});

test('embaralhar mantém os mesmos itens, não altera a lista original e usa o sorteio dado', () => {
  const original = [1, 2, 3, 4, 5, 6];
  const r = embaralhar(original);
  assert.deepEqual([...r].sort(), original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(embaralhar(original, () => 0), [2, 3, 4, 5, 6, 1]); // sorteio fixo = ordem previsível
  assert.deepEqual(embaralhar([], () => 0), []);
});

// ---- cidade --------------------------------------------------------------------------------

test('cidade: Nominatim responde -> ponto do Nominatim, sem tocar o Photon', async () => {
  const { geo, chamadas } = ambiente({
    nominatim: () => resposta(200, nominatimItem(-17.8, -51.9, 'Jataí, Goiás, Região Centro-Oeste, Brasil')),
    photon: () => assert.fail('não deveria chamar o Photon'),
  });
  const r = await geo.cidade({ cidade: 'JATAÍ', uf: 'GO' });
  assert.equal(r.ponto.provider, 'nominatim');
  assert.deepEqual([r.ponto.lat, r.ponto.lng], [-17.8, -51.9]);
  assert.equal(chamadas.nominatim[0].searchParams.get('city'), 'JATAÍ');
  assert.equal(chamadas.nominatim[0].searchParams.get('state'), 'GO');
  assert.equal(chamadas.nominatim[0].searchParams.get('countrycodes'), 'br');
});

test('cidade: Nominatim sem resultado (200 []) é definitivo, não chama o Photon', async () => {
  const { geo, chamadas } = ambiente({ nominatim: () => resposta(200, []), photon: () => assert.fail('sem Photon') });
  const r = await geo.cidade({ cidade: 'Lugar Nenhum', uf: 'GO' });
  assert.equal(r.ponto, null);
  assert.equal(r.conclusivo, true);
  assert.equal(chamadas.photon.length, 0);
});

test('cidade: HTTP 403 do Nominatim vira Photon e o bloqueio é lembrado entre localidades', async () => {
  const { geo, chamadas } = ambiente({
    nominatim: nominatimNegado,
    photon: (u) => resposta(200, { features: [photonCidade(u.searchParams.get('q').startsWith('Jataí') ? 'Jataí' : 'Rio Verde', 'Goiás', -51, -17.9)] }),
  });
  const a = await geo.cidade({ cidade: 'Jataí', uf: 'GO' });
  const b = await geo.cidade({ cidade: 'Rio Verde', uf: 'GO' });
  assert.equal(a.ponto.provider, 'photon');
  assert.equal(a.ponto.display, 'Jataí, Goiás, Brasil');
  assert.equal(b.ponto.provider, 'photon');
  assert.equal(chamadas.nominatim.length, 1, 'só a primeira localidade testa o Nominatim');
  assert.equal(chamadas.photon[0].searchParams.get('q'), 'Jataí, Goiás, Brasil');
});

test('cidade: 403 + Photon sem a cidade NÃO é conclusivo (nada de cache de erro)', async () => {
  const { geo } = ambiente({ nominatim: nominatimNegado, photon: () => resposta(200, { features: [] }) });
  const r = await geo.cidade({ cidade: 'Jataí', uf: 'GO' });
  assert.equal(r.ponto, null);
  assert.equal(r.conclusivo, false);
  assert.match(r.motivo, /403/);
});

test('cidade: 403 + Photon fora do ar também é transitório e devolve o motivo', async () => {
  const { geo } = ambiente({ nominatim: nominatimNegado, photon: () => resposta(503, {}) });
  const r = await geo.cidade({ cidade: 'Jataí', uf: 'GO' });
  assert.equal(r.conclusivo, false);
  assert.match(r.motivo, /Photon HTTP 503/);
});

test('cidade: 5xx e timeout do Nominatim são transitórios e não trocam de provedor', async () => {
  for (const falha of [() => resposta(502, 'bad gateway'), () => new Error('timeout')]) {
    const { geo, chamadas } = ambiente({ nominatim: falha, photon: () => assert.fail('sem Photon') });
    const r = await geo.cidade({ cidade: 'Jataí', uf: 'GO' });
    assert.equal(r.ponto, null);
    assert.equal(r.conclusivo, false);
    assert.ok(r.motivo);
    assert.equal(chamadas.photon.length, 0);
  }
});

test('cidade: HTTP 429 também conta como bloqueio', async () => {
  const { geo } = ambiente({
    nominatim: () => resposta(429, 'slow down'),
    photon: () => resposta(200, { features: [photonCidade('Jataí', 'Goiás')] }),
  });
  const r = await geo.cidade({ cidade: 'Jataí', uf: 'GO' });
  assert.equal(r.ponto.provider, 'photon');
});

test('cidade: a mesma cidade só é consultada uma vez por execução', async () => {
  const { geo, chamadas } = ambiente({ nominatim: () => resposta(200, nominatimItem(-12, -45)), photon: () => assert.fail('sem Photon') });
  await Promise.all([geo.cidade({ cidade: 'Barreiras', uf: 'BA' }), geo.cidade({ cidade: 'BARREIRAS', uf: 'ba' })]);
  await geo.cidade({ cidade: 'Barreiras', uf: 'BA' });
  assert.equal(chamadas.nominatim.length, 1);
});

// ---- embarque ("UF - Cidade (Local)") ------------------------------------------------------

test('embarque: Nominatim acha o local -> nivel local', async () => {
  const { geo, chamadas } = ambiente({ nominatim: () => resposta(200, nominatimItem(-13, -43, 'Fazenda Marina, Correntina, Bahia, Brasil')), photon: () => assert.fail('sem Photon') });
  const r = await geo.embarque({ uf: 'BA', cidade: 'CORRENTINA', local: 'FAZENDA MARINA' });
  assert.equal(r.nivel, 'local');
  assert.equal(chamadas.nominatim.length, 1);
  assert.equal(chamadas.nominatim[0].searchParams.get('q'), 'FAZENDA MARINA, CORRENTINA, BA, Brasil');
});

test('embarque: local sem resultado no Nominatim cai pro ponto da cidade (comportamento de sempre)', async () => {
  const { geo, chamadas } = ambiente({
    nominatim: (u) => resposta(200, u.searchParams.has('q') ? [] : nominatimItem(-12.2, -46.0, 'Luís Eduardo Magalhães, Bahia, Brasil')),
    photon: () => assert.fail('sem Photon'),
  });
  const r = await geo.embarque({ uf: 'BA', cidade: 'LUÍS EDUARDO MAGALHÃES', local: 'FAZENDA SEMENTES OILEMA' });
  assert.equal(r.nivel, 'cidade');
  assert.equal(r.ponto.provider, 'nominatim');
  assert.equal(chamadas.nominatim.length, 2);
});

test('embarque sem local vai direto pra cidade', async () => {
  const { geo, chamadas } = ambiente({ nominatim: () => resposta(200, nominatimItem(-11, -46)), photon: () => assert.fail('sem Photon') });
  const r = await geo.embarque({ uf: 'GO', cidade: 'JATAÍ', local: '' });
  assert.equal(r.nivel, 'cidade');
  assert.equal(chamadas.nominatim.length, 1);
});

test('embarque com Nominatim bloqueado: Photon acha o local certo', async () => {
  const { geo, chamadas } = ambiente({
    nominatim: nominatimNegado,
    photon: () => resposta(200, {
      features: [
        photonFazenda('Fazenda Rio Preto', 'Formosa do Rio Preto', 'Bahia', -46.2, -11.4),
        photonFazenda('Fazenda Sete Campos', 'Formosa do Rio Preto', 'Bahia', -46.0, -11.5),
      ],
    }),
  });
  const r = await geo.embarque({ uf: 'BA', cidade: 'FORMOSA DO RIO PRETO', local: 'FAZENDA SETE CAMPOS - FORMOSA DO RIO PRETO' });
  assert.equal(r.nivel, 'local');
  assert.equal(r.ponto.provider, 'photon');
  assert.deepEqual([r.ponto.lat, r.ponto.lng], [-11.5, -46.0]);
  assert.equal(chamadas.photon[0].searchParams.get('q'), 'FAZENDA SETE CAMPOS, FORMOSA DO RIO PRETO, Bahia, Brasil');
});

test('embarque com Nominatim bloqueado: local que o Photon não confirma cai pro ponto da cidade', async () => {
  const { geo, chamadas } = ambiente({
    nominatim: nominatimNegado,
    photon: (u) => resposta(200, {
      features: u.searchParams.get('q').startsWith('FAZENDA')
        ? [photonFazenda('Fazenda Santa Cruz', 'Luís Eduardo Magalhães', 'Bahia')] // outra fazenda
        : [photonCidade('Luís Eduardo Magalhães', 'Bahia', -45.8, -12.1)],
    }),
  });
  const r = await geo.embarque({ uf: 'BA', cidade: 'LUÍS EDUARDO MAGALHÃES', local: 'FAZENDA SANTA IZABEL - LUÍS EDUARDO MAGALHÃES' });
  assert.equal(r.nivel, 'cidade');
  assert.equal(r.ponto.provider, 'photon');
  assert.equal(chamadas.photon.length, 2);
  assert.equal(chamadas.nominatim.length, 1);
});

test('embarque com tudo fora do ar não é conclusivo', async () => {
  const { geo } = ambiente({ nominatim: nominatimNegado, photon: () => new Error('timeout') });
  const r = await geo.embarque({ uf: 'GO', cidade: 'JATAÍ', local: 'ARMAZEM KATZER - JATAI' });
  assert.equal(r.ponto, null);
  assert.equal(r.conclusivo, false);
  assert.equal(r.nivel, null);
  assert.ok(r.motivo);
});

// ---- CEP -----------------------------------------------------------------------------------

test('cep: Nominatim acha o CEP -> tipo cep', async () => {
  const { geo, chamadas } = ambiente({ nominatim: () => resposta(200, nominatimItem(-25, -50, '84430-000, Imbituva')), photon: () => assert.fail('sem Photon') });
  const r = await geo.cep({ cep: '84430000', cidade: 'Imbituva', uf: 'PR' });
  assert.equal(r.tipo, 'cep');
  assert.equal(chamadas.nominatim[0].searchParams.get('postalcode'), '84430-000');
  assert.equal(chamadas.nominatim[0].searchParams.get('country'), 'Brazil');
});

test('cep: CEP inexistente no Nominatim cai pra cidade (tipo cidade)', async () => {
  const { geo } = ambiente({
    nominatim: (u) => resposta(200, u.searchParams.has('postalcode') ? [] : nominatimItem(-16.9, -50.4, 'Paraúna, Goiás, Brasil')),
    photon: () => assert.fail('sem Photon'),
  });
  const r = await geo.cep({ cep: '75982100', cidade: 'Paraúna', uf: 'GO' });
  assert.equal(r.tipo, 'cidade');
  assert.equal(r.ponto.provider, 'nominatim');
});

test('cep: CEP e cidade inexistentes é conclusivo (aí sim vale gravar erro)', async () => {
  const { geo } = ambiente({ nominatim: () => resposta(200, []), photon: () => assert.fail('sem Photon') });
  const r = await geo.cep({ cep: '00000000', cidade: 'Nenhuma', uf: 'GO' });
  assert.equal(r.ponto, null);
  assert.equal(r.conclusivo, true);
});

test('cep sem cidade/UF e inexistente é conclusivo; com falha do provedor não é', async () => {
  const a = ambiente({ nominatim: () => resposta(200, []), photon: () => assert.fail('sem Photon') });
  assert.equal((await a.geo.cep({ cep: '00000000' })).conclusivo, true);
  const b = ambiente({ nominatim: nominatimNegado, photon: () => assert.fail('sem Photon') });
  const r = await b.geo.cep({ cep: '75909225' });
  assert.equal(r.ponto, null);
  assert.equal(r.conclusivo, false);
});

test('cep com Nominatim bloqueado: usa o ponto da cidade via Photon (tipo cidade)', async () => {
  const { geo, chamadas } = ambiente({
    nominatim: nominatimNegado,
    photon: () => resposta(200, { features: [photonCidade('Mineiros', 'Goiás', -52.5, -17.5)] }),
  });
  const r = await geo.cep({ cep: '75830000', cidade: 'Mineiros', uf: 'GO' });
  assert.equal(r.tipo, 'cidade');
  assert.equal(r.ponto.provider, 'photon');
  assert.equal(chamadas.nominatim.length, 1);
});

test('cep com falha passageira (5xx/timeout) não rebaixa pra cidade: tenta de novo depois', async () => {
  for (const falha of [() => resposta(500, 'erro'), () => new Error('timeout')]) {
    const { geo, chamadas } = ambiente({ nominatim: falha, photon: () => assert.fail('sem Photon') });
    const r = await geo.cep({ cep: '75830000', cidade: 'Mineiros', uf: 'GO' });
    assert.equal(r.tipo, 'cep');
    assert.equal(r.ponto, null);
    assert.equal(r.conclusivo, false);
    assert.equal(chamadas.photon.length, 0);
  }
});

// ---- prazo da execução ---------------------------------------------------------------------

test('prazoAte: sem tempo restante não faz requisição e devolve falha transitória', async () => {
  let relogio = 1_000_000;
  const chamadas = [];
  const geo = criarGeocodificador({
    userAgent: 'teste',
    fetchFn: async (url, init) => {
      chamadas.push({ url, aborta: init.signal });
      return resposta(200, nominatimItem(-12, -45));
    },
    delayMs: 0,
    dormir: async () => {},
    agora: () => relogio,
    prazoAte: relogio + 10_000,
    estado: { nominatimIndisponivelAte: 0, bloqueado: false, motivo: '' },
  });
  assert.ok((await geo.cidade({ cidade: 'Barreiras', uf: 'BA' })).ponto); // dentro do prazo
  relogio += 9_000; // sobra 1 s: abaixo do mínimo de 2 s
  const r = await geo.cidade({ cidade: 'Correntina', uf: 'BA' });
  assert.equal(r.ponto, null);
  assert.equal(r.conclusivo, false);
  assert.match(r.motivo, /prazo/);
  assert.equal(chamadas.length, 1);
});
