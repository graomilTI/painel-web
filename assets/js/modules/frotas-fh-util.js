// Frotas — Fora do horário — constantes e formatadores (sem dependência de outras partes do Fora do horário).
// Extraído de modules/frotas.js em 14/10/2026 (era um único bloco autoexecutável de ~4.100 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo frotas-*.js deste conjunto, troque o token ?v=20261015-frotas-dos1 em TODOS os imports internos (e os do
// carregador da página): o teste tests/frotas-modulos-versao.test.mjs garante que fiquem iguais.
import { state, onlyPlate, formatDateBR } from './frotas-base.js?v=20261015-frotas-dos1';

  // As janelas (modais) são position: fixed. Se algum ancestral tiver transform/filter/backdrop-filter, o fixed passa a
  // valer em relação a ele e não à tela. O .card sobe com translateY no :hover (e o mouse está sobre ele ao clicar em
  // "Ver detalhes"): com a lista longa, a janela abria no meio do card, fora da tela, e era preciso rolar para achá-la.
  // Marca os ancestrais para o CSS (.fh-sem-transform) neutralizar isso; reaplicada a cada abertura de janela.
  function fhLiberarAncestrais(root) {
    for (let el = root?.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      if (el.classList.contains('fh-sem-transform')) continue;
      const cs = getComputedStyle(el);
      const cartao = /(^|\s)(card|base-card|mini-card|hero-card|panel-card|section-card)(\s|$)/.test(el.getAttribute('class') || '');
      const cria = (cs.transform && cs.transform !== 'none') || (cs.filter && cs.filter !== 'none')
        || (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.perspective && cs.perspective !== 'none')
        || /paint|layout/.test(cs.contain || '') || /transform|filter|perspective/.test(cs.willChange || '');
      if (cartao || cria) el.classList.add('fh-sem-transform');
    }
  }

  // Janela aberta sempre começa no topo (a rolagem interna da abertura anterior não pode esconder o início).
  function fhEnquadrarJanela(modal) {
    const caixa = modal?.querySelector('.speed-modal');
    if (caixa) caixa.scrollTop = 0;
  }

  function readForaHorarioReportPeriod(root) {
    const start = root.querySelector('[data-fora-horario-report-start]')?.value || '';
    const end = root.querySelector('[data-fora-horario-report-end]')?.value || '';
    return { start, end };
  }

  function formatKmForaHorario(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '0,00';
  }

  function formatMoneyForaHorario(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
  }

  // ── Dossiê de uso do veículo fora do expediente ─────────────────────────────
  // Horários do dossiê são de Brasília e chegam como texto sem fuso ("AAAA-MM-DDTHH:MM:SS"): nunca passam por Date local.

  const FH_VEREDITOS = {
    FORA_HORARIO: { rotulo: 'Fora do horário', cls: 'fh-badge-fora', ordem: 0 },
    ATENCAO: { rotulo: 'Para conferir', cls: 'fh-badge-atencao', ordem: 1 },
    DENTRO_HORARIO: { rotulo: 'Dentro do horário', cls: 'fh-badge-dentro', ordem: 2 }
  };

  const FH_EVIDENCIAS = {
    INFORMATIVO: 'Informativo no Mapa de Embarque',
    CHECKIN: 'Check-in na O.S.',
    CHECKOUT: 'Check-out da O.S.',
    CELULAR: 'Sinal do celular (GPS do app)',
    OS_PROGRAMADA: 'Veículo no local da O.S. escalada',
    CARONA: 'Veículo na casa do colega de carona'
  };

  function fhPrimeiroNome(nome) {
    const parte = String(nome || '').trim().split(/\s+/)[0] || '';
    return parte ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase() : '';
  }

  const FH_DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  function fhHm(value) {
    const m = String(value || '').match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : '--:--';
  }

  function fhHoraMin(minutos) {
    const total = ((Math.round(Number(minutos) || 0) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function fhMinutosDoDia(value, dia) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    const d = String(dia || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m || !d) return null;
    const dias = (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+d[1], +d[2] - 1, +d[3])) / 86400000;
    return dias * 1440 + (+m[4]) * 60 + (+m[5]) + (+(m[6] || 0)) / 60;
  }

  function fhKm(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0';
  }

  function fhDuracao(minutos) {
    const total = Math.max(0, Math.round(Number(minutos) || 0));
    if (total < 60) return `${total} min`;
    return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
  }

  function fhFonteRotulo(fonte) {
    const partes = String(fonte || '').split('+').filter(Boolean);
    const rotulos = [];
    const add = (texto) => { if (!rotulos.includes(texto)) rotulos.push(texto); };
    if (partes.includes('INFORMATIVO')) add('informativos');
    if (partes.includes('CHECKIN') || partes.includes('CHECKOUT')) add('produção');
    if (partes.includes('CELULAR')) add('GPS do celular');
    if (partes.includes('OS_PROGRAMADA')) add('rota no local da O.S. escalada');
    if (partes.includes('CARONA')) add('parada de carona');
    return rotulos.join(', ');
  }

  function fhChave(row) {
    return `${row.data_evento}|${onlyPlate(row.placa)}`;
  }

  function fhLinkTrajeto(v) {
    const ok = [v.la1, v.lo1, v.la2, v.lo2].every((n) => n !== null && n !== undefined && Number.isFinite(Number(n)));
    if (!ok) return '';
    return `https://www.google.com/maps/dir/?api=1&origin=${v.la1},${v.lo1}&destination=${v.la2},${v.lo2}&travelmode=driving`;
  }

  function fhLinkPonto(lat, lng) {
    if (![lat, lng].every((n) => n !== null && n !== undefined && Number.isFinite(Number(n)))) return '';
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  // Para que o trajeto se justifique: chegou a O.S. programada, carona, local de registro de trabalho ou está no caminho.
  const FH_USOS = {
    OS: 'O.S. programada',
    CARONA: 'Parada de carona',
    TRABALHO: 'Registro de trabalho',
    VEICULO: 'Abastecimento ou serviço do veículo',
    CAMINHO: 'No caminho',
    RETORNO: 'Volta para casa'
  };

  const FH_STATUS_EXCESSO = {
    PENDENTE: 'Notificação pendente',
    GERADA: 'Mensagem copiada',
    NOTIFICADO: 'Notificado'
  };

  // "Avenida Brasil, 6090, Centro, Salto, Paraná, Brazil" -> "Avenida Brasil, 6090 · Salto".
  function fhEnderecoCurto(texto) {
    const partes = String(texto || '').split(',').map((p) => p.trim()).filter(Boolean);
    const comPais = partes.length && /^(brazil|brasil)$/i.test(partes[partes.length - 1]);
    if (comPais) partes.pop();
    if (comPais && partes.length >= 2) partes.pop();
    if (!partes.length) return '';
    if (partes.length === 1 || /^\d+\w?$/.test(partes[partes.length - 1])) return partes.join(', ');
    const rua = /^\d+\w?$/.test(partes[1] || '') ? `${partes[0]}, ${partes[1]}` : partes[0];
    const cidade = partes[partes.length - 1];
    return rua === cidade ? cidade : `${rua} · ${cidade}`;
  }

  // Trajeto só conta como "fora do horário" na tela a partir de 1 km (movimentos de poucos metros são ruído).
  const FH_FORA_MIN_KM = 1;

  function fhDiaSeguinte(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10) : '';
  }

  function fhDataCurta(iso) {
    return formatDateBR(iso).slice(0, 5);
  }

  const FH_ORDEM_VEREDITO = { FORA_HORARIO: 0, ATENCAO: 1, DENTRO_HORARIO: 2 };

  const FH_ORDEM_USO = { INDEVIDO: 0, ATENCAO: 1, REGULAR: 2 };

  function fhPior(valores, ordem) {
    return valores.filter(Boolean).sort((a, b) => (ordem[a] ?? 9) - (ordem[b] ?? 9))[0];
  }

  // Domingo e feriado: só é autorizado rodar com embarque, em qualquer horário.
  function fhDiaEspecial(d) {
    const e = d?.detalhes?.dia_especial;
    if (e) return { tipo: e.tipo, nome: e.nome, embarque: !!e.embarque };
    if (d?.criterio === 'LIVRE' || d?.criterio === 'SEM_EMBARQUE') return { tipo: 'DOMINGO', nome: 'domingo', embarque: d.criterio === 'LIVRE' };
    return null;
  }

  function fhDiaEspecialRotulo(e) {
    return e.tipo === 'FERIADO' ? `feriado (${e.nome})` : 'domingo';
  }

  function fhMaiusc(texto) {
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
  }

  function fhNum(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  // Período do dia em que o trecho aconteceu, em palavras.
  function fhPeriodo(minutoInicial) {
    const minuto = (((Number(minutoInicial) || 0) % 1440) + 1440) % 1440;
    if (minuto < 300) return 'de madrugada';
    if (minuto >= 1320) return 'à noite';
    return '';
  }

  function fhTitulo(nome) {
    const miudas = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
    return String(nome || '').toLowerCase().split(/\s+/).filter(Boolean)
      .map((parte, i) => (i > 0 && miudas.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1))).join(' ');
  }

  function fhDiasPendentes() {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return (state.foraHorarioSync || [])
      .filter((c) => c.status !== 'OK' && c.data_evento < hoje)
      .map((c) => formatDateBR(c.data_evento).slice(0, 5))
      .reverse();
  }

  function atualizarFiltrosForaHorario(root, contagem) {
    root.querySelectorAll('[data-fh-filter]').forEach((btn) => {
      const chave = btn.dataset.fhFilter;
      btn.classList.toggle('active', chave === state.foraHorarioFiltro);
      const total = btn.querySelector('b');
      if (total) total.textContent = String(contagem[chave] ?? 0);
      if (chave === 'SEM_DOSSIE') btn.hidden = !contagem.SEM_DOSSIE;
    });
  }

  // Os excessos do dossiê guardam o status do momento do cálculo; a notificação pode ter andado depois.
  async function fhAtualizarStatusExcessos(supabase, dos) {
    const lista = dos?.detalhes?.excessos;
    if (!Array.isArray(lista) || !lista.length) return;
    try {
      const ids = lista.map((x) => x.id).filter(Boolean);
      if (!ids.length) return;
      const { data, error } = await supabase.from('frotas_excesso_velocidade').select('id,status_notificacao').in('id', ids);
      if (error) throw error;
      const porId = new Map((data || []).map((r) => [String(r.id), r.status_notificacao]));
      lista.forEach((x) => { if (porId.has(String(x.id))) x.status = porId.get(String(x.id)); });
    } catch (err) {
      console.warn('[FROTAS] Status dos excessos indisponível:', err);
    }
  }

  function formatCoordForaHorario(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(6) : '-';
  }

export { fhLiberarAncestrais, fhEnquadrarJanela, readForaHorarioReportPeriod, formatKmForaHorario, formatMoneyForaHorario, FH_VEREDITOS, FH_EVIDENCIAS, fhPrimeiroNome, FH_DIAS_SEMANA, fhHm, fhHoraMin, fhMinutosDoDia, fhKm, fhDuracao, fhFonteRotulo, fhChave, fhLinkTrajeto, fhLinkPonto, FH_USOS, FH_STATUS_EXCESSO, fhEnderecoCurto, FH_FORA_MIN_KM, fhDiaSeguinte, fhDataCurta, FH_ORDEM_VEREDITO, FH_ORDEM_USO, fhPior, fhDiaEspecial, fhDiaEspecialRotulo, fhMaiusc, fhNum, fhPeriodo, fhTitulo, fhDiasPendentes, atualizarFiltrosForaHorario, fhAtualizarStatusExcessos, formatCoordForaHorario };
