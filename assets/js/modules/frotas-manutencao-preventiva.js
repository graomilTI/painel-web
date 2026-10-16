// Frotas · Manutenção › Preventiva: um veículo por linha (pela placa) e um serviço do guia por coluna, com o vencimento
// de cada um (frotas_manutencao_vencimentos_v). O "+" registra o que foi feito no veículo e os próximos prazos
// (RPC frotas_manutencao_registrar_preventiva); "Solicitar" abre a solicitação dos serviços vencidos ou próximos.
import { closeModal, dataBR, esc, openModal, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261016-frotas-manut16';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261016-frotas-manut16';
import * as dados from './frotas-manutencao-dados.js?v=20261016-frotas-manut16';
import { RESPONSAVEIS, STATUS_VENCIMENTO, TIPOS_NOTA, descreverIntervalo, numeroOuNulo, somaNotas, validarNota } from './frotas-manutencao-regras.js?v=20261016-frotas-manut16';
import { htmlEntradaNota } from './frotas-manutencao-html.js?v=20261016-frotas-manut16';
import {
  FILTROS_PREVENTIVA, hojeBrasilISO, montarMatriz, pendentesDoVeiculo, proximoPrazo, restanteCelula, validarRegistroPreventiva,
} from './frotas-manutencao-preventiva-regras.js?v=20261016-frotas-manut16';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PREVENTIVA';
  const MODAL = 'fmPreventiva';
  const state = { supabase: null, root: null, linhas: [], planos: new Map(), filtro: 'todos', busca: '', tipo: 'servico', loading: false, ocupado: false, matriz: null };

  const fmtKm = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`);

  function htmlCelula(l, veiculoId) {
    if (!l) return '<td class="fm-pc fm-pc-vazio"><span class="fm-mm">não se aplica</span></td>';
    const st = STATUS_VENCIMENTO[l.status] || { label: l.status, tone: 'blue' };
    const mais = `<button class="fm-pc-mais" type="button" data-reg="${esc(veiculoId)}|${esc(l.plano_codigo)}" title="Registrar que foi feito" aria-label="Registrar ${esc(l.plano_nome)}">+</button>`;
    if (l.status === 'sem_historico') {
      return `<td class="fm-pc fm-pc-sem_historico"><span class="fm-mm">Sem histórico</span>${l.em_andamento ? '<span class="fm-badge amber">Em andamento</span>' : ''}${mais}</td>`;
    }
    const vence = [l.vencimento_data ? dataBR(l.vencimento_data) : '', l.vencimento_km != null ? fmtKm(l.vencimento_km) : ''].filter(Boolean).join(' · ') || '—';
    return `<td class="fm-pc fm-pc-${esc(l.status)}" title="${esc(`${st.label}. Última vez: ${l.data_ultima ? dataBR(l.data_ultima) : '—'}${l.km_ultima != null ? ` a ${fmtKm(l.km_ultima)}` : ''}`)}">
      <strong>${esc(vence)}</strong><span class="fm-mm">${esc(restanteCelula(l) || st.label)}</span>
      <span class="fm-chips"><span class="fm-badge ${st.tone}">${esc(st.label)}</span>${l.em_andamento ? '<span class="fm-badge amber">Em andamento</span>' : ''}</span>${mais}</td>`;
  }

  function htmlTabela(m) {
    if (!m.veiculos.length) return `<tr><td colspan="${m.colunas.length + 1}" class="fm-empty">Nenhum veículo neste filtro.</td></tr>`;
    return m.veiculos.map((v) => {
      const pend = pendentesDoVeiculo(v, state.tipo);
      return `<tr><td class="fm-pv"><strong>${esc(v.placa)}</strong><span class="fm-mm">${esc(v.marca_modelo || '')}${v.coordenacao ? ` · ${esc(v.coordenacao)}` : ''}</span><span class="fm-mm">Km atual ${esc(fmtKm(v.hodometro))}</span>
        <span class="fm-pv-acoes"><button class="fm-btn soft fm-mini" type="button" data-reg="${esc(v.veiculo_id)}|" title="Registrar o que foi feito neste veículo">+ Registrar</button>${pend.length ? `<button class="fm-btn ghost fm-mini" type="button" data-sol="${esc(v.veiculo_id)}"${state.ocupado ? ' disabled' : ''} title="Abre a solicitação dos serviços vencidos ou próximos">Solicitar (${pend.length})</button>` : ''}</span></td>
        ${m.colunas.map((c) => htmlCelula(v.celulas.get(c.codigo), v.veiculo_id)).join('')}</tr>`;
    }).join('');
  }

  function render() {
    const root = state.root; if (!root) return;
    const m = montarMatriz(state.linhas, { tipo: state.tipo, busca: state.busca, filtro: state.filtro });
    state.matriz = m;
    root.querySelector('[data-kpis]').innerHTML = FILTROS_PREVENTIVA.map((f) => cardFiltro({
      filtro: f.id, tone: f.tone, icone: f.icone, label: f.rotulo, dica: f.dica, ativo: f.id === state.filtro, valor: String(m.contagem[f.id] ?? 0),
    })).join('');
    sincronizarCards(root, state.filtro);
    root.querySelector('[data-cabecalho]').innerHTML = `<th class="fm-pv">Veículo</th>${m.colunas.map((c) => {
      const p = [...state.planos.values()].find((x) => x.codigo === c.codigo && !x.veiculo_id);
      return `<th title="${esc(p ? descreverIntervalo(p) : '')}">${esc(c.nome)}<span class="fm-mm">${esc(p ? descreverIntervalo(p) : '')}</span></th>`;
    }).join('')}`;
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<tr><td class="fm-empty" colspan="2">Carregando vencimentos...</td></tr>'
      : htmlTabela(m);
    root.querySelector('[data-contagem]').textContent = `${m.veiculos.length} veículo(s) · ${m.colunas.length} serviço(s)`;
  }

  async function carregar() {
    state.loading = true; render();
    try {
      const [linhas, planos] = await Promise.all([dados.carregarVencimentos(state.supabase), dados.carregarPlanos(state.supabase)]);
      state.linhas = linhas; state.planos = new Map(planos.map((p) => [p.id, p]));
    } catch (err) { toast(err.message || 'Erro ao carregar as preventivas.', 'err'); state.linhas = []; }
    state.loading = false; render();
  }

  // ---------- Solicitar ----------
  async function abrirSolicitacao(veiculoId) {
    const v = state.matriz?.veiculos.find((x) => x.veiculo_id === veiculoId); if (!v || state.ocupado) return;
    const pend = pendentesDoVeiculo(v, state.tipo); if (!pend.length) return;
    state.ocupado = true; render();
    try {
      const id = await dados.solicitar(state.supabase, {
        veiculo_id: veiculoId, origem: 'plano', prioridade: pend.some((p) => p.status === 'vencida') ? 'alta' : 'normal',
        descricao: `Manutenção programada: ${pend.map((p) => p.plano_nome).join(', ')} — ${v.placa}`,
        itens: pend.map((p) => ({ categoria_codigo: p.categoria_codigo, natureza: 'preventiva', descricao: p.plano_nome, plano_id: p.plano_id })),
      });
      toast('Solicitação aberta. Abrindo a ficha...');
      window.FROTAS_MANUTENCAO_ABRIR = id;
      document.querySelector('[data-ds-tab="manutencao"]')?.click();
    } catch (err) {
      toast(err.message || 'Erro ao abrir a solicitação.', 'err', 5500);
    } finally {
      state.ocupado = false; render();
    }
  }

  // ---------- Registrar o que foi feito ----------
  const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function abrirRegistro(veiculoId, codigoInicial) {
    const v = montarMatriz(state.linhas, { tipo: 'todos' }).veiculos.find((x) => x.veiculo_id === veiculoId);
    if (!v) return;
    // Oficinas (sugestão de quem emitiu a nota) e quem paga a manutenção deste veículo; sem acesso, segue em branco.
    const [oficinas, veic] = await Promise.all([
      dados.carregarOficinas(state.supabase).catch(() => []),
      state.supabase.from('frotas_veiculos').select('responsavel_manutencao').eq('id', veiculoId).maybeSingle().then((r) => r.data).catch(() => null),
    ]);
    const responsavelPadrao = veic?.responsavel_manutencao || '';
    // Todos os serviços do veículo (o plano do veículo, quando há exceção), serviços primeiro e depois verificações.
    const cels = [...v.celulas.values()]
      .sort((a, b) => (a.tipo === b.tipo ? a.categoria_codigo - b.categoria_codigo || String(a.plano_nome).localeCompare(String(b.plano_nome), 'pt-BR') : a.tipo === 'servico' ? -1 : 1));
    const linha = (c) => {
      const p = state.planos.get(c.plano_id) || {};
      return `<div class="fm-prev-linha" data-plano="${esc(c.plano_id)}">
        <label class="fm-check"><input type="checkbox" data-pl-check${c.plano_codigo === codigoInicial ? ' checked' : ''}> <span>${esc(c.plano_nome)}</span><small>${esc(descreverIntervalo(p) || '')}${c.tipo === 'verificacao' ? ' · verificação' : ''}</small></label>
        <div class="fm-prev-prazos"${c.plano_codigo === codigoInicial ? '' : ' hidden'}>
          <label>Próximo km<input class="fm-input" type="number" min="1" step="1" data-pl-km data-auto="1" placeholder="—"></label>
          <label>Próxima data<input class="fm-input" type="date" data-pl-data data-auto="1"></label></div></div>`;
    };
    const ov = openModal({
      id: MODAL,
      conteudoHtml: `<div class="fm-mod-head"><div><h3>Registrar preventiva · ${esc(v.placa)}</h3><p>${esc(v.marca_modelo || '')} · Km atual ${esc(fmtKm(v.hodometro))}</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
        <div class="fm-form" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="fm-field"><label>Data do serviço</label><input class="fm-input" type="date" data-r="data" value="${hojeBrasilISO()}" max="${hojeBrasilISO()}"></div>
          <div class="fm-field"><label>Km do veículo no serviço</label><input class="fm-input" type="number" min="1" step="1" data-r="km" value="${v.hodometro != null ? Math.round(v.hodometro) : ''}"></div>
          <div class="fm-field"><label>Oficina (opcional)</label><input class="fm-input" data-r="oficina" maxlength="120"></div></div>
        <div class="fm-sec"><h4>O que foi feito</h4>
          <div class="fm-mm" style="margin-bottom:8px">Marque os serviços. Os próximos prazos já vêm do intervalo do guia; ajuste se o combinado for outro.</div>
          <div class="fm-prev-lista">${cels.map(linha).join('')}</div></div>
        <div class="fm-sec"><h4>Pagamento e nota fiscal</h4>
          <div class="fm-mm" style="margin-bottom:8px">Todo serviço tem um pagamento: anexe a NF ou NFS-e de cada nota (peças, serviço) e, se já foi pago, o comprovante. Com comprovante o pagamento entra no Financeiro já como pago; a NF vai para o lançamento no GRM.</div>
          <div class="fm-form" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0">
            <div class="fm-field"><label>Quem paga</label><select class="fm-select" data-r="responsavel"><option value="">Selecione...</option>${RESPONSAVEIS.map((r) => `<option value="${r.id}"${r.id === responsavelPadrao ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div class="fm-field"><label>Custo total (R$)</label><input class="fm-input" type="number" min="0" step="0.01" data-r="custo" data-auto="1" placeholder="0,00"><small data-custo-dica>Sem notas: informe só se quiser contar o custo.</small></div></div>
          <div class="fm-nota-cab" style="margin-top:10px"><span>Tipo</span><span>Emitida por</span><span>Nº</span><span>Valor</span><span>Arquivo da NF</span><span></span></div>
          ${htmlEntradaNota({ oficinas })}
          <div class="fm-itens" style="margin-top:10px" data-notas-lista></div>
          <label class="fm-check" data-enviar-linha style="display:none;margin-top:8px"><input type="checkbox" data-r="enviar" checked> Enviar as notas ao GRM e ao Financeiro ao salvar</label></div>
        <div class="fm-field full" style="margin-top:10px"><label>Observações (opcional)</label><textarea class="fm-input" rows="2" data-r="obs" style="height:auto;padding:10px 12px"></textarea></div>
        <div data-erros></div>
        <div class="fm-acoes"><button class="fm-btn ghost" type="button" data-acao="fechar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="salvar">Salvar preventiva</button></div>`,
    });
    ov.classList.add('fm-mod');
    const campo = (n) => ov.querySelector(`[data-r="${n}"]`);
    const notas = [];
    const mostrarErros = (lista) => {
      ov.querySelector('[data-erros]').innerHTML = lista.length ? `<ul class="fm-erros">${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    };

    function recalcular() {
      ov.querySelectorAll('.fm-prev-linha').forEach((el) => {
        const marcado = el.querySelector('[data-pl-check]').checked;
        el.querySelector('.fm-prev-prazos').hidden = !marcado;
        if (!marcado) return;
        const p = state.planos.get(el.dataset.plano); if (!p) return;
        const sug = proximoPrazo(p, campo('data').value, campo('km').value);
        const inKm = el.querySelector('[data-pl-km]'); const inData = el.querySelector('[data-pl-data]');
        if (inKm.dataset.auto === '1') inKm.value = sug.proximo_km ?? '';
        if (inData.dataset.auto === '1') inData.value = sug.proxima_data ?? '';
      });
    }

    function renderNotas() {
      const lista = ov.querySelector('[data-notas-lista]');
      lista.innerHTML = notas.map((n, i) => `<div class="fm-nota-linha fm-nota-item">
        <div class="fm-ro">${esc((TIPOS_NOTA.find((t) => t.id === n.tipo) || {}).label || n.tipo)}</div>
        <div class="fm-ro">${esc(n.fornecedor || '—')}</div><div class="fm-ro">${esc(n.numero || '—')}</div><div class="fm-ro">${esc(dinheiro(n.valor))}</div>
        <div class="fm-ro">${esc(n.arquivo.name)}${n.comprovante ? `<small>Comprovante: ${esc(n.comprovante.name)}${n.pago_em ? ` (${esc(dataBR(n.pago_em))})` : ''}</small>` : '<small>Sem comprovante: o Financeiro vai pagar</small>'}</div>
        <button class="fm-ic danger" type="button" data-acao="nota-remover" data-idx="${i}" title="Remover nota" aria-label="Remover nota">✕</button></div>`).join('')
        + (notas.length ? `<div class="fm-mm" style="margin-top:8px">Soma das ${notas.length} nota(s): <strong>${esc(dinheiro(somaNotas(notas)))}</strong></div>` : '');
      const custo = campo('custo');
      if (custo.dataset.auto === '1') custo.value = notas.length ? somaNotas(notas) : '';
      ov.querySelector('[data-custo-dica]').textContent = notas.length ? 'Soma das notas (altere se houver valor sem nota).' : 'Sem notas: informe só se quiser contar o custo.';
      ov.querySelector('[data-enviar-linha]').style.display = notas.length ? '' : 'none';
    }

    ov.addEventListener('input', (e) => {
      if (e.target.matches('[data-pl-km],[data-pl-data]')) e.target.dataset.auto = e.target.value ? '0' : '1';
      if (e.target.matches('[data-r="custo"]')) e.target.dataset.auto = e.target.value ? '0' : '1';
      if (e.target.matches('[data-r="data"],[data-r="km"],[data-pl-check]')) recalcular();
    });
    ov.addEventListener('change', (e) => { if (e.target.matches('[data-pl-check],[data-r="data"],[data-r="km"]')) recalcular(); });
    recalcular(); renderNotas();

    ov.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-acao]'); if (!a) return;
      if (a.dataset.acao === 'fechar') return closeModal(MODAL);
      if (a.dataset.acao === 'nota-remover') { notas.splice(Number(a.dataset.idx), 1); renderNotas(); return; }
      if (a.dataset.acao === 'nota-add') {
        const f = ov.querySelector('[data-nota-entrada]');
        const nt = (k) => (f.querySelector(`[data-nt="${k}"]`)?.value || '').trim();
        const arquivo = f.querySelector('[data-nt-arquivo]')?.files?.[0] || null;
        const valor = numeroOuNulo(nt('valor'));
        const erros = validarNota({ valor, fornecedor: nt('fornecedor'), arquivo });
        mostrarErros(erros); if (erros.length) return;
        const comprovante = f.querySelector('[data-nt-comprovante]')?.files?.[0] || null;
        const oficina = oficinas.find((o) => String(o.nome || '').trim().toLowerCase() === nt('fornecedor').toLowerCase());
        notas.push({ tipo: nt('tipo') || 'servico', fornecedor: nt('fornecedor'), oficina_id: oficina?.id || null, numero: nt('numero') || null, valor, arquivo, comprovante, pago_em: comprovante ? nt('pago_em') : '' });
        ['fornecedor', 'numero', 'valor', 'pago_em'].forEach((k) => { const el = f.querySelector(`[data-nt="${k}"]`); if (el) el.value = ''; });
        f.querySelector('[data-nt-arquivo]').value = ''; f.querySelector('[data-nt-comprovante]').value = '';
        renderNotas(); return;
      }
      if (a.dataset.acao !== 'salvar') return;
      const itens = [...ov.querySelectorAll('.fm-prev-linha')].filter((el) => el.querySelector('[data-pl-check]').checked).map((el) => ({
        plano_id: el.dataset.plano, nome: state.planos.get(el.dataset.plano)?.nome || '',
        proximo_km: el.querySelector('[data-pl-km]').value === '' ? null : Number(el.querySelector('[data-pl-km]').value),
        proxima_data: el.querySelector('[data-pl-data]').value || null,
      }));
      const payload = {
        veiculo_id: veiculoId, data: campo('data').value, km: campo('km').value === '' ? null : Number(campo('km').value), itens,
        oficina: campo('oficina').value.trim(), observacoes: campo('obs').value.trim(),
        responsavel: campo('responsavel').value, custo: numeroOuNulo(campo('custo').value) ?? (notas.length ? somaNotas(notas) : 0), notas,
      };
      const erros = validarRegistroPreventiva(payload, hojeBrasilISO());
      mostrarErros(erros);
      if (erros.length) return;
      const enviar = notas.length && payload.responsavel === 'empresa' && campo('enviar').checked;
      a.disabled = true; a.textContent = 'Salvando...';
      let id = null; const avisos = [];
      try {
        id = await dados.registrarPreventiva(state.supabase, { ...payload, itens: itens.map(({ plano_id, proximo_km, proxima_data }) => ({ plano_id, proximo_km, proxima_data })) });
      } catch (err) {
        mostrarErros([err.message || 'Erro ao registrar a preventiva.']);
        a.disabled = false; a.textContent = 'Salvar preventiva';
        return;
      }
      // A preventiva já está registrada; as notas seguem uma a uma e o que falhar fica para completar na aba Corretiva.
      let salvas = 0;
      for (const n of notas) {
        try {
          a.textContent = `Anexando nota ${salvas + 1} de ${notas.length}...`;
          const anexo = await dados.enviarAnexo(state.supabase, id, 'nf', n.arquivo);
          const urlComprovante = n.comprovante ? await dados.enviarAnexo(state.supabase, id, 'comprovante', n.comprovante) : null;
          await dados.salvarNota(state.supabase, {
            manutencao_id: id, tipo: n.tipo, fornecedor: n.fornecedor, oficina_id: n.oficina_id, numero: n.numero, valor: n.valor, anexo_url: anexo,
            comprovante_url: urlComprovante, pago_em: urlComprovante ? dados.dataPagamentoISO(n.pago_em) : null,
          });
          salvas += 1;
        } catch (err) { avisos.push(`Nota ${n.numero || n.fornecedor}: ${err.message || 'não foi anexada'}.`); }
      }
      if (enviar && salvas > 0) {
        try { a.textContent = 'Enviando ao GRM e ao Financeiro...'; await dados.enviarNfFinanceiro(state.supabase, id); }
        catch (err) { avisos.push(`Envio ao GRM e ao Financeiro: ${err.message || 'não foi enviado'}.`); }
      }
      await carregar();
      if (avisos.length) {
        mostrarErros([`A preventiva foi registrada em ${v.placa}, mas falta completar: ${avisos.join(' ')} Abra a manutenção na aba Corretiva para ajustar as notas e enviar.`]);
        a.textContent = 'Fechar'; a.disabled = false; a.dataset.acao = 'fechar';
        return;
      }
      closeModal(MODAL);
      toast(`Preventiva registrada em ${v.placa}${salvas ? ` com ${salvas} nota(s)${enviar ? ' enviada(s) ao GRM e ao Financeiro' : ''}` : ''}.`);
    });
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container;
    container.innerHTML = `${ESTILOS_MANUTENCAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn ghost" type="button" data-historico>Importar histórico</button><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por placa, modelo, coordenação..." data-busca></div>
      <select class="fm-select" data-tipo style="width:auto"><option value="servico">Serviços (trocas e revisões)</option><option value="verificacao">Verificações (nível, calibragem...)</option><option value="todos">Serviços e verificações</option></select>
      <span class="fm-count" data-contagem></span></div>
      <div class="fm-table-wrap"><table class="fm-table fm-mx"><thead><tr data-cabecalho></tr></thead><tbody data-linhas></tbody></table></div>
      <div class="fm-nota">Cada célula mostra quando o serviço vence (data e km) e quanto falta, pelo km do rastreador (BFleet) e pelo último serviço registrado. "Sem histórico" é o serviço que ainda não teve nenhuma execução registrada: use o <strong>+</strong> da célula ou "+ Registrar" na linha do veículo. O painel abre as solicitações dos vencidos sozinho (todo dia às 07h, Brasília).</div></div></div></section>`;

    container.querySelector('[data-atualizar]').addEventListener('click', carregar);
    container.querySelector('[data-historico]').addEventListener('click', async () => {
      const { abrirImportacaoHistorico } = await import('./frotas-manutencao-historico.js?v=20261016-frotas-manut16');
      abrirImportacaoHistorico({ supabase: state.supabase, aoConcluir: carregar });
    });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; render(); });
    container.querySelector('[data-tipo]').addEventListener('change', (e) => { state.tipo = e.target.value; render(); });
    container.querySelector('[data-linhas]').addEventListener('click', (e) => {
      const r = e.target.closest('[data-reg]'); if (r) { const [v, c] = r.dataset.reg.split('|'); abrirRegistro(v, c || null); return; }
      const s = e.target.closest('[data-sol]'); if (s && !s.disabled) abrirSolicitacao(s.dataset.sol);
    });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: render });
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
