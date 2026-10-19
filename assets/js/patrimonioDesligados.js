// Aba "Desligados" dos Relatórios de Patrimônios.
//
// Fontes da lista (um colaborador aparece uma vez; o cadastro manual vence):
//   1. patrimonio_desligados — cadastrado aqui pelo botão "+ Novo desligado", com data de
//      desligamento. Prazo para recolher = 10 dias a partir dela.
//   2. programacao_inativacao_solicitacoes PENDENTE — pedido do gestor em
//      Programação > Sem O.S.; sem data de desligamento, então o prazo conta a
//      partir do dia da solicitação.
// Os patrimônios são lidos ao vivo de patrimonios_snapshot pelo nome: quando
// outro colaborador faz a leitura do item, o snapshot muda de `funcionario` e
// ele sai da lista. Vencido o prazo, o que sobrou é marcado como lançado em Caixa.
//
// Layout no mesmo padrão das listas do Frotas (frotas-ui-lista.js): cabeçalho com ações,
// cards clicáveis que filtram, busca com chip do filtro ativo, tabela com cabeçalho fixo e ícones.

import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';
import { ESTILOS_LISTA, ICON, cardFiltro, sincronizarCards, aoClicarCard, iconBtn } from './modules/frotas-ui-lista.js?v=20261019-frotas-manut28';
import { gerarImagemDesligado, gerarImagemSupervisao, nomeArquivoImagem } from './patrimonioDesligadosImagem.js?v=20261019-agrupar';
import {
  PRAZO_RECOLHIMENTO_DIAS, chaveNome, hojeBrasilia, diaBrasilia, somarDias, formatarDia, estadoPrazo,
  valorEstimadoDoItem, formatarReais,
} from './patrimonioDesligadosRegras.js?v=20261019-agrupar';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const COLUNAS = 7;

// Base visual do Frotas (.fm-*), a mesma das telas de Motoristas/Manutenção, + o que é só desta aba.
const ESTILOS_BASE = `
  .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#94a3b8;line-height:1.55;margin:0}
  .fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}
  .fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark;font:inherit}.fm-select option{background:#0d0d18;color:#e2e2f0}
  .fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:950;width:auto;margin:0}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-btn:disabled{opacity:.5;cursor:not-allowed}.fm-btn[hidden]{display:none}
  .fm-actions{display:flex;gap:6px}
  .fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:980px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}
  .fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-badge.info{border-color:rgba(99,102,241,.4);background:rgba(99,102,241,.16);color:#c7d2fe}
  .fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}
  .fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none;font:inherit;color-scheme:dark}
  .fm-bar .fm-select{flex:0 1 230px;min-width:170px}
  .fm-mat{display:flex;align-items:center;gap:8px;appearance:none;border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.1);color:#bbf7d0;font:inherit;font-weight:900;font-size:12px;padding:5px 10px;border-radius:999px;cursor:pointer;min-width:150px}.fm-mat:hover{background:rgba(34,197,94,.2)}.fm-mat .seta{display:inline-block;width:10px;transition:transform .15s ease}.fm-mat[aria-expanded="true"] .seta{transform:rotate(90deg)}.fm-mat .soma{margin-left:auto;color:#fde68a}
  .fm-itens{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:3px;font-size:12px;color:#cbd5e1}.fm-itens li{display:flex;gap:8px;justify-content:space-between}.fm-itens b{color:#f8fafc}.fm-itens .v{color:#fde68a;white-space:nowrap}.fm-itens .sv{color:#64748b;white-space:nowrap}.fm-itens-total{margin-top:6px;font-size:12px;font-weight:900;color:#fde68a}.fm-itens-total small{color:#94a3b8;font-weight:600}
  .fm-prazo-dia{display:block;margin-top:4px;color:#94a3b8;font-size:11.5px}
  .fm-modal-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:22px}.fm-modal{width:min(640px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e2e2f0}.fm-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px;border-bottom:1px solid rgba(148,163,184,.16)}.fm-modal-head h3{margin:0;color:#fff;font-size:20px}.fm-modal-head p{margin:6px 0 0;color:#94a3b8;font-size:13px;line-height:1.45}.fm-modal-body{padding:20px;display:grid;gap:14px}.fm-modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid rgba(148,163,184,.12)}
  .fm-field{position:relative}.fm-sugestoes{position:absolute;left:0;right:0;top:100%;z-index:5;margin-top:4px;border:1px solid rgba(148,163,184,.25);border-radius:14px;background:#0d0d18;max-height:260px;overflow:auto;box-shadow:0 14px 40px rgba(0,0,0,.5)}.fm-sugestoes[hidden]{display:none}.fm-sug{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;appearance:none;border:0;border-bottom:1px solid rgba(148,163,184,.1);background:transparent;color:#e2e8f0;font:inherit;font-size:13px;padding:10px 12px;cursor:pointer}.fm-sug:hover{background:rgba(34,197,94,.12)}.fm-sug small{color:#94a3b8}
  .fm-previa{border:1px dashed rgba(34,197,94,.35);border-radius:14px;padding:10px 12px;font-size:12.5px;line-height:1.6;color:#cbd5e1}.fm-previa.erro{border-color:rgba(239,68,68,.5);color:#fecaca}.fm-erro{color:#fecaca;font-size:12.5px;min-height:16px}.fm-hint{font-size:12px;color:#94a3b8;margin-top:6px}
  .fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;max-width:360px;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:800;font-size:13px;box-shadow:0 16px 45px rgba(0,0,0,.35)}.fm-toast.erro{border-color:rgba(252,165,165,.4);background:rgba(127,29,29,.96);color:#fee2e2}
  .fm-venc{color:#fca5a5}
  .fm-btn.ghost[aria-pressed="true"]{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.16);color:#bbf7d0}
  .fm-table tr.fm-grupo td{background:rgba(34,197,94,.09);border-bottom:1px solid rgba(34,197,94,.22);padding:10px 12px}.fm-grupo-in{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.fm-grupo-in strong{color:#bbf7d0;font-size:14px;letter-spacing:.02em}.fm-grupo-in span{color:#94a3b8;font-size:12px;font-weight:800}.fm-grupo-in .fm-actions{margin-left:auto}
`;

