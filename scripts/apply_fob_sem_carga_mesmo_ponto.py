#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'assets/js/logistica-fob-page-v9.js'
AGENT = ROOT / 'agentes-grm-sync/grm-sync-lancar-nhe.js'
HTML = ROOT / 'logistica-fob.html'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Tela FOB: qualquer carga real no mesmo Cliente + Local elimina TODO o ponto
# da relação de FOB. "Dois Embarques" fica reservado para NHE em O.S. irmã,
# sem carga real no ponto.
# ---------------------------------------------------------------------------
page = PAGE.read_text(encoding='utf-8')
page = replace_once(
    page,
    "const REPORT_CACHE_KEY = 'fob_v9_report_cache_v1';",
    "const REPORT_CACHE_KEY = 'fob_v9_report_cache_v2_sem_carga_ponto';",
    'cache FOB',
)

page = replace_once(
    page,
    """  // Por grupo Cliente + Local de Embarque: se QUALQUER OS do grupo tem NHE ou
  // carga real, isso conta pra decidir \"Dois Embarques\" nas OS irmãs sem
  // lançamento próprio — mesmo que a OS \"dona\" do lançamento nem apareça no
  // painel (por já ter carga real, ver exclusão abaixo).
  const grupos = new Map();
  base.forEach((item) => {
    const key = grupoKey(item.cliente, item.local);
    let g = grupos.get(key);
    if (!g) { g = { temLancamento: false }; grupos.set(key, g); }
    if (temNhe(item.os) || temCargaReal(item.os)) g.temLancamento = true;
  });

  const rows = [];
  base.forEach((item) => {
    // Carga real na Produção + Atualização = situação correta, fora do
    // escopo desta tela (não é pendência de NHE) — não entra no painel.
    if (temCargaReal(item.os)) return;

    let status;
    if (temNhe(item.os)) {
      status = 'OK';
    } else {
      const g = grupos.get(grupoKey(item.cliente, item.local));
      status = (g && g.temLancamento) ? 'DOIS EMBARQUES' : 'PENDENTE';
    }
""",
    """  // Regra obrigatória por ponto: se QUALQUER O.S. do mesmo Cliente + Local
  // de Embarque tiver carga real, nenhuma O.S. desse ponto pode gerar FOB/NHE.
  // O ponto inteiro fica fora da relação. \"Dois Embarques\" só é usado quando
  // existe NHE numa O.S. irmã e não existe carga real em nenhuma O.S. do ponto.
  const grupos = new Map();
  base.forEach((item) => {
    const key = grupoKey(item.cliente, item.local);
    let g = grupos.get(key);
    if (!g) { g = { temCargaReal: false, temNhe: false }; grupos.set(key, g); }
    if (temCargaReal(item.os)) g.temCargaReal = true;
    if (temNhe(item.os)) g.temNhe = true;
  });

  const rows = [];
  base.forEach((item) => {
    const g = grupos.get(grupoKey(item.cliente, item.local));

    // Mesmo que ESTA O.S. esteja zerada, uma carga em outra O.S. do mesmo
    // Cliente + ponto bloqueia o lançamento de FOB para o grupo inteiro.
    if (g && g.temCargaReal) return;

    let status;
    if (temNhe(item.os)) {
      status = 'OK';
    } else {
      status = (g && g.temNhe) ? 'DOIS EMBARQUES' : 'PENDENTE';
    }
""",
    'regra da tela FOB',
)

page = replace_once(
    page,
    """      <div class=\"fob-note\">Regra (só pendências de NHE): base = O.S. com Última Atualização no Mapa de Embarque. Carga real na Produção Diária + Atualização = correto, não entra na lista. Ok = tem NHE (tabela NHE ou \"Cargas\"=NHE na Produção) + Atualização. Dois Embarques = não tem NHE nem carga própria, mas outra O.S. do mesmo Cliente + Local de Embarque tem. Pendente = só tem Atualização, sem NHE/carga própria nem de irmã.</div>""",
    """      <div class=\"fob-note\">Regra (só pendências de NHE): só existe FOB quando <strong>nenhuma O.S. do mesmo Cliente no mesmo ponto de embarque possui carga real</strong>. Havendo qualquer carga no ponto, o grupo inteiro não entra. Ok = a própria O.S. tem NHE. Dois Embarques = outra O.S. do mesmo Cliente + ponto tem NHE, sem carga real no ponto. Pendente = nenhuma O.S. do ponto tem carga nem NHE.</div>""",
    'texto visível da regra FOB',
)
PAGE.write_text(page, encoding='utf-8')


