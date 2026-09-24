-- Espelho COMPLETO do cadastro de Locais de Serviço do GRM (servicePlaces/getRecords), inclusive os
-- que ainda não têm coordenada (operacional_pontos_embarque só guarda os georreferenciados).
-- Usada pela abertura de O.S. (Gestor > Logística > Abrir OS) para permitir só locais que já existem
-- no GRM. Preenchida por agentes-grm-sync/grmserver-locais-embarque-api.js (service role).
-- nome_norm / cidade_norm: chave sem acento/pontuação em minúsculas (mesma normKey do agente e do
-- front) para casar o que o usuário digita sem depender de acento ou caixa.
create table if not exists public.grm_locais_servico (
  spl_code integer primary key,
  nome_local text not null,
  uf text not null,
  cidade text not null,
  tipo_local text,
  ativo boolean not null default true,
  latitude numeric(10,7),
  longitude numeric(10,7),
  nome_norm text not null,
  cidade_norm text not null,
  updated_at timestamptz not null default now()
);

create index if not exists grm_locais_servico_uf_cidade_norm_idx
  on public.grm_locais_servico (uf, cidade_norm)
  where ativo;

alter table public.grm_locais_servico enable row level security;

drop policy if exists grm_locais_servico_select_authenticated on public.grm_locais_servico;
create policy grm_locais_servico_select_authenticated
  on public.grm_locais_servico for select to authenticated using (true);
