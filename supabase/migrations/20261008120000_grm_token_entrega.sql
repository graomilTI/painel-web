-- Entrega do token de sessão do GRM pelo painel (substitui o "copiar e colar no SSH").
--
-- Contexto: desde 30/09/2026 o login do GRM exige Cloudflare Turnstile, então só um
-- humano num navegador consegue um token novo (vale até 23:59:59 BRT). Antes, o token
-- era copiado do navegador e colado no servidor via SSH (`grm-token-cache.js salvar`).
--
-- Agora: depois de entrar no GRM, a pessoa clica no favorito "Enviar token GRM" (ou cola
-- o token em TI > Integrações). O painel chama grm_token_entregar(), que guarda o token
-- aqui; o grm-token-cache.js do servidor (que todo agente já usa) o busca sozinho
-- quando não há token válido em cache, confere no GRM, grava no cache e APAGA o token
-- desta tabela. O token só fica aqui até o servidor buscar (minutos) — e nunca é
-- legível por anon/authenticated (RLS ligada, sem policy, sem grant).

create table if not exists public.grm_token_entregas (
  id uuid primary key default gen_random_uuid(),
  token text,
  user_email text,
  user_code text,
  token_exp timestamptz,
  status text not null default 'pendente',
  mensagem text,
  tentativas integer not null default 0,
  enviado_por uuid,
  enviado_em timestamptz not null default now(),
  aplicado_em timestamptz,
  constraint grm_token_entregas_status_check
    check (status in ('pendente', 'processando', 'aplicado', 'recusado', 'expirado', 'substituido'))
);

comment on table public.grm_token_entregas is
  'Entrega do token de sessão do GRM (painel -> servidor dos agentes). A coluna token é apagada assim que o servidor aplica, recusa ou o prazo vence; só service_role lê.';

create index if not exists grm_token_entregas_status_idx on public.grm_token_entregas (status, enviado_em desc);

alter table public.grm_token_entregas enable row level security;
revoke all on table public.grm_token_entregas from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entrega: valida a forma do JWT (e o exp), guarda e devolve um resumo SEM o token.
create or replace function public.grm_token_entregar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := regexp_replace(btrim(coalesce(p_token, '')), '^(bearer\s+)', '', 'i');
  v_payload text;
  v_claims jsonb;
  v_exp timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.painel_has_module(array['TI', 'TI_AGENTES', 'TI_INTEGRACOES', 'INTEGRACOES'], true) then
    raise exception 'Usuário sem permissão para enviar o token do GRM';
  end if;

  v_token := btrim(v_token, '"''');
  if v_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'Isso não parece um token do GRM (deveria ter 3 partes separadas por ponto, sem espaços).';
  end if;

  begin
    v_payload := translate(split_part(v_token, '.', 2), '-_', '+/');
    v_payload := v_payload || repeat('=', (4 - length(v_payload) % 4) % 4);
    v_claims := convert_from(decode(v_payload, 'base64'), 'UTF8')::jsonb;
  exception when others then
    raise exception 'Token ilegível: o conteúdo do JWT não pôde ser lido.';
  end;

  if coalesce(v_claims ->> 'exp', '') !~ '^[0-9]+$' then
    raise exception 'Token sem data de validade (exp).';
  end if;
  v_exp := to_timestamp((v_claims ->> 'exp')::bigint);
  if v_exp <= now() + interval '2 minutes' then
    raise exception 'Este token já venceu (%). Saia do GRM, entre de novo e envie outra vez.',
      to_char(v_exp at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  -- higiene: nada de token parado na tabela
  update public.grm_token_entregas
     set token = null,
         status = case when status = 'pendente' then 'substituido' else status end
   where token is not null
     and (status <> 'processando' or enviado_em < now() - interval '15 minutes');

  insert into public.grm_token_entregas (token, user_email, user_code, token_exp, enviado_por)
  values (v_token, nullif(v_claims ->> 'userEmail', ''), nullif(v_claims ->> 'userCode', ''), v_exp, v_uid)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'user_email', v_claims ->> 'userEmail',
    'token_exp', v_exp
  );
end;
$$;

revoke all on function public.grm_token_entregar(text) from public, anon;
grant execute on function public.grm_token_entregar(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Acompanhamento na tela: últimas entregas, sem o token.
create or replace function public.grm_token_entregas_status(p_limite integer default 5)
returns table (
  id uuid,
  status text,
  mensagem text,
  user_email text,
  token_exp timestamptz,
  enviado_em timestamptz,
  aplicado_em timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.painel_has_module(array['TI', 'TI_AGENTES', 'TI_INTEGRACOES', 'INTEGRACOES'], false) then
    raise exception 'Usuário sem permissão para ver o token do GRM';
  end if;

  return query
    select e.id, e.status, e.mensagem, e.user_email, e.token_exp, e.enviado_em, e.aplicado_em
      from public.grm_token_entregas e
     order by e.enviado_em desc
     limit greatest(1, least(coalesce(p_limite, 5), 20));
end;
$$;

revoke all on function public.grm_token_entregas_status(integer) from public, anon;
grant execute on function public.grm_token_entregas_status(integer) to authenticated;
