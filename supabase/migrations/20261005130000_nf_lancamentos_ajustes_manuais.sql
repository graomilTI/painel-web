-- Completar à mão os dados pendentes de um lançamento de NF/holerite
-- (status AGUARDANDO_DADOS / AGUARDANDO_CLASSIFICACAO / ERRO) e devolver pra fila.
--
-- 1) ajustes_manuais: valores digitados no painel; o agente aplica por cima da
--    extração/regras antes de validar (ver applyManualOverrides no agente).
-- 2) grm_nf_catalogo: categorias e formas de pagamento reais do GRM, publicadas
--    pelo próprio agente a cada execução, pra o painel montar os selects com
--    exatamente os nomes que o GRM reconhece.
-- 3) completar_lancamento_nf: único caminho de escrita do painel nessas colunas;
--    só aceita os campos da lista abaixo e só nos status pendentes.

alter table public.grm_nf_lancamentos
  add column if not exists ajustes_manuais jsonb;

create table if not exists public.grm_nf_catalogo (
  tipo text not null check (tipo in ('CATEGORIA', 'FORMA_PAGAMENTO')),
  nome text not null,
  grupo text not null default '',
  atualizado_em timestamptz not null default now(),
  primary key (tipo, nome, grupo)
);

alter table public.grm_nf_catalogo enable row level security;

drop policy if exists "Leitura autenticada catalogo NF" on public.grm_nf_catalogo;
create policy "Leitura autenticada catalogo NF" on public.grm_nf_catalogo
  for select to authenticated using (true);

create or replace function public.completar_lancamento_nf(p_id uuid, p_ajustes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_limpo jsonb := '{}'::jsonb;
  v_chave text;
  v_valor text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_ajustes is null or jsonb_typeof(p_ajustes) <> 'object' then
    raise exception 'Informe os campos a ajustar.';
  end if;

  select status into v_status from public.grm_nf_lancamentos where id = p_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if v_status not in ('AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO', 'ERRO') then
    raise exception 'Lançamento com status % não pode ser completado.', v_status;
  end if;

  for v_chave in select jsonb_object_keys(p_ajustes) loop
    v_valor := nullif(btrim(p_ajustes ->> v_chave), '');
    if v_valor is null then
      continue;
    end if;
    if v_chave in ('data_vencimento', 'data_conta') then
      if v_valor !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Data inválida em %.', v_chave;
      end if;
      perform v_valor::date; -- rejeita 2026-02-31
    elsif v_chave = 'tipo_contrato' then
      if v_valor not in ('Mensalista', 'Intermitente') then
        raise exception 'Tipo de contrato deve ser Mensalista ou Intermitente.';
      end if;
    elsif v_chave not in ('numero_documento', 'forma_pagamento', 'categoria', 'grupo_categoria') then
      raise exception 'Campo % não pode ser ajustado por aqui.', v_chave;
    end if;
    v_limpo := v_limpo || jsonb_build_object(v_chave, left(v_valor, 200));
  end loop;

  if v_limpo = '{}'::jsonb then
    raise exception 'Nenhum campo preenchido.';
  end if;

  update public.grm_nf_lancamentos
     set ajustes_manuais = coalesce(ajustes_manuais, '{}'::jsonb) || v_limpo,
         status = 'NOVO',
         erro = null,
         updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.completar_lancamento_nf(uuid, jsonb) from public, anon;
grant execute on function public.completar_lancamento_nf(uuid, jsonb) to authenticated;
