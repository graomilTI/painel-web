// Frotas · Manutenção › Preventiva › "+ Registrar": assistente em 3 passos para lançar o que foi feito em um veículo.
//   1. O que foi feito (data, km, oficina e os serviços, agrupados por sistema com busca)
//   2. Próximos prazos (km e data sugeridos pelo intervalo do guia, editáveis)
//   3. Pagamento e NF (opcional: quem paga, custo, notas com comprovante, envio ao GRM e Financeiro)
// Grava pela RPC frotas_manutencao_registrar_preventiva; as notas são anexadas em seguida, uma a uma.
import { closeModal, esc, openModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261019-frotas-manut36';
import { RESPONSAVEIS, componentesDoServico, descreverIntervalo, numeroOuNulo, somaNotas } from './frotas-manutencao-regras.js?v=20261019-frotas-manut36';
import { htmlComponentes, htmlEntradaNota } from './frotas-manutencao-html.js?v=20261019-frotas-manut36';
import { criarEditorNotas } from './frotas-manutencao-preventiva-notas.js?v=20261019-frotas-manut36';
import {
  filtrarServicos, hojeBrasilISO, kmMais, nomeCurto, opcoesDePrazo, proximoPrazo, somarPrazo, validarPasso1, validarPasso2, validarPasso3,
} from './frotas-manutencao-preventiva-regras.js?v=20261019-frotas-manut36';
import { fmtKm, htmlCardServico } from './frotas-manutencao-preventiva-cards.js?v=20261019-frotas-manut36';

const MODAL = 'fmPreventiva';
const PASSOS = ['O que foi feito', 'Próximos prazos', 'Pagamento e NF'];

// veiculo: item de montarLista (com todos os serviços); planos: Map(id → plano do guia); planosIniciais: plano_id já marcados
// (os cards selecionados na janela do veículo).
export async function abrirRegistro({ supabase, veiculo, planos, planosIniciais = [], aoConcluir = async () => {} }) {
  // Oficinas (sugestão de quem emitiu a nota) e quem paga a manutenção deste veículo; sem acesso, segue em branco.
  const [oficinas, veic, componentes] = await Promise.all([
    dados.carregarOficinas(supabase).catch(() => []),
    supabase.from('frotas_veiculos').select('responsavel_manutencao').eq('id', veiculo.veiculo_id).maybeSingle().then((r) => r.data).catch(() => null),
    dados.carregarComponentes(supabase).catch(() => []),
  ]);
  const responsavelPadrao = veic?.responsavel_manutencao || '';
  const servicos = veiculo.servicos;
  const porId = new Map(servicos.map((s) => [s.plano_id, s]));
  const marcados = new Set(planosIniciais.filter((id) => porId.has(id)));
  const prazos = new Map(); // plano_id → { km, data, editouKm, editouData }
  const compsSel = new Map(); // plano_id → Set(nomes dos componentes do guia feitos neste serviço)
  const compsDoPlano = (id) => { const s = porId.get(id); return s ? componentesDoServico(componentes, s.categoria_codigo, s.plano_codigo) : []; };
  let passo = 1;
  let mostrarVerificacoes = [...marcados].some((id) => porId.get(id)?.tipo === 'verificacao');

  const ov = openModal({
    id: MODAL,
    conteudoHtml: `<div class="fm-mod-head"><div><h3>Registrar preventiva · ${esc(veiculo.placa)}</h3><p>${esc(veiculo.marca_modelo || '')} · Km atual ${esc(fmtKm(veiculo.hodometro))}</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
      <ol class="fm-passos">${PASSOS.map((n, i) => `<li data-ind="${i + 1}"><b>${i + 1}</b> ${esc(n)}</li>`).join('')}</ol>
      <section data-passo="1">
        <div class="fm-form" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="fm-field"><label>Data do serviço</label><input class="fm-input" type="date" data-r="data" value="${hojeBrasilISO()}" max="${hojeBrasilISO()}"></div>
          <div class="fm-field"><label>Km do veículo no serviço</label><input class="fm-input" type="number" min="1" step="1" data-r="km" value="${veiculo.hodometro != null ? Math.round(veiculo.hodometro) : ''}"></div>
          <div class="fm-field"><label>Oficina (opcional)</label><input class="fm-input" data-r="oficina" maxlength="120"></div></div>
        <div class="fm-prev-busca"><input class="fm-input" data-busca-servico placeholder="Buscar serviço (óleo, freio, filtro...)"><label class="fm-check"><input type="checkbox" data-ver> Mostrar verificações</label></div>
        <div class="fm-prev-marcados" data-marcados></div>
        <div class="fm-prev-comps" data-comps-servico></div>
        <div class="fm-svc-grid fm-svc-grid-rolagem" data-grupos></div></section>
      <section data-passo="2" hidden><div class="fm-mm" style="margin-bottom:8px">Próximo km e próxima data já vêm do intervalo do guia; ajuste se o combinado for outro. Deixe em branco o que não tem prazo.</div><div class="fm-prev-lista" data-prazos></div></section>
      <section data-passo="3" hidden>
        <div class="fm-mm" style="margin-bottom:8px">Opcional: anexe o que já tiver (NF/NFS-e e/ou comprovante de pagamento). O que faltar fica como <strong>pendência</strong> no painel do veículo, e dá para completar depois em Pagamento e NF. Com comprovante o pagamento entra no Financeiro já como pago; a NF vai para o lançamento no GRM.</div>
        <div class="fm-form" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0">
          <div class="fm-field"><label>Quem paga</label><select class="fm-select" data-r="responsavel"><option value="">Selecione...</option>${RESPONSAVEIS.map((r) => `<option value="${r.id}"${r.id === responsavelPadrao ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
          <div class="fm-field"><label>Custo total (R$)</label><input class="fm-input" type="number" min="0" step="0.01" data-r="custo" data-auto="1" placeholder="0,00"><small data-custo-dica></small></div></div>
        <div class="fm-nota-cab" style="margin-top:10px"><span>Tipo</span><span>Emitida por</span><span>Nº</span><span>Valor</span><span>Arquivo da NF</span><span></span></div>
        ${htmlEntradaNota({ oficinas })}
        <div class="fm-itens" style="margin-top:10px" data-notas-lista></div>
        <label class="fm-check" data-enviar-linha style="display:none;margin-top:8px"><input type="checkbox" data-r="enviar" checked> Enviar as notas ao GRM e ao Financeiro ao salvar</label>
        <div class="fm-field full" style="margin-top:10px"><label>Observações (opcional)</label><textarea class="fm-input" rows="2" data-r="obs" style="height:auto;padding:10px 12px"></textarea></div></section>
      <div data-erros></div>
      <div class="fm-acoes fm-prev-rodape"><button class="fm-btn ghost" type="button" data-acao="voltar">Cancelar</button><button class="fm-btn soft" type="button" data-acao="salvar-simples" hidden>Salvar sem pagamento</button><button class="fm-btn primary" type="button" data-acao="proximo">Próximo</button></div>`,
  });
  ov.classList.add('fm-mod');
  const campo = (n) => ov.querySelector(`[data-r="${n}"]`);
  const mostrarErros = (lista) => {
    ov.querySelector('[data-erros]').innerHTML = lista.length ? `<ul class="fm-erros">${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  };
  const editor = criarEditorNotas(ov, { oficinas, aoMudar: () => aoMudarNotas(), mostrarErros });
  const notas = editor.notas;
  const dadosPasso1 = () => ({ data: campo('data').value, km: campo('km').value === '' ? null : Number(campo('km').value) });
  const itensMarcados = () => [...marcados].map((id) => {
    const p = prazos.get(id) || {};
    return { plano_id: id, nome: porId.get(id)?.plano_nome || '', componentes: [...(compsSel.get(id) || [])], proximo_km: p.km === '' || p.km == null ? null : Number(p.km), proxima_data: p.data || null };
  });

  // ---------- passo 1: serviços (cards selecionáveis) ----------
  function renderGrupos() {
    const visiveis = filtrarServicos(servicos, { busca: ov.querySelector('[data-busca-servico]').value, verificacoes: mostrarVerificacoes, selecionados: marcados });
    ov.querySelector('[data-grupos]').innerHTML = visiveis.length
      ? visiveis.map((s) => htmlCardServico(s, planos.get(s.plano_id) || {}, marcados.has(s.plano_id))).join('')
      : '<div class="fm-empty">Nenhum serviço encontrado.</div>';
    ov.querySelector('[data-marcados]').innerHTML = marcados.size
      ? `<span class="fm-mm">Marcados:</span> ${[...marcados].map((id) => `<span class="fm-chip-x">${esc(nomeCurto(porId.get(id)?.plano_nome || ''))}<button type="button" data-desmarcar="${esc(id)}" aria-label="Desmarcar">✕</button></span>`).join('')}`
      : '<span class="fm-mm">Nenhum serviço marcado ainda. Toque nos serviços feitos.</span>';
    renderComponentes();
  }

  // Itens do guia dentro de cada serviço marcado (vêm marcados; desmarque o que não foi feito).
  function renderComponentes() {
    for (const id of [...compsSel.keys()]) if (!marcados.has(id)) compsSel.delete(id);
    ov.querySelector('[data-comps-servico]').innerHTML = [...marcados].map((id) => {
      const nomes = compsDoPlano(id);
      if (!nomes.length) return '';
      if (!compsSel.has(id)) compsSel.set(id, new Set(nomes));
      return `<div class="fm-prev-comp" data-comp-plano="${esc(id)}"><strong>${esc(nomeCurto(porId.get(id)?.plano_nome || ''))}</strong>${htmlComponentes(nomes, [...compsSel.get(id)], { titulo: 'Itens feitos' })}</div>`;
    }).join('');
  }

  // ---------- passo 2: próximos prazos ----------
  function renderPrazos() {
    const { data, km } = dadosPasso1();
    const ordem = [...marcados].map((id) => porId.get(id)).filter(Boolean).sort((a, b) => a.categoria_codigo - b.categoria_codigo || String(a.plano_nome).localeCompare(String(b.plano_nome), 'pt-BR'));
    ov.querySelector('[data-prazos]').innerHTML = ordem.map((s) => {
      const e = prazos.get(s.plano_id) || {};
      const sug = proximoPrazo(planos.get(s.plano_id) || {}, data, km);
      const vKm = e.editouKm ? e.km : (sug.proximo_km ?? '');
      const vData = e.editouData ? e.data : (sug.proxima_data ?? '');
      prazos.set(s.plano_id, { ...e, km: vKm, data: vData });
      return `<div class="fm-prev-linha" data-plano="${esc(s.plano_id)}"><div class="fm-check"><span>${esc(nomeCurto(s.plano_nome))}</span><small>${esc(descreverIntervalo(planos.get(s.plano_id) || {}) || '')}</small></div>
        <div class="fm-prev-prazos"><label>Próximo km<input class="fm-input" type="number" min="1" step="1" data-pz-km value="${esc(vKm)}" placeholder="—"></label>
        <label>Próxima data<input class="fm-input" type="date" data-pz-data value="${esc(vData)}"></label></div>${htmlOpcoesPrazo(planos.get(s.plano_id) || {})}</div>`;
    }).join('') || '<div class="fm-empty">Nenhum serviço marcado.</div>';
    ov.querySelectorAll('[data-passo="2"] .fm-prev-linha').forEach(marcarOpcoesAtivas);
  }

  // Escolha rápida do intervalo (ex.: +5.000 ou +10.000 km; +6 ou +12 meses), contado a partir do km e da data do passo 1.
  function htmlOpcoesPrazo(plano) {
    const o = opcoesDePrazo(plano);
    const fmt = (n) => Number(n).toLocaleString('pt-BR');
    const grupo = (rotulo, botoes) => (botoes.length ? `<span class="fm-prev-opcoes-grupo"><span>${rotulo}</span>${botoes.join('')}</span>` : '');
    const botoes = [
      grupo('Km:', o.kms.map((k) => `<button type="button" class="fm-opcao" data-pz-km-add="${k}">+${fmt(k)} km</button>`)),
      grupo('Prazo:', [...o.meses.map((m) => `<button type="button" class="fm-opcao" data-pz-meses="${m}">+${m} ${m === 1 ? 'mês' : 'meses'}</button>`), ...o.dias.map((d) => `<button type="button" class="fm-opcao" data-pz-dias="${d}">+${d} dias</button>`)]),
    ].join('');
    return botoes ? `<div class="fm-prev-opcoes">${botoes}</div>` : '';
  }

  // Destaca a opção que bate com o valor atual dos campos.
  function marcarOpcoesAtivas(linha) {
    const { data, km } = dadosPasso1();
    const inKm = linha.querySelector('[data-pz-km]'); const inData = linha.querySelector('[data-pz-data]');
    linha.querySelectorAll('[data-pz-km-add]').forEach((b) => b.classList.toggle('ativo', kmMais(km, b.dataset.pzKmAdd) === Number(inKm.value)));
    linha.querySelectorAll('[data-pz-meses]').forEach((b) => b.classList.toggle('ativo', !!inData.value && somarPrazo(data, { meses: Number(b.dataset.pzMeses) }) === inData.value));
    linha.querySelectorAll('[data-pz-dias]').forEach((b) => b.classList.toggle('ativo', !!inData.value && somarPrazo(data, { dias: Number(b.dataset.pzDias) }) === inData.value));
  }

  function aplicarOpcaoPrazo(botao) {
    const linha = botao.closest('[data-plano]'); const id = linha.dataset.plano;
    const { data, km } = dadosPasso1();
    const inKm = linha.querySelector('[data-pz-km]'); const inData = linha.querySelector('[data-pz-data]');
    if (botao.dataset.pzKmAdd) {
      const novo = kmMais(km, botao.dataset.pzKmAdd);
      if (novo == null) return mostrarErros(['Informe o km do veículo no passo 1 para usar esta opção.']);
      inKm.value = novo; prazos.set(id, { ...prazos.get(id), km: novo, editouKm: true });
    } else {
      const nova = somarPrazo(data, botao.dataset.pzMeses ? { meses: Number(botao.dataset.pzMeses) } : { dias: Number(botao.dataset.pzDias) });
      if (!nova) return mostrarErros(['Informe a data do serviço no passo 1 para usar esta opção.']);
      inData.value = nova; prazos.set(id, { ...prazos.get(id), data: nova, editouData: true });
    }
    mostrarErros([]); marcarOpcoesAtivas(linha);
  }

  // ---------- passo 3: notas ----------
  // A lista de notas novas e o "+" ficam no editor compartilhado; aqui só o custo sugerido e o envio.
  function aoMudarNotas() {
    const custo = campo('custo');
    if (custo.dataset.auto === '1') custo.value = notas.length ? somaNotas(notas) : '';
    ov.querySelector('[data-custo-dica]').textContent = notas.length ? 'Soma das notas (altere se houver valor sem nota).' : 'Sem notas: informe só se quiser contar o custo.';
    ov.querySelector('[data-enviar-linha]').style.display = notas.length ? '' : 'none';
  }

  // ---------- navegação ----------
  function irPara(n) {
    passo = n;
    ov.querySelectorAll('[data-passo]').forEach((el) => { el.hidden = Number(el.dataset.passo) !== n; });
    ov.querySelectorAll('[data-ind]').forEach((el) => {
      el.classList.toggle('ativo', Number(el.dataset.ind) === n); el.classList.toggle('feito', Number(el.dataset.ind) < n);
    });
    if (n === 2) renderPrazos();
    ov.querySelector('[data-acao="voltar"]').textContent = n === 1 ? 'Cancelar' : 'Voltar';
    ov.querySelector('[data-acao="salvar-simples"]').hidden = n !== 2;
    const prox = ov.querySelector('[data-acao="proximo"]');
    prox.textContent = n === 3 ? 'Salvar preventiva' : 'Próximo'; prox.dataset.acao = n === 3 ? 'salvar' : 'proximo';
    mostrarErros([]);
  }

  async function salvar({ semPagamento = false } = {}) {
    const listaNotas = semPagamento ? [] : notas;
    const registro = {
      ...dadosPasso1(), itens: itensMarcados(), notas: listaNotas, responsavel: campo('responsavel').value,
      custo: semPagamento ? 0 : (numeroOuNulo(campo('custo').value) ?? (listaNotas.length ? somaNotas(listaNotas) : 0)),
    };
    const erros = [...validarPasso1(registro, hojeBrasilISO()), ...validarPasso2(registro), ...(semPagamento ? [] : validarPasso3(registro))];
    mostrarErros(erros); if (erros.length) return;
    const botoes = [...ov.querySelectorAll('.fm-prev-rodape button')]; botoes.forEach((b) => { b.disabled = true; });
    const rotulo = (t) => { ov.querySelector('.fm-btn.primary').textContent = t; };
    const enviar = listaNotas.length && registro.responsavel === 'empresa' && campo('enviar').checked;
    let id = null; const avisos = []; let semNf = 0;
    try {
      id = await dados.registrarPreventiva(supabase, {
        veiculo_id: veiculo.veiculo_id, data: registro.data, km: registro.km, oficina: campo('oficina').value.trim(), observacoes: campo('obs').value.trim(),
        responsavel: registro.responsavel, custo: registro.custo,
        itens: registro.itens.map(({ plano_id, proximo_km, proxima_data, componentes: comps }) => ({ plano_id, proximo_km, proxima_data, componentes: comps })),
      });
    } catch (err) {
      mostrarErros([err.message || 'Erro ao registrar a preventiva.']); botoes.forEach((b) => { b.disabled = false; });
      return;
    }
    // A preventiva já está registrada; as notas seguem uma a uma e o que falhar fica para completar na aba Corretiva.
    let salvas = 0;
    for (const n of listaNotas) {
      try {
        rotulo(`Anexando nota ${salvas + 1} de ${listaNotas.length}...`);
        const anexo = n.arquivo ? await dados.enviarAnexo(supabase, id, 'nf', n.arquivo) : null;
        const urlComprovante = n.comprovante ? await dados.enviarAnexo(supabase, id, 'comprovante', n.comprovante) : null;
        await dados.salvarNota(supabase, {
          manutencao_id: id, tipo: n.tipo, fornecedor: n.fornecedor, oficina_id: n.oficina_id, numero: n.numero, valor: n.valor, anexo_url: anexo,
          comprovante_url: urlComprovante, pago_em: urlComprovante ? dados.dataPagamentoISO(n.pago_em) : null,
        });
        salvas += 1;
      } catch (err) { avisos.push(`Nota ${n.numero || n.fornecedor}: ${err.message || 'não foi anexada'}.`); }
    }
    if (enviar && salvas > 0) {
      try { rotulo('Enviando ao GRM e ao Financeiro...'); const envio = await dados.enviarNfFinanceiro(supabase, id); semNf = Number(envio?.sem_nf || 0); }
      catch (err) { avisos.push(`Envio ao GRM e ao Financeiro: ${err.message || 'não foi enviado'}.`); }
    }
    await aoConcluir();
    if (avisos.length) {
      mostrarErros([`A preventiva foi registrada em ${veiculo.placa}, mas falta completar: ${avisos.join(' ')} Abra a manutenção na aba Corretiva para ajustar as notas e enviar.`]);
      const fechar = ov.querySelector('.fm-btn.primary'); fechar.textContent = 'Fechar'; fechar.disabled = false; fechar.dataset.acao = 'fechar';
      return;
    }
    closeModal(MODAL);
    toast(salvas
      ? `Preventiva registrada em ${veiculo.placa} com ${salvas} nota(s)${enviar ? ' enviada(s) ao GRM e ao Financeiro' : ''}.${semNf ? ` ${semNf} sem NF ainda: fica como pendência.` : ''}`
      : `Preventiva registrada em ${veiculo.placa}. O que falta (NF, comprovante) fica como pendência: abra o veículo > Registros feitos > Pagamento e NF.`, 'ok', 7000);
  }

  // ---------- eventos ----------
  ov.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-busca-servico]')) renderGrupos();
    if (t.matches('[data-pz-km]')) { const id = t.closest('[data-plano]').dataset.plano; prazos.set(id, { ...prazos.get(id), km: t.value, editouKm: t.value !== '' }); marcarOpcoesAtivas(t.closest('[data-plano]')); }
    if (t.matches('[data-pz-data]')) { const id = t.closest('[data-plano]').dataset.plano; prazos.set(id, { ...prazos.get(id), data: t.value, editouData: t.value !== '' }); marcarOpcoesAtivas(t.closest('[data-plano]')); }
    if (t.matches('[data-r="custo"]')) t.dataset.auto = t.value ? '0' : '1';
  });
  ov.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ver]')) { mostrarVerificacoes = t.checked; renderGrupos(); }
    if (t.matches('[data-comp]')) {
      const bloco = t.closest('[data-comp-plano]');
      if (bloco) compsSel.set(bloco.dataset.compPlano, new Set([...bloco.querySelectorAll('[data-comp]:checked')].map((c) => c.value)));
    }
  });
  ov.addEventListener('click', async (e) => {
    const opcao = e.target.closest('[data-pz-km-add],[data-pz-meses],[data-pz-dias]'); if (opcao) return aplicarOpcaoPrazo(opcao);
    const card = e.target.closest('[data-card]');
    if (card) { const id = card.dataset.card; if (marcados.has(id)) marcados.delete(id); else marcados.add(id); renderGrupos(); return; }
    const a = e.target.closest('[data-acao],[data-desmarcar]'); if (!a) return;
    if (a.dataset.desmarcar) { marcados.delete(a.dataset.desmarcar); renderGrupos(); return; }
    const acao = a.dataset.acao;
    if (acao === 'fechar') return closeModal(MODAL);
    if (acao === 'voltar') return passo === 1 ? closeModal(MODAL) : irPara(passo - 1);
    if (acao === 'proximo') {
      const erros = passo === 1 ? validarPasso1({ ...dadosPasso1(), itens: itensMarcados() }, hojeBrasilISO()) : validarPasso2({ ...dadosPasso1(), itens: itensMarcados() });
      mostrarErros(erros); if (!erros.length) irPara(passo + 1);
      return;
    }
    if (acao === 'salvar-simples') return salvar({ semPagamento: true });
    if (acao === 'salvar') return salvar();
    editor.tratarClique(a);
  });

  renderGrupos(); editor.renderizar(); irPara(1);
}
