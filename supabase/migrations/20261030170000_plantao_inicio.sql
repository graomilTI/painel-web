-- Plantão em Início: o gestor de cada setor programa o plantão dos finais de semana e gera a imagem de divulgação.
--
-- 1) Módulo próprio no catálogo: "Plantão" (INÍCIO) é liberado à parte em Usuários e Acessos, sem depender do
--    "Plantão" do RH (rh_plantao). Quem edita cada setor continua sendo definido em Equipe > Plantão
--    (rh_plantao_setor_editores), e o banco continua barrando por trigger quem não é editor do setor.
-- 2) A leitura dos setores/horários passa a aceitar também o módulo novo.
-- 3) rh_plantao_salvar_setor grava o plantão de um setor em um conjunto de datas numa única transação
--    (apaga e regrava juntos; falhou, nada muda) e guarda telefone/e-mail na agenda de plantonistas.

insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao)
select 'plantao_inicio', 'Plantão', 'inicio', 'plantao-fim-semana', 25, true,
       'Programar o plantão dos fins de semana do setor e gerar a imagem de divulgação.'
where not exists (select 1 from public.app_modulos where codigo = 'plantao_inicio');

-- Setores e horários: o menu novo precisa ler a configuração sem ter o módulo do RH.
create or replace function public.rh_plantao_setores_acesso()
returns table (
  setor text,
  hora_inicio time,
  hora_fim time,
  hora_inicio_2 time,
  hora_fim_2 time,
  pode_editar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.setor, c.hora_inicio, c.hora_fim, c.hora_inicio_2, c.hora_fim_2,
         public.rh_plantao_pode_editar_setor(c.setor)
  from public.rh_plantao_setor_config c
  where auth.uid() is not null
    and c.ativo
    and public.painel_has_module(array['equipe', 'rh_plantao', 'plantao_inicio'], false)
  order by c.setor;
$$;

alter policy rh_plantao_setor_config_select on public.rh_plantao_setor_config
  using (public.painel_has_module(array['equipe', 'rh_plantao', 'plantao_inicio'], false));

-- Grava o plantão de UM setor nas datas informadas. p_linhas é uma lista de objetos, um por pessoa e dia:
-- { data_plantao, evento, colaborador_key, cpf, nome, apelido, telefone, email_corporativo,
--   hora_inicio, hora_fim, hora_inicio_2, hora_fim_2, observacoes, ordem }.
-- SECURITY INVOKER de propósito: a RLS e o trigger rh_plantao_validar_editor_setor continuam valendo.
create or replace function public.rh_plantao_salvar_setor(p_setor text, p_datas date[], p_linhas jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  if btrim(coalesce(p_setor, '')) = '' then
    raise exception 'Informe o setor do plantão.';
  end if;
  if p_datas is null or cardinality(p_datas) = 0 then
    raise exception 'Informe as datas do plantão.';
  end if;
  if auth.uid() is not null and not public.rh_plantao_pode_editar_setor(p_setor) then
    raise exception 'Você não possui permissão para editar o plantão do setor %.', p_setor
      using errcode = '42501';
  end if;

  delete from public.rh_plantao_escalas
  where setor = p_setor
    and data_plantao = any (p_datas);

  insert into public.rh_plantao_escalas
    (data_plantao, evento, setor, colaborador_key, cpf, nome, apelido, telefone, email_corporativo,
     hora_inicio, hora_fim, hora_inicio_2, hora_fim_2, observacoes, ordem, created_by)
  select l.data_plantao, nullif(btrim(l.evento), ''), p_setor, l.colaborador_key, nullif(l.cpf, ''),
         l.nome, nullif(btrim(l.apelido), ''), nullif(l.telefone, ''), nullif(l.email_corporativo, ''),
         l.hora_inicio, l.hora_fim, l.hora_inicio_2, l.hora_fim_2, nullif(btrim(l.observacoes), ''),
         coalesce(l.ordem, 1), auth.uid()
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as l(
    data_plantao date, evento text, colaborador_key text, cpf text, nome text, apelido text,
    telefone text, email_corporativo text, hora_inicio time, hora_fim time, hora_inicio_2 time,
    hora_fim_2 time, observacoes text, ordem integer)
  where l.data_plantao = any (p_datas)
    and btrim(coalesce(l.colaborador_key, '')) <> ''
    and btrim(coalesce(l.nome, '')) <> '';
  get diagnostics v_total = row_count;

  -- Agenda de plantonistas: telefone/e-mail digitados valem para os próximos plantões da pessoa.
  insert into public.rh_plantao_contatos
    (colaborador_key, cpf, nome, telefone, email_corporativo, setor_preferencial, origem, atualizado_por)
  select distinct on (l.colaborador_key)
         l.colaborador_key, nullif(l.cpf, ''), l.nome, nullif(l.telefone, ''), nullif(l.email_corporativo, ''),
         p_setor, 'plantao_inicio', auth.uid()
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as l(
    data_plantao date, colaborador_key text, cpf text, nome text, telefone text, email_corporativo text)
  where l.data_plantao = any (p_datas)
    and btrim(coalesce(l.colaborador_key, '')) <> ''
    and btrim(coalesce(l.nome, '')) <> ''
    and (nullif(l.telefone, '') is not null or nullif(l.email_corporativo, '') is not null)
  order by l.colaborador_key
  on conflict (colaborador_key) do update
    set telefone = coalesce(excluded.telefone, public.rh_plantao_contatos.telefone),
        email_corporativo = coalesce(excluded.email_corporativo, public.rh_plantao_contatos.email_corporativo),
        setor_preferencial = coalesce(public.rh_plantao_contatos.setor_preferencial, excluded.setor_preferencial),
        atualizado_por = excluded.atualizado_por,
        updated_at = now();

  return v_total;
end;
$$;

revoke all on function public.rh_plantao_salvar_setor(text, date[], jsonb) from public;
revoke all on function public.rh_plantao_salvar_setor(text, date[], jsonb) from anon;
grant execute on function public.rh_plantao_salvar_setor(text, date[], jsonb) to authenticated;
