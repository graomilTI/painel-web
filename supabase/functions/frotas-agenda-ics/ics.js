// Monta o feed iCalendar (.ics) da Agenda de Rastreadores (instalações e manutenções agendadas).
// Funções puras (sem Deno nem rede) para poder testar no Node: tests/frotas-agenda-ics.test.mjs.
const DOMINIO = 'frotas.grao1000.com.br';
const FUSO_MIN = -180; // America/Sao_Paulo (UTC-3; o Brasil não tem mais horário de verão)

export function escapeTexto(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

// Linhas do iCalendar têm no máximo 75 octetos; a continuação começa com um espaço. Não parte caractere multibyte.
export function dobrar(linha) {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes = [];
  let atual = '';
  let bytes = 0;
  let limite = 75;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (bytes + n > limite) { partes.push(atual); atual = ''; bytes = 0; limite = 74; }
    atual += ch; bytes += n;
  }
  if (atual) partes.push(atual);
  return partes.join('\r\n ');
}

const p2 = (n) => String(n).padStart(2, '0');

export function dataIcs(iso) { return String(iso).replace(/-/g, '').slice(0, 8); }

function somaDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}

// "2026-10-20" + "14:30" (horário de Brasília) -> "20261020T173000Z"
export function utcIcs(iso, hora, somaMin = 0) {
  const [a, m, d] = iso.split('-').map(Number);
  const [hh, mm] = String(hora).split(':').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, hh || 0, mm || 0) - FUSO_MIN * 60000 + somaMin * 60000);
  return `${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}T${p2(t.getUTCHours())}${p2(t.getUTCMinutes())}00Z`;
}

const horaValida = (h) => /^\d{1,2}:\d{2}/.test(String(h || ''));

// evento: { uid, titulo, descricao, local, url, data, hora, concluido }
export function buildCalendar({ eventos, nome = 'Frotas · Agenda de rastreadores', agora = new Date() }) {
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grao Mil//Frotas Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeTexto(nome)}`, 'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  // DTSTAMP = momento em que o feed foi gerado (UTC)
  const stamp = `${agora.getUTCFullYear()}${p2(agora.getUTCMonth() + 1)}${p2(agora.getUTCDate())}T${p2(agora.getUTCHours())}${p2(agora.getUTCMinutes())}${p2(agora.getUTCSeconds())}Z`;
  for (const ev of eventos) {
    linhas.push('BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${stamp}`);
    if (horaValida(ev.hora)) {
      linhas.push(`DTSTART:${utcIcs(ev.data, ev.hora)}`, `DTEND:${utcIcs(ev.data, ev.hora, 60)}`);
    } else {
      linhas.push(`DTSTART;VALUE=DATE:${dataIcs(ev.data)}`, `DTEND;VALUE=DATE:${dataIcs(somaDias(ev.data, 1))}`);
    }
    linhas.push(`SUMMARY:${escapeTexto(ev.titulo)}`);
    if (ev.descricao) linhas.push(`DESCRIPTION:${escapeTexto(ev.descricao)}`);
    if (ev.local) linhas.push(`LOCATION:${escapeTexto(ev.local)}`);
    if (ev.url) linhas.push(`URL:${ev.url}`);
    linhas.push(`STATUS:${ev.concluido ? 'CONFIRMED' : 'TENTATIVE'}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const placaKey = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Transforma as linhas do banco nos eventos da agenda (mesmas regras da tela de Agenda de Rastreadores).
export function eventosDe({ manutencoes = [], rastreadores = [], veiculos = [], motoristas = [] }) {
  const veic = new Map(veiculos.map((v) => [placaKey(v.placa), v]));
  const fone = new Map(motoristas.map((m) => [norm(m.nome), soDigitos(m.telefone)]));
  const motorista = (placa, nome, contato) => {
    const n = nome || veic.get(placaKey(placa))?.motorista_atual || '';
    const c = contato || (n ? fone.get(norm(n)) : '') || '';
    return { nome: n, contato: c };
  };
  const linha = (rotulo, valor) => (valor ? `${rotulo}: ${valor}` : '');
  const eventos = [];

  for (const m of manutencoes) {
    if (m.situacao === 'cancelada' || !m.data_agendada) continue;
    const concluido = m.situacao === 'finalizada';
    const mot = motorista(m.placa, m.motorista_nome, m.motorista_contato);
    eventos.push({
      uid: `manut-${m.id}@${DOMINIO}`,
      titulo: `${concluido ? '✓ ' : ''}Manutenção rastreador · ${m.placa}`,
      descricao: [
        linha('Situação', concluido ? 'Concluída' : 'Agendada'), linha('Motivo', m.motivo),
        linha('Motorista', [mot.nome, mot.contato].filter(Boolean).join(' · ')),
        linha('Técnico', [m.tecnico_nome, m.tecnico_contato].filter(Boolean).join(' · ')),
        linha('Local', m.local_agendado), linha('Mapa', m.local_maps_url),
      ].filter(Boolean).join('\n'),
      local: m.local_agendado || '', url: /^https?:\/\//i.test(m.local_maps_url || '') ? m.local_maps_url : '',
      data: String(m.data_agendada).slice(0, 10), hora: m.hora_agendada || '', concluido,
    });
  }

  for (const r of rastreadores) {
    if (!r.data_instalacao || !['agendado', 'concluido'].includes(r.status)) continue;
    const concluido = r.status === 'concluido';
    const mot = motorista(r.placa, '', '');
    const local = [r.local_instalacao, [r.cidade, r.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    eventos.push({
      uid: `inst-${r.id}@${DOMINIO}`,
      titulo: `${concluido ? '✓ ' : ''}Instalação rastreador · ${r.placa}`,
      descricao: [
        linha('Situação', concluido ? 'Concluída' : 'Agendada'),
        linha('Motorista', [mot.nome, mot.contato].filter(Boolean).join(' · ')), linha('Técnico', [r.tecnico_instalacao, r.tecnico_contato_instalacao].filter(Boolean).join(' · ')), linha('Local', local),
      ].filter(Boolean).join('\n'),
      local, url: '', data: String(r.data_instalacao).slice(0, 10), hora: r.hora_instalacao || '', concluido,
    });
  }
  return eventos.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
}
