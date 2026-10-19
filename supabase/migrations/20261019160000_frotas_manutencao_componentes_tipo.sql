-- Frotas · Manutenção: cada componente do guia é PEÇA (produto) ou SERVIÇO. Quem abre a manutenção não escolhe mais o tipo:
-- o tipo vem do componente (padrão peça). "Mão de obra" é serviço e a tela a oferece em todos os grupos.
-- O tipo do item (peça/serviço) decide a categoria da nota fiscal no GRM.
alter table public.frotas_manutencao_componentes
  add column if not exists tipo text not null default 'peca' check (tipo in ('peca', 'servico'));

comment on column public.frotas_manutencao_componentes.tipo is
  'peca = produto/peça comprada; servico = trabalho (alinhamento, recarga de gás, funilaria, revisão, guincho...).';

update public.frotas_manutencao_componentes set tipo = 'servico'
 where nome in (
   'Geometria / alinhamento de direção (cambagem, caster e convergência)',
   'Calibragem (verificação da pressão de ar)',
   'Gás e vazamentos (recarga)',
   'Higienização',
   'Escaneamento e leitura de falhas',
   'Funilaria e pintura',
   'Revisão por km ou tempo (plano do fabricante)',
   'Inspeção geral por falha não localizada',
   'Guincho e socorro',
   'Serviço em oficina terceirizada');
