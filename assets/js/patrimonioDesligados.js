// Aba "Desligados" dos Relatórios de Patrimônios.
//
// Fontes da lista (um colaborador aparece uma vez; o cadastro manual vence):
//   1. patrimonio_desligados — cadastrado aqui pelo botão "+", com data de
//      desligamento. Prazo para recolher = 10 dias a partir dela.
//   2. programacao_inativacao_solicitacoes PENDENTE — pedido do gestor em
//      Programação > Sem O.S.; sem data de desligamento, então o prazo conta a
//      partir do dia da solicitação.
// Os patrimônios são lidos ao vivo de patrimonios_snapshot pelo nome: quando
// outro colaborador faz a leitura do item, o snapshot muda de `funcionario` e
// ele sai da lista. Vencido o prazo, o que sobrou é marcado como lançado em Caixa.

import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';
import {
  PRAZO_RECOLHIMENTO_DIAS, chaveNome, hojeBrasilia, diaBrasilia, somarDias, formatarDia, estadoPrazo,
} from './patrimonioDesligadosRegras.js';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function injectStyles() {
  if (document.getElementById('patDesligadosStyles')) return;
  const style = document.createElement('style');
  style.id = 'patDesligadosStyles';
  style.textContent = `
    .pat-deslig-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
    .pat-deslig-head .base-button { width:auto; flex:none; margin:0; }
    .pat-deslig-filtros { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 4px; }
    .pat-deslig-filtro { appearance:none; border:1px solid rgba(148,163,184,.22); background:rgba(15,23,42,.42); color:rgba(226,232,240,.8); font:inherit; font-size:12.5px; font-weight:700; padding:6px 13px; border-radius:999px; cursor:pointer; }
    .pat-deslig-filtro.active { border-color:rgba(45,212,191,.5); background:rgba(45,212,191,.14); color:#ecfdf5; }
    .pat-deslig-prazo { display:inline-flex; align-items:center; padding:4px 10px; border-radius:999px; font-weight:800; font-size:12px; white-space:nowrap; border:1px solid rgba(148,163,184,.25); }
    .pat-deslig-prazo.ok { color:#bbf7d0; background:rgba(52,211,153,.1); border-color:rgba(52,211,153,.28); }
    .pat-deslig-prazo.urgente, .pat-deslig-prazo.hoje { color:#fde68a; background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.35); }
    .pat-deslig-prazo.vencido { color:#fecaca; background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.4); }
    .pat-deslig-prazo.caixa { color:#c7d2fe; background:rgba(99,102,241,.14); border-color:rgba(99,102,241,.4); }
    .pat-deslig-origem { font-size:11px; color:rgba(226,232,240,.55); }
    .pat-deslig-acoes { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .pat-deslig-acoes .base-button { width:auto; margin:0; padding:6px 11px; font-size:12px; }
    .pat-deslig-modal-bg { position:fixed; inset:0; z-index:9998; background:rgba(2,6,23,.8); display:flex; align-items:center; justify-content:center; padding:22px; }
    .pat-deslig-modal { width:min(640px,96vw); max-height:92vh; overflow:auto; border:1px solid rgba(148,163,184,.22); border-radius:20px; background:#031d14; color:#e2e8f0; box-shadow:0 24px 80px rgba(0,0,0,.55); }
    .pat-deslig-modal header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:18px 20px; border-bottom:1px solid rgba(148,163,184,.16); }
    .pat-deslig-modal header h3 { margin:0; font-size:18px; color:#fff; }
    .pat-deslig-modal header p { margin:5px 0 0; font-size:12.5px; color:rgba(226,232,240,.65); }
    .pat-deslig-modal .corpo { padding:18px 20px; display:grid; gap:14px; }
    .pat-deslig-modal footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid rgba(148,163,184,.14); }
    .pat-deslig-modal footer .base-button, .pat-deslig-modal header .base-button { width:auto; margin:0; }
    .pat-deslig-campo { display:flex; flex-direction:column; gap:6px; position:relative; }
    .pat-deslig-campo label { font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; color:#bbf7d0; }
    .pat-deslig-campo input, .pat-deslig-campo textarea { border:1px solid rgba(148,163,184,.22); border-radius:12px; background:#0d1a15; color:#e2e8f0; padding:10px 12px; font:inherit; font-size:13.5px; outline:none; color-scheme:dark; }
    .pat-deslig-campo textarea { min-height:64px; resize:vertical; }
    .pat-deslig-sugestoes { position:absolute; left:0; right:0; top:100%; z-index:5; margin-top:4px; border:1px solid rgba(148,163,184,.25); border-radius:12px; background:#06251a; max-height:260px; overflow:auto; box-shadow:0 14px 40px rgba(0,0,0,.45); }
    .pat-deslig-sugestoes[hidden] { display:none; }
    .pat-deslig-sug { display:flex; justify-content:space-between; gap:10px; width:100%; text-align:left; appearance:none; border:0; border-bottom:1px solid rgba(148,163,184,.1); background:transparent; color:#e2e8f0; font:inherit; font-size:13px; padding:9px 12px; cursor:pointer; }
    .pat-deslig-sug:hover { background:rgba(52,211,153,.12); }
    .pat-deslig-sug small { color:rgba(226,232,240,.6); }
    .pat-deslig-previa { border:1px dashed rgba(52,211,153,.35); border-radius:12px; padding:10px 12px; font-size:12.5px; line-height:1.6; color:#cbd5e1; }
    .pat-deslig-previa.erro { border-color:rgba(239,68,68,.5); color:#fecaca; }
    .pat-deslig-erro { color:#fecaca; font-size:12.5px; min-height:16px; }
  `;
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

const FILTROS = [
  ['todos', 'Todos'],
  ['prazo', 'No prazo'],
  ['vencidos', 'Vencidos'],
  ['caixa', 'Lançados em caixa'],
];

/**
 * @param {{ target: HTMLElement, loadSnapshotRows: () => Promise<any[]> }} deps
 */
export function criarDesligados({ target, loadSnapshotRows }) {
  injectStyles();
  let snapshot = [];
  let filtro = 'todos';
  let entradas = [];

  async function carregar() {
    const lista = target.querySelector('#patDesligadosList');
    if (!lista) return;
    lista.className = 'pat-desligados-empty';
    lista.textContent = 'Carregando colaboradores e materiais...';

    const [manuaisR, solicitacoesR, snapshotR] = await Promise.allSettled([
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
    ]);

    const falha = [manuaisR, solicitacoesR].find((r) => r.status === 'rejected' || r.value?.error);
    if (falha) {
      const err = falha.status === 'rejected' ? falha.reason : falha.value.error;
      lista.textContent = err?.message || 'Não foi possível carregar os desligados.';
      return;
    }
    if (snapshotR.status === 'rejected') {
      lista.textContent = snapshotR.reason?.message || 'Não foi possível atualizar a base de patrimônios.';
      return;
    }

    snapshot = snapshotR.value;
    const porNome = itensPorNome(snapshot);
    const hoje = hojeBrasilia();
    const vistos = new Set();
    const novas = [];
    const recolhidosAgora = [];

    (manuaisR.value.data || []).forEach((reg) => {
      const chave = chaveNome(reg.nome_colaborador);
      if (!chave || vistos.has(chave)) return;
      vistos.add(chave);
      const lancado = reg.status === 'LANCADO_CAIXA';
      const itens = lancado ? (reg.itens_lancados || []) : (porNome.get(chave) || []);
      if (!lancado && !itens.length) {
        // Tudo recolhido (outro colaborador leu os itens): fecha o registro.
        recolhidosAgora.push(reg.id);
        return;
      }
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
      const itens = porNome.get(chave) || [];
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

    if (recolhidosAgora.length) {
      // Melhor esforço: se falhar, a próxima abertura da aba tenta de novo.
      supabase.from('patrimonio_desligados').update({ status: 'RECOLHIDO' }).in('id', recolhidosAgora)
        .then(({ error }) => { if (error) console.warn('[desligados] não fechou recolhidos', error); });
    }

    novas.sort((a, b) => (a.lancado - b.lancado) || a.prazo.localeCompare(b.prazo));
    entradas = novas.map((e) => ({ ...e, estado: e.lancado ? { classe: 'caixa', texto: 'Lançado em caixa', vencido: false } : estadoPrazo(e.prazo, hoje) }));
    desenhar();
  }

  function desenhar() {
    const lista = target.querySelector('#patDesligadosList');
    if (!lista) return;
    const contagem = {
      todos: entradas.length,
      prazo: entradas.filter((e) => !e.lancado && !e.estado.vencido).length,
      vencidos: entradas.filter((e) => !e.lancado && e.estado.vencido).length,
      caixa: entradas.filter((e) => e.lancado).length,
    };
    const visiveis = entradas.filter((e) => {
      if (filtro === 'prazo') return !e.lancado && !e.estado.vencido;
      if (filtro === 'vencidos') return !e.lancado && e.estado.vencido;
      if (filtro === 'caixa') return e.lancado;
      return true;
    });

    target.querySelector('#patDesligadosFiltros').innerHTML = FILTROS.map(([k, rotulo]) =>
      `<button type="button" class="pat-deslig-filtro${k === filtro ? ' active' : ''}" data-filtro="${k}">${rotulo} (${contagem[k]})</button>`).join('');

    if (!visiveis.length) {
      lista.className = 'pat-desligados-empty';
      lista.textContent = entradas.length
        ? 'Nenhum desligado neste filtro.'
        : 'Nenhum desligado com material a recolher. Use o + para cadastrar.';
      return;
    }

    lista.className = 'table-shell';
    lista.innerHTML = `<div class="table-scroll-x"><table class="patrimonio-table"><thead><tr><th>Colaborador</th><th>Materiais</th><th>Supervisão</th><th>Desligamento</th><th>Prazo</th><th>Motivo</th><th></th></tr></thead><tbody>${visiveis.map((e) => `<tr>
      <td><div class="pat-cell-stack"><span class="pat-primary">${esc(e.nome)}</span><span class="pat-secondary">${esc(e.cargo || 'Colaborador')}</span><span class="pat-deslig-origem">${esc(e.origem)}</span></div></td>
      <td><div class="pat-cell-stack"><span class="pat-count-badge">${e.itens.length} ${e.itens.length === 1 ? 'item' : 'itens'}</span><span class="pat-secondary">${e.itens.map((row) => esc(`${row.patrimonio_codigo || '-'} — ${row.identificacao || '-'}`)).join('<br>')}</span></div></td>
      <td>${esc(e.supervisao || '-')}</td>
      <td>${esc(formatarDia(e.dataDesligamento))}</td>
      <td><div class="pat-cell-stack"><span class="pat-deslig-prazo ${e.estado.classe}">${esc(e.estado.texto)}</span><span class="pat-secondary">${e.lancado ? esc(`em ${formatarDia(diaBrasilia(e.lancadoEm))}`) : esc(`até ${formatarDia(e.prazo)}`)}</span></div></td>
      <td>${esc(e.motivo || '-')}</td>
      <td>${e.manual && !e.lancado ? `<div class="pat-deslig-acoes">${e.estado.vencido ? `<button type="button" class="base-button primary" data-acao="caixa" data-id="${esc(e.id)}" title="Registra que o material não recolhido foi lançado em Caixa">Lançado em caixa</button>` : ''}<button type="button" class="base-button secondary" data-acao="remover" data-id="${esc(e.id)}" title="Tirar este desligado da lista">Remover</button></div>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  async function marcarLancadoCaixa(id) {
    const e = entradas.find((x) => x.manual && x.id === id);
    if (!e) return;
    const resumo = e.itens.map((r) => `${r.patrimonio_codigo} — ${r.identificacao}`).join('\n');
    if (!window.confirm(`Confirma que o material de ${e.nome} que não foi recolhido já foi lançado em Caixa?\n\n${resumo}`)) return;
    const user = await usuarioAtual();
    const { error } = await supabase.from('patrimonio_desligados').update({
      status: 'LANCADO_CAIXA',
      itens_lancados: e.itens.map((r) => ({ patrimonio_codigo: r.patrimonio_codigo, identificacao: r.identificacao })),
      lancado_caixa_em: new Date().toISOString(),
      lancado_caixa_por_nome: user.nome,
    }).eq('id', id).eq('status', 'ABERTO');
    if (error) { window.alert(error.message || 'Não foi possível registrar.'); return; }
    await carregar();
  }

  async function remover(id) {
    const e = entradas.find((x) => x.manual && x.id === id);
    if (!e) return;
    if (!window.confirm(`Tirar ${e.nome} da lista de desligados?`)) return;
    const { error } = await supabase.from('patrimonio_desligados').update({ status: 'CANCELADO' }).eq('id', id).eq('status', 'ABERTO');
    if (error) { window.alert(error.message || 'Não foi possível remover.'); return; }
    await carregar();
  }

  async function abrirModalNovo() {
    const hoje = hojeBrasilia();
    const bg = document.createElement('div');
    bg.className = 'pat-deslig-modal-bg';
    bg.innerHTML = `
      <div class="pat-deslig-modal" role="dialog" aria-modal="true" aria-label="Cadastrar desligado">
        <header>
          <div><h3>Cadastrar desligado</h3><p>Os patrimônios em nome do colaborador entram na lista e saem sozinhos quando outro colaborador fizer a leitura. Prazo de ${PRAZO_RECOLHIMENTO_DIAS} dias para recolher; o que sobrar vai para Caixa.</p></div>
          <button type="button" class="base-button secondary" data-fechar aria-label="Fechar">✕</button>
        </header>
        <div class="corpo">
          <div class="pat-deslig-campo">
            <label for="dsNome">Colaborador</label>
            <input id="dsNome" type="text" autocomplete="off" placeholder="Digite o nome" />
            <div class="pat-deslig-sugestoes" id="dsSugestoes" hidden></div>
          </div>
          <div class="pat-deslig-previa" id="dsPrevia">Escolha o colaborador para ver os patrimônios em nome dele.</div>
          <div class="pat-deslig-campo">
            <label for="dsData">Data de desligamento</label>
            <input id="dsData" type="date" value="${hoje}" />
            <span class="pat-secondary" id="dsPrazo"></span>
          </div>
          <div class="pat-deslig-campo">
            <label for="dsMotivo">Motivo (opcional)</label>
            <textarea id="dsMotivo" placeholder="Ex.: pediu demissão, fim do contrato..."></textarea>
          </div>
          <div class="pat-deslig-erro" id="dsErro"></div>
        </div>
        <footer>
          <button type="button" class="base-button secondary" data-fechar>Cancelar</button>
          <button type="button" class="base-button primary" id="dsSalvar">Cadastrar</button>
        </footer>
      </div>`;
    document.body.appendChild(bg);
    const q = (sel) => bg.querySelector(sel);
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
    const inputNome = q('#dsNome');
    const caixaSug = q('#dsSugestoes');
    const previa = q('#dsPrevia');

    const atualizarPrazo = () => {
      const d = q('#dsData').value;
      q('#dsPrazo').textContent = d ? `Prazo para recolher: ${formatarDia(somarDias(d, PRAZO_RECOLHIMENTO_DIAS))}` : '';
    };
    atualizarPrazo();
    q('#dsData').addEventListener('input', atualizarPrazo);

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
        previa.innerHTML = `<strong>${rows.length} ${rows.length === 1 ? 'item' : 'itens'} a recolher</strong><br>${rows.map((r) => esc(`${r.patrimonio_codigo || '-'} — ${r.identificacao || '-'}`)).join('<br>')}`;
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
      caixaSug.innerHTML = achados.map((c, i) => `<button type="button" class="pat-deslig-sug" data-i="${i}"><span>${esc(c.nome)}${c.cargo ? ` <small>· ${esc(c.cargo)}</small>` : ''}</span><small>${c.qtd ? `${c.qtd} ${c.qtd === 1 ? 'item' : 'itens'}` : 'sem patrimônio'}</small></button>`).join('');
      caixaSug.hidden = false;
      caixaSug.querySelectorAll('.pat-deslig-sug').forEach((btn) => btn.addEventListener('mousedown', (ev) => {
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

    q('#dsSalvar').addEventListener('click', async () => {
      const erro = q('#dsErro');
      erro.textContent = '';
      if (!escolhido) { erro.textContent = 'Escolha o colaborador na lista.'; return; }
      const rows = porNome.get(escolhido.chave) || [];
      if (jaAbertos.has(escolhido.chave)) { erro.textContent = 'Este colaborador já está na lista de desligados.'; return; }
      if (!rows.length) { erro.textContent = 'Não há patrimônio em nome deste colaborador.'; return; }
      const data = q('#dsData').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { erro.textContent = 'Informe a data de desligamento.'; return; }
      const botao = q('#dsSalvar');
      botao.disabled = true;
      const user = await usuarioAtual();
      const { error } = await supabase.from('patrimonio_desligados').insert({
        colaborador_id: escolhido.id == null ? null : String(escolhido.id),
        nome_colaborador: escolhido.nome,
        cargo: escolhido.cargo || null,
        coordenacao: escolhido.coordenacao || rows[0].coordenacao || null,
        supervisao: escolhido.supervisao || rows[0].supervisao || null,
        motivo: q('#dsMotivo').value.trim() || null,
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

  target.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn || !target.contains(btn)) return;
    if (btn.id === 'btnDesligadoNovo') { abrirModalNovo(); return; }
    if (btn.dataset.filtro) { filtro = btn.dataset.filtro; desenhar(); return; }
    if (btn.dataset.acao === 'caixa') marcarLancadoCaixa(btn.dataset.id);
    if (btn.dataset.acao === 'remover') remover(btn.dataset.id);
  });

  return { carregar };
}
