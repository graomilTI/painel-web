-- A supervisão do veículo é sempre a associada ao GRM Patrimônios.
--
-- Enquanto o veículo tiver patrimônio associado (frotas_veiculos.patrimonio_supervisao
-- preenchida pela sincronizar_frotas_veiculos_patrimonios), qualquer gravação em
-- frotas_veiculos — edição manual no painel, importação de planilha, sync da BFleet/Detran
-- ou do próprio Patrimônios — fica com supervisao = patrimonio_supervisao. Sem patrimônio
-- associado, a supervisão cadastrada é mantida.
--
-- O nome do gatilho é escolhido para disparar DEPOIS de
-- trg_proteger_atualizacoes_manuais_frotas_veiculos (ordem alfabética dos BEFORE), que
-- devolve o valor antigo da supervisão quando a BFleet/Detran atualizam a linha: assim a
-- regra do Patrimônios sempre prevalece.
--
-- Motivo: a placa RVH2C89 mudou de Confresa para Querência no Patrimônios, mas a supervisão
-- do cadastro ficou em Confresa e a placa sumiu da Programação (07/10/2026).
create or replace function public.frotas_veiculos_supervisao_do_patrimonio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.patrimonio_supervisao), '') is not null then
    new.supervisao := btrim(new.patrimonio_supervisao);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_supervisao_do_patrimonio_frotas_veiculos on public.frotas_veiculos;
create trigger trg_supervisao_do_patrimonio_frotas_veiculos
  before insert or update on public.frotas_veiculos
  for each row execute function public.frotas_veiculos_supervisao_do_patrimonio();

-- Corrige de uma vez os veículos que já estavam divergentes (o gatilho acerta a supervisão
-- no próprio UPDATE; o set abaixo só força a linha a ser regravada).
update public.frotas_veiculos
   set supervisao = btrim(patrimonio_supervisao)
 where nullif(btrim(patrimonio_supervisao), '') is not null
   and supervisao is distinct from btrim(patrimonio_supervisao);
