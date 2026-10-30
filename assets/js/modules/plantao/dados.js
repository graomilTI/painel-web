// Plantão (Início): acesso ao Supabase. Recebe o cliente como parâmetro (a tela e o harness passam o seu).
import { chaveColaborador, expandirLinhas, normalizar } from './regras.js?v=20261030-plantao1';

// Setores ativos com o horário padrão e a marca "este usuário pode editar" (a regra vive no banco: editores por setor).
export async function carregarSetores(supabase) {
  const [acesso, ordem] = await Promise.all([
    supabase.rpc('rh_plantao_setores_acesso'),
    supabase.from('rh_plantao_setores').select('nome,ordem').eq('ativo', true),
  ]);
  if (acesso.error) throw acesso.error;
  const posicao = new Map((ordem.data || []).map((s) => [normalizar(s.nome), s.ordem ?? 999]));
  return (acesso.data || [])
    .map((s) => ({ setor: s.setor, horario: s, podeEditar: Boolean(s.pode_editar) }))
    .sort((a, b) => (posicao.get(normalizar(a.setor)) ?? 999) - (posicao.get(normalizar(b.setor)) ?? 999)
      || a.setor.localeCompare(b.setor, 'pt-BR'));
}

export async function carregarEscalas(supabase, de, ate) {
  const { data, error } = await supabase
    .from('rh_plantao_escalas')
    .select('*')
    .gte('data_plantao', de)
    .lte('data_plantao', ate)
    .order('data_plantao', { ascending: true })
    .order('ordem', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Ativos do RH. Só o e-mail da empresa entra: o pessoal nunca vai para uma imagem de divulgação.
export async function carregarColaboradores(supabase) {
  const todos = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('cpf,nome,whatsapp,email_empresa')
      .eq('situacao', 'Ativo')
      .order('nome', { ascending: true })
      .order('id', { ascending: true })
      .range(de, de + 999);
    if (error) throw error;
    todos.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  const unicos = new Map();
  for (const c of todos) {
    const key = chaveColaborador({ cpf: c.cpf, nome: c.nome });
    if (!key || unicos.has(key)) continue;
    unicos.set(key, { colaborador_key: key, cpf: c.cpf || '', nome: String(c.nome || '').trim(), telefone: c.whatsapp || '', email: c.email_empresa || '' });
  }
  return [...unicos.values()];
}

export async function carregarContatos(supabase) {
  const { data, error } = await supabase.from('rh_plantao_contatos').select('colaborador_key,cpf,nome,telefone,email_corporativo,setor_preferencial');
  if (error) throw error;
  return data || [];
}

// Grava o setor inteiro naquele período numa transação só (apaga e regrava juntos).
export async function salvarSetor(supabase, { setor, periodo, entradas }) {
  const { data, error } = await supabase.rpc('rh_plantao_salvar_setor', {
    p_setor: setor,
    p_datas: periodo.dias,
    p_linhas: expandirLinhas({ entradas, periodo }),
  });
  if (error) throw error;
  return data;
}