function injectStyles() {
  if (document.getElementById('patDesligadosStyles')) return;
  const style = document.createElement('style');
  style.id = 'patDesligadosStyles';
  style.textContent = `${ESTILOS_BASE}${ESTILOS_LISTA}`;
  document.head.appendChild(style);
}

async function usuarioAtual() {
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    return { id: u?.id || null, nome: u?.user_metadata?.nome || u?.user_metadata?.name || u?.email || null };
  } catch {
    return { id: null, nome: null };
  }
}

function itensPorNome(snapshot) {
  const mapa = new Map();
  snapshot.forEach((row) => {
    const k = chaveNome(row.funcionario);
    if (!k) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(row);
  });
  return mapa;
}

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/).filter((w) => w.length > 2 || w === String(nome).trim());
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

const ICONE_IMAGEM = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
const ICONE_MAIS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

const FILTROS = [
  { key: 'todos', label: 'Todos', tone: 'blue', icone: 'total', tem: () => true },
  { key: 'prazo', label: 'No prazo', tone: 'green', icone: 'ok', tem: (e) => !e.lancado && !e.estado.vencido },
  { key: 'vencidos', label: 'Vencidos', tone: 'red', icone: 'alerta', tem: (e) => !e.lancado && e.estado.vencido },
  { key: 'caixa', label: 'Lançados em caixa', tone: 'purple', icone: 'dinheiro', tem: (e) => e.lancado },
];

const somaValor = (itens) => itens.reduce((t, r) => t + (r.valor == null ? 0 : Number(r.valor)), 0);

/**
 * @param {{ target: HTMLElement, loadSnapshotRows: () => Promise<any[]> }} deps
 */
