import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas.js';

async function carregarColaboradores() {
  try {
    const { data, error } = await supabase
      .from('colaborador_snapshot')
      .select('id,nome,cpf,tipo,empresa,coordenacao,supervisao,ativo,data_referencia')
      .order('nome', { ascending: true })
      .limit(2500);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const latest = rows.reduce((max, row) => {
      const ref = row?.data_referencia || '';
      return ref > max ? ref : max;
    }, '');

    return rows
      .filter((row) => !latest || row.data_referencia === latest)
      .filter((row) => row.ativo !== false)
      .map((row) => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        tipo: row.tipo,
        empresa: row.empresa,
        coordenacao: row.coordenacao,
        supervisao: row.supervisao
      }))
      .filter((row) => row.nome);
  } catch (err) {
    console.warn('[FROTAS] Não foi possível carregar colaboradores:', err);
    return [];
  }
}

initProtectedPage('Frotas', async (content, ctx) => {
  content.innerHTML = `
    <section class="card">
      <h2>Carregando Frotas...</h2>
      <p class="muted">Preparando módulo de excesso de velocidade.</p>
    </section>
  `;

  const colaboradores = await carregarColaboradores();

  window.FROTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null,
    colaboradores
  });
});
