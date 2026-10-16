// Programação: veículos que estão parados na oficina (manutenção com OS em execução e "veículo parado").
// Fonte: RPC frotas_veiculos_parados() (derivada do fluxo de Manutenção; frotas_veiculos.status não muda).
// A regra de data espelha frotas_veiculo_indisponivel no banco: parado da entrada na oficina até a previsão de
// entrega (ou até hoje, se não há previsão ou ela já passou). O banco recusa a placa mesmo que a tela deixe passar.
const TTL_MS = 60 * 1000;
let cache = { em: 0, mapa: new Map() };

export const placaNorm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

const diaBrasilia = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '');

export function hojeBrasilia() {
  return diaBrasilia(new Date());
}

export function montarMapa(linhas) {
  const mapa = new Map();
  for (const l of linhas || []) {
    const placa = placaNorm(l.placa);
    if (placa) mapa.set(placa, { numero: l.numero, inicio: diaBrasilia(l.desde), previsao: l.previsao_entrega || '' });
  }
  return mapa;
}

// Devolve a manutenção que prende o veículo naquela data, ou null.
export function indisponivelEm(mapa, placa, dataIso, hojeIso = hojeBrasilia()) {
  const info = mapa?.get(placaNorm(placa));
  if (!info || !dataIso) return null;
  if (info.inicio && dataIso < info.inicio) return null;
  const limite = info.previsao && info.previsao > hojeIso ? info.previsao : hojeIso;
  return dataIso <= limite ? info : null;
}

export async function carregarVeiculosParados({ forcar = false } = {}) {
  if (!forcar && Date.now() - cache.em < TTL_MS) return cache.mapa;
  try {
    // Import tardio: o módulo fica puro (testável sem cliente Supabase) e só abre a conexão quando precisa.
    const { supabase } = await import('./supabaseClient.js');
    const { data, error } = await supabase.rpc('frotas_veiculos_parados');
    if (error) throw error;
    cache = { em: Date.now(), mapa: montarMapa(data) };
  } catch (error) {
    // Sem a lista a tela segue como antes; o banco continua barrando a placa indisponível.
    console.warn('[programacao] veículos parados indisponíveis', error?.message || error);
    cache = { em: Date.now() - TTL_MS + 10 * 1000, mapa: cache.mapa };
  }
  return cache.mapa;
}
