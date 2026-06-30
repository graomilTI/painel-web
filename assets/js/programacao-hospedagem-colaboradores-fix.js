// Programação → Hospedagem: normaliza o vínculo de colaboradores.
//
// A tela de Programação usa a tabela hospedagem_solicitacao_colaboradores para
// mostrar quem vai ficar no hotel. O fluxo automático antigo enviava
// colaborador_nome/colaborador_cpf, mas o módulo de Hospedagem e a view usam
// nome_colaborador/cpf. Esse patch corrige qualquer insert desse fluxo antes de
// chegar ao Supabase, evitando solicitação "Solicitada" sem colaborador.
import { supabase } from './supabaseClient.js';

const PATCH_FLAG = '__programacaoHospedagemColaboradoresFix';

function normalizeHospedagemColaboradorRow(row) {
  const out = { ...(row || {}) };

  if (out.colaborador_nome && !out.nome_colaborador) {
    out.nome_colaborador = out.colaborador_nome;
  }
  if (out.colaborador_cpf && !out.cpf) {
    out.cpf = out.colaborador_cpf;
  }

  // Remove os nomes antigos para não gerar PGRST204 quando a coluna não existe.
  delete out.colaborador_nome;
  delete out.colaborador_cpf;

  if (out.nome_colaborador != null) out.nome_colaborador = String(out.nome_colaborador).trim();
  if (out.cpf != null) out.cpf = String(out.cpf).replace(/\D/g, '') || null;

  // Compatibilidade com o formulário manual de Hospedagem.
  if (!out.status_colaborador) out.status_colaborador = 'ATIVO';

  return out;
}

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);

  supabase.from = function patchedFrom(table) {
    const builder = originalFrom(table);
    if (table !== 'hospedagem_solicitacao_colaboradores' || builder.__hospColabInsertPatched) {
      return builder;
    }

    const originalInsert = builder.insert.bind(builder);
    builder.insert = function patchedInsert(values, options) {
      const normalized = Array.isArray(values)
        ? values.map(normalizeHospedagemColaboradorRow).filter((row) => row.nome_colaborador)
        : normalizeHospedagemColaboradorRow(values);

      if (Array.isArray(normalized) && !normalized.length) {
        throw new Error('A solicitação de hospedagem precisa ter pelo menos um colaborador.');
      }
      if (!Array.isArray(normalized) && !normalized.nome_colaborador) {
        throw new Error('A solicitação de hospedagem precisa ter o nome do colaborador.');
      }

      return originalInsert(normalized, options);
    };

    builder.__hospColabInsertPatched = true;
    return builder;
  };

  supabase[PATCH_FLAG] = true;
}
