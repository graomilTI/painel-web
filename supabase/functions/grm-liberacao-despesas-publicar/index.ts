import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  isDesiredStateApplied,
  shouldClearOperationalRules,
} from '../_shared/grm-liberacao-policy.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_REASONS = new Set([
  'INATIVIDADE_5_MIN',
  'TROCA_DE_TELA',
  'FECHAMENTO_JANELA',
  'SALVAR_MANUAL',
  'RECONCILIACAO',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function norm(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isActiveStaff(row: Record<string, unknown>): boolean {
  if (row?.ativo === false) return false;
  if (clean(row?.desligamento)) return false;
  const status = norm(row?.situacao ?? row?.status);
  return ![
    'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA',
    'DEMITIDO', 'DEMITIDA', 'NAO ATIVO', 'NAO ATIVA',
  ].some((item) => status.includes(item));
}

function regionalMatches(row: Record<string, unknown>, regional: string): boolean {
  const target = norm(regional);
  if (!target) return false;
  const fields = [row?.supervisao, row?.coordenacao, row?.regional].map(norm).filter(Boolean);
  return fields.some((field) => field === target || field.includes(target) || target.includes(field));
}

function chunk<T>(rows: T[], size = 300): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function jwtRole(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (!payload) return '';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return clean(JSON.parse(decoded)?.role);
  } catch {
    return '';
  }
}

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function canonicalRule(rule: Record<string, unknown>) {
  return {
    tipo_despesa: clean(rule.tipo_despesa),
    exibir: rule.exibir !== false,
    valor_maximo: Number(rule.valor_maximo ?? 0),
    auto: rule.auto === true,
    carga_nhe: rule.carga_nhe !== false,
    max_mov_dia: Math.max(0, Number(rule.max_mov_dia ?? 1) || 0),
  };
}

function canonicalRules(rules: Record<string, unknown>[]) {
  const byType = new Map<string, ReturnType<typeof canonicalRule>>();
  for (const raw of rules) {
    const rule = canonicalRule(raw);
    if (!rule.tipo_despesa) continue;
    byType.set(norm(rule.tipo_despesa), rule);
  }
  return [...byType.values()].sort((a, b) => a.tipo_despesa.localeCompare(b.tipo_despesa, 'pt-BR'));
}

