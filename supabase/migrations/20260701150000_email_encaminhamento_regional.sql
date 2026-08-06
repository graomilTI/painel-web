-- Aperta as regras de classificação da Central de E-mails (a regra de LOGÍSTICA usava a
-- palavra genérica "os" e capturava quase tudo) e ativa o encaminhamento sugerido pro
-- gestor responsável da regional, faturamento ou auditoria conforme a categoria.

create table if not exists public.email_gestores_regionais (
  id uuid primary key default gen_random_uuid(),
  regional text not null unique,
  gestor_nome text not null,
  gestor_email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_gestores_regionais enable row level security;
drop policy if exists email_gestores_regionais_select on public.email_gestores_regionais;
drop policy if exists email_gestores_regionais_insert on public.email_gestores_regionais;
drop policy if exists email_gestores_regionais_update on public.email_gestores_regionais;
drop policy if exists email_gestores_regionais_delete on public.email_gestores_regionais;
create policy email_gestores_regionais_select
  on public.email_gestores_regionais for select to authenticated using (true);
create policy email_gestores_regionais_insert
  on public.email_gestores_regionais for insert to authenticated with check (true);
create policy email_gestores_regionais_update
  on public.email_gestores_regionais for update to authenticated using (true) with check (true);
create policy email_gestores_regionais_delete
  on public.email_gestores_regionais for delete to authenticated using (true);
insert into public.email_gestores_regionais (regional, gestor_nome, gestor_email) values
  ('BAHIA', 'Douglas Candido de Lima', 'supervisao.bahia@grao1000.com.br'),
  ('GOIAS', 'Sidnei Ribeiro de Souza', 'sidneiribeirolm@gmail.com'),
  ('MARANHAO', 'Manuel de Jesus Santos Martins', 'manuel_kaique@hotmail.com'),
  ('MATO GROSSO DO SUL', 'Samuel Santa Cruz Mareco', 'samuelbbca@gmail.com'),
  ('MINAS GERAIS', 'Ricardo Melo de Araujo', 'ricardomelo.araujo@hotmail.com'),
  ('MATO GROSSO MT1', 'Marco Augusto Ferreira de Andrade', 'marco.augusto@grao1000.com.br'),
  ('MATO GROSSO MT2', 'Jean Pablo Souza Silva', 'jeanpabloex@gmail.com'),
  ('MATO GROSSO MT3', 'Vanuza Pereira da Silva', 'vanuzadeusnocorasao@gmail.com'),
  ('MATO GROSSO MT4', 'Cleuton Cesar Soares de Albernaz', 'supervisao.ms@grao1000.com.br'),
  ('PARA', 'Jadson Teixeira Saraiva', 'supervisao.para@grao1000.com.br'),
  ('PARAGUAI', 'Anderson do Carmo Rosa', 'andergraomil@gmail.com'),
  ('PR PONTA GROSSA', 'Michael Fernando Ribas', 'michaelribas2017@gmail.com'),
  ('PR CASCAVEL', 'Anderson do Carmo Rosa', 'andergraomil@gmail.com'),
  ('PR LONDRINA', 'Michael Goncalves da Silva', 'supervisao.londrina@grao1000.com.br'),
  ('PR MARINGA', 'Jose Boa Ventura da Silva', 'boaventura.qualidade@gmail.com'),
  ('RIO GRANDE DO SUL', 'Dilmar Antonio Thomet', 'dilmarthomet09@gmail.com'),
  ('SAO PAULO', 'Mayckon Wender Inoue Pereira', 'mayckoninoue@grao1000.com.br'),
  ('TOCANTINS', 'Kairo de Oliveira Leite', 'kairoleite0@gmail.com')
on conflict (regional) do update set
  gestor_nome = excluded.gestor_nome,
  gestor_email = excluded.gestor_email,
  ativo = true,
  updated_at = now();
alter table public.email_regras
  add column if not exists destino_regional boolean not null default false,
  add column if not exists destino_fixo_email text,
  add column if not exists cc_fixo_email text;
alter table public.email_outbox
  add column if not exists tipo text not null default 'RESPOSTA';
alter table public.email_outbox drop constraint if exists email_outbox_tipo_check;
alter table public.email_outbox
  add constraint email_outbox_tipo_check check (tipo in ('RESPOSTA', 'ENCAMINHAMENTO'));
alter table public.email_messages
  add column if not exists encaminhar_sugerido_para text,
  add column if not exists encaminhar_sugerido_cc text;
-- "os"/"o.s"/"contrato" genéricos demais estavam capturando quase todo e-mail recebido.
-- Troca por frases reais encontradas nos e-mails de logística/embarque.
update public.email_regras
set
  palavras_chave = array[
    'nova ordem de serviço de classificação', 'nova ordem de servico de classificacao',
    'fechamento de frete',
    'liberação de embarque', 'liberacao de embarque',
    'programação de embarque', 'programacao de embarque',
    'bloqueio de embarque', 'desbloqueio de embarque',
    'liberação de lote', 'liberacao de lote',
    'embarques programados', 'programação de embarques', 'programacao de embarques',
    'autorização de embarque', 'autorizacao de embarque'
  ],
  destino_regional = true,
  updated_at = now()
where nome = 'Logística / OS / contrato';
update public.email_regras
set destino_fixo_email = 'faturamento@grao1000.com.br', updated_at = now()
where nome = 'Notas fiscais e XML';
insert into public.email_regras (nome, prioridade, palavras_chave, categoria, prioridade_email, precisa_resposta, destino_regional, cc_fixo_email)
values (
  'Qualidade / carga recusada',
  25,
  array['carga recusada', 'fora do padrão', 'fora do padrao', 'impureza', 'carga refugada', 'modal recusado'],
  'QUALIDADE',
  'ALTA',
  true,
  true,
  'auditoria@grao1000.com.br'
)
on conflict do nothing;
insert into public.email_regras (nome, prioridade, palavras_chave, remetente_contem, assunto_contem, categoria, prioridade_email, precisa_resposta)
values (
  'Proposta comercial (interno)',
  8,
  array[]::text[],
  'contratos@grao1000.com.br',
  'proposta comercial',
  'PROPOSTA',
  'NORMAL',
  false
)
on conflict do nothing;
