const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

function actionRule(status) {
  const value = normalize(status);
  if (value === 'DOBRADOELANCADO') return 'dobrar-concluido';
  if (value === 'INDICADOELANCADO') return 'identificar-concluido';
  if (value === 'AGUARDANDORESPOSTA') return 'identificar-pendente';
  return '';
}

async function updateRows(supabase, ids, payload) {
  if (!ids.length) return;
  const { error } = await supabase
    .from('frotas_multas')
    .update({ ...payload, atualizado_em: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function reconcileMultaActions(supabase) {
  const { data, error } = await supabase
    .from('frotas_multas')
    .select('id,status_multa,situacao,dobrar_solicitado_em,multa_dobrada_em,identificar_solicitado_em,condutor_identificado_em');
  if (error) throw error;

  const now = new Date().toISOString();
  const groups = {
    'dobrar-concluido': [],
    'identificar-concluido': [],
    'identificar-pendente': []
  };

  for (const row of data || []) {
    const rule = actionRule(row.status_multa || row.situacao);
    if (rule) groups[rule].push(row.id);
  }

  await updateRows(supabase, groups['dobrar-concluido'], {
    dobrar_solicitado_em: now,
    multa_dobrada_em: now,
    identificar_solicitado_em: null,
    condutor_identificado_em: null,
    acao_status: 'Dobrar multa'
  });

  await updateRows(supabase, groups['identificar-concluido'], {
    identificar_solicitado_em: now,
    condutor_identificado_em: now,
    dobrar_solicitado_em: null,
    multa_dobrada_em: null,
    acao_status: 'Identificar condutor'
  });

  await updateRows(supabase, groups['identificar-pendente'], {
    identificar_solicitado_em: now,
    condutor_identificado_em: null,
    dobrar_solicitado_em: null,
    multa_dobrada_em: null,
    acao_status: 'Identificar condutor'
  });

  return {
    dobrarConcluido: groups['dobrar-concluido'].length,
    identificarConcluido: groups['identificar-concluido'].length,
    identificarPendente: groups['identificar-pendente'].length
  };
}
