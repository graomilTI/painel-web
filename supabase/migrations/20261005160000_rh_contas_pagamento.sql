-- Folha e Holerite > aba "Contas": cadastro das contas que fogem do padrão
-- "conta no CPF do próprio colaborador".
--
--   outro_titular : colaborador que recebe numa conta de outra pessoa (titular
--                   com CPF/CNPJ diferente do dele). A autorização do
--                   colaborador pode ser anexada (opcional por enquanto).
--   pensao        : conta do beneficiário da pensão alimentícia, usada no
--                   débito/repasse da pensão.
--
-- Uma linha = uma conta. O mesmo colaborador pode ter várias (ex.: dois
-- beneficiários de pensão); `ativo` marca qual vale hoje sem apagar o
-- histórico. Documentos (CPF/CNPJ) ficam só com dígitos; a tela formata.
--
-- Anexo no bucket privado rh-anexos (mesmo das demais telas de RH), guardado
-- como path em anexo_url. Políticas no padrão das tabelas rh_* (authenticated;
-- quem acessa a tela é controlado pela permissão HOLERITE_PAGAMENTOS do menu).

create table if not exists public.rh_contas_pagamento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  colaborador_nome text not null,
  colaborador_cpf text,
  titular_nome text not null,
  titular_documento text not null,
  vinculo text,
  banco text not null,
  agencia text,
  conta text,
  tipo_conta text,
  chave_pix text,
  anexo_url text,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rh_contas_pagamento_tipo_check
    check (tipo in ('outro_titular', 'pensao')),
  constraint rh_contas_pagamento_tipo_conta_check
    check (tipo_conta is null or tipo_conta in ('corrente', 'poupanca', 'pagamento')),
  constraint rh_contas_pagamento_titular_documento_check
    check (titular_documento ~ '^([0-9]{11}|[0-9]{14})$'),
  constraint rh_contas_pagamento_colaborador_cpf_check
    check (colaborador_cpf is null or colaborador_cpf ~ '^[0-9]{11}$'),
  -- Precisa dar pra pagar: ou agência+conta, ou chave PIX.
  constraint rh_contas_pagamento_destino_check
    check (
      nullif(btrim(chave_pix), '') is not null
      or (nullif(btrim(agencia), '') is not null and nullif(btrim(conta), '') is not null)
    ),
  -- "Outro titular" só faz sentido se o CPF do titular for diferente do colaborador.
  constraint rh_contas_pagamento_outro_titular_cpf_check
    check (tipo <> 'outro_titular' or colaborador_cpf is null or titular_documento <> colaborador_cpf)
);

comment on table public.rh_contas_pagamento is
  'Contas de pagamento fora do padrão (conta de outro titular e conta de pensão) cadastradas em RH > Folha e Holerite > Contas.';
comment on column public.rh_contas_pagamento.tipo is
  'outro_titular = colaborador recebe em conta de outra pessoa; pensao = conta do beneficiário da pensão alimentícia.';
comment on column public.rh_contas_pagamento.titular_documento is
  'CPF (11) ou CNPJ (14) do titular da conta, só dígitos.';
comment on column public.rh_contas_pagamento.anexo_url is
  'Path no bucket rh-anexos da autorização do colaborador (tipo outro_titular). Opcional.';

create index if not exists rh_contas_pagamento_colaborador_idx
  on public.rh_contas_pagamento (colaborador_id);

create index if not exists rh_contas_pagamento_created_at_idx
  on public.rh_contas_pagamento (created_at desc);

alter table public.rh_contas_pagamento enable row level security;

drop policy if exists authenticated_read_rh_contas_pagamento on public.rh_contas_pagamento;
create policy authenticated_read_rh_contas_pagamento on public.rh_contas_pagamento
  as permissive for select to authenticated
  using (true);

drop policy if exists authenticated_write_rh_contas_pagamento on public.rh_contas_pagamento;
create policy authenticated_write_rh_contas_pagamento on public.rh_contas_pagamento
  as permissive for all to authenticated
  using (true)
  with check (true);
