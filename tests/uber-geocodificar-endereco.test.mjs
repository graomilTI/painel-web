import assert from 'node:assert/strict';
import test from 'node:test';

import {
  candidatosBusca,
  cidadeCompativel,
  ehCodigoRodovia,
  interpretarEndereco,
  temLocalEspecifico,
  viaCompativel,
} from '../supabase/functions/uber-geocodificar-gps/endereco.ts';
import { geocodificarEndereco } from '../supabase/functions/uber-geocodificar-gps/geocodificar.ts';

const campos = (e) => {
  const { rua, numero, bairro, cidade, uf, cep } = interpretarEndereco(e);
  return { rua, numero, bairro, cidade, uf, cep };
};

test('formato "Rua, nº - Bairro - Cidade - UF, CEP"', () => {
  assert.deepEqual(campos('Rua Gana, 87 - Laranjeiras - Uberlândia - MG, 38410-266'), {
    rua: 'Rua Gana', numero: '87', bairro: 'Laranjeiras', cidade: 'Uberlândia', uf: 'MG', cep: '38410266',
  });
});

test('formato "R. Rua, nº - Bairro, Cidade - UF, CEP, Brasil" expande abreviações', () => {
  assert.deepEqual(campos('R. Cel. João Manoel, 497 - Centro, Bebedouro - SP, 14700-020, Brasil'), {
    rua: 'Rua Coronel João Manoel', numero: '497', bairro: 'Centro', cidade: 'Bebedouro', uf: 'SP', cep: '14700020',
  });
  assert.equal(interpretarEndereco('Av. Visc. de Nova Granada, 188 - Centro, Leme - SP, 13617-400, Brasil').rua,
    'Avenida Visconde de Nova Granada');
});

test('sem bairro: "Rua, nº, Cidade - UF, CEP"', () => {
  assert.deepEqual(campos('Rua do Pau Ferro, 1320, Luís Eduardo Magalhães - BA, 47850-000, Brasil'), {
    rua: 'Rua do Pau Ferro', numero: '1320', bairro: '', cidade: 'Luís Eduardo Magalhães', uf: 'BA', cep: '47850000',
  });
});

test('telefone colado no começo é descartado', () => {
  const e = campos('Zap(13)98180 - 3664R. Monteiro Lobato, 63 - Jardim Santo André, Hortolândia - SP, 13186-012, Brasil');
  assert.equal(e.rua, 'Rua Monteiro Lobato');
  assert.equal(e.numero, '63');
  assert.equal(e.cidade, 'Hortolândia');
});

test('praça com acento e vírgula depois da abreviação', () => {
  assert.equal(interpretarEndereco('Pç. Nagasaki - Vila Nova - Santos - SP, 11013').rua, 'Praça Nagasaki');
  assert.equal(interpretarEndereco('Pç, Da Bíblia, 200 - Martins - Uberlândia - MG, 38400-474').rua, 'Praça Da Bíblia');
});

test('nome de complexo antes da via não vira a rua; "2 Andar" e "km" não viram bairro', () => {
  const complexo = campos('complexo núcleo Industrial lll - R. Padre Luís Luíse, N° 440 - Núcleo de Produção III, Cascavel - PR, 85811-550, Brasil');
  assert.equal(complexo.rua, 'Rua Padre Luís Luíse');
  assert.equal(complexo.numero, '440');
  assert.equal(campos('Av. Maria Silva Garcia, 385, 2 Andar - Granja Marileusa - Uberlândia - MG, 38406-634').bairro, 'Granja Marileusa');
  assert.equal(campos('Rod. Francisco Alves Negrão, km 264 - Eng. Bacelar, Taquarivaí - SP, 18425-000, Brasil').bairro, 'Eng. Bacelar');
});

test('cruzamento fica com a primeira via; bairro igual à cidade é ignorado', () => {
  assert.equal(interpretarEndereco('Rodovia Deputado Roberto Rollemberg & SP-461, Brejo Alegre - SP, 16265-000, Brasil').rua,
    'Rodovia Deputado Roberto Rollemberg');
  assert.equal(campos('Rua Cezário Leite, 194 - Cândido Mota - Cândido Mota - SP, 19880-000').bairro, '');
});

test('"Prédio ..." não é confundido com prefixo de via (acento + \\b)', () => {
  assert.equal(interpretarEndereco('Prédio B KM 186 - Rod. Anhangüera - Serelepe, Leme - SP, Brasil').rua, 'Rodovia Anhangüera');
});

test('sem rua: usa o bairro; plus code e "Rural" são ignorados', () => {
  const e = campos('- Jardim Inconfidência - Uberlândia - MG, 38411-228');
  assert.equal(e.rua, '');
  assert.equal(e.bairro, 'Jardim Inconfidência');
  assert.equal(campos('VH6V+Q6 - Rural, Leme - SP, 13614-310, Brasil').bairro, '');
});

