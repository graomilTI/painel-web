import { supabase } from './supabaseClient.js';
import { carregarSupervisoesLiberadas } from './supervisoesLiberadas.js';
import { calcularEscopoGestor } from './dashboardEscopoGestor.js';

// Coordenações e supervisões do gestor: a principal do cadastro mais as de cada
// supervisão liberada a ele (mesma fonte do mapa regional). Usado pelo dashboard
// e pelo app do gestor. Não derruba a tela se falhar: cai pra coordenação
// principal, como era antes. A Promise fica guardada pra uma carga só por página.
let escopoPromise = null;

export function resolverEscopoGestor(principal, { force = false, tag = 'dashboard' } = {}) {
  if (!escopoPromise || force) {
    const now = new Date();
    escopoPromise = (async () => {
      try {
        const [supervisoes, metas] = await Promise.all([
          carregarSupervisoesLiberadas(),
          supabase.from('metas_producao').select('regional').eq('ano', now.getFullYear()).eq('mes', now.getMonth() + 1).eq('ativo', true),
        ]);
        if (metas.error) throw metas.error;
        return calcularEscopoGestor({ principal, supervisoes, regionaisMetas: (metas.data || []).map((r) => r.regional) });
      } catch (error) {
        console.warn(`[${tag}] escopo do gestor indisponível, usando só a coordenação principal:`, error?.message || error);
        escopoPromise = null; // a próxima carga tenta de novo
        return calcularEscopoGestor({ principal });
      }
    })();
  }
  return escopoPromise;
}
