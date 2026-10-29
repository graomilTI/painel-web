-- Compras -> GRM: os arquivos extras da compra (compras_itens.nf_anexos) também são NFs.
-- Compra com uma NF e uma NFS-e (ou várias NFs) pagas por um só comprovante: cada documento entra na
-- fila do agente (uma linha por arquivo, setor COMPRAS), é lançado à parte com o valor do próprio documento
-- e a baixa no GRM é individual por NF, anexando o mesmo comprovante (o agente de baixa já faz isso).
-- O item só vira nf_lancado quando todos os documentos da compra forem lançados (regra no agente).
--
-- Mesmas condições do gatilho original (status 'comprado', com comprovante, não lançado). Compras já
-- lançadas não são tocadas; o gatilho agora também dispara quando nf_anexos muda.

create or replace function private.compras_enfileirar_nf_grm()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_marcador constant text := '/storage/v1/object/public/notas-fiscais/';
  v_url text;
  v_path text;
  v_id uuid;
  v_novo boolean := false;
  v_anexo jsonb;
begin
  if new.status is distinct from 'comprado'
     or coalesce(new.nf_lancado, false)
     or new.comprovante_url is null then
    return new;
  end if;

  -- NF principal + cada arquivo extra (só arquivos do bucket notas-fiscais; link externo/número digitado não entra)
  for v_url, v_anexo in
    select new.nf_url, null::jsonb
    union all
    select a ->> 'url', a
      from jsonb_array_elements(case when jsonb_typeof(new.nf_anexos) = 'array' then new.nf_anexos else '[]'::jsonb end) a
  loop
    continue when position(v_marcador in coalesce(v_url, '')) = 0;

    v_path := split_part(substr(v_url, position(v_marcador in v_url) + length(v_marcador)), '?', 1);
    v_path := replace(v_path, '%20', ' ');
    continue when coalesce(v_path, '') = '';

    v_id := null;
    insert into public.grm_nf_lancamentos (storage_bucket, storage_path, arquivo_nome, setor, status, extraido_json)
    values (
      'notas-fiscais', v_path, regexp_replace(v_path, '^.*/', ''), 'COMPRAS', 'NOVO',
      jsonb_build_object('origem', 'COMPRAS', 'compras_item_id', new.id) || case when v_anexo is null then '{}'::jsonb else jsonb_build_object('anexo', true) end
    )
    on conflict (storage_path) do nothing
    returning id into v_id;

    if v_id is not null then
      v_novo := true;
    end if;
  end loop;

  if v_novo then
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
  after insert or update of status, nf_url, nf_anexos, comprovante_url on public.compras_itens
  for each row execute function private.compras_enfileirar_nf_grm();