test('só cidade ou CEP geral não tem local específico', () => {
  assert.equal(temLocalEspecifico(interpretarEndereco('Uberlândia, MG, Brasil')), false);
  assert.equal(temLocalEspecifico(interpretarEndereco('Capivari do Sul, RS, 95552-000, Brasil')), false);
  assert.equal(temLocalEspecifico(interpretarEndereco('Unnamed Road, Içara - SC, 88820-000, Brasil')), false);
  assert.equal(temLocalEspecifico(interpretarEndereco('Rua Gana - Uberlândia - MG, 38410-266')), true);
});

test('consultas: da mais específica (número + bairro) à mais genérica; nunca "cidade" suja', () => {
  const q = candidatosBusca(interpretarEndereco('Rua Gana, 87 - Laranjeiras - Uberlândia - MG, 38410-266')).map((c) => c.query);
  assert.deepEqual(q, [
    'Rua Gana, 87, Laranjeiras, Uberlândia, MG, Brasil',
    'Rua Gana, 87, Uberlândia, MG, Brasil',
    'Rua Gana, Laranjeiras, Uberlândia, MG, Brasil',
    'Rua Gana, Uberlândia, MG, Brasil',
  ]);
});

test('compatibilidade de cidade ignora acento/caixa e não rejeita por falta de dado', () => {
  assert.equal(cidadeCompativel('Uberlândia', 'uberlandia'), true);
  assert.equal(cidadeCompativel('Uberlândia', 'Araguari'), false);
  assert.equal(cidadeCompativel('Uberlândia', undefined, ''), true);
});

// ---- cadeia de provedores com fetch simulado ----
const semEspera = async () => {};
const resposta = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo });

test('Nominatim: rejeita centro de cidade (place_rank baixo) e resultado de outro estado', async () => {
  const chamadas = [];
  const fetchFn = async (url) => {
    chamadas.push(String(url));
    if (String(url).includes('nominatim')) {
      return resposta([
        { lat: '-1', lon: '-1', place_rank: 16, address: { 'ISO3166-2-lvl4': 'BR-MG', city: 'Uberlândia' } },
        { lat: '-2', lon: '-2', place_rank: 26, address: { 'ISO3166-2-lvl4': 'BR-GO', city: 'Uberlândia' } },
        { lat: '-18.9', lon: '-48.2', place_rank: 26, display_name: 'Rua Gana', address: { 'ISO3166-2-lvl4': 'BR-MG', city: 'Uberlândia' } },
      ]);
    }
    throw new Error('provedor inesperado');
  };
  const r = await geocodificarEndereco('Rua Gana, 87 - Laranjeiras - Uberlândia - MG, 38410-266', { aguardar: semEspera, fetchFn });
  assert.equal(r.result?.lat, -18.9);
  assert.equal(r.result?.provider, 'nominatim');
  assert.equal(r.result?.precisao, 'endereco');
  assert.equal(chamadas.length, 1);
});

test('cai para o Photon quando o Nominatim não acha', async () => {
  const fetchFn = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) return resposta([]);
    return resposta({ features: [{
      geometry: { coordinates: [-48.48, -20.91] },
      properties: { type: 'house', street: 'Rua José de Paula Ferreira', city: 'Bebedouro', countrycode: 'BR' },
    }] });
  };
  const r = await geocodificarEndereco('Rua José de Paula Ferreira, 1050 - Residencial Doutor Pedro Paschoal - Bebedouro - SP, 14709-188', { aguardar: semEspera, fetchFn });
  assert.equal(r.result?.provider, 'photon');
  assert.equal(r.result?.lat, -20.91);
});

test('Photon: recusa rua de nome parecido ou de outro tipo (Rua x Avenida)', async () => {
  const fetchFn = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) return resposta([]);
    return resposta({ features: [
      { geometry: { coordinates: [-48.2, -18.9] }, properties: { type: 'house', street: 'Rua Aniceto Maccheroni', city: 'Uberlândia', countrycode: 'BR' } },
      { geometry: { coordinates: [-48.3, -18.8] }, properties: { type: 'street', name: 'Rua Fabio Cardoso', city: 'Uberlândia', countrycode: 'BR' } },
    ] });
  };
  const a = await geocodificarEndereco('Av. Aniceto Maccheroni, 86 - Jardim Ipanema - Uberlândia - MG, 38406-382', { aguardar: semEspera, fetchFn });
  assert.equal(a.result, null);
  const b = await geocodificarEndereco('Rua Taxista Fábio Cardoso, 525 - São Jorge - Uberlândia - MG, 38410-212', { aguardar: semEspera, fetchFn });
  assert.equal(b.result, null);
  assert.equal(b.definitive, true);
});

