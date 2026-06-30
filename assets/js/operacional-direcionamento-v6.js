import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;
  const CACHE_PREFIX = 'alojamento:';
  const BR_LAT_MIN = -34.2;
  const BR_LAT_MAX = 6.0;
  const BR_LNG_MIN = -74.5;
  const BR_LNG_MAX = -28.0;

  let observer = null;
  let alojamentosResolvidos = [];

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

  function inBrazil(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    return Number.isFinite(la) && Number.isFinite(lo)
      && la >= BR_LAT_MIN && la <= BR_LAT_MAX
      && lo >= BR_LNG_MIN && lo <= BR_LNG_MAX;
  }

  function km(aLat, aLng, bLat, bLng) {
    if (!inBrazil(aLat, aLng) || !inBrazil(bLat, bLng)) return null;
    const la1 = Number(aLat), lo1 = Number(aLng), la2 = Number(bLat), lo2 = Number(bLng);
    const R = 6371;
    const dlat = (la2 - la1) * Math.PI / 180;
    const dlon = (lo2 - lo1) * Math.PI / 180;
    const x = Math.sin(dlat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dlon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function first(row, fields) {
    return fields.map(f => row?.[f]).find(v => v !== undefined && v !== null && String(v).trim() !== '') ?? '';
  }

  function montarEndereco(row) {
    const rua = first(row, ['endereco', 'logradouro', 'rua', 'endereco_rua', 'endereco_completo']);
    const numero = first(row, ['numero', 'nro', 'num']);
    const bairro = first(row, ['bairro']);
    const cep = first(row, ['cep']);
    const cidade = first(row, ['cidade', 'municipio']);
    const uf = first(row, ['uf', 'estado']);
    return [rua, numero, bairro, cep, cidade, uf, 'Brasil']
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function normAlojamento(row, origem) {
    return {
      id: row.id,
      nome: first(row, ['nome', 'nome_alojamento', 'descricao', 'titulo']) || 'Alojamento',
      tipo: 'Alojamento',
      origem,
      cidade: first(row, ['cidade', 'municipio']),
      uf: String(first(row, ['uf', 'estado'])).toUpperCase(),
      endereco: montarEndereco(row),
      latitude: num(first(row, ['latitude', 'lat'])),
      longitude: num(first(row, ['longitude', 'lng', 'lon'])),
      ativo: row.ativo !== false,
      raw: row,
    };
  }

  async function safeSelect(table) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1000);
      if (error) throw error;
      return (data || []).map(r => normAlojamento(r, table));
    } catch (err) {
      console.warn(`[opv6] ${table}:`, err?.message || err);
      return [];
    }
  }

  async function cacheGet(chave) {
    try {
      const { data, error } = await supabase
        .from('geocode_cache')
        .select('chave,latitude,longitude,status')
        .eq('chave', chave)
        .maybeSingle();

      if (error) throw error;
      if (data?.status === 'ok' && inBrazil(data.latitude, data.longitude)) {
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      }
    } catch (err) {
      console.warn('[opv6] leitura geocode_cache:', err?.message || err);
    }
    return null;
  }

  async function cacheSet(chave, geo, status = 'ok') {
    try {
      await supabase.from('geocode_cache').upsert({
        chave,
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'chave' });
    } catch (err) {
      console.warn('[opv6] gravação geocode_cache:', err?.message || err);
    }
  }

  async function geocodeEndereco(endereco) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    const item = Array.isArray(arr) ? arr[0] : null;
    const lat = Number(item?.lat);
    const lng = Number(item?.lon);
    return inBrazil(lat, lng) ? { lat, lng } : null;
  }

  async function resolverAlojamento(a) {
    if (!a.ativo) return null;

    if (inBrazil(a.latitude, a.longitude)) {
      return { ...a, latitude: Number(a.latitude), longitude: Number(a.longitude), geocodificado: false };
    }

    if (!a.endereco || a.endereco.length < 8) return null;

    const chave = CACHE_PREFIX + norm(a.endereco);
    const cached = await cacheGet(chave);
    if (cached) {
      return { ...a, latitude: cached.lat, longitude: cached.lng, geocodificado: true };
    }

    try {
      const geo = await geocodeEndereco(a.endereco);
      if (geo) {
        await cacheSet(chave, geo, 'ok');
        return { ...a, latitude: geo.lat, longitude: geo.lng, geocodificado: true };
      }

      await cacheSet(chave, null, 'erro');
    } catch (err) {
      console.warn('[opv6] geocodificação alojamento:', err?.message || err);
    }

    return null;
  }

  async function carregarAlojamentos() {
    const fontes = await Promise.all([
      safeSelect('hospedagem_alojamentos'),
      safeSelect('operacional_alojamentos'),
      safeSelect('alojamentos'),
    ]);

    const candidatos = fontes.flat().filter(a => a.ativo !== false);
    const resolvidos = [];

    for (const a of candidatos) {
      const r = await resolverAlojamento(a);
      if (r) resolvidos.push(r);
      if (resolvidos.length >= 250) break;
    }

    alojamentosResolvidos = resolvidos;
    return alojamentosResolvidos;
  }

  function encontrarAlojamentoParaTexto(texto) {
    const t = norm(texto);
    if (!t || !alojamentosResolvidos.length) return null;

    return alojamentosResolvidos.find(a => {
      const cidade = norm(a.cidade);
      const uf = norm(a.uf);
      const nome = norm(a.nome);
      return (cidade && t.includes(cidade)) || (nome && t.includes(nome)) || (uf && cidade && t.includes(uf) && t.includes(cidade));
    }) || null;
  }

  function encontrarAlojamentoMaisProximo(pontoTexto, destinoLat, destinoLng) {
    const peloTexto = encontrarAlojamentoParaTexto(pontoTexto);
    if (peloTexto) return peloTexto;

    return alojamentosResolvidos
      .map(a => ({ ...a, distancia: km(a.latitude, a.longitude, destinoLat, destinoLng) }))
      .filter(a => Number.isFinite(a.distancia))
      .sort((a, b) => a.distancia - b.distancia)[0] || null;
  }

  function corrigirCardsHospedagem(root) {
    if (!root) return;

    const cards = [...root.querySelectorAll('.opv2-kpi')];
    for (const card of cards) {
      const label = card.querySelector('span');
      if (label && norm(label.textContent).includes('HOTEL')) {
        label.textContent = 'Hospedagem > 120 km';
      }
    }

    root.querySelectorAll('.opv2-row small, .opv2-mini strong').forEach(el => {
      const txt = el.textContent || '';
      if (!/Hotel:/i.test(txt) && !/Sem hotel próximo/i.test(txt)) return;

      const row = el.closest('.opv2-row') || el.closest('.opv2-detail');
      const contexto = row?.textContent || txt;
      const aloj = encontrarAlojamentoParaTexto(contexto);

      if (aloj) {
        el.innerHTML = esc(txt)
          .replace(/Hotel:/i, 'Hospedagem: Alojamento')
          .replace(/sem cadastro próximo/i, `${aloj.nome}${aloj.cidade ? ' · ' + aloj.cidade : ''}`);
      } else {
        el.innerHTML = esc(txt)
          .replace(/Hotel:/i, 'Hospedagem:')
          .replace(/Sem hotel próximo/i, 'Sem hospedagem próxima');
      }
    });
  }

  function observar(root) {
    if (!root) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => corrigirCardsHospedagem(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  async function openHome(root, opts = {}) {
    const alojPromise = carregarAlojamentos();

    if (typeof previousOpenHome === 'function') {
      await previousOpenHome(root, opts);
    } else {
      root.innerHTML = `
        <article class="card">
          <h3>Operacional ADM</h3>
          <p>Não foi possível carregar o módulo operacional.</p>
        </article>
      `;
      return;
    }

    observar(root);
    await alojPromise;
    corrigirCardsHospedagem(root);

    console.info('[opv6] alojamentos geocodificados para roteirização', { alojamentos: alojamentosResolvidos.length });
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
