-- Compras -> GRM automático: quando um item de Compras fica "comprado" com a
-- NF (arquivo no bucket notas-fiscais) e o comprovante/boleto anexados, a NF
-- entra sozinha na fila do agente de lançamento (grm_nf_lancamentos, setor
-- COMPRAS) e um job é criado pro worker. Antes dependia do botão "Lançado"
-- da tela de Notas Fiscais, que ainda marcava nf_lancado=true antes do GRM
-- confirmar. Agora nf_lancado só vira true quando o agente lança de verdade
-- (grmserver-lancar-notas-fiscais-api.js atualiza compras_itens).
--
-- Uma linha por arquivo de NF (storage_path é unique): os itens da mesma NF
-- são agrupados pelo agente na hora de processar, lendo compras_itens pelo
-- nf_url. NF que é link externo ou número digitado não entra (não há arquivo
-- pra ler) e continua com o "Marcar lançado" manual.
--
-- Sem backfill: as NFs que já estavam paradas são enfileiradas à mão depois
-- de conferidas em dry-run.

create or replace function private.compras_enfileirar_nf_grm()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_marcador constant text := '/storage/v1/object/public/notas-fiscais/';
  v_path text;
  v_id uuid;
begin
  if new.status is distinct from 'comprado'
     or coalesce(new.nf_lancado, false)
     or new.comprovante_url is null
     or position(v_marcador in coalesce(new.nf_url, '')) = 0 then
    return new;
  end if;

  v_path := split_part(substr(new.nf_url, position(v_marcador in new.nf_url) + length(v_marcador)), '?', 1);
  v_path := replace(v_path, '%20', ' ');
  if coalesce(v_path, '') = '' then
    return new;
  end if;

  insert into public.grm_nf_lancamentos (storage_bucket, storage_path, arquivo_nome, setor, status, extraido_json)
  values (
    'notas-fiscais', v_path, regexp_replace(v_path, '^.*/', ''), 'COMPRAS', 'NOVO',
    jsonb_build_object('origem', 'COMPRAS', 'compras_item_id', new.id)
  )
  on conflict (storage_path) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.grm_sync_jobs (agente_id, status, lane, solicitado_por, payload)
    select 'sync-lancar-notas-fiscais', 'pendente', 'alteracoes', 'compras-auto', jsonb_build_object('origem', 'compras')
    where not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'sync-lancar-notas-fiscais' and status in ('pendente', 'rodando')
    );
  end if;

  return new;
end;
$$;

revoke all on function private.compras_enfileirar_nf_grm() from public, anon, authenticated;

drop trigger if exists compras_itens_enfileirar_nf_grm on public.compras_itens;
create trigger compras_itens_enfileirar_nf_grm
  after insert or update of status, nf_url, comprovante_url on public.compras_itens
  for each row execute function private.compras_enfileirar_nf_grm();

-- A tela de Notas Fiscais mostra o andamento no GRM (status/erro do agente)
-- de cada NF de Compras; leitura já é liberada pra autenticados na tabela.
create index if not exists grm_nf_lancamentos_setor_status_idx
  on public.grm_nf_lancamentos (setor, status);
