-- Frotas > Sinistros: acidente com veículo da frota, aberto na corretora/seguradora.
--
-- Como a equipe trabalha hoje (Ana Carolina, 29/10/2026): o condutor avisa do acidente; Ana reúne relato, data/hora/local,
-- fotos, CNH, documento do veículo, oficina indicada pela seguradora (e o boletim de ocorrência quando há terceiro) e manda
-- tudo por WhatsApp à corretora, que abre o sinistro na seguradora. Ela acompanha em duas etiquetas: "pedi a abertura e a
-- corretora ainda não respondeu" e "a corretora confirmou que abriu". Se há terceiro, junta também CNH, CRLV, contato,
-- comprovante de residência, oficina de preferência, fotos e se o terceiro tem seguro. O sinistro é uma manutenção feita
-- pela seguradora, por isso fica separado da Manutenção (que passa por orçamento e aprovação interna).
--
-- Modelo:
--   frotas_sinistros                   o sinistro (etapa, ocorrência, condutor, seguradora, oficina, próximo passo)
--   frotas_sinistro_terceiros          terceiros envolvidos (um sinistro pode ter mais de um)
--   frotas_sinistro_checklist_modelo   documentos/informações exigidos (editável: o checklist da Ana é ajustado aqui)
--   frotas_sinistro_marcas             item conferido ou dispensado à mão (o que não tem arquivo nem campo)
--   frotas_sinistro_anexos             arquivos (bucket privado frotas-sinistros), ligados a um item do checklist
--   frotas_sinistro_historico          linha do tempo: etapas (automático) e atualizações escritas pela equipe

create sequence if not exists public.frotas_sinistros_numero_seq;