# ---------------------------------------------------------------------------
# Agente NHE: usa duas chaves simultâneas para identificar o mesmo ponto:
# 1) Cliente + coordenada aproximada; 2) Cliente + texto do local. Assim uma
# divergência de geocodificação não ignora um local textual idêntico, e uma
# variação de sufixo no texto ainda pode ser capturada pela coordenada.
# Também considera O.S. com carga que não apareceu no mapa-base do dia.
# ---------------------------------------------------------------------------
agent = AGENT.read_text(encoding='utf-8')
agent = replace_once(
    agent,
    ".select('numero_os,data_os,ponto1_latitude,ponto1_longitude,servico,supervisao')",
    ".select('numero_os,data_os,cliente,embarque,ponto1_nome,ponto1_latitude,ponto1_longitude,servico,supervisao')",
    'select operacional_os do agente',
)
agent = replace_once(
    agent,
    """        servico: row.servico,
        supervisao: row.supervisao
""",
    """        servico: row.servico,
        supervisao: row.supervisao,
        cliente: row.cliente,
        local: row.ponto1_nome || row.embarque
""",
    'dados do ponto da O.S.',
)

agent = replace_once(
    agent,
    """  // Agrupamento por PROXIMIDADE (não mais por texto exato de \"Local de
  // Embarque\"): locais como \"FAZENDA VEREDAO - ADEMAR...\" e \"FAZENDA VEREDAO
  // - THAIS...\" são o mesmo ponto físico com sufixo de proprietário/talhão
  // diferente — arredondar lat/lng a 3 casas (~100m) agrupa esses casos junto
  // (achado do usuário 21/07, com print de exemplo). Sem coordenada
  // resolvida, cai pro texto do Local como antes (fallback).
  function clusterKey(item) {
    var info = coordPorOs[item.os];
    if (info && info.lat !== null && info.lng !== null) {
      return normText(item.cliente) + '|geo:' + (Math.round(info.lat * 1000) / 1000) + ',' + (Math.round(info.lng * 1000) / 1000);
    }
    return normText(item.cliente) + '|txt:' + normText(item.local);
  }

  var grupos = {};
  base.forEach(function (item) {
    var key = clusterKey(item);
    if (!grupos[key]) grupos[key] = { temLancamento: false };
    if (temNhe(item.os) || temCargaReal(item.os)) grupos[key].temLancamento = true;
  });

  var pendentes = [];
  base.forEach(function (item) {
    if (temCargaReal(item.os)) return;
    if (temNhe(item.os)) return;
    var g = grupos[clusterKey(item)];
    var status = (g && g.temLancamento) ? 'DOIS EMBARQUES' : 'PENDENTE';
    if (status !== 'PENDENTE') return;
    if (!item.funcionario) return;
""",
    """  // Um ponto é identificado por DUAS chaves em paralelo:
  // - Cliente + coordenada aproximada (~100m), para nomes com sufixos diferentes;
  // - Cliente + texto normalizado do local, para não separar o mesmo armazém
  //   quando duas O.S. possuem coordenadas divergentes ou incompletas.
  // Basta qualquer uma das chaves coincidir para uma carga bloquear o ponto.
  function clusterKeys(item) {
    var info = coordPorOs[item.os] || {};
    var cliente = normText(item.cliente || info.cliente);
    var keys = [];
    if (cliente && info.lat !== null && info.lat !== undefined && info.lng !== null && info.lng !== undefined) {
      keys.push(cliente + '|geo:' + (Math.round(info.lat * 1000) / 1000) + ',' + (Math.round(info.lng * 1000) / 1000));
    }
    var local = normText(item.local || info.local);
    if (cliente && local) keys.push(cliente + '|txt:' + local);
    return Array.from(new Set(keys));
  }

  var grupos = {};
  function grupo(key) {
    if (!grupos[key]) grupos[key] = { temCargaReal: false, temNhe: false };
    return grupos[key];
  }
  function marcarPonto(item, tipo) {
    clusterKeys(item).forEach(function (key) { grupo(key)[tipo] = true; });
  }

  // Marca o que aparece no Mapa de Embarque.
  base.forEach(function (item) {
    if (temCargaReal(item.os)) marcarPonto(item, 'temCargaReal');
    if (temNhe(item.os)) marcarPonto(item, 'temNhe');
  });

  // Marca também O.S. com carga/NHE que não apareceram na base de informativos
  // do dia. Os dados de Cliente/Local/geo vêm de operacional_os, resolvidos acima.
  Object.keys(setCargaRealOs).forEach(function (os) {
    var info = coordPorOs[os];
    if (info) marcarPonto({ os: os, cliente: info.cliente, local: info.local }, 'temCargaReal');
  });
  Object.keys(setNheEmProducaoOs).concat(Object.keys(setNheOsOnly)).forEach(function (os) {
    var info = coordPorOs[os];
    if (info) marcarPonto({ os: os, cliente: info.cliente, local: info.local }, 'temNhe');
  });

  var pendentes = [];
  var bloqueadasCargaMesmoPonto = 0;
  base.forEach(function (item) {
    if (temCargaReal(item.os)) return;
    if (temNhe(item.os)) return;

    var relacionados = clusterKeys(item).map(function (key) { return grupos[key]; }).filter(Boolean);
    // Regra de segurança: qualquer carga real do mesmo Cliente no mesmo ponto
    // bloqueia a O.S., ainda que o saldo/linha desta O.S. esteja zerado.
    if (relacionados.some(function (g) { return g.temCargaReal; })) {
      bloqueadasCargaMesmoPonto++;
      return;
    }

    var status = relacionados.some(function (g) { return g.temNhe; }) ? 'DOIS EMBARQUES' : 'PENDENTE';
    if (status !== 'PENDENTE') return;
    if (!item.funcionario) return;
""",
    'agrupamento por ponto do agente',
)
agent = replace_once(
    agent,
    """  });
  return pendentes;
}

async function buscarPendentes() {
""",
    """  });
  if (bloqueadasCargaMesmoPonto) {
    log('INFO', bloqueadasCargaMesmoPonto + ' O.S. bloqueada(s): existe carga real do mesmo cliente no mesmo ponto de embarque.');
  }
  return pendentes;
}

async function buscarPendentes() {
""",
    'log de bloqueio do agente',
)

