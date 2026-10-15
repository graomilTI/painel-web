// Frotas — Fora do horário — mapa da rota (Leaflet) e seu estado.
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261015-frotas-ev1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { FORA_HORARIO_ROTA_FUNCTION, state, escapeHtml, callEdgeFunction } from './frotas-base.js?v=20261015-frotas-ev1';
import { fhHm, fhMinutosDoDia, fhKm, FH_FORA_MIN_KM, fhNum, fhTitulo } from './frotas-fh-util.js?v=20261015-frotas-ev1';

  // ── Rota do dia: trajeto GPS no mapa, ao lado do dossiê ──────────────────────────────
  // Pontos da RedGPS (edge function frotas-fora-horario-rota): [segundos desde 00:00, lat, lng, km/h].

  let fhMapa = null;

  let fhMapaMarcador = null;

  let fhMapaDados = null;

  let fhMapaPedido = 0;

  let fhMapaBases = null;

  let fhMapaBaseAtiva = null;

  function fhHoraSeg(segundos) {
    const total = Math.max(0, Math.round(Number(segundos) || 0));
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(Math.floor(total / 3600) % 24)}:${p2(Math.floor((total % 3600) / 60))}:${p2(total % 60)}`;
  }

  function fhDistanciaKm(la1, lo1, la2, lo2) {
    const rad = (v) => (v * Math.PI) / 180;
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  async function fhGarantirLeaflet() {
    if (window.L) return true;
    try {
      if (!document.getElementById('fh-leaflet-css')) {
        await new Promise((resolve) => {
          const link = document.createElement('link');
          link.id = 'fh-leaflet-css'; link.rel = 'stylesheet'; link.href = './assets/vendor/leaflet/leaflet.css';
          link.onload = resolve; link.onerror = resolve;
          document.head.appendChild(link);
        });
      }
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './assets/vendor/leaflet/leaflet.js'; script.async = true;
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
      });
      return Boolean(window.L);
    } catch (err) {
      console.warn('[FROTAS] Leaflet indisponível:', err);
      return false;
    }
  }

  function finito(n) {
    return n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
  }

  // Papel da O.S. na Programação: atendimento do condutor, logística (carona frota) ou destino da carona.
  function fhPapelOs(o) {
    const quem = fhTitulo(o.quem);
    if (o.papel === 'CARONA') return `destino da carona de ${quem}`;
    if (o.logistica === true || o.logistica === 'true') return `logística (carona frota) de ${quem}`;
    if (o.papel === 'EQUIPE') return `equipe do veículo: ${quem}`;
    return `atendimento escalado de ${quem}`;
  }

  function fhAgruparOs(prog) {
    const grupos = new Map();
    (prog?.os || []).forEach((o) => {
      const chave = String(o.os);
      if (!grupos.has(chave)) grupos.set(chave, { os: o.os, local: o.local || o.cliente || '', la: o.la, lo: o.lo, papeis: [] });
      const grupo = grupos.get(chave);
      const papel = fhPapelOs(o);
      if (!grupo.papeis.includes(papel)) grupo.papeis.push(papel);
    });
    return [...grupos.values()];
  }

  // Locais para conferir na rota: O.S. escalada na Programação, endereço cadastrado do colaborador e onde o veículo dormiu.
  function fhPontosReferencia(dos) {
    const det = dos.detalhes || {};
    const finito = (n) => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
    const lista = [];
    fhAgruparOs(det.programacao).forEach((g) => {
      const base = {
        tipo: 'os', sigla: 'O.S.',
        titulo: `O.S. ${g.os} · local de embarque programado`,
        detalhe: [g.local, g.papeis.join('; ')].filter(Boolean).join(' · ')
      };
      if (finito(g.la) && finito(g.lo)) lista.push({ ...base, lat: Number(g.la), lng: Number(g.lo) });
      else lista.push({ ...base, sem: true });
    });
    (det.enderecos || []).forEach((e) => {
      if (!finito(e.lat) || !finito(e.lng)) return;
      lista.push({
        tipo: 'casa', sigla: 'C', lat: Number(e.lat), lng: Number(e.lng),
        titulo: `Endereço cadastrado de ${fhTitulo(e.quem)}${e.papel === 'CARONA' ? ' (carona)' : ''}`,
        detalhe: e.endereco || 'endereço não informado no cadastro'
      });
    });
    const cm = det.casa_manha;
    if (cm && finito(cm.lat) && finito(cm.lng)) {
      lista.push({ tipo: 'pernoite', sigla: 'P', lat: Number(cm.lat), lng: Number(cm.lng), titulo: 'Onde o veículo dormiu', detalhe: cm.endereco || '' });
    }
    return lista;
  }

  function fhMaisProximo(pontos, lat, lng) {
    let melhor = null;
    pontos.forEach((p) => {
      const km = fhDistanciaKm(p[1], p[2], lat, lng);
      if (!melhor || km < melhor.km) melhor = { km, sec: p[0] };
    });
    return melhor;
  }

  // Painel do mapa, ao lado do dossiê: título, mapa, deslizador de horário, legenda do que existe no dia e pontos de referência.
  function fhMapaCorpoHtml(dos, rota, referencias) {
    const pontos = rota.pontos || [];
    const origem = rota.fonte === 'cache' ? 'consulta guardada' : 'consultada agora na RedGPS';
    if (!pontos.length) {
      return '<div class="fh-mapa-vazio">A RedGPS não devolveu pontos de GPS para este veículo neste dia.</div>';
    }
    const det = dos.detalhes || {};
    const temFora = (det.viagens || []).some((v) => fhNum(v.fora_km) >= FH_FORA_MIN_KM);
    const temSem = (det.viagens || []).some((v) => v.uso === 'SEM_JUSTIFICATIVA');
    const temExc = (det.excessos || []).some((x) => finito(x.la) && finito(x.lo));
    const refs = referencias.map((r, i) => {
      if (r.sem) {
        return `<div class="fh-ref">
          <span class="fh-pin fh-pin-${r.tipo}">${escapeHtml(r.sigla)}</span>
          <div><b>${escapeHtml(r.titulo)}</b><small>${escapeHtml(r.detalhe || '')}</small><small class="fh-ref-prox">O local desta O.S. não tem coordenada cadastrada: não dá para marcar no mapa.</small></div>
          <span></span>
        </div>`;
      }
      const prox = fhMaisProximo(pontos, r.lat, r.lng);
      const txt = !prox ? '' : (prox.km <= 2
        ? `A rota passou a ${fhKm(prox.km)} km, às ${fhHm(`T${fhHoraSeg(prox.sec)}`)}.`
        : `A rota ficou a no mínimo ${fhKm(prox.km)} km deste ponto.`);
      return `<div class="fh-ref">
        <span class="fh-pin fh-pin-${r.tipo}">${escapeHtml(r.sigla)}</span>
        <div><b>${escapeHtml(r.titulo)}</b><small>${escapeHtml(r.detalhe || '')}</small><small class="fh-ref-prox">${escapeHtml(txt)}</small></div>
        <button type="button" class="fora-horario-link-btn" data-rota-mapa-ir="${i}">Ver no mapa</button>
      </div>`;
    }).join('');
    return `
      <div class="fh-mapa-cab">
        <div><b>Rota realizada</b><span>${pontos.length} pontos · ${escapeHtml(origem)}</span></div>
        <div class="fh-mapa-base" data-mapa-base>
          <button type="button" data-base="sat" class="${state.foraHorarioMapaBase === 'ruas' ? '' : 'active'}">Satélite</button>
          <button type="button" data-base="ruas" class="${state.foraHorarioMapaBase === 'ruas' ? 'active' : ''}">Ruas</button>
        </div>
      </div>
      <div class="fh-mapa" data-rota-mapa-el></div>
      <div class="fh-mapa-slider">
        <input type="range" min="0" max="${pontos.length - 1}" value="0" step="1" data-rota-mapa-slider aria-label="Horário no trajeto">
        <span data-rota-mapa-slider-txt></span>
      </div>
      <div class="fh-legenda-barra">
        <span><i class="fh-lb fh-lb-ok"></i>Percurso</span>
        ${temFora ? '<span><i class="fh-lb fh-lb-fora"></i>Fora do horário</span>' : ''}
        ${temSem ? '<span><i class="fh-lb fh-lb-sem"></i>Sem justificativa</span>' : ''}
        ${temExc ? '<span><i class="fh-lb fh-lb-excm"></i>Excesso de velocidade</span>' : ''}
      </div>
      <details class="fh-metodo fh-interno"><summary>Pontos de referência (${referencias.length})</summary>
        ${refs ? `<div class="fh-refs">${refs}</div>` : '<p class="speed-hint">Sem O.S. programada nem endereço cadastrado com coordenada para este dia.</p>'}
      </details>`;
  }

  function fhRenderMapa(root, dos, rota, referencias) {
    const L = window.L;
    const el = root.querySelector('[data-rota-mapa-el]');
    const pontos = rota.pontos || [];
    if (!L || !el || !pontos.length) return;
    if (fhMapa) { fhMapa.remove(); fhMapa = null; }
    fhMapa = L.map(el, { zoomControl: true, scrollWheelZoom: true, center: [pontos[0][1], pontos[0][2]], zoom: 12, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
    // Fundo "realista": imagem de satélite com nomes de cidades e estradas por cima; alternativa: mapa de ruas colorido.
    const esri = (caminho, extra = {}) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${caminho}/MapServer/tile/{z}/{y}/{x}`,
      { maxZoom: 18, maxNativeZoom: 17, attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics', ...extra });
    fhMapaBases = {
      sat: L.layerGroup([esri('World_Imagery'), esri('Reference/World_Transportation', { attribution: '' }), esri('Reference/World_Boundaries_and_Places', { attribution: '' })]),
      ruas: L.layerGroup([esri('World_Street_Map')])
    };
    fhMapaBaseAtiva = fhMapaBases[state.foraHorarioMapaBase] ? state.foraHorarioMapaBase : 'sat';
    fhMapaBases[fhMapaBaseAtiva].addTo(fhMapa);

    fhMapaDados = { pontos, dia: dos.data_evento, excessos: [] };

    // Trajeto: trechos azuis normais, vermelhos fora do horário e roxos sem justificativa.
    // Vermelho só onde o banco marcou uso fora do horário (ida e volta ficam normais): a parte da viagem que passa da janela.
    const foraIntervalos = [];
    ((dos.detalhes || {}).viagens || []).forEach((v) => {
      if (fhNum(v.fora_km) < FH_FORA_MIN_KM) return;
      const jIniMin = fhMinutosDoDia(v._ji ?? dos.janela_inicio, dos.data_evento);
      const jFimMin = fhMinutosDoDia(v._jf ?? dos.janela_fim, dos.data_evento);
      const ini = (fhMinutosDoDia(v.ini, dos.data_evento) ?? 0) * 60;
      const fim = (fhMinutosDoDia(v.fim, dos.data_evento) ?? 0) * 60;
      if (jIniMin === null || jFimMin === null) {
        foraIntervalos.push([ini, fim]);
      } else {
        if (ini < jIniMin * 60) foraIntervalos.push([ini, Math.min(fim, jIniMin * 60)]);
        if (fim > jFimMin * 60) foraIntervalos.push([Math.max(ini, jFimMin * 60), fim]);
      }
    });
    const fora = (seg) => foraIntervalos.some(([a, b]) => seg >= a && seg <= b);
    const semIntervalos = ((dos.detalhes || {}).viagens || [])
      .filter((v) => v.uso === 'SEM_JUSTIFICATIVA')
      .map((v) => [(fhMinutosDoDia(v.ini, dos.data_evento) ?? 0) * 60, (fhMinutosDoDia(v.fim, dos.data_evento) ?? 0) * 60]);
    const classeDe = (seg) => {
      if (fora(seg)) return 'fora';
      return semIntervalos.some(([ini, fim]) => seg >= ini && seg <= fim) ? 'sem' : 'ok';
    };
    const corTrecho = { fora: '#f87171', sem: '#c084fc', ok: '#60a5fa' };
    let corrente = [];
    let correnteClasse = null;
    const fecharTrecho = () => {
      if (corrente.length > 1) {
        L.polyline(corrente, { color: '#0b1220', weight: 8, opacity: 0.55 }).addTo(fhMapa);
        L.polyline(corrente, { color: corTrecho[correnteClasse], weight: 4.5, opacity: 1 }).addTo(fhMapa);
      }
    };
    pontos.forEach((p) => {
      const classe = classeDe(p[0]);
      if (correnteClasse === null) correnteClasse = classe;
      if (classe !== correnteClasse) {
        corrente.push([p[1], p[2]]);
        fecharTrecho();
        corrente = [[p[1], p[2]]];
        correnteClasse = classe;
      } else {
        corrente.push([p[1], p[2]]);
      }
    });
    fecharTrecho();

    // Etiqueta de hora na 1ª posição de cada hora (sem empilhar etiquetas no mesmo lugar).
    let ultima = null;
    const horasTotal = Math.max(24, Math.ceil(Math.max(...pontos.map((pt) => pt[0])) / 3600));
    for (let h = 0; h < horasTotal; h += 1) {
      const p = pontos.find((item) => item[0] >= h * 3600 && item[0] < (h + 1) * 3600);
      if (!p) continue;
      if (ultima && fhDistanciaKm(ultima[0], ultima[1], p[1], p[2]) < 0.3) continue;
      ultima = [p[1], p[2]];
      L.marker([p[1], p[2]], {
        interactive: false,
        icon: L.divIcon({ className: '', html: `<div class="fh-hora">${String(h % 24).padStart(2, '0')}h</div>`, iconSize: [30, 16], iconAnchor: [15, 8] })
      }).addTo(fhMapa);
    }

    // Saída e chegada de cada viagem, com o horário.
    ((dos.detalhes || {}).viagens || []).forEach((v) => {
      if (Number(v.km) < 0.1) return;
      const ok = (n) => n !== null && n !== undefined && Number.isFinite(Number(n));
      if (ok(v.la1) && ok(v.lo1)) {
        L.circleMarker([Number(v.la1), Number(v.lo1)], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#22c55e', fillOpacity: 1 })
          .bindTooltip(`${fhHm(v.ini)} · saída · ${escapeHtml(v.de || '')}`).addTo(fhMapa);
      }
      if (ok(v.la2) && ok(v.lo2)) {
        L.circleMarker([Number(v.la2), Number(v.lo2)], { radius: 5, color: '#475569', weight: 2, fillColor: '#f8fafc', fillOpacity: 1 })
          .bindTooltip(`${fhHm(v.fim)} · chegada · ${escapeHtml(v.para || '')}`).addTo(fhMapa);
      }
    });

    // Excessos de velocidade do dia.
    ((dos.detalhes || {}).excessos || []).forEach((x) => {
      if (!finito(x.la) || !finito(x.lo)) return;
      const marcador = L.circleMarker([Number(x.la), Number(x.lo)], { radius: 7, color: '#fff', weight: 2, fillColor: '#fb923c', fillOpacity: 1 })
        .bindTooltip(`${escapeHtml(String(x.ts || '').slice(11, 19))} · excesso de velocidade · ${Math.round(fhNum(x.vel))} km/h${x.endereco ? `<br>${escapeHtml(x.endereco)}` : ''}`)
        .addTo(fhMapa);
      fhMapaDados.excessos.push({ la: Number(x.la), lo: Number(x.lo), marcador });
    });

    // Pontos de referência (O.S. programada, endereço cadastrado, pernoite).
    const marcadoresRef = referencias.map((r) => r.sem ? null : L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: '', html: `<div class="fh-pin fh-pin-${r.tipo}">${escapeHtml(r.sigla)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: 500
    }).bindTooltip(`<b>${escapeHtml(r.titulo)}</b>${r.detalhe ? `<br>${escapeHtml(r.detalhe)}` : ''}`).addTo(fhMapa));

    const limites = L.latLngBounds(pontos.map((p) => [p[1], p[2]]));
    // Referências muito longe da rota (endereço cadastrado desatualizado) não esticam o enquadramento.
    referencias.forEach((r) => { if (!r.sem && limites.pad(0.5).contains([r.lat, r.lng])) limites.extend([r.lat, r.lng]); });
    fhMapa.invalidateSize();
    fhMapa.fitBounds(limites, { padding: [30, 30], maxZoom: 16, animate: false });
    const mapaAtual = fhMapa;
    window.setTimeout(() => {
      if (fhMapa !== mapaAtual) return;
      mapaAtual.invalidateSize();
      mapaAtual.fitBounds(limites, { padding: [30, 30], maxZoom: 16, animate: false });
    }, 150);

    // Deslizador de horário.
    fhMapaMarcador = L.circleMarker([pontos[0][1], pontos[0][2]], { radius: 9, color: '#fff', weight: 2, fillColor: '#fbbf24', fillOpacity: 1 }).addTo(fhMapa);
    const slider = root.querySelector('[data-rota-mapa-slider]');
    const texto = root.querySelector('[data-rota-mapa-slider-txt]');
    const mover = () => {
      const p = pontos[Number(slider.value)] || pontos[0];
      const ll = [p[1], p[2]];
      fhMapaMarcador.setLatLng(ll);
      if (!fhMapa.getBounds().contains(ll)) fhMapa.panTo(ll, { animate: false });
      texto.textContent = `${fhHoraSeg(p[0])}${p[0] >= 86400 ? ' (dia seguinte)' : ''} · ${Number(p[3]) || 0} km/h`;
    };
    slider?.addEventListener('input', mover);
    mover();

    root.querySelectorAll('[data-rota-mapa-ir]').forEach((btn) => btn.addEventListener('click', () => {
      const r = referencias[Number(btn.dataset.rotaMapaIr)];
      if (!r || r.sem) return;
      fhMapa.setView([r.lat, r.lng], 15, { animate: false });
      const m = marcadoresRef[Number(btn.dataset.rotaMapaIr)];
      if (m) m.openTooltip();
    }));
  }

  // Carrega a rota do dossiê aberto no painel ao lado (a consulta é guardada para dias encerrados).
  async function fhCarregarMapa(root, opts) {
    const dos = state.foraHorarioDossieAberto;
    const painel = root.querySelector('[data-dossie-mapa]');
    if (!dos || !painel) return;
    const pedido = ++fhMapaPedido;
    if (fhMapa) { fhMapa.remove(); fhMapa = null; }
    fhMapaMarcador = null;
    fhMapaDados = null;
    fhMapaBases = null;
    painel.innerHTML = '<div class="fh-mapa-vazio">Consultando a rota do veículo...</div>';
    try {
      // Rota que atravessa a meia-noite: uma consulta por dia, com os segundos do dia seguinte somados a 24 h.
      const datas = Array.isArray(dos.dias) ? dos.dias.map((d) => d.data_evento) : [dos.data_evento];
      const respostas = await Promise.all(datas.map((data) => callEdgeFunction(opts, FORA_HORARIO_ROTA_FUNCTION, { placa: dos.placa, data })));
      const rota = {
        fonte: respostas.every((r) => r.fonte === 'cache') ? 'cache' : 'rede',
        pontos: respostas.flatMap((r, k) => (r.pontos || []).map((pt) => [pt[0] + 86400 * k, pt[1], pt[2], pt[3]]))
      };
      if (pedido !== fhMapaPedido) return;
      const referencias = fhPontosReferencia(dos);
      painel.innerHTML = fhMapaCorpoHtml(dos, rota, referencias);
      if (!(rota.pontos || []).length) return;
      if (!(await fhGarantirLeaflet())) {
        if (pedido === fhMapaPedido) painel.innerHTML = '<div class="fh-mapa-vazio">Não foi possível carregar o mapa neste navegador.</div>';
        return;
      }
      if (pedido !== fhMapaPedido) return;
      fhRenderMapa(root, dos, rota, referencias);
    } catch (err) {
      if (pedido !== fhMapaPedido) return;
      console.error('[FROTAS] Rota do dia:', err);
      painel.innerHTML = `<div class="fh-mapa-vazio">${escapeHtml(err.message || 'Não foi possível consultar a rota.')}<br><button type="button" class="fora-horario-link-btn" data-rota-mapa-tentar>Tentar de novo</button></div>`;
    }
  }

  function fhFecharMapa(root) {
    fhMapaPedido += 1;
    if (fhMapa) { fhMapa.remove(); fhMapa = null; }
    fhMapaMarcador = null;
    fhMapaDados = null;
    fhMapaBases = null;
    const painel = root.querySelector('[data-dossie-mapa]');
    if (painel) painel.innerHTML = '';
  }

  // Clicar num trajeto da tabela enquadra aquele trecho no mapa; clicar num excesso leva ao ponto.
  function fhMapaFocarIntervalo(ini, fim) {
    if (!fhMapa || !fhMapaDados || !window.L) return;
    const a = (fhMinutosDoDia(ini, fhMapaDados.dia) ?? 0) * 60;
    const b = (fhMinutosDoDia(fim, fhMapaDados.dia) ?? 0) * 60;
    const pts = fhMapaDados.pontos.filter((pt) => pt[0] >= a - 30 && pt[0] <= b + 30);
    if (!pts.length) return;
    fhMapa.fitBounds(window.L.latLngBounds(pts.map((pt) => [pt[1], pt[2]])), { padding: [40, 40], maxZoom: 16, animate: false });
  }

  function fhMapaTrocarBase(chave) {
    if (!fhMapa || !fhMapaBases || !fhMapaBases[chave] || chave === fhMapaBaseAtiva) return;
    fhMapa.removeLayer(fhMapaBases[fhMapaBaseAtiva]);
    fhMapaBases[chave].addTo(fhMapa);
    fhMapaBaseAtiva = chave;
    state.foraHorarioMapaBase = chave;
  }

  function fhMapaFocarPonto(lat, lng) {
    if (!fhMapa || !fhMapaDados) return;
    fhMapa.setView([lat, lng], 16, { animate: false });
    const perto = fhMapaDados.excessos.find((x) => Math.abs(x.la - lat) < 1e-6 && Math.abs(x.lo - lng) < 1e-6);
    if (perto) perto.marcador.openTooltip();
  }

  // Ao redimensionar a janela o mapa precisa recalcular o tamanho (o painel muda de lado ou de altura).
  window.addEventListener('resize', () => { if (fhMapa) fhMapa.invalidateSize(); });

export { finito, fhAgruparOs, fhCarregarMapa, fhFecharMapa, fhMapaFocarIntervalo, fhMapaTrocarBase, fhMapaFocarPonto };
