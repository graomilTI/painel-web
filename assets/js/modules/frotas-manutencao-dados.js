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

// A API devolve no máximo 1.000 linhas por consulta (.limit maior é ignorado): lê em páginas de 1.000 até acabar.
// A consulta precisa de ordem estável (inclua um desempate) para as páginas não repetirem nem pularem linhas.
const PAGINA = 1000;
async function tudoPaginado(montar, padrao) {
  const linhas = [];
  for (let de = 0; de < 200000; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) falhar(error, padrao);
    linhas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return linhas;
}

// Componentes e peças do guia por categoria. Sem acesso ou sem a tabela: lista vazia (o item segue só com a descrição livre).
export async function carregarComponentes(supabase) {
  const { data, error } = await supabase.from('frotas_manutencao_componentes').select('id,grupo_codigo,categoria_codigo,plano_codigo,nome,ordem,tipo').eq('ativo', true)
    .order('categoria_codigo', { ascending: true }).order('ordem', { ascending: true }).limit(2000);
  return error ? [] : (data || []);
}

// Peças já usadas por modelo (catálogo que aprende ao aprovar). Sem acesso ou sem a tabela: lista vazia.
export async function carregarPecas(supabase) {
  const { data, error } = await supabase.from('frotas_manutencao_pecas').select('id,modelo,componente,detalhe,ultimo_valor,ultima_data,usos,observacoes,ativo').order('modelo', { ascending: true }).order('componente', { ascending: true }).limit(5000);
  return error ? [] : (data || []);
}

// Ao aprovar: as peças com marca/referência do orçamento escolhido entram no catálogo do modelo. Devolve quantas foram gravadas.
export async function aprenderPecas(supabase, manutencaoId, modelo) {
  const { data, error } = await supabase.rpc('frotas_manutencao_aprender_pecas', { p_manutencao: manutencaoId, p_modelo: modelo });
  if (error) throw new Error(error.message || 'Erro ao atualizar o catálogo de peças.');
  return Number(data || 0);
}

export async function salvarPeca(supabase, peca) {
  const { id, ...campos } = peca;
  const consulta = id ? supabase.from('frotas_manutencao_pecas').update(campos).eq('id', id) : supabase.from('frotas_manutencao_pecas').insert(campos);
  const { data, error } = await consulta.select('*').single();
  if (error) {
    if (error.code === '23505' || /uq_frotas_manut_pecas/.test(error.message || '')) throw new Error('Essa peça já está cadastrada neste modelo.');
    throw new Error(error.message || 'Erro ao salvar a peça.');
  }
  return data;
}

export async function removerPeca(supabase, id) {
  const { error } = await supabase.from('frotas_manutencao_pecas').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Erro ao remover a peça.');
}

// Grupos do guia (Suspensão, Freios, Motor...). Sem acesso ou sem a tabela: lista vazia (a tela cai nas categorias).
export async function carregarGrupos(supabase) {
  const { data, error } = await supabase.from('frotas_manutencao_grupos').select('codigo,nome,ordem,categoria_codigo').eq('ativo', true).order('ordem', { ascending: true });
  return error ? [] : (data || []);
}

