-- Achado ao vivo 16/09/2026: um unico colaborador_inicial com regional
-- incompativel (ex.: AMANDA REIS DA SILVA informada numa O.S. de CASCAVEL -
-- Geral, mas cadastrada em GERAL - Administrativo) fazia
-- programacao_equipe_validar_regional_trg lancar excecao sem handler nenhum
-- no loop, abortando a funcao inteira -- e travando TODOS os outros
-- colaborador_inicial pendentes atras dela na fila pra sempre (mesma
-- transacao, mesmo sem ter nada a ver um com o outro; RONEI CARLOS FRIAS e
-- IZABELLA FERNANDES VAZ MONTEIRO ficaram presos 1-3 dias so por causa da
-- Amanda estar na frente na ordem por updated_at). Agora cada linha roda num
-- sub-bloco com EXCEPTION: uma linha com problema de dado so fica de fora
-- (aplicado continua false, pra revisao manual) e o loop segue pras demais.
create or replace function public.aplicar_colaboradores_iniciais_abertura_os()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row record;
  v_os record;
  v_programacao_id uuid;
  v_colaborador_id text;
  v_nome text;
  v_data date;
  v_cafe boolean;
  v_almoco boolean;
  v_janta boolean;
  v_count integer := 0;
  v_job_ativo uuid;
begin
  for v_row in
    select id, numero_os_cadastrada, raw
    from public.logistica_abertura_os
    where status = 'CADASTRADO'
      and numero_os_cadastrada is not null
      and raw ? 'colaborador_inicial'
      and coalesce((raw->'colaborador_inicial'->>'aplicado')::boolean, false) = false
    order by updated_at
    limit 50
  loop
    begin
      select id, supervisao into v_os from public.operacional_os where numero_os = v_row.numero_os_cadastrada limit 1;
      if v_os.id is null or v_os.supervisao is null then
        continue; -- ainda não sincronizou (ou sem supervisão) — tenta de novo na próxima varredura
      end if;

      v_colaborador_id := v_row.raw->'colaborador_inicial'->>'colaboradorId';
      v_nome := v_row.raw->'colaborador_inicial'->>'nome';
      v_data := (v_row.raw->'colaborador_inicial'->>'dataInicio')::date;
      v_cafe := coalesce((v_row.raw->'colaborador_inicial'->'despesas'->>'cafe')::boolean, false);
      v_almoco := coalesce((v_row.raw->'colaborador_inicial'->'despesas'->>'almoco')::boolean, false);
      v_janta := coalesce((v_row.raw->'colaborador_inicial'->'despesas'->>'janta')::boolean, false);

      if v_colaborador_id is null or v_data is null then
        continue; -- dado incompleto, não tenta de novo (não vai se corrigir sozinho)
      end if;

      select id into v_programacao_id from public.programacao_dia
        where data_referencia = v_data and supervisao = v_os.supervisao limit 1;
      if v_programacao_id is null then
        insert into public.programacao_dia (data_referencia, supervisao, coordenacao, regional, status)
        values (v_data, v_os.supervisao, v_os.supervisao, v_os.supervisao, 'rascunho')
        returning id into v_programacao_id;
      end if;

      insert into public.programacao_equipe (programacao_id, os_id, colaborador_id, nome_colaborador, confirmado)
      values (v_programacao_id, v_os.id, v_colaborador_id, v_nome, true)
      on conflict (programacao_id, os_id, colaborador_id)
        do update set confirmado = true, nome_colaborador = excluded.nome_colaborador, updated_at = now();

      delete from public.operacional_os_colaboradores where os_id = v_os.id and colaborador_key = v_colaborador_id;
      insert into public.operacional_os_colaboradores (os_id, colaborador_key, colaborador_nome, origem_sugestao)
      values (v_os.id, v_colaborador_id, v_nome, 'ABERTURA_OS_INFORMAR_COLABORADOR');

      -- data_referencia É OBRIGATÓRIA aqui — trigger programacao_colaboradores_
      -- auto_transferir_rascunho_trg exige bater com a data de programacao_dia,
      -- senão lança "Programação de destino inválida" (achado ao vivo 11/09,
      -- mesmo bug que corrigi em adicionarColaboradorOs/programacao-equipe.js).
      insert into public.programacao_colaboradores (programacao_id, data_referencia, colaborador_id, nome_colaborador, supervisao, disponibilidade)
      values (v_programacao_id, v_data, v_colaborador_id, v_nome, v_os.supervisao, 'OK')
      on conflict (programacao_id, colaborador_id)
        do update set nome_colaborador = excluded.nome_colaborador, disponibilidade = 'OK', updated_at = now();

      insert into public.programacao_alimentacao (programacao_id, data_referencia, colaborador_id, nome_colaborador, cafe, almoco, janta)
      values (v_programacao_id, v_data, v_colaborador_id, v_nome, v_cafe, v_almoco, v_janta)
      on conflict (programacao_id, colaborador_id)
        do update set cafe = excluded.cafe, almoco = excluded.almoco, janta = excluded.janta, updated_at = now();

      -- Equivalente a reabrirDistribuicaoOs/enfileirarDistribuicaoOs
      -- (assets/js/programacao-equipe.js) — volta a O.S. pra conferência e
      -- garante que o agente de distribuição rode de novo com a equipe nova.
      update public.operacional_os
        set status_conferencia = 'PENDENTE', conferido_por = null, conferido_em = null, updated_at = now()
        where id = v_os.id;

      select id into v_job_ativo from public.grm_sync_jobs
        where agente_id = 'aplicar-distribuicao-os' and status in ('pendente','rodando') limit 1;
      if v_job_ativo is null then
        insert into public.grm_sync_jobs (agente_id, status) values ('aplicar-distribuicao-os', 'pendente');
      end if;

      update public.logistica_abertura_os
        set raw = jsonb_set(raw, '{colaborador_inicial,aplicado}', 'true'::jsonb)
        where id = v_row.id;

      v_count := v_count + 1;
    exception when others then
      raise warning 'aplicar_colaboradores_iniciais_abertura_os: falha na O.S. % (colaborador_inicial % / %): %',
        v_row.numero_os_cadastrada, v_colaborador_id, v_nome, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$function$;
