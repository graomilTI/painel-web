// Colaborador em hospedagem (hotel/alojamento/pernoite) na Programação passa a
// entrar automaticamente na janta pra pagamento em Financeiro > Refeições.
//
// Financeiro > Refeições só lê `financeiro_alimentacao_colaboradores` (hoje
// populada só pelo agente grm-sync-login-alimentacao, via login GRM x
// proximidade de embarque) — `programacao_alimentacao` (chip manual da Etapa
// 3) não alimenta o pagamento. Por isso este módulo grava DIRETO na tabela do
// Financeiro, usando um `origem` próprio (JANTA_HOTEL_ORIGEM) diferente do
// agente GRM: o sync de login roda `deactivatePendingRange()` a cada ciclo
// (15/15min) desativando tudo com `origem` dele — usar o mesmo origem faria
// o próximo sync apagar a janta lançada por aqui.
//
// apurarAlmocoRows (financeiro.js) casa cada linha pelo NOME normalizado
// contra a base RH (`colaboradores`) — não precisa de CPF/colaborador_chave
// corretos pra funcionar, só de `colaborador` (nome), `data_ref`,
// `tipo_beneficio`, `ativo=true` e chave única.
import { supabase } from './supabaseClient.js';

export const JANTA_HOTEL_ORIGEM = 'programacao_estadia';

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

// Uma data por noite de estadia: checkin (inclusive) até checkout (exclusive)
// — no dia do checkout o colaborador já está de saída, não conta janta.
function datasDoPernoite(checkin, checkout) {
  const datas = [];
  if (!checkin || !checkout) return datas;
  let atual = checkin;
  let guard = 0;
  while (atual < checkout && guard < 60) {
    datas.push(atual);
    atual = addDaysIso(atual, 1);
    guard += 1;
  }
  return datas;
}

function chaveJanta(colaboradorId, dataRef) {
  return `janta-hotel-${colaboradorId}-${dataRef}`;
}

// Sempre desativa antes de recriar: cobre tanto "estadia removida" quanto
// "período de estadia mudou" (dias a mais/a menos), sem deixar jantas
// fantasmas de um período antigo cobráveis no Financeiro.
export async function sincronizarJantaHotelFinanceiro({ programacaoId, colaboradorId, nome, comEstadia, checkin, checkout }) {
  if (!programacaoId || !colaboradorId) return;
  try {
    const { error: deactErr } = await supabase
      .from('financeiro_alimentacao_colaboradores')
      .update({ ativo: false })
      .eq('origem', JANTA_HOTEL_ORIGEM)
      .eq('origem_chave_login', programacaoId)
      .like('chave_unica', `${chaveJanta(colaboradorId, '')}%`);
    if (deactErr) console.error('[janta-hotel] desativar jantas anteriores', deactErr);

    if (!comEstadia) return;
    const datas = datasDoPernoite(checkin, checkout);
    if (!datas.length) return;
    const rows = datas.map((data_ref) => ({
      chave_unica: chaveJanta(colaboradorId, data_ref),
      data_ref,
      colaborador: nome || '',
      tipo_beneficio: 'JANTA',
      ativo: true,
      origem: JANTA_HOTEL_ORIGEM,
      origem_chave_login: programacaoId,
      local_nome: 'Hospedagem (Programação)',
    }));
    const { error } = await supabase.from('financeiro_alimentacao_colaboradores').upsert(rows, { onConflict: 'chave_unica' });
    if (error) console.error('[janta-hotel] gravar jantas automáticas', error);
  } catch (error) {
    console.error('[janta-hotel] sincronizarJantaHotelFinanceiro', error);
  }
}
