-- Distribuição de O.S.: guarda o hash da última aplicação confirmada por supervisão/data.
--
-- O agente aplicar-distribuicao-os rodava a cada ~2 minutos e consultava o GRM (getDistributionData) para
-- TODAS as supervisões/datas da janela, quase sempre só para descobrir que já estava tudo correto
-- (~22 mil leituras por dia). Com este estado ele compara o que a Programação espera com o hash da última
-- aplicação e só chama o GRM para a supervisão/data que mudou.
--
-- Lido e escrito só pelo agente (service role). Sem a tabela o agente segue como antes (reconcilia tudo).

create table if not exists public.grm_distribuicao_os_estado (
  supervisao_chave text not null,
  data_referencia date not null,
  hash_aplicado text not null,
  aplicado_em timestamptz not null default now(),
  primary key (supervisao_chave, data_referencia)
);

comment on table public.grm_distribuicao_os_estado is
  'Hash da distribuição de O.S. (O.S. + colaboradores esperados) aplicada e confirmada no GRM, por supervisão/data. Escrita pelo agente aplicar-distribuicao-os.';

alter table public.grm_distribuicao_os_estado enable row level security;

revoke all on table public.grm_distribuicao_os_estado from anon, authenticated;