create table if not exists public.frotas_sinistros (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('public.frotas_sinistros_numero_seq'),
  veiculo_id uuid not null references public.frotas_veiculos (id),
  placa text not null,
  etapa text not null default 'preparando'
    check (etapa in ('preparando', 'solicitado', 'aberto', 'reparo', 'concluido', 'cancelado')),
  motivo_status text,
  -- ocorrência
  ocorrido_em timestamptz,
  local_texto text,
  relato text,
  houve_terceiro boolean not null default false,
  houve_ferido boolean not null default false,
  guincho boolean not null default false,
  guincho_obs text,
  bo_numero text,
  -- condutor
  condutor_nome text,
  condutor_telefone text,
  -- corretora / seguradora
  seguradora text,
  corretora text,
  apolice text,
  protocolo text,
  -- oficina (normalmente indicada pela seguradora)
  oficina_nome text,
  oficina_contato text,
  previsao_entrega date,
  -- agenda: o que falta fazer e até quando
  proxima_acao text,
  proxima_acao_em date,
  observacoes text,
  -- carimbos das etapas (preenchidos pelo trigger)
  solicitado_corretora_em timestamptz,
  aberto_seguradora_em timestamptz,
  reparo_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  responsavel_nome text,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.frotas_sinistros_numero_seq owned by public.frotas_sinistros.numero;
create unique index if not exists uq_frotas_sinistros_numero on public.frotas_sinistros (numero);
create index if not exists idx_frotas_sinistros_veiculo on public.frotas_sinistros (veiculo_id);
create index if not exists idx_frotas_sinistros_etapa on public.frotas_sinistros (etapa);
create index if not exists idx_frotas_sinistros_prazo on public.frotas_sinistros (proxima_acao_em)
  where proxima_acao_em is not null and etapa not in ('concluido', 'cancelado');

comment on table public.frotas_sinistros is
  'Sinistros (acidentes) de veículos da frota: documentos reunidos pela equipe e enviados à corretora, que abre o sinistro na seguradora.';
comment on column public.frotas_sinistros.etapa is
  'preparando (reunindo documentos) > solicitado (pedido de abertura enviado à corretora, sem resposta) > aberto (corretora confirmou) > reparo (veículo na oficina) > concluido; cancelado a qualquer momento.';

drop trigger if exists trg_frotas_sinistros_updated on public.frotas_sinistros;
create trigger trg_frotas_sinistros_updated
  before update on public.frotas_sinistros
  for each row execute function public.set_updated_at();

create table if not exists public.frotas_sinistro_terceiros (
  id uuid primary key default gen_random_uuid(),
  sinistro_id uuid not null references public.frotas_sinistros (id) on delete cascade,
  nome text,
  telefone text,
  email text,
  placa text,
  veiculo_modelo text,
  tem_seguro boolean,
  seguradora text,
  oficina_preferencia text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_frotas_sinistro_terceiros_sinistro on public.frotas_sinistro_terceiros (sinistro_id);

drop trigger if exists trg_frotas_sinistro_terceiros_updated on public.frotas_sinistro_terceiros;
create trigger trg_frotas_sinistro_terceiros_updated
  before update on public.frotas_sinistro_terceiros
  for each row execute function public.set_updated_at();

-- Checklist (modelo). `campos` = o item se considera feito quando todos esses campos estão preenchidos (na tabela do grupo:
-- frotas_sinistros para 'empresa', frotas_sinistro_terceiros para 'terceiro'). Sem `campos`, é um documento: precisa de arquivo
-- ou de marcação manual (ok/dispensado).
create table if not exists public.frotas_sinistro_checklist_modelo (
  codigo text primary key,
  grupo text not null check (grupo in ('empresa', 'terceiro')),
  rotulo text not null,
  dica text,
  campos text[],
  so_se_ferido boolean not null default false,
  obrigatorio_quando text not null default 'sempre' check (obrigatorio_quando in ('sempre', 'terceiro', 'nunca')),
  ordem integer not null default 0,
  ativo boolean not null default true
);

insert into public.frotas_sinistro_checklist_modelo (codigo, grupo, rotulo, dica, campos, so_se_ferido, obrigatorio_quando, ordem) values
  ('cnh_condutor',       'empresa', 'CNH do colaborador',                    'Foto ou PDF da CNH do condutor do veículo da empresa.', null, false, 'sempre', 10),
  ('telefone_condutor',  'empresa', 'Telefone do colaborador',               'Preencha em Dados > Condutor.', array['condutor_telefone'], false, 'sempre', 20),
  ('crlv_veiculo',       'empresa', 'CRLV do veículo',                       'Documento do veículo.', null, false, 'sempre', 30),
  ('relato',             'empresa', 'Relato do acidente',                    'Preencha em Dados > Ocorrência.', array['relato'], false, 'sempre', 40),
  ('data_hora_local',    'empresa', 'Data, hora e local',                    'Preencha em Dados > Ocorrência.', array['ocorrido_em', 'local_texto'], false, 'sempre', 50),
  ('boletim_ocorrencia', 'empresa', 'Boletim de ocorrência',                 'Obrigatório quando há terceiro; sem terceiro a seguradora costuma abrir só com o relato, data, hora e local.', null, false, 'terceiro', 60),
  ('dados_oficina',      'empresa', 'Dados da oficina',                      'Oficina para onde o veículo será levado (normalmente a indicada pela seguradora). Preencha em Dados > Oficina.', array['oficina_nome'], false, 'sempre', 70),
  ('prontuario_medico',  'empresa', 'Prontuário médico do colaborador',      'Só quando o colaborador precisou ser socorrido.', null, true, 'sempre', 80),
  ('fotos_veiculo',      'empresa', 'Fotos do acidente e do veículo',        'Fotos de todos os lados do veículo e do local.', null, false, 'sempre', 90),
  ('t_cnh',              'terceiro', 'CNH do condutor',                      null, null, false, 'sempre', 10),
  ('t_crlv',             'terceiro', 'CRLV do veículo',                      null, null, false, 'sempre', 20),
  ('t_contato',          'terceiro', 'Telefone e e-mail do condutor',        null, array['telefone', 'email'], false, 'sempre', 30),
  ('t_residencia',       'terceiro', 'Comprovante de residência',            null, null, false, 'sempre', 40),
  ('t_oficina',          'terceiro', 'Dados da oficina de preferência',      null, array['oficina_preferencia'], false, 'sempre', 50),
  ('t_fotos',            'terceiro', 'Fotos do veículo',                     null, null, false, 'sempre', 60),
  ('t_seguro',           'terceiro', 'Verificar se possui seguro',           'Informe se o terceiro tem seguro.', array['tem_seguro'], false, 'sempre', 70)
on conflict (codigo) do nothing;

create table if not exists public.frotas_sinistro_marcas (
  id uuid primary key default gen_random_uuid(),
  sinistro_id uuid not null references public.frotas_sinistros (id) on delete cascade,
  terceiro_id uuid references public.frotas_sinistro_terceiros (id) on delete cascade,
  codigo text not null references public.frotas_sinistro_checklist_modelo (codigo),
  status text not null check (status in ('ok', 'dispensado')),
  observacao text,
  por_nome text,
  em timestamptz not null default now()
);
create unique index if not exists uq_frotas_sinistro_marcas
  on public.frotas_sinistro_marcas (sinistro_id, coalesce(terceiro_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

create table if not exists public.frotas_sinistro_anexos (
  id uuid primary key default gen_random_uuid(),
  sinistro_id uuid not null references public.frotas_sinistros (id) on delete cascade,
  terceiro_id uuid references public.frotas_sinistro_terceiros (id) on delete cascade,
  item_codigo text references public.frotas_sinistro_checklist_modelo (codigo),   -- null = arquivo avulso ("Outros")
  storage_bucket text not null default 'frotas-sinistros',
  storage_path text not null,
  nome_arquivo text,
  mime_type text,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);
create index if not exists idx_frotas_sinistro_anexos_sinistro on public.frotas_sinistro_anexos (sinistro_id);

create table if not exists public.frotas_sinistro_historico (
  id uuid primary key default gen_random_uuid(),
  sinistro_id uuid not null references public.frotas_sinistros (id) on delete cascade,
  tipo text not null check (tipo in ('etapa', 'nota')),
  de_etapa text,
  para_etapa text,
  texto text,
  por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_frotas_sinistro_historico_sinistro on public.frotas_sinistro_historico (sinistro_id, criado_em);

-- ============================================================
-- Regras do fluxo (um só lugar, vale para qualquer escritor)
-- ============================================================
create or replace function public.frotas_sinistros_fluxo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nome text := public.frotas_manutencao_ator_nome();
begin
  if tg_op = 'INSERT' then
    new.placa := upper(btrim(coalesce(new.placa, '')));
    new.criado_por_nome := coalesce(nullif(new.criado_por_nome, ''), v_nome);
    new.responsavel_nome := coalesce(nullif(new.responsavel_nome, ''), v_nome);
    if new.etapa <> 'preparando' and auth.uid() is not null then
      raise exception 'Todo sinistro nasce em "Preparando documentos".' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE'
  if new.etapa is distinct from old.etapa then
    if new.etapa = 'cancelado' and nullif(btrim(coalesce(new.motivo_status, '')), '') is null then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
    end if;
    if new.etapa = 'solicitado' then new.solicitado_corretora_em := coalesce(new.solicitado_corretora_em, now()); end if;
    if new.etapa = 'aberto'     then new.aberto_seguradora_em   := coalesce(new.aberto_seguradora_em, now());
                                     new.solicitado_corretora_em := coalesce(new.solicitado_corretora_em, now()); end if;
    if new.etapa = 'reparo'     then new.reparo_em              := coalesce(new.reparo_em, now()); end if;
    if new.etapa = 'concluido'  then new.concluido_em           := now(); end if;
    if new.etapa = 'cancelado'  then new.cancelado_em           := now(); end if;
    if new.etapa not in ('concluido') then new.concluido_em := null; end if;
    if new.etapa <> 'cancelado' then new.cancelado_em := null; new.motivo_status := null; end if;
    insert into public.frotas_sinistro_historico (sinistro_id, tipo, de_etapa, para_etapa, texto, por_nome)
    values (new.id, 'etapa', old.etapa, new.etapa, nullif(btrim(coalesce(new.motivo_status, '')), ''), v_nome);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_frotas_sinistros_fluxo on public.frotas_sinistros;
create trigger trg_frotas_sinistros_fluxo
  before insert or update on public.frotas_sinistros
  for each row execute function public.frotas_sinistros_fluxo();

create or replace function public.frotas_sinistros_historico_criado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.frotas_sinistro_historico (sinistro_id, tipo, de_etapa, para_etapa, texto, por_nome)
  values (new.id, 'etapa', null, new.etapa, 'Sinistro registrado', new.criado_por_nome);
  return new;
end;
$$;

drop trigger if exists trg_frotas_sinistros_historico_criado on public.frotas_sinistros;
create trigger trg_frotas_sinistros_historico_criado
  after insert on public.frotas_sinistros
  for each row execute function public.frotas_sinistros_historico_criado();

-- ============================================================
-- Acesso: quem vê/edita Sinistros ou Manutenção (a seguradora faz a manutenção do acidente)
-- ============================================================
alter table public.frotas_sinistros enable row level security;
alter table public.frotas_sinistro_terceiros enable row level security;
alter table public.frotas_sinistro_checklist_modelo enable row level security;
alter table public.frotas_sinistro_marcas enable row level security;
alter table public.frotas_sinistro_anexos enable row level security;
alter table public.frotas_sinistro_historico enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['frotas_sinistros', 'frotas_sinistro_terceiros', 'frotas_sinistro_checklist_modelo',
                           'frotas_sinistro_marcas', 'frotas_sinistro_anexos', 'frotas_sinistro_historico']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using ((select public.painel_has_module(array['frotas_sinistros','frotas_manutencao','frotas','dashboard_socio'], false)))$p$, t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using ((select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], true)))
      with check ((select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], true)))$p$, t || '_write', t);
  end loop;
