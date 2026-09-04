-- "Nova Folha" (RH > Folha e Holerite) deixa de pedir colaborador/competência/
-- valores na mão: agora só escolhe a Empresa e anexa os holerites, que vão
-- direto pra fila de Notas Fiscais (grm_nf_lancamentos) e são lançados no
-- Contas a Pagar pelo agente que já existe. Uma linha em rh_folha passa a
-- representar um LOTE (empresa + N holerites), não mais 1 colaborador.

alter table public.rh_folha
  alter column colaborador_nome drop not null,
  alter column competencia drop not null,
  add column if not exists empresa text;

comment on column public.rh_folha.empresa is
  'Empresa selecionada na Nova Folha (lote). Linhas antigas, de lançamento manual por colaborador, ficam com este campo nulo.';

alter table public.grm_nf_lancamentos
  add column if not exists rh_folha_id uuid references public.rh_folha(id) on delete set null;

comment on column public.grm_nf_lancamentos.rh_folha_id is
  'Lote de folha (rh_folha) que originou este holerite, quando enviado pela tela Nova Folha do RH.';

create index if not exists grm_nf_lancamentos_rh_folha_id_idx
  on public.grm_nf_lancamentos (rh_folha_id)
  where rh_folha_id is not null;
