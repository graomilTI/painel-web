// Locais de Serviço que já existem no GRM (grm_locais_servico, espelhada por
// agentes-grm-sync/grmserver-locais-embarque-api.js). A abertura de O.S. só aceita
// Armazém/Local de embarque que esteja nesse cadastro para a UF+cidade escolhidas.
import { supabase } from './supabaseClient.js';

// Mesma normKey do agente (sem acento/pontuação, minúsculas): casa o que foi digitado com o cadastro.
export function chaveLocal(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Abaixo disso a tabela é considerada não carregada (agente ainda não rodou): a validação é
// ignorada em vez de bloquear toda abertura de O.S. por falta de dados.
const MIN_LOCAIS_TABELA_PRONTA = 1000;

let tabelaPronta = null;
const cache = new Map();

async function tabelaPreenchida() {
  if (tabelaPronta !== null) return tabelaPronta;
  try {
    const { count, error } = await supabase
      .from('grm_locais_servico')
      .select('spl_code', { count: 'exact', head: true })
      .eq('ativo', true);
    tabelaPronta = !error && (count || 0) >= MIN_LOCAIS_TABELA_PRONTA;
  } catch {
    tabelaPronta = false;
  }
  return tabelaPronta;
}

// Locais ativos do GRM na UF+cidade: [{ nome_local, tipo_local }]. Lança se a consulta falhar.
export async function locaisDaCidade(uf, cidade) {
  const ufKey = String(uf || '').trim().toUpperCase();
  const cidadeKey = chaveLocal(cidade);
  if (!ufKey || !cidadeKey) return [];
  const key = `${ufKey}|${cidadeKey}`;
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await supabase
    .from('grm_locais_servico')
    .select('nome_local,tipo_local,nome_norm')
    .eq('ativo', true)
    .eq('uf', ufKey)
    .eq('cidade_norm', cidadeKey)
    .order('nome_local', { ascending: true })
    .limit(2000);
  if (error) throw error;
  const rows = data || [];
  cache.set(key, rows);
  return rows;
}

// { ok:true } quando o local existe no GRM (ou a validação não se aplica); { ok:false, motivo } caso contrário.
export async function validarLocalEmbarque({ uf, cidade, nome }) {
  if (!(await tabelaPreenchida())) return { ok: true, ignorada: true };
  let locais;
  try {
    locais = await locaisDaCidade(uf, cidade);
  } catch (error) {
    console.warn('[locais-servico] não foi possível validar o local (seguindo sem bloquear):', error?.message || error);
    return { ok: true, ignorada: true };
  }
  const alvo = chaveLocal(nome);
  if (alvo && locais.some((l) => l.nome_norm === alvo)) return { ok: true };
  if (!locais.length) {
    return { ok: false, motivo: `Não há nenhum Local de Serviço cadastrado no GRM em ${cidade}/${uf}. A O.S. só pode ser aberta em um local que já existe — solicite o cadastro do local no GRM antes.` };
  }
  return { ok: false, motivo: `"${nome}" não existe no cadastro de Locais de Serviço do GRM em ${cidade}/${uf}. Escolha um dos locais da lista (${locais.length} disponíveis nesta cidade). A O.S. só pode ser aberta em local já cadastrado.` };
}

function escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Popula o <select> de Armazém de embarque com os locais existentes da cidade (só dá para escolher
// um deles). Mantém a escolha anterior — ou o valor pendente (dataset.desejado) deixado pela leitura
// de documento/correção enquanto a lista ainda carregava — quando ela existe na lista.
export function preencherSelectLocais(select, locais, placeholderVazio) {
  const desejado = select.value || select.dataset.desejado || '';
  const vistos = new Set();
  const nomes = [];
  locais.forEach((l) => {
    if (vistos.has(l.nome_norm)) return; // homônimos no mesmo município: uma opção só
    vistos.add(l.nome_norm);
    nomes.push(l.nome_local);
  });
  const placeholder = nomes.length ? 'Selecione ou digite para buscar o local' : placeholderVazio;
  select.innerHTML = `<option value="">${escHtml(placeholder)}</option>`
    + nomes.map((n) => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  select.disabled = !nomes.length;
  delete select.dataset.desejado;

  const alvo = chaveLocal(desejado);
  if (!alvo) return;
  let achado = nomes.find((n) => chaveLocal(n) === alvo);
  if (!achado && alvo.length >= 6) {
    const parecidos = nomes.filter((n) => { const k = chaveLocal(n); return k.includes(alvo) || alvo.includes(k); });
    if (parecidos.length === 1) achado = parecidos[0]; // só aceita aproximação quando é inequívoca
  }
  if (achado) {
    select.value = achado;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
