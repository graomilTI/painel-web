// Frotas · Manutenção: acesso ao Supabase. Consultas simples (sem embed) para a tela juntar no cliente.
// Erros do banco (regras do trigger de fluxo) chegam com mensagem em português e são repassados como Error.

const BUCKET = 'notas-fiscais';

function falhar(error, padrao) {
  throw new Error(error?.message || padrao);
}

async function tudo(consulta, padrao) {
  const { data, error } = await consulta;
  if (error) falhar(error, padrao);
  return data || [];
}

export async function carregarBase(supabase) {
  const [categorias, planos, oficinas, veiculos] = await Promise.all([
    tudo(supabase.from('frotas_manutencao_categorias').select('*').order('codigo', { ascending: true }), 'Erro ao carregar as categorias.'),
    tudo(supabase.from('frotas_manutencao_planos').select('*').order('categoria_codigo', { ascending: true }), 'Erro ao carregar os planos.'),
    tudo(supabase.from('frotas_oficinas').select('*').order('nome', { ascending: true }), 'Erro ao carregar as oficinas.'),
    tudo(supabase.from('frotas_veiculos').select('id,placa,marca_modelo,coordenacao,supervisao,status,motorista_atual,responsavel_manutencao').order('placa', { ascending: true }), 'Erro ao carregar os veículos.'),
  ]);
  return { categorias, planos, oficinas, veiculos };
}

export async function carregarManutencoes(supabase) {
  const [manutencoes, itens, orcamentos] = await Promise.all([
    tudo(supabase.from('frotas_manutencoes').select('*').order('solicitado_em', { ascending: false }).limit(2000), 'Erro ao carregar as manutenções.'),
    tudo(supabase.from('frotas_manutencao_itens').select('*').order('created_at', { ascending: true }).limit(10000), 'Erro ao carregar os itens.'),
    tudo(supabase.from('frotas_manutencao_orcamentos').select('*').order('created_at', { ascending: true }).limit(10000), 'Erro ao carregar os orçamentos.'),
  ]);
  return { manutencoes, itens, orcamentos };
}

// Recarrega uma manutenção com itens e orçamentos (depois de uma ação, para refletir carimbos e linha do tempo).
export async function carregarUma(supabase, id) {
  const [manutencao, itens, orcamentos] = await Promise.all([
    supabase.from('frotas_manutencoes').select('*').eq('id', id).maybeSingle(),
    tudo(supabase.from('frotas_manutencao_itens').select('*').eq('manutencao_id', id).order('created_at', { ascending: true }), 'Erro ao carregar os itens.'),
    tudo(supabase.from('frotas_manutencao_orcamentos').select('*').eq('manutencao_id', id).order('created_at', { ascending: true }), 'Erro ao carregar os orçamentos.'),
  ]);
  if (manutencao.error) falhar(manutencao.error, 'Erro ao carregar a manutenção.');
  return { manutencao: manutencao.data, itens, orcamentos };
}

export async function carregarVencimentos(supabase) {
  return tudo(supabase.from('frotas_manutencao_vencimentos_v').select('*').limit(20000), 'Erro ao carregar os vencimentos.');
}

export async function kmAtualDoVeiculo(supabase, veiculoId) {
  const { data, error } = await supabase.rpc('frotas_veiculo_km_atual', { p_veiculo: veiculoId });
  if (error) return null;
  return data == null ? null : Number(data);
}

// NF para o agente do GRM e pagamento para o Financeiro (só manutenção concluída, paga pela empresa, com NF e custo).
export async function enviarNfFinanceiro(supabase, manutencaoId) {
  const { data, error } = await supabase.rpc('frotas_manutencao_enviar_nf_financeiro', { p_manutencao: manutencaoId });
  if (error) falhar(error, 'Erro ao enviar a nota fiscal e o pagamento.');
  return data;
}

// Situação da NF no GRM e do pagamento. Sem acesso ou sem envio: null.
export async function statusNfFinanceiro(supabase, manutencaoId) {
  const { data, error } = await supabase.rpc('frotas_manutencao_nf_status', { p_manutencao: manutencaoId });
  return error ? null : data;
}

// Programação que já usa o veículo desta manutenção (de hoje até a previsão de entrega). Sem acesso: lista vazia.
export async function programacoesAfetadas(supabase, manutencaoId) {
  const { data, error } = await supabase.rpc('frotas_manutencao_programacoes_afetadas', { p_manutencao: manutencaoId });
  return error ? [] : (data || []);
}

