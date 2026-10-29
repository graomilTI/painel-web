// Frotas · Sinistros: acesso ao Supabase. Consultas simples (sem embed): a tela junta no cliente.
// Erros do banco (regras do trigger de etapa) chegam em português e são repassados como Error.

const BUCKET = 'frotas-sinistros';
const LIMITE_BYTES = 25 * 1024 * 1024;

function falhar(error, padrao) {
  throw new Error(error?.message || padrao);
}

// A API devolve no máximo 1.000 linhas por consulta: lê em páginas até acabar (a consulta precisa de ordem estável).
const PAGINA = 1000;
async function tudoPaginado(montar, padrao) {
  const linhas = [];
  for (let de = 0; de < 100000; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) falhar(error, padrao);
    linhas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return linhas;
}

const ordem = (consulta) => consulta.order('created_at', { ascending: false }).order('id', { ascending: true });

export async function carregarTudo(supabase) {
  const [sinistros, terceiros, marcas, anexos, modelo] = await Promise.all([
    tudoPaginado(() => ordem(supabase.from('frotas_sinistros').select('*')), 'Erro ao carregar os sinistros.'),
    tudoPaginado(() => supabase.from('frotas_sinistro_terceiros').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os terceiros.'),
    tudoPaginado(() => supabase.from('frotas_sinistro_marcas').select('*').order('em', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar o checklist.'),
    tudoPaginado(() => supabase.from('frotas_sinistro_anexos').select('*').order('criado_em', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os anexos.'),
    supabase.from('frotas_sinistro_checklist_modelo').select('*').eq('ativo', true).order('ordem', { ascending: true }),
  ]);
  if (modelo.error) falhar(modelo.error, 'Erro ao carregar o modelo do checklist.');
  return { sinistros, terceiros, marcas, anexos, modelo: modelo.data || [] };
}

// Recarrega o que pertence a UM sinistro (depois de gravar), sem baixar a lista toda de novo.
export async function carregarUm(supabase, id) {
  const [s, terceiros, marcas, anexos] = await Promise.all([
    supabase.from('frotas_sinistros').select('*').eq('id', id).maybeSingle(),
    supabase.from('frotas_sinistro_terceiros').select('*').eq('sinistro_id', id).order('created_at', { ascending: true }),
    supabase.from('frotas_sinistro_marcas').select('*').eq('sinistro_id', id).order('em', { ascending: true }),
    supabase.from('frotas_sinistro_anexos').select('*').eq('sinistro_id', id).order('criado_em', { ascending: true }),
  ]);
  for (const r of [s, terceiros, marcas, anexos]) if (r.error) falhar(r.error, 'Erro ao recarregar o sinistro.');
  return { sinistro: s.data, terceiros: terceiros.data || [], marcas: marcas.data || [], anexos: anexos.data || [] };
}

export async function carregarHistorico(supabase, id) {
  const { data, error } = await supabase.from('frotas_sinistro_historico').select('*').eq('sinistro_id', id)
    .order('criado_em', { ascending: false }).order('id', { ascending: true });
  if (error) falhar(error, 'Erro ao carregar o acompanhamento.');
  return data || [];
}

export async function carregarVeiculos(supabase) {
  return tudoPaginado(() => supabase.from('frotas_veiculos')
    .select('id,placa,marca_modelo,marca,modelo,coordenacao,supervisao,status,motorista_atual,apolice_seguro,seguro_vencimento')
    .order('placa', { ascending: true }).order('id', { ascending: true }), 'Erro ao carregar os veículos.');
}

// Nomes dos colaboradores ativos para sugerir o condutor (texto livre com sugestão). Sem acesso: lista vazia.
export async function carregarColaboradores(supabase) {
  const nomes = new Set();
  try {
    for (let de = 0; de < 10000; de += 1000) {
      const { data, error } = await supabase.from('colaboradores_atuais').select('nome').eq('ativo', true).order('nome', { ascending: true }).range(de, de + 999);
      if (error) throw error;
      (data || []).forEach((c) => { const n = String(c.nome || '').trim(); if (n) nomes.add(n); });
      if (!data || data.length < 1000) break;
    }
  } catch { /* o campo continua em texto livre */ }
  return [...nomes];
}

export async function criarSinistro(supabase, campos) {
  const { data, error } = await supabase.from('frotas_sinistros').insert(campos).select('*').single();
  if (error) falhar(error, 'Erro ao registrar o sinistro.');
  return data;
}

export async function atualizarSinistro(supabase, id, campos) {
  const { data, error } = await supabase.from('frotas_sinistros').update(campos).eq('id', id).select('*').single();
  if (error) falhar(error, 'Erro ao salvar o sinistro.');
  return data;
}

// O trigger valida (cancelar exige motivo), carimba a data e escreve a linha do tempo.
export const mudarEtapa = (supabase, id, etapa, extras = {}) => atualizarSinistro(supabase, id, { etapa, ...extras });

export async function salvarTerceiro(supabase, terceiro) {
  const { id, ...campos } = terceiro;
  const consulta = id ? supabase.from('frotas_sinistro_terceiros').update(campos).eq('id', id) : supabase.from('frotas_sinistro_terceiros').insert(campos);
  const { data, error } = await consulta.select('*').single();
  if (error) falhar(error, 'Erro ao salvar o terceiro.');
  return data;
}

export async function removerTerceiro(supabase, id) {
  // Os arquivos do terceiro saem do bucket junto (as linhas de anexo e de checklist caem em cascata no banco).
  const { data: anexos } = await supabase.from('frotas_sinistro_anexos').select('storage_path').eq('terceiro_id', id);
  const { error } = await supabase.from('frotas_sinistro_terceiros').delete().eq('id', id);
  if (error) falhar(error, 'Erro ao remover o terceiro.');
  const caminhos = (anexos || []).map((a) => a.storage_path).filter(Boolean);
  if (caminhos.length) await supabase.storage.from(BUCKET).remove(caminhos).catch(() => {});
}

// Conferir à mão ('ok') ou dispensar um item; status null desfaz a marca.
export async function marcarItem(supabase, { sinistro_id, terceiro_id = null, codigo, status, por_nome = null }) {
  let apagar = supabase.from('frotas_sinistro_marcas').delete().eq('sinistro_id', sinistro_id).eq('codigo', codigo);
  apagar = terceiro_id ? apagar.eq('terceiro_id', terceiro_id) : apagar.is('terceiro_id', null);
  const { error: e1 } = await apagar;
  if (e1) falhar(e1, 'Erro ao atualizar o item.');
  if (!status) return;
  const { error } = await supabase.from('frotas_sinistro_marcas').insert({ sinistro_id, terceiro_id, codigo, status, por_nome });
  if (error) falhar(error, 'Erro ao atualizar o item.');
}

// Arquivo do sinistro (bucket privado). Sem upsert: o nome já é único (data/hora) e o bucket não tem política para sobrescrever.
export async function enviarAnexo(supabase, { sinistro_id, terceiro_id = null, item_codigo = null, arquivo, por_nome = null }) {
  if (!arquivo) return null;
  if (!arquivo.size) throw new Error(`O arquivo "${arquivo.name}" está vazio.`);
  if (arquivo.size > LIMITE_BYTES) throw new Error(`O arquivo "${arquivo.name}" passa de 25 MB.`);
  const limpo = String(arquivo.name || 'anexo').replace(/[^\w.\-]+/g, '_');
  const caminho = `${sinistro_id}/${terceiro_id || 'empresa'}/${item_codigo || 'outros'}/${Date.now()}-${limpo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined });
  if (error) falhar(error, 'Erro ao enviar o arquivo.');
  const { data, error: e2 } = await supabase.from('frotas_sinistro_anexos').insert({
    sinistro_id, terceiro_id, item_codigo, storage_bucket: BUCKET, storage_path: caminho,
    nome_arquivo: arquivo.name, mime_type: arquivo.type || null, tamanho_bytes: arquivo.size, criado_por_nome: por_nome,
  }).select('*').single();
  if (e2) {
    await supabase.storage.from(BUCKET).remove([caminho]).catch(() => {});
    falhar(e2, 'Erro ao registrar o arquivo.');
  }
  return data;
}

export async function removerAnexo(supabase, anexo) {
  const { error } = await supabase.from('frotas_sinistro_anexos').delete().eq('id', anexo.id);
  if (error) falhar(error, 'Erro ao remover o arquivo.');
  await supabase.storage.from(anexo.storage_bucket || BUCKET).remove([anexo.storage_path]).catch(() => {});
}

export async function urlAnexo(supabase, anexo, baixar = false) {
  const { data, error } = await supabase.storage.from(anexo.storage_bucket || BUCKET)
    .createSignedUrl(anexo.storage_path, 3600, baixar ? { download: anexo.nome_arquivo || true } : undefined);
  if (error) falhar(error, 'Erro ao abrir o arquivo.');
  return data.signedUrl;
}

export async function adicionarNota(supabase, { sinistro_id, texto, por_nome = null }) {
  const { error } = await supabase.from('frotas_sinistro_historico').insert({ sinistro_id, tipo: 'nota', texto, por_nome });
  if (error) falhar(error, 'Erro ao salvar a atualização.');
}

// ── Drive ──────────────────────────────────────────────────────────────────
// Arquivo guardado no painel -> Blob, para reenviar ao Drive (envio que falhou antes ou arquivo anexado antes do Drive existir).
export async function baixarAnexo(supabase, anexo) {
  const { data, error } = await supabase.storage.from(anexo.storage_bucket || BUCKET).download(anexo.storage_path);
  if (error) falhar(error, 'Erro ao ler o arquivo guardado no painel.');
  return data;
}

export async function registrarDriveAnexo(supabase, anexoId, info) {
  const { error } = await supabase.from('frotas_sinistro_anexos').update({
    drive_file_id: info.fileId, drive_url: info.fileUrl || null, drive_enviado_em: new Date().toISOString(),
  }).eq('id', anexoId);
  if (error) falhar(error, 'O arquivo foi para o Drive, mas não foi possível registrar isso no painel.');
}

export async function registrarPastaDrive(supabase, sinistroId, info) {
  const { error } = await supabase.from('frotas_sinistros').update({
    drive_pasta_id: info.folderId, drive_pasta_nome: info.folderName || null, drive_pasta_url: info.folderUrl || null,
  }).eq('id', sinistroId);
  if (error) falhar(error, 'Erro ao registrar a pasta do Drive.');
}