async function sha256(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function indexSourceRows(rows: Record<string, unknown>[]) {
  const byCpf = new Map<string, Record<string, unknown>>();
  const byId = new Map<string, Record<string, unknown>>();
  const byName = new Map<string, Record<string, unknown>>();
  for (const row of rows || []) {
    const id = clean(row.colaborador_id);
    const cpf = digits(row.cpf ?? row.colaborador_cpf ?? id);
    const name = norm(row.nome_colaborador ?? row.colaborador_nome ?? row.nome);
    if (cpf.length === 11) byCpf.set(cpf, row);
    if (id) byId.set(id, row);
    if (name) byName.set(name, row);
  }
  return { byCpf, byId, byName };
}

function sourceRowForStaff(
  index: ReturnType<typeof indexSourceRows>,
  staff: Record<string, unknown>,
  linkKeys: string[],
) {
  const cpf = digits(staff.cpf);
  if (cpf && index.byCpf.has(cpf)) return index.byCpf.get(cpf) || null;
  for (const key of linkKeys) if (index.byId.has(key)) return index.byId.get(key) || null;
  const staffId = clean(staff.id ?? staff.colaborador_id);
  if (staffId && index.byId.has(staffId)) return index.byId.get(staffId) || null;
  return index.byName.get(norm(staff.nome)) || null;
}

function configKeyExtra(value: unknown, description?: unknown): string {
  const key = norm(value);
  if (key === 'RECARGA') return 'EXTRA_RECARGA';
  if (key === 'LAVANDERIA') return 'EXTRA_LAVANDERIA';
  if (key === 'LAVAGEM DE VEICULO') return 'EXTRA_LAVAGEM_VEICULO';
  if (key === 'OUTROS') {
    const desc = norm(description);
    if (desc.includes('COMBUSTIVEL')) return 'EXTRA_COMBUSTIVEL';
    // 4 categorias mapeadas em 09/09/2026 (pedido do usuário, achado ao
    // investigar um colaborador com extras "Outros" nunca configurados no
    // GRM) — nomes conferidos contra o dropdown real de Tipo da Despesa do
    // Caixa Operacional (lista completa passada pela usuária).
    if (desc.includes('COMERCIAL CLIENTE')) return 'EXTRA_COMERCIAL_CLIENTE';
    if (desc.includes('CORREIOS') || desc.includes('POSTAGEM') || desc.includes('FRETE')) return 'EXTRA_POSTAGENS_FRETES';
    if (desc.includes('COMPRA') && desc.includes('ALOJAMENTO')) return 'EXTRA_COMPRA_ALOJAMENTO';
    // "Limpeza" aqui vira Serviços de Limpeza (mão de obra), não Material de
    // Limpeza (insumo) — assumido a partir do texto "limpeza de alojamento"
    // do caso real; corrigir se o uso real for de compra de material.
    if (desc.includes('LIMPEZA')) return 'EXTRA_SERVICOS_LIMPEZA';
    // Estas 4 categorias já existiam em grm_despesas_tipos_config (com
    // observação documentando a intenção de detecção) desde 01-13/08/2026,
    // mas o código aqui nunca foi escrito — a tabela client-side
    // AGENTE_OUTROS_CATEGORIAS (adm-conferencia.js) já tratava esses textos
    // como "categoria reconhecida" (sumindo da fila de lançamento manual)
    // SEM o GRM nunca ter sido configurado de verdade: pior versão do mesmo
    // bug investigado em 09/09 (a despesa ficava duplamente invisível).
    // Achado ao mapear as 4 categorias novas acima e notar o padrão.
    if (desc.includes('BONUS') || desc.includes('BONIFICACAO') || desc.includes('PREMIACAO')) return 'EXTRA_BONUS';
    if (desc.includes('PEDAGIO')) return 'EXTRA_PEDAGIO';
    if (desc.includes('PASSAGEM')) return 'EXTRA_PASSAGEM';
    if (desc.includes('MANUTENCAO') || desc.includes('TROCA DE PNEU')) return 'EXTRA_MANUTENCAO_VEICULO';
  }
  return 'EXTRA_OUTROS';
}

function configKeyDeslocamento(value: unknown): string | null {
  const key = norm(value);
  if (key === 'UBER TAXI') return 'DESLOCAMENTO_UBER_TAXI';
  if (key === 'REEMBOLSO KM') return 'DESLOCAMENTO_REEMBOLSO_KM';
  return null;
}

const CHAVES_AUTO_PERMITIDAS = new Set([
  'ALIMENTACAO_ALMOCO',
  'VINCULO_SALARIO_INTERMITENTE',
  'VINCULO_SERVICOS_TERCEIRIZADOS',
]);

function ruleFromConfig(config: Record<string, unknown>, overrideValue?: number | null) {
  const configuredValue = overrideValue != null && Number(overrideValue) > 0
    ? Number(overrideValue)
    : Number(config.valor_padrao ?? 0);
  return canonicalRule({
    tipo_despesa: config.tipo_grm,
    exibir: config.exibir,
    valor_maximo: configuredValue,
    auto: CHAVES_AUTO_PERMITIDAS.has(clean(config.chave)) && config.auto === true,
    carga_nhe: config.carga_nhe,
    max_mov_dia: config.max_mov_dia,
  });
}

function buildRulesForStaff(args: {
  staff: Record<string, unknown>;
  contract?: Record<string, unknown> | null;
  linkKeys: string[];
  alimentacao: ReturnType<typeof indexSourceRows>;
  estadia: ReturnType<typeof indexSourceRows>;
  deslocamento: ReturnType<typeof indexSourceRows>;
  extras: Record<string, unknown>[];
  configByKey: Map<string, Record<string, unknown>>;
}) {
  const pendingConfig: string[] = [];
  const rules: Record<string, unknown>[] = [];
  const { staff, contract, linkKeys, alimentacao, estadia, deslocamento, extras, configByKey } = args;

  const requireConfig = (
    key: string,
    selected: boolean,
    overrideValue?: number | null,
    allowZero = false,
  ) => {
    if (!selected) return;
    const config = configByKey.get(key);
    if (!config || config.ativo !== true || !clean(config.tipo_grm)) {
      pendingConfig.push(key);
      return;
    }
    const overrideNumber = Number(overrideValue);
    const hasValidOverride = overrideValue != null
      && Number.isFinite(overrideNumber)
      && (allowZero ? overrideNumber >= 0 : overrideNumber > 0);
    const value = hasValidOverride ? overrideNumber : Number(config.valor_padrao ?? 0);
    if (!Number.isFinite(value) || (allowZero ? value < 0 : !(value > 0))) {
      pendingConfig.push(`${key}:VALOR`);
      return;
    }
    rules.push(ruleFromConfig(config, value));
  };

  const contractType = norm(contract?.tipo_contrato ?? staff.tipo_contrato);
  const contractValue = Number(contract?.salario ?? staff.salario ?? 0);
  requireConfig(
    'VINCULO_SALARIO_INTERMITENTE',
    contractType === 'INTERMITENTE',
    contractValue,
    true,
  );
  requireConfig(
    'VINCULO_SERVICOS_TERCEIRIZADOS',
    contractType === 'DIARISTA',
    contractValue,
    true,
  );

  const ali = sourceRowForStaff(alimentacao, staff, linkKeys);
  requireConfig('ALIMENTACAO_CAFE', ali?.cafe === true);
  requireConfig('ALIMENTACAO_ALMOCO', ali ? ali.almoco !== false : true);
  requireConfig('ALIMENTACAO_JANTA', ali?.janta === true);

  const stay = sourceRowForStaff(estadia, staff, linkKeys);
  requireConfig('ESTADIA_PERNOITE', norm(stay?.tipo_estadia) === 'PERNOITE');

  const des = sourceRowForStaff(deslocamento, staff, linkKeys);
  const desKey = configKeyDeslocamento(des?.tipo_deslocamento);
  const displacementValue = Number(des?.valor ?? 0);
  if (desKey) {
    requireConfig(
      desKey,
      true,
      displacementValue,
      ['DESLOCAMENTO_REEMBOLSO_KM', 'DESLOCAMENTO_UBER_TAXI'].includes(desKey),
    );
  }

  const cpf = digits(staff.cpf);
  const name = norm(staff.nome);
  const staffId = clean(staff.id ?? staff.colaborador_id);
  const acceptedKeys = new Set([cpf, staffId, ...linkKeys].filter(Boolean));
  const staffExtras = (extras || []).filter((row) => {
    const rowId = clean(row.colaborador_id);
    const rowCpf = digits(row.cpf ?? row.colaborador_cpf ?? rowId);
    const rowName = norm(row.nome_colaborador ?? row.colaborador_nome ?? row.nome);
    return (rowCpf.length === 11 && rowCpf === cpf)
      || acceptedKeys.has(rowId)
      || (!!rowName && rowName === name);
  });
  for (const extra of staffExtras) {
    const key = configKeyExtra(
      extra.tipo_despesa,
      `${clean(extra.descricao)} ${clean(extra.observacao)}`,
    );
    if (key === 'EXTRA_OUTROS') continue;
    const extraValue = Number(extra.valor ?? 0);
    const abreComZero = [
      'EXTRA_LAVANDERIA', 'EXTRA_COMBUSTIVEL', 'EXTRA_RECARGA', 'EXTRA_LAVAGEM_VEICULO',
      'EXTRA_COMERCIAL_CLIENTE', 'EXTRA_POSTAGENS_FRETES', 'EXTRA_COMPRA_ALOJAMENTO', 'EXTRA_SERVICOS_LIMPEZA',
      // EXTRA_BONUS documentado assim desde 13/08 (observação em
      // grm_despesas_tipos_config); PASSAGEM/PEDAGIO/MANUTENCAO_VEICULO
      // ficam de fora — a observação delas não menciona abrir a zero, e um
      // pedágio/passagem/manutenção sem valor nenhum é mais provável ser
      // rascunho incompleto do que despesa real ainda não apurada.
      'EXTRA_BONUS',
    ].includes(key);
    if (extraValue > 0 || abreComZero) {
      requireConfig(key, true, extraValue, abreComZero);
    }
  }

  return { rules: canonicalRules(rules), pendingConfig: [...new Set(pendingConfig)] };
}

const AGENTE_LIBERACAO_DESPESAS_PAUSADO = false;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authorization = req.headers.get('Authorization') || '';
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'Secrets do Supabase não configurados.' }, 500);
    }
    if (!authorization) return json({ error: 'Sessão obrigatória.' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bearerToken = authorization.replace(/^Bearer\s+/i, '').trim();
    const internalReconciliation = bearerToken === serviceKey || jwtRole(bearerToken) === 'service_role';
    const { data: userData, error: userError } = internalReconciliation
      ? { data: { user: null }, error: null }
      : await userClient.auth.getUser();
    if (!internalReconciliation && (userError || !userData?.user)) {
      return json({ error: 'Sessão inválida.' }, 401);
    }

    const body = await readBody(req) as Record<string, unknown>;
    const programacaoIds = [...new Set(
      (Array.isArray(body.programacaoIds) ? body.programacaoIds : [body.programacaoId])
        .map(clean)
        .filter(Boolean),
    )];
    if (!programacaoIds.length) return json({ error: 'Nenhuma programação informada.' }, 400);

    const reason = VALID_REASONS.has(clean(body.motivo)) ? clean(body.motivo) : 'INATIVIDADE_5_MIN';
    const settleMs = Math.min(2000, Math.max(0, Number(body.settleMs ?? 0) || 0));
    if (settleMs) await new Promise((resolve) => setTimeout(resolve, settleMs));

    const programacaoClient = internalReconciliation ? service : userClient;
    const { data: programacoes, error: progError } = await programacaoClient
      .from('programacao_dia')
      .select('*')
      .in('id', programacaoIds);
    if (progError) throw progError;
    if (!programacoes?.length || programacoes.length !== programacaoIds.length) {
      return json({ error: 'Uma ou mais programações não existem ou não estão liberadas para este usuário.' }, 403);
    }

    const groups = new Map<string, { regional: string; date: string; ids: string[] }>();
    for (const row of programacoes) {
      const regional = clean(row.supervisao ?? row.regional ?? row.coordenacao);
      const date = clean(row.data_referencia ?? row.data ?? row.data_programacao).slice(0, 10);
      if (!regional || !date) return json({ error: `Programação ${row.id} sem regional ou data de referência.` }, 422);
      const key = `${norm(regional)}|${date}`;
      const current = groups.get(key) || { regional, date, ids: [] };
      current.ids.push(clean(row.id));
      groups.set(key, current);
    }

    const { data: configRows, error: configError } = await service
      .from('grm_despesas_tipos_config')
      .select('*');
    if (configError) throw configError;
    const configByKey = new Map((configRows || []).map((row) => [clean(row.chave), row]));

    const { data: allStaffRows, error: staffError } = await service
      .from('colaboradores_atuais')
      .select('*')
      .limit(20000);
    if (staffError) throw staffError;
    const allStaff = (allStaffRows || []).filter(isActiveStaff);
    const staffByCpf = new Map<string, Record<string, unknown>>();
    const staffByName = new Map<string, Record<string, unknown>[]>();
    for (const staff of allStaff) {
      const cpf = digits(staff.cpf);
      if (cpf.length === 11) staffByCpf.set(cpf, staff);
      const name = norm(staff.nome);
      if (name) staffByName.set(name, [...(staffByName.get(name) || []), staff]);
    }

    const { data: contractRows, error: contractError } = await service
      .from('colaborador_cruzamento')
      .select('cpf,tipo_contrato,salario,atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(20000);
    if (contractError) throw contractError;
    const contractByCpf = new Map<string, Record<string, unknown>>();
    for (const contract of contractRows || []) {
      const cpf = digits(contract.cpf);
      if (cpf.length === 11 && !contractByCpf.has(cpf)) contractByCpf.set(cpf, contract);
    }

    const activeWindowStart = todayInSaoPaulo();
    const { data: activePrograms, error: globalOsError } = await service
      .from('programacao_dia')
      .select('id,data_referencia')
      .gte('data_referencia', activeWindowStart)
      .limit(20000);
    if (globalOsError) throw globalOsError;
    const globalOsIds = (activePrograms || []).map((row) => clean(row.id)).filter(Boolean);
    const globalLinks: Record<string, unknown>[] = [];
    for (const ids of chunk(globalOsIds)) {
      const { data, error } = await service
        .from('programacao_equipe')
        .select('programacao_id,os_id,colaborador_id,nome_colaborador,confirmado,created_at')
        .in('programacao_id', ids)
        .eq('confirmado', true);
      if (error) throw error;
      globalLinks.push(...(data || []).map((row) => ({
        ...row,
        colaborador_key: row.colaborador_id,
        colaborador_cpf: row.colaborador_id,
      })));
    }

    const resolveLinkCpf = (link: Record<string, unknown>) => {
      const direct = digits(link.colaborador_cpf ?? link.colaborador_key);
      if (direct.length === 11) return { cpf: direct, error: null };
      const candidates = staffByName.get(norm(link.colaborador_nome ?? link.colaborador_key)) || [];
      if (candidates.length === 1) {
        const cpf = digits(candidates[0].cpf);
        return cpf.length === 11 ? { cpf, error: null } : { cpf: '', error: 'CPF_AUSENTE' };
      }
      if (candidates.length > 1) return { cpf: '', error: 'NOME_AMBIGUO' };
      return { cpf: '', error: 'COLABORADOR_NAO_LOCALIZADO' };
    };

    const cpfsAuthorizedInActiveWindow = new Set<string>();
    for (const link of globalLinks) {
      const resolved = resolveLinkCpf(link);
      if (!resolved.cpf) continue;
      cpfsAuthorizedInActiveWindow.add(resolved.cpf);
    }
    for (const ids of chunk(globalOsIds)) {
      const { data, error } = await service
        .from('programacao_colaboradores')
        .select('programacao_id,colaborador_id,nome_colaborador')
        .in('programacao_id', ids)
        .eq('disponibilidade', 'DISPONIVEL');
      if (error) throw error;
      for (const row of data || []) {
        const resolved = resolveLinkCpf({
          colaborador_key: row.colaborador_id,
          colaborador_cpf: row.colaborador_id,
          colaborador_nome: row.nome_colaborador,
        });
        if (!resolved.cpf) continue;
        cpfsAuthorizedInActiveWindow.add(resolved.cpf);
      }
    }

    const overall = {
      grupos: groups.size,
      versoes: [] as string[],
      avaliados: 0,
      enfileirados: 0,
      enfileirados_na_janela: 0,
      aplicar: 0,
      limpar: 0,
      sem_alteracao: 0,
      preservados_por_outra_regional: 0,
      grupos_adiados_sem_os: 0,
      avisos: [] as string[],
    };

    for (const group of groups.values()) {
      const regionalStaff = allStaff.filter((staff) => regionalMatches(staff, group.regional));
      const regionalStaffByCpf = new Map(
        regionalStaff
          .map((staff) => [digits(staff.cpf), staff] as const)
          .filter(([cpf]) => cpf.length === 11),
      );

      const { data: teamRows, error: osError } = await service
        .from('programacao_equipe')
        .select('programacao_id,os_id,colaborador_id,nome_colaborador,confirmado,created_at')
        .in('programacao_id', group.ids)
        .eq('confirmado', true);
      if (osError) throw osError;
      const currentLinks = (teamRows || []).filter((row) => clean(row.os_id)).map((row) => ({
        ...row,
        colaborador_key: row.colaborador_id,
        colaborador_cpf: row.colaborador_id,
      }));

      const { data: availableRows, error: availableError } = await service
        .from('programacao_colaboradores')
        .select('programacao_id,colaborador_id,nome_colaborador,disponibilidade')
        .in('programacao_id', group.ids)
        .eq('disponibilidade', 'DISPONIVEL');
      if (availableError) throw availableError;

      if (!currentLinks.length && !availableRows?.length) {
        overall.grupos_adiados_sem_os += 1;
        overall.avisos.push(
          `${group.regional} em ${group.date}: nenhum colaborador confirmado em O.S.; limpeza adiada por segurança.`,
        );
        continue;
      }

      const linkKeysByCpf = new Map<string, string[]>();
      const linkedStaffFallbackByCpf = new Map<string, Record<string, unknown>>();
      const currentCpfs = new Set<string>();
      const linkProblems: Record<string, unknown>[] = [];
      for (const link of currentLinks) {
        const resolved = resolveLinkCpf(link);
        if (!resolved.cpf) {
          linkProblems.push({
            os_id: link.os_id,
            colaborador: link.colaborador_nome ?? link.colaborador_key,
            problema: resolved.error,
          });
          continue;
        }
        currentCpfs.add(resolved.cpf);
        if (!staffByCpf.has(resolved.cpf)) {
          linkedStaffFallbackByCpf.set(resolved.cpf, {
            id: clean(link.colaborador_key) || resolved.cpf,
            colaborador_id: clean(link.colaborador_key) || resolved.cpf,
            cpf: resolved.cpf,
            nome: clean(link.colaborador_nome ?? link.colaborador_key) || resolved.cpf,
          });
        }
        const keys = new Set(linkKeysByCpf.get(resolved.cpf) || []);
        [link.colaborador_key, link.colaborador_cpf].map(clean).filter(Boolean).forEach((key) => keys.add(key));
        linkKeysByCpf.set(resolved.cpf, [...keys]);
      }
      if (linkProblems.length) {
        return json({
          error: 'A programação possui colaborador sem CPF válido ou não localizado.',
          regional: group.regional,
          data_referencia: group.date,
          detalhes: linkProblems,
        }, 422);
      }

      const availableCpfs = new Set<string>();
      for (const row of availableRows || []) {
        const resolved = resolveLinkCpf({
          colaborador_key: row.colaborador_id,
          colaborador_cpf: row.colaborador_id,
          colaborador_nome: row.nome_colaborador,
        });
        if (!resolved.cpf) {
          linkProblems.push({ colaborador: row.nome_colaborador ?? row.colaborador_id, problema: resolved.error, origem: 'DISPONIVEL' });
          continue;
        }
        if (!norm(contractByCpf.get(resolved.cpf)?.tipo_contrato).includes('EFETIVO')) {
          overall.avisos.push(`${row.nome_colaborador || resolved.cpf}: disponibilidade ignorada porque o contrato vigente não é EFETIVO.`);
          continue;
        }
        availableCpfs.add(resolved.cpf);
        const keys = new Set(linkKeysByCpf.get(resolved.cpf) || []);
        [row.colaborador_id, resolved.cpf].map(clean).filter(Boolean).forEach((key) => keys.add(key));
        linkKeysByCpf.set(resolved.cpf, [...keys]);
      }
      if (linkProblems.length) {
        return json({
          error: 'A programação possui colaborador sem CPF válido ou não localizado.',
          regional: group.regional,
          data_referencia: group.date,
          detalhes: linkProblems,
        }, 422);
      }
      const authorizedCpfs = new Set([...currentCpfs, ...availableCpfs]);

      const [aliRes, estRes, desRes, extraRes] = await Promise.all([
        service.from('programacao_alimentacao').select('*').in('programacao_id', group.ids),
        service.from('programacao_estadia').select('*').in('programacao_id', group.ids),
        service.from('programacao_deslocamento').select('*').in('programacao_id', group.ids),
        service.from('programacao_extras').select('*').in('programacao_id', group.ids),
      ]);
      if (aliRes.error) throw aliRes.error;
      if (estRes.error) throw estRes.error;
      if (desRes.error) throw desRes.error;
      if (extraRes.error) throw extraRes.error;
      const aliIndex = indexSourceRows(aliRes.data || []);
      const estIndex = indexSourceRows(estRes.data || []);
      const desIndex = indexSourceRows(desRes.data || []);
      const extraRows = extraRes.data || [];

      const desired = new Map<string, {
        staff: Record<string, unknown>;
        action: 'APLICAR' | 'LIMPAR';
        rules: ReturnType<typeof canonicalRules>;
        hash: string;
      }>();
      const configProblems: Record<string, unknown>[] = [];

      const staffForGroupByCpf = new Map(regionalStaffByCpf);
      for (const cpf of currentCpfs) {
        const linkedStaff = staffByCpf.get(cpf) || linkedStaffFallbackByCpf.get(cpf);
        if (linkedStaff) staffForGroupByCpf.set(cpf, linkedStaff);
      }
      for (const cpf of availableCpfs) {
        const availableStaff = staffByCpf.get(cpf);
        if (availableStaff) staffForGroupByCpf.set(cpf, availableStaff);
      }

      const { data: version, error: versionError } = await service
        .from('grm_despesas_versoes')
        .insert({
          gestor_id: userData.user?.id ?? null,
          regional: group.regional,
          data_referencia: group.date,
          motivo: reason,
          programacao_ids: group.ids,
          resumo: {
            os_atender: new Set(currentLinks.map((row) => clean(row.os_id))).size,
            colaboradores_com_os: currentCpfs.size,
            colaboradores_disponiveis: availableCpfs.size,
            colaboradores_regionais_ativos: regionalStaff.length,
            colaboradores_emprestados: Math.max(0, staffForGroupByCpf.size - regionalStaffByCpf.size),
          },
        })
        .select('id')
        .single();
      if (versionError) throw versionError;
      overall.versoes.push(version.id);

      for (const staff of staffForGroupByCpf.values()) {
        const cpf = digits(staff.cpf);
        if (cpf.length !== 11) continue;
        overall.avaliados += 1;

        if (authorizedCpfs.has(cpf)) {
          const built = buildRulesForStaff({
            staff,
            contract: contractByCpf.get(cpf) || null,
            linkKeys: linkKeysByCpf.get(cpf) || [],
            alimentacao: aliIndex,
            estadia: estIndex,
            deslocamento: desIndex,
            extras: extraRows,
            configByKey,
          });
          if (built.pendingConfig.length) {
            configProblems.push({ cpf, nome: staff.nome, pendencias: built.pendingConfig });
            overall.avisos.push(
              `${staff.nome || cpf}: despesas não enfileiradas por falta de configuração (${built.pendingConfig.join(', ')}).`,
            );
            continue;
          }
          const staffId = clean(staff.id ?? staff.colaborador_id) || cpf;
          const { data: regrasFiltradas, error: filtroError } = await service.rpc(
            'grm_filtrar_regras_programacao',
            {
              p_versao_id: version.id,
              p_data: group.date,
              p_colaborador_id: staffId,
              p_nome: clean(staff.nome),
              p_regras: built.rules,
            },
          );
          if (filtroError) throw filtroError;
          const rules = canonicalRules(regrasFiltradas || []);
          const action: 'APLICAR' | 'LIMPAR' = rules.length ? 'APLICAR' : 'LIMPAR';
          const hash = await sha256({ cpf, action, rules });
          desired.set(cpf, { staff, action, rules, hash });
          continue;
        }

        if (shouldClearOperationalRules(cpf, cpfsAuthorizedInActiveWindow)) {
          const rules: ReturnType<typeof canonicalRules> = [];
          const hash = await sha256({ cpf, action: 'LIMPAR', rules });
          desired.set(cpf, { staff, action: 'LIMPAR', rules, hash });
        } else {
          overall.preservados_por_outra_regional += 1;
        }
      }

      const cpfs = [...desired.keys()];
      const existingByCpf = new Map<string, Record<string, unknown>>();
      for (const cpfChunk of chunk(cpfs)) {
        const { data, error } = await service
          .from('grm_despesas_estado_colaborador')
          .select('*')
          .in('cpf', cpfChunk)
          .eq('data_referencia', group.date);
        if (error) throw error;
        (data || []).forEach((row) => existingByCpf.set(clean(row.cpf), row));
      }

      const liveHashesByCpf = new Map<string, Set<string>>();
      for (const cpfChunk of chunk(cpfs)) {
        const { data, error } = await service
          .from('grm_despesas_fila')
          .select('cpf,hash_desejado,status,tentativas,max_tentativas')
          .in('cpf', cpfChunk)
          .eq('data_referencia', group.date)
          .in('status', ['PENDENTE', 'PROCESSANDO', 'ERRO']);
        if (error) throw error;
        (data || []).forEach((row) => {
          const isRetriableErro = clean(row.status) === 'ERRO'
            && Number(row.tentativas || 0) < Number(row.max_tentativas || 3);
          const isLive = ['PENDENTE', 'PROCESSANDO'].includes(clean(row.status))
            || isRetriableErro;
          if (!isLive) return;
          const key = clean(row.cpf);
          if (!liveHashesByCpf.has(key)) liveHashesByCpf.set(key, new Set());
          liveHashesByCpf.get(key)!.add(clean(row.hash_desejado));
        });
      }

      for (const [cpf, item] of desired) {
        const previous = existingByCpf.get(cpf);
        const alreadyApplied = isDesiredStateApplied(
          item.action,
          item.hash,
          previous?.hash_aplicado,
          clean(previous?.status_aplicacao),
        );
        const hasLiveQueueItem = liveHashesByCpf.get(cpf)?.has(item.hash) ?? false;
        const alreadyDesired = previous?.hash_desejado === item.hash
          && ['PENDENTE', 'PROCESSANDO', 'ERRO'].includes(clean(previous?.status_aplicacao))
          && hasLiveQueueItem;

        if (alreadyApplied || alreadyDesired) {
          overall.sem_alteracao += 1;
          continue;
        }

        const statePayload = {
          cpf,
          data_referencia: group.date,
          colaborador_id: clean(item.staff.id ?? item.staff.colaborador_id) || cpf,
          nome: clean(item.staff.nome),
          regional_origem: group.regional,
          versao_desejada_id: version.id,
          hash_desejado: item.hash,
          regras_desejadas: item.rules,
          deve_liberar: item.action === 'APLICAR',
          status_aplicacao: 'PENDENTE',
        };
        const { error: stateError } = await service
          .from('grm_despesas_estado_colaborador')
          .upsert(statePayload, { onConflict: 'cpf,data_referencia' });
        if (stateError) throw stateError;

        const { error: queueError } = await service.from('grm_despesas_fila').insert({
          versao_id: version.id,
          programacao_id: group.ids[0] || null,
          data_referencia: group.date,
          regional: group.regional,
          colaborador_id: statePayload.colaborador_id,
          nome: statePayload.nome,
          cpf,
          acao: item.action,
          regras: item.rules,
          hash_desejado: item.hash,
          status: 'PENDENTE',
          max_tentativas: 3,
        });
        if (queueError && queueError.code !== '23505') throw queueError;
        if (!queueError) {
          overall.enfileirados += 1;
          if (group.date <= activeWindowStart) overall.enfileirados_na_janela += 1;
          if (item.action === 'APLICAR') overall.aplicar += 1;
          else overall.limpar += 1;
        }
      }
    }

    if (overall.enfileirados_na_janela > 0 && !AGENTE_LIBERACAO_DESPESAS_PAUSADO) {
      const { data: existingJob, error: jobCheckError } = await service
        .from('grm_sync_jobs')
        .select('id')
        .eq('agente_id', 'sync-liberacao-despesas')
        .in('status', ['pendente', 'rodando'])
        .limit(1);
      if (jobCheckError) throw jobCheckError;
      if (!existingJob?.length) {
        const { error: jobError } = await service.from('grm_sync_jobs').insert({
          agente_id: 'sync-liberacao-despesas',
          status: 'pendente',
        });
        if (jobError) throw jobError;
      }
    }

    return json({
      ok: true,
      motivo: reason,
      agente_pausado: AGENTE_LIBERACAO_DESPESAS_PAUSADO,
      ...overall,
    });
  } catch (error) {
    console.error('[grm-liberacao-despesas-publicar]', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
