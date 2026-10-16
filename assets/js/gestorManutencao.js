// App do Gestor › Patrimônio › Manutenção de veículo: o gestor pede manutenção de um veículo da sua regional.
// A solicitação entra no fluxo de Frotas (orçamento, aprovação, OS) pela RPC frotas_manutencao_solicitar, que confere
// a supervisão do veículo. O gestor não lê a tabela de manutenções: aqui só se envia o pedido.

const semAcento = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Marca/modelo para exibir quando o campo do cadastro vem vazio (mesma ideia de rotuloVeiculo em frotas-manutencao-regras.js).
export function modeloDoVeiculo(v) {
  const t = (x) => String(x ?? '').trim();
  if (t(v.marca_modelo)) return t(v.marca_modelo);
  return [t(v.marca) || t(v.bfleet_marca), t(v.modelo) || t(v.bfleet_modelo)].filter(Boolean).join('/').toUpperCase();
}

const PRIORIDADES = [['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente'], ['baixa', 'Baixa']];

export function veiculosDaRegional(veiculos, { isMaster, supervisoes }) {
  const ativos = veiculos.filter((v) => ['ATIVO', 'MANUTENCAO'].includes(String(v.status || '').toUpperCase()));
  if (isMaster) return ativos;
  const liberadas = new Set((supervisoes || []).map(semAcento).filter(Boolean));
  return ativos.filter((v) => liberadas.has(semAcento(v.supervisao)));
}

export async function renderSolicitarManutencao(main, { supabase, state, escapeHtml, onBack }) {
  main.innerHTML = '<div class="section-card"><p class="help">Carregando veículos...</p></div>';
  const [veic, cats] = await Promise.all([
    supabase.from('frotas_veiculos').select('id,placa,marca_modelo,marca,modelo,bfleet_marca,bfleet_modelo,supervisao,status,motorista_atual').order('placa', { ascending: true }),
    supabase.from('frotas_manutencao_categorias').select('codigo,nome').eq('ativo', true).order('codigo', { ascending: true }),
  ]);
  const veiculos = veiculosDaRegional(veic.data || [], { isMaster: state.isMaster, supervisoes: state.allowedSupervisoes });
  const categorias = cats.data || [];

  main.innerHTML = `
    <section class="hero-card pat-header">
      <button class="btn secondary" data-man-back type="button">← Voltar</button>
      <h1>Manutenção de veículo</h1>
      <p>Peça a manutenção de um veículo da sua regional. A equipe de Frotas pede o orçamento e acompanha a aprovação.</p>
    </section>
    <section class="section-card">
      ${veic.error ? `<p class="help error-text">Erro ao carregar os veículos: ${escapeHtml(veic.error.message)}</p>` : !veiculos.length ? '<p class="help">Nenhum veículo ativo encontrado para a sua regional.</p>' : `
      <form id="manSolicitarForm">
        <div class="field"><label>Veículo</label><select id="manVeiculo" required><option value="">Selecione...</option>${veiculos.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.placa)} · ${escapeHtml(modeloDoVeiculo(v))}${v.motorista_atual ? ` · ${escapeHtml(v.motorista_atual)}` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>O que está acontecendo?</label><textarea id="manDescricao" rows="4" required placeholder="Ex.: barulho ao frear, luz do painel acesa, revisão..."></textarea></div>
        <div class="field"><label>Sistema do veículo (opcional)</label><select id="manCategoria"><option value="">Não sei / vários</option>${categorias.map((c) => `<option value="${c.codigo}">${String(c.codigo).padStart(2, '0')} · ${escapeHtml(c.nome)}</option>`).join('')}</select></div>
        <div class="field"><label>Prioridade</label><select id="manPrioridade">${PRIORIDADES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="manParado"> <span>Veículo parado (não pode rodar)</span></label>
        <div class="help warn" id="manFeedback"></div>
        <button class="btn" type="submit" id="manEnviar">Enviar solicitação</button>
      </form>`}
    </section>`;

  main.querySelector('[data-man-back]')?.addEventListener('click', onBack);
  const form = main.querySelector('#manSolicitarForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = main.querySelector('#manFeedback');
    const botao = main.querySelector('#manEnviar');
    const descricao = main.querySelector('#manDescricao').value.trim();
    const categoria = main.querySelector('#manCategoria').value;
    feedback.textContent = '';
    botao.disabled = true; botao.textContent = 'Enviando...';
    const { error } = await supabase.rpc('frotas_manutencao_solicitar', {
      p_veiculo_id: main.querySelector('#manVeiculo').value,
      p_descricao: descricao,
      p_prioridade: main.querySelector('#manPrioridade').value,
      p_origem: 'manual',
      p_checklist_id: null,
      p_veiculo_parado: main.querySelector('#manParado').checked,
      p_itens: categoria ? [{ categoria_codigo: Number(categoria), descricao }] : [],
    });
    botao.disabled = false; botao.textContent = 'Enviar solicitação';
    if (error) { feedback.textContent = error.message || 'Não foi possível enviar a solicitação.'; return; }
    form.reset();
    feedback.textContent = 'Solicitação enviada para a equipe de Frotas.';
  });
}