// Veículos para as visões de conjunto (Painel, Veículos, Agenda): só o que elas mostram, sem os cadastros do fluxo.
export async function carregarVeiculosVisao(supabase) {
  return tudoPaginado(() => supabase.from('frotas_veiculos').select('id,placa,renavam,updated_at,marca_modelo,marca,modelo,bfleet_marca,bfleet_modelo,nome,coordenacao,supervisao,status,motorista_atual,responsavel_manutencao').order('placa', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os veículos.');
}

// Manutenções (sem itens, orçamentos e notas) para o quadro, a agenda e o prontuário.
export async function carregarManutencoesVisao(supabase) {
  return tudoPaginado(() => supabase.from('frotas_manutencoes').select('*').order('solicitado_em', { ascending: false }).order('id', { ascending: true }), 'Erro ao carregar as manutenções.');
}

// Itens (sistemas do guia) das manutenções de um veículo, para o histórico do prontuário. Sem acesso: lista vazia.
export async function carregarItensDeManutencoes(supabase, ids = []) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('frotas_manutencao_itens').select('id,manutencao_id,categoria_codigo,descricao,tipo_item').in('manutencao_id', ids.slice(0, 200)).order('created_at', { ascending: true });
  return error ? [] : (data || []);
}

export async function carregarBase(supabase) {
  const [categorias, planos, oficinas, veiculos, componentes, grupos, pecas] = await Promise.all([
    tudo(supabase.from('frotas_manutencao_categorias').select('*').order('codigo', { ascending: true }), 'Erro ao carregar as categorias.'),
    tudo(supabase.from('frotas_manutencao_planos').select('*').order('categoria_codigo', { ascending: true }), 'Erro ao carregar os planos.'),
    carregarOficinasTodas(supabase),
    tudoPaginado(() => supabase.from('frotas_veiculos').select('id,placa,renavam,updated_at,marca_modelo,marca,modelo,bfleet_marca,bfleet_modelo,nome,coordenacao,supervisao,status,motorista_atual,responsavel_manutencao').order('placa', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os veículos.'),
    carregarComponentes(supabase).catch(() => []),
    carregarGrupos(supabase).catch(() => []),
    carregarPecas(supabase).catch(() => []),
  ]);
  return { categorias, planos, oficinas, veiculos, componentes, grupos, pecas };
}

// Nomes dos colaboradores ativos, para sugerir em "Quem pediu" (texto livre com sugestão). Sem acesso: lista vazia.
export async function carregarColaboradores(supabase) {
  const nomes = new Set();
  try {
    for (let de = 0; de < 10000; de += 1000) {
      const { data, error } = await supabase.from('colaboradores_atuais').select('nome').eq('ativo', true).order('nome', { ascending: true }).range(de, de + 999);
      if (error) throw error;
      (data || []).forEach((c) => { const n = String(c.nome || '').trim(); if (n) nomes.add(n); });
      if (!data || data.length < 1000) break;
    }
  } catch { /* a escolha continua em texto livre */ }
  return [...nomes];
}

export async function carregarManutencoes(supabase) {
  const [manutencoes, itens, orcamentos, notas] = await Promise.all([
    tudoPaginado(() => supabase.from('frotas_manutencoes').select('*').order('solicitado_em', { ascending: false }).order('id', { ascending: true }), 'Erro ao carregar as manutenções.'),
    tudoPaginado(() => supabase.from('frotas_manutencao_itens').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os itens.'),
    tudoPaginado(() => supabase.from('frotas_manutencao_orcamentos').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os orçamentos.'),
    tudoPaginado(() => supabase.from('frotas_manutencao_notas').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar as notas fiscais.'),
  ]);
  return { manutencoes, itens, orcamentos, notas };
}

// Recarrega uma manutenção com itens e orçamentos (depois de uma ação, para refletir carimbos e linha do tempo).
export async function carregarUma(supabase, id) {
  const [manutencao, itens, orcamentos, notas] = await Promise.all([
    supabase.from('frotas_manutencoes').select('*').eq('id', id).maybeSingle(),
    tudo(supabase.from('frotas_manutencao_itens').select('*').eq('manutencao_id', id).order('created_at', { ascending: true }), 'Erro ao carregar os itens.'),
    tudo(supabase.from('frotas_manutencao_orcamentos').select('*').eq('manutencao_id', id).order('created_at', { ascending: true }), 'Erro ao carregar os orçamentos.'),
    tudo(supabase.from('frotas_manutencao_notas').select('*').eq('manutencao_id', id).order('created_at', { ascending: true }), 'Erro ao carregar as notas fiscais.'),
  ]);
  if (manutencao.error) falhar(manutencao.error, 'Erro ao carregar a manutenção.');
  return { manutencao: manutencao.data, itens, orcamentos, notas };
}

export async function carregarVencimentos(supabase) {
  // 1 linha por veículo e serviço do guia (200+ veículos x ~24 serviços): passa de 5.000 linhas, então vem em páginas.
  return tudoPaginado(() => supabase.from('frotas_manutencao_vencimentos_v').select('*').order('placa', { ascending: true }).order('plano_codigo', { ascending: true }).order('plano_id', { ascending: true }), 'Erro ao carregar os vencimentos.');
}

// Lista da Preventiva em UMA consulta (jsonb compacto por veículo); expandirPainel monta as linhas. Se a função não existir
// ou falhar, quem chama cai em carregarVencimentos (view paginada, bem mais lenta).
export async function carregarPainelPreventiva(supabase) {
  const { data, error } = await supabase.rpc('frotas_preventiva_painel');
  if (error) falhar(error, 'Erro ao carregar a lista da Preventiva.');
  return Array.isArray(data) ? data : [];
}

export async function carregarCategorias(supabase) {
  return tudo(supabase.from('frotas_manutencao_categorias').select('codigo,nome').order('codigo', { ascending: true }).limit(200), 'Erro ao carregar os sistemas do guia.');
}

// Serviços do guia (padrão da frota e exceções por veículo) com os intervalos, para sugerir os próximos prazos.
export async function carregarOficinas(supabase) {
  return tudoPaginado(() => supabase.from('frotas_oficinas').select('id,nome,razao_social,cnpj,pix_chave,ativo').order('nome', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar as oficinas.');
}

// Todas as oficinas com os dados completos (são milhares, importadas do GRM: a API entrega 1.000 por vez).
export async function carregarOficinasTodas(supabase) {
  return tudoPaginado(() => supabase.from('frotas_oficinas').select('*').order('nome', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar as oficinas.');
}

// Data do pagamento (yyyy-mm-dd) para o timestamp da nota; vazio = o banco usa o momento do envio.
export function dataPagamentoISO(dataISO) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dataISO || '')) ? `${dataISO}T12:00:00-03:00` : null;
}

export async function carregarPlanos(supabase) {
  return tudo(supabase.from('frotas_manutencao_planos').select('id,codigo,nome,categoria_codigo,tipo,veiculo_id,intervalo_km,intervalo_km_max,intervalo_meses,intervalo_meses_max,intervalo_dias,ativo').eq('ativo', true).order('categoria_codigo', { ascending: true }).order('id', { ascending: true }).limit(1000), 'Erro ao carregar os serviços do guia.');
}

// Registra uma preventiva já feita (manutenção concluída, sem custo e sem NF) com os próximos prazos combinados.
export async function registrarPreventiva(supabase, { veiculo_id, data, km, itens, oficina, observacoes, custo, responsavel }) {
  const { data: id, error } = await supabase.rpc('frotas_manutencao_registrar_preventiva', {
    p_veiculo: veiculo_id, p_data: data, p_km: km, p_itens: itens, p_oficina: oficina || null, p_observacoes: observacoes || null,
    p_custo: custo || 0, p_responsavel: responsavel || null,
  });
  if (error) falhar(error, 'Erro ao registrar a preventiva.');
  return id;
}

// Preventivas registradas pela aba Preventiva e o que falta em cada uma (view frotas_preventiva_pendencias_v).
// `id` = id da manutenção. Do veículo: as 10 últimas; de todos: só as que têm pendência (para o filtro da lista).
const doRegistro = (r) => ({ ...r, id: r.manutencao_id });
export async function carregarRegistrosPreventivos(supabase, veiculoId) {
  const linhas = await tudo(supabase.from('frotas_preventiva_pendencias_v').select('*').eq('veiculo_id', veiculoId)
    .order('data_execucao', { ascending: false }).order('manutencao_id', { ascending: true }).limit(10), 'Erro ao carregar os registros do veículo.');
  return linhas.map(doRegistro);
}

export async function carregarPendenciasPreventivas(supabase) {
  const linhas = await tudoPaginado(() => supabase.from('frotas_preventiva_pendencias_v').select('*').eq('pendente', true)
    .order('placa', { ascending: true }).order('data_execucao', { ascending: false }).order('manutencao_id', { ascending: true }), 'Erro ao carregar as pendências de documentos.');
  return linhas.map(doRegistro);
}

// Anexa o que chegou depois: NF/comprovante em nota ainda não enviada (update direto) ou comprovante em nota já enviada
// (RPC que baixa o pagamento no Financeiro).
export async function atualizarNota(supabase, id, campos) {
  const { error } = await supabase.from('frotas_manutencao_notas').update(campos).eq('id', id);
  if (error) falhar(error, 'Erro ao atualizar a nota.');
}

export async function comprovanteTardio(supabase, notaId, url, pagoEm) {
  const { data, error } = await supabase.rpc('frotas_manutencao_nota_comprovante', { p_nota: notaId, p_url: url, p_pago_em: pagoEm || null });
  if (error) falhar(error, 'Erro ao anexar o comprovante.');
  return data;
}

// Dispensa as pendências de documento (o que nunca terá NF ou comprovante).
export async function dispensarPendencias(supabase, manutencaoId) {
  await atualizarManutencao(supabase, manutencaoId, { pendencia_dispensada_em: new Date().toISOString() });
}

export async function kmAtualDoVeiculo(supabase, veiculoId) {
  const { data, error } = await supabase.rpc('frotas_veiculo_km_atual', { p_veiculo: veiculoId });
  if (error) return null;
  return data == null ? null : Number(data);
}

export async function salvarNota(supabase, nota) {
  const { data, error } = await supabase.from('frotas_manutencao_notas').insert(nota).select('*').single();
  if (error) falhar(error, 'Erro ao salvar a nota fiscal.');
  return data;
}

export async function removerNota(supabase, id) {
  const { error } = await supabase.from('frotas_manutencao_notas').delete().eq('id', id);
  if (error) falhar(error, 'Erro ao remover a nota fiscal.');
}

// NF para o agente do GRM e pagamento para o Financeiro (só manutenção concluída, paga pela empresa, com NF e custo).
export async function enviarNfFinanceiro(supabase, manutencaoId) {
  const { data, error } = await supabase.rpc('frotas_manutencao_enviar_nf_financeiro', { p_manutencao: manutencaoId });
  if (error) falhar(error, 'Erro ao enviar a nota fiscal e o pagamento.');
  return data;
}

// Notas para lançamento: a NF vai para o painel de Notas Fiscais (o agente lança no GRM). Só quando o usuário diz que todas as NFs
// e comprovantes estão anexados.
export async function enviarLancamentoNf(supabase, manutencaoId) {
  const { data, error } = await supabase.rpc('frotas_manutencao_enviar_lancamento', { p_manutencao: manutencaoId });
  if (error) falhar(error, 'Erro ao enviar as notas para lançamento.');
  return data;
}

// Notas para o Financeiro pagar. `pagamentos`: [{ nota_id, forma: 'PIX'|'BOLETO'|'LINK', dados, vencimento, contato }].
export async function enviarFinanceiroNf(supabase, manutencaoId, pagamentos) {
  const { data, error } = await supabase.rpc('frotas_manutencao_enviar_financeiro', { p_manutencao: manutencaoId, p_pagamentos: pagamentos });
  if (error) falhar(error, 'Erro ao enviar as notas ao Financeiro.');
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
export async function solicitar(supabase, { veiculo_id, descricao, prioridade, origem, checklist_id, veiculo_parado, itens, solicitante_nome }) {
  const { data, error } = await supabase.rpc('frotas_manutencao_solicitar', {
    p_veiculo_id: veiculo_id,
    p_descricao: descricao,
    p_prioridade: prioridade || 'normal',
    p_origem: origem || 'manual',
    p_checklist_id: checklist_id || null,
    p_veiculo_parado: !!veiculo_parado,
    p_itens: itens || [],
    p_solicitante_nome: solicitante_nome || null,
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
// Sem upsert: o bucket não tem política de leitura (SELECT) para quem está logado, e o upsert a exige ("new row violates row-level security policy"). O nome já é único (data/hora).
export async function enviarAnexo(supabase, manutencaoId, tipo, arquivo) {
  if (!arquivo) return null;
  if (!arquivo.size) throw new Error('O arquivo está vazio.');
  const limpo = String(arquivo.name || 'anexo').replace(/[^\w.\-]+/g, '_');
  const caminho = `frotas-manutencao/${manutencaoId}/${tipo}/${Date.now()}-${limpo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { upsert: false });
  if (error) falhar(error, 'Erro ao enviar o anexo.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  return data?.publicUrl || null;
}