agent = replace_once(
    agent,
    """    var pendentes = args.os
      ? [{ os: normOs(args.os), data: dataReferencia, data_br: referenceBr(), funcionario: args.funcionario || '', cliente: '', local: '', supervisao: '' }]
      : await buscarPendentes();
""",
    """    var pendentes = await buscarPendentes();
    if (args.os) {
      var osSolicitada = normOs(args.os);
      pendentes = pendentes.filter(function (item) { return item.os === osSolicitada; });
      if (pendentes.length && args.funcionario) pendentes[0].funcionario = args.funcionario;
      if (!pendentes.length) {
        log('WARN', 'O.S. ' + osSolicitada + ' não é elegível: pode existir carga/NHE no mesmo ponto, serviço fora do escopo ou ausência de informativo. --forcar não ignora esta regra.');
      }
    }
""",
    'proteção do modo --os',
)
AGENT.write_text(agent, encoding='utf-8')


# Cache-bust da tela.
html = HTML.read_text(encoding='utf-8')
html = replace_once(
    html,
    './assets/js/logistica-fob-page-v9.js?v=20260721-foradoraiotab',
    './assets/js/logistica-fob-page-v9.js?v=20260727-sem-carga-mesmo-ponto',
    'cache-bust HTML FOB',
)
HTML.write_text(html, encoding='utf-8')

print('Patch aplicado com sucesso:')
print(' - assets/js/logistica-fob-page-v9.js')
print(' - agentes-grm-sync/grm-sync-lancar-nhe.js')
print(' - logistica-fob.html')