// Abre a solicitação pela RPC (vale para quem tem o módulo e para o gestor da supervisão do veículo).
export async function solicitar(supabase, { veiculo_id, descricao, prioridade, origem, checklist_id, veiculo_parado, itens }) {
  const { data, error } = await supabase.rpc('frotas_manutencao_solicitar', {
    p_veiculo_id: veiculo_id,
    p_descricao: descricao,
    p_prioridade: prioridade || 'normal',
    p_origem: origem || 'manual',
    p_checklist_id: checklist_id || null,
    p_veiculo_parado: !!veiculo_parado,
    p_itens: itens || [],
  });
  if (error) falhar(error, 'Erro ao abrir a solicitação.');
  return data;
}

export async function atualizarManutencao(supabase, id, campos) {
  const { data, error } = await supabase.from('frotas_manutencoes').update(campos).eq('id', id).select('*').single();
  if (error) falhar(error, 'Erro ao salvar a manutenção.');
  return data;
}

// Troca de etapa: o trigger valida, carimba e escreve a linha do tempo.
export async function mudarStatus(supabase, id, para, extras = {}) {
  return atualizarManutencao(supabase, id, { status: para, ...extras });
}

export async function salvarItem(supabase, item) {
  const { id, ...campos } = item;
  const consulta = id
    ? supabase.from('frotas_manutencao_itens').update(campos).eq('id', id)
    : supabase.from('frotas_manutencao_itens').insert(campos);
  const { data, error } = await consulta.select('*').single();
  if (error) falhar(error, 'Erro ao salvar o item.');
  return data;
}

export async function removerItem(supabase, id) {
  const { error } = await supabase.from('frotas_manutencao_itens').delete().eq('id', id);
  if (error) falhar(error, 'Erro ao remover o item.');
}

export async function salvarOrcamento(supabase, orcamento) {
  const { id, ...campos } = orcamento;
  const consulta = id
    ? supabase.from('frotas_manutencao_orcamentos').update(campos).eq('id', id)
    : supabase.from('frotas_manutencao_orcamentos').insert(campos);
  const { data, error } = await consulta.select('*').single();
  if (error) falhar(error, 'Erro ao salvar o orçamento.');
  return data;
}

export async function removerOrcamento(supabase, id) {
  const { error } = await supabase.from('frotas_manutencao_orcamentos').delete().eq('id', id);
  if (error) falhar(error, 'Erro ao remover o orçamento.');
}

// O trigger desmarca os outros orçamentos da mesma manutenção.
export async function escolherOrcamento(supabase, id) {
  const { data, error } = await supabase.from('frotas_manutencao_orcamentos').update({ selecionado: true }).eq('id', id).select('*').single();
  if (error) falhar(error, 'Erro ao escolher o orçamento.');
  return data;
}

export async function salvarOficina(supabase, oficina) {
  const { id, ...campos } = oficina;
  const consulta = id
    ? supabase.from('frotas_oficinas').update(campos).eq('id', id)
    : supabase.from('frotas_oficinas').insert(campos);
  const { data, error } = await consulta.select('*').single();
  if (error) {
    if (error.code === '23505' || /uq_frotas_oficinas_cnpj/.test(error.message || '')) throw new Error('Já existe uma oficina com este CNPJ/CPF.');
    if (/frotas_oficinas_cnpj_formato/.test(error.message || '')) throw new Error('CNPJ deve ter 14 dígitos (ou CPF com 11).');
    falhar(error, 'Erro ao salvar a oficina.');
  }
  return data;
}

// Anexos de orçamento e nota fiscal. O bucket é o mesmo das notas fiscais (hoje público: não colocar dados sensíveis no arquivo).
export async function enviarAnexo(supabase, manutencaoId, tipo, arquivo) {
  if (!arquivo) return null;
  if (!arquivo.size) throw new Error('O arquivo está vazio.');
  const limpo = String(arquivo.name || 'anexo').replace(/[^\w.\-]+/g, '_');
  const caminho = `frotas-manutencao/${manutencaoId}/${tipo}/${Date.now()}-${limpo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { upsert: true });
  if (error) falhar(error, 'Erro ao enviar o anexo.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  return data?.publicUrl || null;
}
