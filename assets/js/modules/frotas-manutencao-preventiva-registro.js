// Frotas · Manutenção › Preventiva › "+ Registrar": assistente em 3 passos para lançar o que foi feito em um veículo.
//   1. O que foi feito (data, km, oficina e os serviços, agrupados por sistema com busca)
//   2. Próximos prazos (km e data sugeridos pelo intervalo do guia, editáveis)
//   3. Pagamento e NF (opcional: quem paga, custo, notas com comprovante, envio ao GRM e Financeiro)
// Grava pela RPC frotas_manutencao_registrar_preventiva; as notas são anexadas em seguida, uma a uma.
import { closeModal, dataBR, esc, openModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261016-frotas-manut17';
import { RESPONSAVEIS, STATUS_VENCIMENTO, TIPOS_NOTA, descreverIntervalo, norm, numeroOuNulo, somaNotas, validarNota } from './frotas-manutencao-regras.js?v=20261016-frotas-manut17';
import { htmlEntradaNota } from './frotas-manutencao-html.js?v=20261016-frotas-manut17';
import {
  agruparPorSistema, hojeBrasilISO, proximoPrazo, validarPasso1, validarPasso2, validarPasso3,
} from './frotas-manutencao-preventiva-regras.js?v=20261016-frotas-manut17';

const MODAL = 'fmPreventiva';
const PASSOS = ['O que foi feito', 'Próximos prazos', 'Pagamento e NF'];
const fmtKm = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`);
const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// veiculo: item de montarLista (com todos os serviços); planos: Map(id → plano do guia); planoInicial: plano_id já marcado.
export async function abrirRegistro({ supabase, veiculo, planos, planoInicial = null, aoConcluir = async () => {} }) {
  // Oficinas (sugestão de quem emitiu a nota) e quem paga a manutenção deste veículo; sem acesso, segue em branco.
  const [oficinas, veic] = await Promise.all([
    dados.carregarOficinas(supabase).catch(() => []),
    supabase.from('frotas_veiculos').select('responsavel_manutencao').eq('id', veiculo.veiculo_id).maybeSingle().then((r) => r.data).catch(() => null),
  ]);
  const responsavelPadrao = veic?.responsavel_manutencao || '';
  const servicos = veiculo.servicos;
  const porId = new Map(servicos.map((s) => [s.plano_id, s]));
  const marcados = new Set(planoInicial && porId.has(planoInicial) ? [planoInicial] : []);
  const prazos = new Map(); // plano_id → { km, data, editouKm, editouData }
  const notas = [];
  let passo = 1;
  let mostrarVerificacoes = !!(planoInicial && porId.get(planoInicial)?.tipo === 'verificacao');

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
        <div class="fm-prev-grupos" data-grupos></div></section>
      <section data-passo="2" hidden><div class="fm-mm" style="margin-bottom:8px">Próximo km e próxima data já vêm do intervalo do guia; ajuste se o combinado for outro. Deixe em branco o que não tem prazo.</div><div class="fm-prev-lista" data-prazos></div></section>
      <section data-passo="3" hidden>
        <div class="fm-mm" style="margin-bottom:8px">Opcional: dá para completar depois na aba Corretiva. Anexe a NF ou NFS-e de cada nota (peças, serviço) e, se já foi pago, o comprovante: com comprovante o pagamento entra no Financeiro já como pago; a NF vai para o lançamento no GRM.</div>
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
  const dadosPasso1 = () => ({ data: campo('data').value, km: campo('km').value === '' ? null : Number(campo('km').value) });
  const itensMarcados = () => [...marcados].map((id) => {
    const p = prazos.get(id) || {};
    return { plano_id: id, nome: porId.get(id)?.plano_nome || '', proximo_km: p.km === '' || p.km == null ? null : Number(p.km), proxima_data: p.data || null };
  });

  // ---------- passo 1: serviços por sistema ----------
  function renderGrupos() {
    const termo = norm(ov.querySelector('[data-busca-servico]').value);
    const visiveis = servicos.filter((s) => (mostrarVerificacoes || s.tipo === 'servico' || marcados.has(s.plano_id)) && (!termo || norm(s.plano_nome).includes(termo)));
    const grupos = agruparPorSistema(visiveis);
    ov.querySelector('[data-grupos]').innerHTML = grupos.length ? grupos.map((g) => {
      const qtdMarcados = g.itens.filter((i) => marcados.has(i.plano_id)).length;
      const aberto = termo || qtdMarcados || g.atencao;
      return `<details class="fm-prev-grupo"${aberto ? ' open' : ''} data-grupo="${g.categoria_codigo}"><summary><span>${String(g.categoria_codigo).padStart(2, '0')} · ${esc(g.categoria_nome)}</span>${qtdMarcados ? `<span class="fm-badge green">${qtdMarcados} marcado(s)</span>` : ''}${g.atencao ? `<span class="fm-badge ${g.vencida ? 'red' : 'amber'}">${g.vencida + g.proxima} a vencer</span>` : ''}</summary>
        ${g.itens.map((s) => { const st = STATUS_VENCIMENTO[s.status] || { label: s.status, tone: 'blue' };
          return `<label class="fm-prev-item"><input type="checkbox" data-sv="${esc(s.plano_id)}"${marcados.has(s.plano_id) ? ' checked' : ''}> <span>${esc(s.plano_nome)}</span><small>${esc(descreverIntervalo(planos.get(s.plano_id) || {}) || '')}${s.tipo === 'verificacao' ? ' · verificação' : ''}</small><span class="fm-badge ${st.tone}">${esc(st.label)}</span></label>`; }).join('')}</details>`;
    }).join('') : '<div class="fm-empty">Nenhum serviço encontrado.</div>';
    ov.querySelector('[data-marcados]').innerHTML = marcados.size
      ? `<span class="fm-mm">Marcados:</span> ${[...marcados].map((id) => `<span class="fm-chip-x">${esc(porId.get(id)?.plano_nome || '')}<button type="button" data-desmarcar="${esc(id)}" aria-label="Desmarcar">✕</button></span>`).join('')}`
      : '<span class="fm-mm">Nenhum serviço marcado ainda.</span>';
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
      return `<div class="fm-prev-linha" data-plano="${esc(s.plano_id)}"><div class="fm-check"><span>${esc(s.plano_nome)}</span><small>${esc(descreverIntervalo(planos.get(s.plano_id) || {}) || '')}</small></div>
        <div class="fm-prev-prazos"><label>Próximo km<input class="fm-input" type="number" min="1" step="1" data-pz-km value="${esc(vKm)}" placeholder="—"></label>
        <label>Próxima data<input class="fm-input" type="date" data-pz-data value="${esc(vData)}"></label></div></div>`;
    }).join('') || '<div class="fm-empty">Nenhum serviço marcado.</div>';
  }

  // ---------- passo 3: notas ----------
  function renderNotas() {
    ov.querySelector('[data-notas-lista]').innerHTML = notas.map((n, i) => `<div class="fm-nota-linha fm-nota-item">
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
    let id = null; const avisos = [];
    try {
      id = await dados.registrarPreventiva(supabase, {
        veiculo_id: veiculo.veiculo_id, data: registro.data, km: registro.km, oficina: campo('oficina').value.trim(), observacoes: campo('obs').value.trim(),
        responsavel: registro.responsavel, custo: registro.custo,
        itens: registro.itens.map(({ plano_id, proximo_km, proxima_data }) => ({ plano_id, proximo_km, proxima_data })),
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
        const anexo = await dados.enviarAnexo(supabase, id, 'nf', n.arquivo);
        const urlComprovante = n.comprovante ? await dados.enviarAnexo(supabase, id, 'comprovante', n.comprovante) : null;
        await dados.salvarNota(supabase, {
          manutencao_id: id, tipo: n.tipo, fornecedor: n.fornecedor, oficina_id: n.oficina_id, numero: n.numero, valor: n.valor, anexo_url: anexo,
          comprovante_url: urlComprovante, pago_em: urlComprovante ? dados.dataPagamentoISO(n.pago_em) : null,
        });
        salvas += 1;
      } catch (err) { avisos.push(`Nota ${n.numero || n.fornecedor}: ${err.message || 'não foi anexada'}.`); }
    }
    if (enviar && salvas > 0) {
      try { rotulo('Enviando ao GRM e ao Financeiro...'); await dados.enviarNfFinanceiro(supabase, id); }
      catch (err) { avisos.push(`Envio ao GRM e ao Financeiro: ${err.message || 'não foi enviado'}.`); }
    }
    await aoConcluir();
    if (avisos.length) {
      mostrarErros([`A preventiva foi registrada em ${veiculo.placa}, mas falta completar: ${avisos.join(' ')} Abra a manutenção na aba Corretiva para ajustar as notas e enviar.`]);
      const fechar = ov.querySelector('.fm-btn.primary'); fechar.textContent = 'Fechar'; fechar.disabled = false; fechar.dataset.acao = 'fechar';
      return;
    }
    closeModal(MODAL);
    toast(`Preventiva registrada em ${veiculo.placa}${salvas ? ` com ${salvas} nota(s)${enviar ? ' enviada(s) ao GRM e ao Financeiro' : ''}` : ''}.`);
  }

  // ---------- eventos ----------
  ov.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-busca-servico]')) renderGrupos();
    if (t.matches('[data-pz-km]')) { const id = t.closest('[data-plano]').dataset.plano; prazos.set(id, { ...prazos.get(id), km: t.value, editouKm: t.value !== '' }); }
    if (t.matches('[data-pz-data]')) { const id = t.closest('[data-plano]').dataset.plano; prazos.set(id, { ...prazos.get(id), data: t.value, editouData: t.value !== '' }); }
    if (t.matches('[data-r="custo"]')) t.dataset.auto = t.value ? '0' : '1';
  });
  ov.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-sv]')) { if (t.checked) marcados.add(t.dataset.sv); else marcados.delete(t.dataset.sv); renderGrupos(); }
    if (t.matches('[data-ver]')) { mostrarVerificacoes = t.checked; renderGrupos(); }
  });
  ov.addEventListener('click', async (e) => {
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
    if (acao === 'nota-remover') { notas.splice(Number(a.dataset.idx), 1); renderNotas(); return; }
    if (acao === 'nota-add') {
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
      renderNotas();
    }
  });

  renderGrupos(); renderNotas(); irPara(1);
}
