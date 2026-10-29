// Feed .ics da Agenda de Rastreadores (Frotas) para o usuário sincronizar com o Google Agenda.
//
//   GET  ?t=<token>        -> calendário iCalendar (público; o token é o segredo, como o "endereço secreto" do Google)
//   POST { acao }          -> (com login) 'status' | 'obter' | 'regenerar' | 'cancelar': gerencia o link do próprio usuário
//
// verify_jwt = false (o GET é chamado pelo Google, sem login); o POST valida a sessão e a permissão aqui dentro.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { authorizeRequest } from '../_shared/authorization.ts';
import { buildCalendar, eventosDe } from './ics.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const MODULOS = ['FROTAS_RASTREADORES', 'RASTREADORES', 'FROTAS_CADASTROS'];
const TOKEN_RE = /^[a-f0-9]{48}$/;
const JANELA_DIAS = 120; // compromissos dos últimos 120 dias em diante

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function novoToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function urlDoFeed(token: string): { url: string; webcal: string } {
  const base = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/frotas-agenda-ics?t=${token}`;
  return { url: base, webcal: base.replace(/^https?:\/\//, 'webcal://') };
}

async function gerarFeed(token: string): Promise<Response> {
  if (!TOKEN_RE.test(token)) return new Response('Link inválido.', { status: 404, headers: CORS });
  const db = admin();
  const { data: ass } = await db.from('frotas_agenda_assinaturas').select('id,user_id,acessos').eq('token', token).maybeSingle();
  if (!ass) return new Response('Link inválido ou cancelado.', { status: 404, headers: CORS });

  // O link morre junto com o acesso: usuário removido ou banido no Auth não recebe mais a agenda.
  const { data: u, error: uErr } = await db.auth.admin.getUserById(ass.user_id);
  const banidoAte = u?.user?.banned_until ? new Date(u.user.banned_until).getTime() : 0;
  if (uErr || !u?.user || banidoAte > Date.now()) return new Response('Acesso encerrado.', { status: 403, headers: CORS });

  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString().slice(0, 10);
  const [man, ras, vei, mot] = await Promise.all([
    db.from('frotas_rastreadores_manutencoes')
      .select('id,placa,situacao,motivo,tecnico_nome,tecnico_contato,data_agendada,hora_agendada,local_agendado,motorista_nome,motorista_contato,local_maps_url')
      .not('data_agendada', 'is', null).gte('data_agendada', desde).neq('situacao', 'cancelada').limit(5000),
    db.from('frotas_rastreadores').select('id,placa,status,data_instalacao,hora_instalacao,tecnico_instalacao,tecnico_contato_instalacao,local_instalacao,cidade,estado')
      .not('data_instalacao', 'is', null).gte('data_instalacao', desde).in('status', ['agendado', 'concluido']).limit(5000),
    db.from('frotas_veiculos').select('placa,motorista_atual').limit(5000),
    db.from('frotas_motoristas').select('nome,telefone').limit(5000),
  ]);
  for (const r of [man, ras, vei, mot]) if (r.error) { console.error('[frotas-agenda-ics]', r.error); return new Response('Erro ao montar a agenda.', { status: 500, headers: CORS }); }

  const corpo = buildCalendar({ eventos: eventosDe({ manutencoes: man.data ?? [], rastreadores: ras.data ?? [], veiculos: vei.data ?? [], motoristas: mot.data ?? [] }) });
  await db.from('frotas_agenda_assinaturas').update({ ultimo_acesso_em: new Date().toISOString(), acessos: (ass.acessos ?? 0) + 1 }).eq('id', ass.id);
  return new Response(corpo, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="agenda-frotas.ics"' },
  });
}

async function gerenciar(req: Request): Promise<Response> {
  const auth = await authorizeRequest(req, MODULOS);
  if (!auth.ok || !auth.userId) return json({ error: auth.error ?? 'Não autorizado.' }, auth.status || 403);
  let corpo: { acao?: string } = {};
  try { corpo = await req.json(); } catch { /* corpo vazio = status */ }
  const acao = String(corpo.acao ?? 'status');
  const db = admin();
  const { data: atual } = await db.from('frotas_agenda_assinaturas').select('id,token').eq('user_id', auth.userId).maybeSingle();

  if (acao === 'status') return json(atual ? { ativo: true, ...urlDoFeed(atual.token) } : { ativo: false });

  if (acao === 'cancelar') {
    if (atual) await db.from('frotas_agenda_assinaturas').delete().eq('id', atual.id);
    return json({ ativo: false });
  }

  if (acao === 'obter' || acao === 'regenerar') {
    if (atual && acao === 'obter') return json({ ativo: true, ...urlDoFeed(atual.token) });
    const token = novoToken();
    const q = atual
      ? db.from('frotas_agenda_assinaturas').update({ token, renovado_em: new Date().toISOString(), acessos: 0, ultimo_acesso_em: null }).eq('id', atual.id)
      : db.from('frotas_agenda_assinaturas').insert({ user_id: auth.userId, token });
    const { error } = await q;
    if (error) { console.error('[frotas-agenda-ics]', error); return json({ error: 'Não foi possível gerar o link.' }, 500); }
    return json({ ativo: true, ...urlDoFeed(token) });
  }
  return json({ error: 'Ação inválida.' }, 400);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (req.method === 'GET') return await gerarFeed(new URL(req.url).searchParams.get('t') ?? '');
    if (req.method === 'POST') return await gerenciar(req);
    return json({ error: 'Método não permitido.' }, 405);
  } catch (err) {
    console.error('[frotas-agenda-ics]', err);
    return json({ error: 'Erro interno.' }, 500);
  }
});