export function criarDesligados({ target, loadSnapshotRows }) {
  injectStyles();
  let snapshot = [];
  let filtro = 'todos';
  let busca = '';
  let supervisaoSel = '';
  let carregando = false;
  let agrupar = false;
  // Materiais abertos por colaborador (chave = nome normalizado). Começa tudo recolhido.
  const abertos = new Set();
  let entradas = [];
  let catalogoAtual = [];

  target.innerHTML = `<section class="fm-shell">
    <div class="fm-kpis" data-kpis></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar">
        <div class="fm-search">${ICON.busca}<input class="fm-input" placeholder="Buscar por colaborador, supervisão, patrimônio ou material..." data-busca></div>
        <select class="fm-select" data-supervisao aria-label="Supervisão"><option value="">Todas as supervisões</option></select>
        <span data-chip></span>
        <button class="fm-btn ghost" type="button" data-agrupar aria-pressed="false" title="Agrupa os desligados por supervisão, com um botão de imagem por supervisão para cobrar o gestor em lote">Agrupar por supervisão</button>
        <button class="fm-btn ghost" type="button" data-expandir></button>
        <span class="fm-count" data-count>0 desligado(s)</span>
        <button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button>
        <button class="fm-btn primary" type="button" data-novo>${ICONE_MAIS} Novo desligado</button>
      </div>
      <div class="fm-table-wrap"><table class="fm-table">
        <thead><tr><th>Colaborador</th><th>Materiais</th><th>Supervisão</th><th>Desligamento</th><th>Prazo</th><th>Motivo</th><th style="width:1%">Ações</th></tr></thead>
        <tbody data-linhas><tr><td colspan="${COLUNAS}" class="fm-empty">Carregando...</td></tr></tbody>
      </table></div>
    </div></div>
  </section>`;

  const q = (sel) => target.querySelector(sel);
  const comValor = (rows, catalogo) => rows.map((r) => ({ ...r, valor: valorEstimadoDoItem(r.identificacao, catalogo) }));
  const mensagem = (texto) => { q('[data-linhas]').innerHTML = `<tr><td colspan="${COLUNAS}" class="fm-empty">${esc(texto)}</td></tr>`; };

  async function carregar() {
    if (carregando) return;
    carregando = true;
    mensagem('Carregando colaboradores e materiais...');
    try {
      await carregarDados();
    } finally {
      carregando = false;
    }
  }

  async function carregarDados() {
    const [manuaisR, solicitacoesR, snapshotR, catalogoR] = await Promise.allSettled([
      supabase
        .from('patrimonio_desligados')
        .select('id,colaborador_id,nome_colaborador,cargo,coordenacao,supervisao,motivo,data_desligamento,prazo_recolhimento,status,itens_lancados,lancado_caixa_em,lancado_caixa_por_nome')
        .in('status', ['ABERTO', 'LANCADO_CAIXA'])
        .order('data_desligamento', { ascending: false })
        .limit(1000),
      supabase
        .from('programacao_inativacao_solicitacoes')
        .select('id,colaborador_id,nome_colaborador,cargo,coordenacao,supervisao,motivo,solicitado_em')
        .eq('status', 'PENDENTE')
        .order('solicitado_em', { ascending: false })
        .limit(1000),
      loadSnapshotRows(),
      supabase.from('compras_catalogo').select('material,valor_estimado').eq('ativo', true).not('valor_estimado', 'is', null).limit(2000),
    ]);
    // Sem catálogo os itens só ficam sem estimativa; não bloqueia a aba.
    const catalogo = catalogoR.status === 'fulfilled' && !catalogoR.value.error ? (catalogoR.value.data || []) : [];
    catalogoAtual = catalogo;

    const falha = [manuaisR, solicitacoesR].find((r) => r.status === 'rejected' || r.value?.error);
    if (falha) {
      const err = falha.status === 'rejected' ? falha.reason : falha.value.error;
      mensagem(err?.message || 'Não foi possível carregar os desligados.');
      return;
    }
    if (snapshotR.status === 'rejected') {
      mensagem(snapshotR.reason?.message || 'Não foi possível atualizar a base de patrimônios.');
      return;
    }

    snapshot = snapshotR.value;
    const porNome = itensPorNome(snapshot);
    const hoje = hojeBrasilia();
    const vistos = new Set();
    const novas = [];

    (manuaisR.value.data || []).forEach((reg) => {
      const chave = chaveNome(reg.nome_colaborador);
      if (!chave || vistos.has(chave)) return;
      vistos.add(chave);
      const lancado = reg.status === 'LANCADO_CAIXA';
      const itens = lancado ? (reg.itens_lancados || []) : comValor(porNome.get(chave) || [], catalogo);
      // Sem itens = tudo recolhido (outro colaborador leu): só some da tela. NÃO fecha o registro no banco:
      // o snapshot é regravado do zero a cada sincronização e uma leitura no meio dela volta vazia.
      if (!lancado && !itens.length) return;
      novas.push({
        manual: true,
        id: reg.id,
        nome: reg.nome_colaborador,
        cargo: reg.cargo,
        supervisao: reg.supervisao || reg.coordenacao,
        motivo: reg.motivo,
        dataDesligamento: String(reg.data_desligamento).slice(0, 10),
        prazo: String(reg.prazo_recolhimento).slice(0, 10),
        lancado,
        lancadoEm: reg.lancado_caixa_em,
        itens,
        origem: 'Cadastro manual',
      });
    });

    (solicitacoesR.value.data || []).forEach((sol) => {
      const chave = chaveNome(sol.nome_colaborador);
      if (!chave || vistos.has(chave)) return;
      vistos.add(chave);
      const itens = comValor(porNome.get(chave) || [], catalogo);
      if (!itens.length) return;
      const base = diaBrasilia(sol.solicitado_em);
      novas.push({
        manual: false,
        id: sol.id,
        nome: sol.nome_colaborador,
        cargo: sol.cargo,
        supervisao: sol.supervisao || sol.coordenacao,
        motivo: sol.motivo,
        dataDesligamento: base,
        prazo: somarDias(base, PRAZO_RECOLHIMENTO_DIAS),
        lancado: false,
        itens,
        origem: 'Programação › Sem O.S.',
      });
    });

    novas.sort((a, b) => (a.lancado - b.lancado) || a.prazo.localeCompare(b.prazo));
    entradas = novas.map((e) => ({ ...e, estado: e.lancado ? { classe: 'caixa', texto: 'Lançado em caixa', vencido: false } : estadoPrazo(e.prazo, hoje) }));
    preencherSupervisoes();
    desenhar();
  }

  function preencherSupervisoes() {
    const sel = q('[data-supervisao]');
    const nomes = [...new Set(entradas.map((e) => e.supervisao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (supervisaoSel && !nomes.includes(supervisaoSel)) supervisaoSel = '';
    sel.innerHTML = `<option value="">Todas as supervisões</option>${nomes.map((n) => `<option value="${esc(n)}"${n === supervisaoSel ? ' selected' : ''}>${esc(n)}</option>`).join('')}`;
  }

  function resumoValor(itens) {
    const total = somaValor(itens);
    const sem = itens.filter((r) => r.valor == null).length;
    if (!total && sem === itens.length) return '<div class="fm-itens-total"><small>Sem estimativa no catálogo</small></div>';
    return `<div class="fm-itens-total">Caixa estimado: ${esc(formatarReais(total))}${sem ? ` <small>(${sem} sem valor)</small>` : ''}</div>`;
  }

  function celulaMateriais(e) {
    const chave = chaveNome(e.nome);
    const aberto = abertos.has(chave);
    const n = e.itens.length;
    const total = somaValor(e.itens);
    const lista = `<ul class="fm-itens">${e.itens.map((r) => `<li><span><b>${esc(r.patrimonio_codigo || '-')}</b> — ${esc(r.identificacao || '-')}</span>${r.valor == null ? '<span class="sv">sem valor</span>' : `<span class="v">${esc(formatarReais(r.valor))}</span>`}</li>`).join('')}</ul>${resumoValor(e.itens)}`;
    return `<button type="button" class="fm-mat" data-toggle-itens="${esc(chave)}" aria-expanded="${aberto}" title="${aberto ? 'Recolher' : 'Mostrar'} os materiais"><span class="seta">▸</span>${n} ${n === 1 ? 'item' : 'itens'}${total ? `<span class="soma">${esc(formatarReais(total))}</span>` : ''}</button>${aberto ? lista : ''}`;
  }

  function aplicaBusca(e) {
    if (supervisaoSel && e.supervisao !== supervisaoSel) return false;
    const termo = chaveNome(busca);
    if (!termo) return true;
    const campos = [e.nome, e.cargo, e.supervisao, e.motivo, ...e.itens.flatMap((r) => [r.patrimonio_codigo, r.identificacao])];
    return campos.some((c) => chaveNome(c).includes(termo));
  }

  function desenharKpis(base) {
    const abertosAgora = base.filter((e) => !e.lancado);
    const itensRecolher = abertosAgora.reduce((t, e) => t + e.itens.length, 0);
    const caixaVencidos = base.filter((e) => !e.lancado && e.estado.vencido).reduce((t, e) => t + somaValor(e.itens), 0);
    q('[data-kpis]').innerHTML = [
      ...FILTROS.map((f) => cardFiltro({ filtro: f.key, label: f.label, tone: f.tone, icone: f.icone, valor: String(base.filter(f.tem).length), ativo: filtro === f.key })),
      cardFiltro({ label: 'Itens a recolher', tone: 'amber', icone: 'ferramenta', valor: String(itensRecolher), dica: 'Patrimônios ainda no nome dos desligados que não foram lançados em Caixa' }),
      cardFiltro({ label: 'Caixa estimado (vencidos)', tone: 'amber', icone: 'dinheiro', valor: formatarReais(caixaVencidos), dica: 'Soma do valor estimado dos itens dos desligados com prazo vencido' }),
    ].join('');
  }

  function desenhar() {
    // Os cards contam sobre o que a busca/supervisão deixam passar, para bater com a tabela.
    const base = entradas.filter(aplicaBusca);
    desenharKpis(base);
    sincronizarCards(target, filtro);

    const filtroAtual = FILTROS.find((f) => f.key === filtro) || FILTROS[0];
    const visiveis = base.filter(filtroAtual.tem);
    q('[data-count]').textContent = `${visiveis.length} de ${entradas.length} desligado(s)`;

    const botaoExpandir = q('[data-expandir]');
    const todosAbertos = visiveis.length > 0 && visiveis.every((e) => abertos.has(chaveNome(e.nome)));
    botaoExpandir.hidden = !visiveis.length;
    botaoExpandir.dataset.expandir = todosAbertos ? 'recolher' : 'abrir';
    botaoExpandir.textContent = todosAbertos ? 'Recolher todos os materiais' : 'Expandir todos os materiais';

    if (!visiveis.length) {
      mensagem(entradas.length ? 'Nenhum desligado encontrado com esse filtro.' : 'Nenhum desligado com material a recolher. Use "Novo desligado" para cadastrar.');
      return;
    }

    q('[data-agrupar]').setAttribute('aria-pressed', String(agrupar));
    q('[data-linhas]').innerHTML = agrupar
      ? agruparPorSupervisao(visiveis).map((g) => `${cabecalhoGrupo(g)}${g.lista.map(linhaHtml).join('')}`).join('')
      : visiveis.map(linhaHtml).join('');

  }


  const NOME_SEM_SUPERVISAO = 'Sem supervisão';

  function linhaHtml(e) {
    return `<tr>
      <td><div class="fm-person"><span class="fm-avatar">${esc(iniciais(e.nome))}</span><div><strong>${esc(e.nome)}</strong><small>${esc(e.cargo || 'Colaborador')} · ${esc(e.origem)}</small></div></div></td>
      <td>${celulaMateriais(e)}</td>
      <td>${esc(e.supervisao || '-')}</td>
      <td>${esc(formatarDia(e.dataDesligamento))}</td>
      <td><span class="fm-badge ${{ ok: 'ok', urgente: 'warn', hoje: 'warn', vencido: 'err', caixa: 'info' }[e.estado.classe] || ''}">${esc(e.estado.texto)}</span><span class="fm-prazo-dia">${e.lancado ? esc(`em ${formatarDia(diaBrasilia(e.lancadoEm))}`) : esc(`até ${formatarDia(e.prazo)}`)}</span></td>
      <td>${esc(e.motivo || '-')}</td>
      <td><div class="fm-actions">${iconBtn('data-img', e.id, 'anexo', 'Gerar imagem dos patrimônios (para enviar ao gestor)', ICONE_IMAGEM)}${e.manual && !e.lancado ? `${e.estado.vencido ? iconBtn('data-caixa', e.id, 'termo', 'Marcar como lançado em Caixa (material não recolhido)', 'dinheiro') : ''}${iconBtn('data-rem', e.id, 'danger', 'Tirar este desligado da lista', 'excluir')}` : ''}</div></td>
    </tr>`;
  }

  function agruparPorSupervisao(lista) {
    const mapa = new Map();
    lista.forEach((e) => {
      const nome = e.supervisao || NOME_SEM_SUPERVISAO;
      if (!mapa.has(nome)) mapa.set(nome, []);
      mapa.get(nome).push(e);
    });
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([nome, grupo]) => ({ nome, lista: grupo }));
  }

  function cabecalhoGrupo(g) {
    const pendentes = g.lista.filter((e) => !e.lancado);
    const itens = pendentes.reduce((t, e) => t + e.itens.length, 0);
    const caixa = pendentes.reduce((t, e) => t + somaValor(e.itens), 0);
    const vencidos = pendentes.filter((e) => e.estado.vencido).length;
    const resumo = `${g.lista.length} ${g.lista.length === 1 ? 'colaborador' : 'colaboradores'} · ${itens} ${itens === 1 ? 'item' : 'itens'}${vencidos ? ` · ${vencidos} vencido(s)` : ''}${caixa ? ` · Caixa estimado ${formatarReais(caixa)}` : ''}`;
    const botao = pendentes.length ? iconBtn('data-img-grupo', g.nome, 'anexo', `Gerar imagem da supervisão ${g.nome} (cobrança em lote)`, ICONE_IMAGEM) : '';
    return `<tr class="fm-grupo"><td colspan="${COLUNAS}"><div class="fm-grupo-in"><strong>${esc(g.nome)}</strong><span>${esc(resumo)}</span><div class="fm-actions">${botao}</div></div></td></tr>`;
  }

  function avisar(texto, erro = false) {
    const el = document.createElement('div');
    el.className = `fm-toast${erro ? ' erro' : ''}`;
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  async function gerarImagem(id, botao) {
    const e = entradas.find((x) => x.id === id);
    if (!e) return;
    await entregarImagem(botao, () => gerarImagemDesligado(e), nomeArquivoImagem(e.nome, hojeBrasilia()));
  }

  // Cobrança em lote: uma imagem com todos os desligados (ainda não lançados) da supervisão que estão na lista filtrada.
  async function gerarImagemDoGrupo(nome, botao) {
    const filtroAtual = FILTROS.find((f) => f.key === filtro) || FILTROS[0];
    const lista = entradas.filter(aplicaBusca).filter(filtroAtual.tem)
      .filter((e) => (e.supervisao || NOME_SEM_SUPERVISAO) === nome && !e.lancado);
    if (!lista.length) { avisar('Nenhum desligado pendente nesta supervisão.', true); return; }
    await entregarImagem(botao, () => gerarImagemSupervisao(nome, lista), nomeArquivoImagem(nome, hojeBrasilia()));
  }

  async function entregarImagem(botao, gerar, nomeArquivo) {
    botao.disabled = true;
    try {
      const blob = await gerar();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      let copiada = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copiada = true;
      } catch { /* sem permissão da área de transferência: o arquivo baixado basta */ }
      avisar(copiada ? 'Imagem baixada e copiada — é só colar na conversa.' : 'Imagem baixada.');
    } catch (err) {
      avisar(err?.message || 'Não foi possível gerar a imagem.', true);
    } finally {
      botao.disabled = false;
    }
  }

  async function marcarLancadoCaixa(id) {
    const e = entradas.find((x) => x.manual && x.id === id);
    if (!e) return;
    const resumo = e.itens.map((r) => `${r.patrimonio_codigo} — ${r.identificacao}${r.valor == null ? '' : ` (${formatarReais(r.valor)})`}`).join('\n');
    if (!window.confirm(`Confirma que o material de ${e.nome} que não foi recolhido já foi lançado em Caixa?\n\n${resumo}`)) return;
    const user = await usuarioAtual();
    const { error } = await supabase.from('patrimonio_desligados').update({
      status: 'LANCADO_CAIXA',
      itens_lancados: e.itens.map((r) => ({ patrimonio_codigo: r.patrimonio_codigo, identificacao: r.identificacao, valor: r.valor ?? null })),
      lancado_caixa_em: new Date().toISOString(),
      lancado_caixa_por_nome: user.nome,
    }).eq('id', id).eq('status', 'ABERTO');
    if (error) { avisar(error.message || 'Não foi possível registrar.', true); return; }
    await carregar();
  }

  async function remover(id) {
    const e = entradas.find((x) => x.manual && x.id === id);
    if (!e) return;
    if (!window.confirm(`Tirar ${e.nome} da lista de desligados?`)) return;
    const { error } = await supabase.from('patrimonio_desligados').update({ status: 'CANCELADO' }).eq('id', id).eq('status', 'ABERTO');
    if (error) { avisar(error.message || 'Não foi possível remover.', true); return; }
    await carregar();
  }

  async function abrirModalNovo() {
    const hoje = hojeBrasilia();
    const bg = document.createElement('div');
    bg.className = 'fm-modal-backdrop';
    bg.innerHTML = `
      <div class="fm-modal" role="dialog" aria-modal="true" aria-label="Novo desligado">
        <div class="fm-modal-head">
          <div><h3>Novo desligado</h3><p>Os patrimônios em nome do colaborador entram na lista e saem sozinhos quando outro colaborador fizer a leitura. Prazo de ${PRAZO_RECOLHIMENTO_DIAS} dias para recolher; o que sobrar vai para Caixa.</p></div>
          <button type="button" class="fm-btn ghost" data-fechar aria-label="Fechar">✕</button>
        </div>
        <div class="fm-modal-body">
          <div class="fm-field">
            <label for="dsNome">Colaborador</label>
            <input class="fm-input" id="dsNome" type="text" autocomplete="off" placeholder="Digite o nome" />
            <div class="fm-sugestoes" id="dsSugestoes" hidden></div>
          </div>
          <div class="fm-previa" id="dsPrevia">Escolha o colaborador para ver os patrimônios em nome dele.</div>
          <div class="fm-field">
            <label for="dsData">Data de desligamento</label>
            <input class="fm-input" id="dsData" type="date" value="${hoje}" />
            <div class="fm-hint" id="dsPrazo"></div>
          </div>
          <div class="fm-field">
            <label for="dsMotivo">Motivo (opcional)</label>
            <textarea id="dsMotivo" placeholder="Ex.: pediu demissão, fim do contrato..."></textarea>
          </div>
          <div class="fm-erro" id="dsErro"></div>
        </div>
        <div class="fm-modal-foot">
          <button type="button" class="fm-btn ghost" data-fechar>Cancelar</button>
          <button type="button" class="fm-btn primary" id="dsSalvar">Cadastrar</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const m = (sel) => bg.querySelector(sel);
    const fechar = () => bg.remove();
    bg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fechar));
    bg.addEventListener('mousedown', (ev) => { if (ev.target === bg) fechar(); });

    // Candidatos: base de colaboradores (inclui inativos — desligado já costuma
    // estar "Não Ativo") + nomes que só existem no snapshot de patrimônios.
    let base = [];
    try { base = await getColaboradores({ somenteAtivos: false }); } catch (err) { console.warn('[desligados] base de colaboradores', err); }
    const porNome = itensPorNome(snapshot);
    const jaAbertos = new Set(entradas.map((e) => chaveNome(e.nome)));
    const candidatos = new Map();
    base.forEach((c) => {
      const k = chaveNome(c.nome);
      if (k) candidatos.set(k, { nome: c.nome, id: c.id ?? null, cargo: c.cargo || '', supervisao: c.supervisao || '', coordenacao: c.coordenacao || '' });
    });
    porNome.forEach((rows, k) => {
      if (candidatos.has(k)) return;
      candidatos.set(k, { nome: rows[0].funcionario, id: null, cargo: '', supervisao: rows[0].supervisao || '', coordenacao: rows[0].coordenacao || '' });
    });
    const lista = [...candidatos.entries()].map(([k, c]) => ({ ...c, chave: k, qtd: (porNome.get(k) || []).length }));

    let escolhido = null;
    const inputNome = m('#dsNome');
    const caixaSug = m('#dsSugestoes');
    const previa = m('#dsPrevia');

    const atualizarPrazo = () => {
      const d = m('#dsData').value;
      m('#dsPrazo').textContent = d ? `Prazo para recolher: ${formatarDia(somarDias(d, PRAZO_RECOLHIMENTO_DIAS))}` : '';
    };
    atualizarPrazo();
    m('#dsData').addEventListener('input', atualizarPrazo);

    const mostrarPrevia = () => {
      previa.classList.remove('erro');
      if (!escolhido) { previa.textContent = 'Escolha o colaborador para ver os patrimônios em nome dele.'; return; }
      const rows = porNome.get(escolhido.chave) || [];
      if (jaAbertos.has(escolhido.chave)) {
        previa.classList.add('erro');
        previa.textContent = `${escolhido.nome} já está na lista de desligados.`;
      } else if (!rows.length) {
        previa.classList.add('erro');
        previa.textContent = `Nenhum patrimônio em nome de ${escolhido.nome}. Se o material está no nome de outra grafia, escolha-a na lista.`;
      } else {
        const itens = comValor(rows, catalogoAtual);
        previa.innerHTML = `<strong>${rows.length} ${rows.length === 1 ? 'item' : 'itens'} a recolher</strong><ul class="fm-itens">${itens.map((r) => `<li><span><b>${esc(r.patrimonio_codigo || '-')}</b> — ${esc(r.identificacao || '-')}</span>${r.valor == null ? '' : `<span class="v">${esc(formatarReais(r.valor))}</span>`}</li>`).join('')}</ul>${resumoValor(itens)}`;
      }
    };

    const desenharSug = () => {
      const termo = chaveNome(inputNome.value);
      if (escolhido && chaveNome(escolhido.nome) !== termo) { escolhido = null; mostrarPrevia(); }
      if (termo.length < 2) { caixaSug.hidden = true; return; }
      const achados = lista
        .filter((c) => c.chave.includes(termo))
        .sort((a, b) => (b.qtd > 0) - (a.qtd > 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .slice(0, 8);
      if (!achados.length) { caixaSug.hidden = true; return; }
      caixaSug.innerHTML = achados.map((c, i) => `<button type="button" class="fm-sug" data-i="${i}"><span>${esc(c.nome)}${c.cargo ? ` <small>· ${esc(c.cargo)}</small>` : ''}</span><small>${c.qtd ? `${c.qtd} ${c.qtd === 1 ? 'item' : 'itens'}` : 'sem patrimônio'}</small></button>`).join('');
      caixaSug.hidden = false;
      caixaSug.querySelectorAll('.fm-sug').forEach((btn) => btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        escolhido = achados[Number(btn.dataset.i)];
        inputNome.value = escolhido.nome;
        caixaSug.hidden = true;
        mostrarPrevia();
      }));
    };
    inputNome.addEventListener('input', desenharSug);
    inputNome.addEventListener('blur', () => { caixaSug.hidden = true; });
    inputNome.focus();

    m('#dsSalvar').addEventListener('click', async () => {
      const erro = m('#dsErro');
      erro.textContent = '';
      if (!escolhido) { erro.textContent = 'Escolha o colaborador na lista.'; return; }
      const rows = porNome.get(escolhido.chave) || [];
      if (jaAbertos.has(escolhido.chave)) { erro.textContent = 'Este colaborador já está na lista de desligados.'; return; }
      if (!rows.length) { erro.textContent = 'Não há patrimônio em nome deste colaborador.'; return; }
      const data = m('#dsData').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { erro.textContent = 'Informe a data de desligamento.'; return; }
      const botao = m('#dsSalvar');
      botao.disabled = true;
      const user = await usuarioAtual();
      const { error } = await supabase.from('patrimonio_desligados').insert({
        colaborador_id: escolhido.id == null ? null : String(escolhido.id),
        nome_colaborador: escolhido.nome,
        cargo: escolhido.cargo || null,
        coordenacao: escolhido.coordenacao || rows[0].coordenacao || null,
        supervisao: escolhido.supervisao || rows[0].supervisao || null,
        motivo: m('#dsMotivo').value.trim() || null,
        data_desligamento: data,
        criado_por_nome: user.nome,
      });
      botao.disabled = false;
      if (error) {
        erro.textContent = error.code === '23505' ? 'Este colaborador já está na lista de desligados.' : (error.message || 'Não foi possível cadastrar.');
        return;
      }
      fechar();
      await carregar();
    });
  }

  // Cards: clicar aplica o filtro; clicar de novo (ou no ✕ do chip) limpa.
  aoClicarCard(target, (card, limpar) => {
    filtro = limpar ? 'todos' : (filtro === card.dataset.filtro ? 'todos' : card.dataset.filtro);
    desenhar();
  });

  q('[data-busca]').addEventListener('input', (ev) => { busca = ev.target.value; desenhar(); });
  q('[data-supervisao]').addEventListener('change', (ev) => { supervisaoSel = ev.target.value; desenhar(); });

  target.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('button');
    if (!alvo || !target.contains(alvo)) return;
    if (alvo.hasAttribute('data-novo')) { abrirModalNovo(); return; }
    if (alvo.hasAttribute('data-atualizar')) { carregar(); return; }
    if (alvo.hasAttribute('data-agrupar')) { agrupar = !agrupar; desenhar(); return; }
    if (alvo.dataset.toggleItens) {
      const k = alvo.dataset.toggleItens;
      if (abertos.has(k)) abertos.delete(k); else abertos.add(k);
      desenhar();
      return;
    }
    if (alvo.dataset.expandir) {
      const filtroAtual = FILTROS.find((f) => f.key === filtro) || FILTROS[0];
      entradas.filter(aplicaBusca).filter(filtroAtual.tem).forEach((e) => {
        if (alvo.dataset.expandir === 'abrir') abertos.add(chaveNome(e.nome)); else abertos.delete(chaveNome(e.nome));
      });
      desenhar();
      return;
    }
    if (alvo.dataset.img) gerarImagem(alvo.dataset.img, alvo);
    if (alvo.dataset.imgGrupo) gerarImagemDoGrupo(alvo.dataset.imgGrupo, alvo);
    if (alvo.dataset.caixa) marcarLancadoCaixa(alvo.dataset.caixa);
    if (alvo.dataset.rem) remover(alvo.dataset.rem);
  });

  return { carregar };
}