test('Nominatim: recusa quando a rua devolvida é outra ("Rua Três" -> Rua Aquiles...)', async () => {
  const fetchFn = async (url) => {
    const u = String(url);
    if (u.includes('nominatim')) {
      return resposta([{ lat: '-18.5', lon: '-46.5', place_rank: 30, address: { road: 'Rua Aquiles Magela da Costa Silva', city: 'Patos de Minas', 'ISO3166-2-lvl4': 'BR-MG' } }]);
    }
    return resposta({ features: [] });
  };
  const r = await geocodificarEndereco('Rua Três, 117 - Distrito Industrial I - Patos de Minas - MG, 38706-301', { aguardar: semEspera, fetchFn });
  assert.equal(r.result, null);
});

test('viaCompativel: tolera grafia e título, exige tipo e nome completos', () => {
  assert.equal(viaCompativel('Avenida Telmo Sessim', 'Avenida Telmo Sessin'), true);
  assert.equal(viaCompativel('Rua Manoel Novaes', 'Rua Manoel Novais'), true);
  assert.equal(viaCompativel('Avenida Prefeito Hércules Pereira Hortal', 'Avenida Hércules Pereira Hortal'), true);
  assert.equal(viaCompativel('Avenida Hermínia Casteletti Bellodi', 'Avenida Herminia C Bellodi'), true);
  assert.equal(viaCompativel('Rua Taxista Fábio Cardoso', 'Rua Fabio Cardoso'), false);
  assert.equal(viaCompativel('Avenida Aniceto Maccheroni', 'Rua Aniceto Maccheroni'), false);
  assert.equal(viaCompativel('Rodovia Anhangüera', 'Rodovia Anhanguera (SP-330)'), true);
  assert.equal(viaCompativel('Estrada Nadir Kenan', 'Rodovia Nadir Kenan'), true); // estrada = rodovia
  assert.equal(viaCompativel('Rua Padre Luís Luíse', 'Rua Padre Luiz Luise'), true);
  assert.equal(viaCompativel('Rua Domiciano Theobaldo Bresolin', 'Rua Domiciliano Theobaldo Bresolin'), true);
  assert.equal(ehCodigoRodovia('ICR-472'), true);
  assert.equal(ehCodigoRodovia('Rua 15 de Novembro'), false);
  assert.equal(viaCompativel('Rua Santa Rita', 'Rua Santa Rosa'), false);
  assert.equal(viaCompativel('Rua Gana', ''), true); // provedor sem nome: não rejeita
});

test('Nominatim bloqueado (403): usa o Photon, lembra do bloqueio e não cacheia "não achei"', async () => {
  const estado = { nominatimBloqueadoAte: 0 };
  const chamadas = [];
  const fetchFn = async (url) => {
    const u = String(url);
    chamadas.push(u.includes('nominatim') ? 'nominatim' : 'photon');
    if (u.includes('nominatim')) return resposta({}, 403);
    if (u.includes('Gana')) {
      return resposta({ features: [{
        geometry: { coordinates: [-48.24, -18.95] },
        properties: { type: 'house', street: 'Rua Gana', city: 'Uberlândia', countrycode: 'BR' },
      }] });
    }
    return resposta({ features: [] });
  };
  const opcoes = { aguardar: semEspera, fetchFn, estado };

  const achou = await geocodificarEndereco('Rua Gana, 87 - Laranjeiras - Uberlândia - MG, 38410-266', opcoes);
  assert.equal(achou.result?.provider, 'photon');
  assert.ok(estado.nominatimBloqueadoAte > Date.now(), 'bloqueio lembrado');
  assert.equal(chamadas.filter((c) => c === 'nominatim').length, 1, 'só uma tentativa antes de desistir');

  chamadas.length = 0;
  const naoAchou = await geocodificarEndereco('Rua Inexistente, 10 - Centro - Uberlândia - MG', opcoes);
  assert.equal(naoAchou.result, null);
  assert.equal(chamadas.filter((c) => c === 'nominatim').length, 0, 'Nominatim pulado enquanto bloqueado');
  assert.equal(naoAchou.motivo, 'busca_parcial');
  assert.equal(naoAchou.definitive, false, 'sem o Nominatim, "não achei" não vira cache de endereço inexistente');
});

test('Nominatim com falha passageira (HTTP 500) não é tratado como bloqueio', async () => {
  const estado = { nominatimBloqueadoAte: 0 };
  const fetchFn = async (url) => (String(url).includes('nominatim') ? resposta({}, 500) : resposta({ features: [] }));
  const r = await geocodificarEndereco('Rua Gana, 87 - Laranjeiras - Uberlândia - MG, 38410-266', { aguardar: semEspera, fetchFn, estado });
  assert.equal(r.result, null);
  assert.equal(r.definitive, false);
  assert.equal(r.motivo, undefined);
  assert.match(r.error, /500/);
  assert.equal(estado.nominatimBloqueadoAte, 0);
});

test('endereço só com cidade não chama provedor algum', async () => {
  let chamou = false;
  const fetchFn = async () => { chamou = true; return resposta([]); };
  const r = await geocodificarEndereco('Uberlândia, MG, Brasil', { aguardar: semEspera, fetchFn });
  assert.equal(r.motivo, 'endereco_incompleto');
  assert.equal(chamou, false);
});
