-- grmserver-colaboradores-sync.js faz upsert(onConflict:'cpf') continuamente pra
-- colaboradores ativos, e o mapeamento de coluna não reconhecia o cabeçalho real
-- da planilha ("C. Banc. Despesas") — resultado: 0 dos 733 "Ativo" tinham
-- conta_bancaria_despesas (zerava a cada rodada do cron, sobrescrevendo com
-- string vazia). Efeito visível: tela de Refeições/Almoço mostrando "C. Banc.
-- Despesas sem destino reconhecido" pra praticamente todo mundo.
--
-- Trigger protege só esse campo: se o UPDATE chega com valor vazio mas já existe
-- um valor salvo, preserva o valor existente em vez de apagar. Não afeta INSERT
-- (linha nova legitimamente pode nascer sem conta) nem outros campos.
create or replace function public.colaboradores_preserva_conta_bancaria()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.conta_bancaria_despesas, '') = '' and coalesce(old.conta_bancaria_despesas, '') <> '' then
    new.conta_bancaria_despesas := old.conta_bancaria_despesas;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_colaboradores_preserva_conta_bancaria on public.colaboradores;
create trigger trg_colaboradores_preserva_conta_bancaria
before update on public.colaboradores
for each row execute function public.colaboradores_preserva_conta_bancaria();