end $$;

-- Bucket privado (CNH, documentos e comprovantes de residência): o painel abre via createSignedUrl.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frotas-sinistros', 'frotas-sinistros', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists frotas_sinistros_obj_select on storage.objects;
create policy frotas_sinistros_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'frotas-sinistros' and (select public.painel_has_module(array['frotas_sinistros','frotas_manutencao','frotas','dashboard_socio'], false)));
drop policy if exists frotas_sinistros_obj_insert on storage.objects;
create policy frotas_sinistros_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'frotas-sinistros' and (select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], true)));
drop policy if exists frotas_sinistros_obj_delete on storage.objects;
create policy frotas_sinistros_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'frotas-sinistros' and (select public.painel_has_module(array['frotas_sinistros','frotas_manutencao'], true)));

-- Catálogo de módulos: permite conceder "Sinistros" separadamente em Usuários e Acessos.
-- Quem já tem Manutenção também vê o menu (alias no menuConfig), sem precisar de nova concessão.
insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
select 'frotas_sinistros', 'Sinistros', 'FROTAS', 'frotas-sinistros', 71, true
where not exists (select 1 from public.app_modulos where codigo = 'frotas_sinistros');

insert into public.modules (code, name, area, active)
select 'frotas_sinistros', 'Sinistros', 'FROTAS', true
where not exists (select 1 from public.modules where code = 'frotas_sinistros');
