import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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
    .replace(/[\u0300-\u036f]/g, '')
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
  if (key === 'OUTROS' && norm(description).includes('COMBUSTIVEL')) {
    return 'EXTRA_COMBUSTIVEL';
  }
  return 'EXTRA_OUTROS';
}

function configKeyDeslocamento(value: unknown): string | null {
  const key = norm(value);
  if (key === 'UBER TAXI') return 'DESLOCAMENTO_UBER_TAXI';
  if (key === 'REEMBOLSO KM') return 'DESLOCAMENTO_REEMBOLSO_KM';
  return null;
}

function ruleFromConfig(config: Record<string, unknown>, overrideValue?: number | null) {
  const configuredValue = overrideValue != null && Number(overrideValue) > 0
    ? Number(overrideValue)
    : Number(config.valor_padrao ?? 0);
  return canonicalRule({
    tipo_despesa: config.tipo_grm,
    exibir: config.exibir,
    valor_maximo: configuredValue,
    auto: config.auto,
    carga_nhe: config.carga_nhe,
    max_mov_dia: config.max_mov_dia,
  });
}

function buildRulesForStaff(args: {
  staff: Record<string, unknown>;
  linkKeys: string[];
  alimentacao: ReturnType<typeof indexSourceRows>;
  deslocamento: ReturnType<typeof indexSourceRows>;
  extras: Record<string, unknown>[];
  configByKey: Map<string, Record<string, unknown>>;
}) {
  const pendingConfig: string[] = [];
  const rules: Record<string, unknown>[] = [];
  const { staff, linkKeys, alimentacao, deslocamento, extras, configByKey } = args;

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

  const ali = sourceRowForStaff(alimentacao, staff, linkKeys);
  requireConfig('ALIMENTACAO_CAFE', ali?.cafe === true);
  // A própria Programação e a Conferência exibem almoço=SIM quando ainda não
  // existe linha em programacao_alimentacao. A publicação precisa repetir o
  // mesmo padrão para não mostrar uma despesa que nunca chega ao GRM.
  requireConfig('ALIMENTACAO_ALMOCO', ali ? ali.almoco !== false : true);
  requireConfig('ALIMENTACAO_JANTA', ali?.janta === true);

  const des = sourceRowForStaff(deslocamento, staff, linkKeys);
  const desKey = configKeyDeslocamento(des?.tipo_deslocamento);
  const displacementValue = Number(des?.valor ?? 0);
  if (desKey) {
    // Reembolso KM deve abrir a categoria mesmo antes de o valor calculado
    // estar disponível; o GRM aceita a regra inicial com limite zero.
    requireConfig(
      desKey,
      true,
      displacementValue,
      desKey === 'DESLOCAMENTO_REEMBOLSO_KM',
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
    // "Outros" é um campo livre do painel para o gestor descrever uma
    // necessidade fora das categorias padrão; não existe categoria
    // correspondente no GRM, então essa seleção nunca gera regra de Caixa
    // Operacional nem bloqueia a publicação da regional.
    const key = configKeyExtra(
      extra.tipo_despesa,
      `${clean(extra.descricao)} ${clean(extra.observacao)}`,
    );
    if (key === 'EXTRA_OUTROS') continue;
    const extraValue = Number(extra.valor ?? 0);
    // Lavanderia também deve abrir mesmo quando o gestor ainda não informou
    // valor. As demais categorias continuam exigindo limite positivo.
    if (extraValue > 0 || key === 'EXTRA_LAVANDERIA') {
      requireConfig(key, true, extraValue, key === 'EXTRA_LAVANDERIA');
    }
  }

  return { rules: canonicalRules(rules), pendingConfig: [...new Set(pendingConfig)] };
}

// Chave operacional mantida explícita para permitir uma pausa emergencial sem
// remover a proteção que adia regionais cuja Lista de OS ainda não sincronizou.
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

    // Esta consulta usa o JWT do gestor. Portanto a própria RLS da
    // programacao_dia impede publicar uma regional que ele não pode acessar.
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

    // Uma programação futura já representa uma janela válida de despesas.
    // Como o GRM mantém a regra por colaborador (sem data de vigência), nenhuma
    // publicação pode limpar hoje quem possui O.S. ATENDER hoje ou no futuro.
    // A proteção expira naturalmente à meia-noite de São Paulo após a data da
    // O.S.; a partir daí uma reconciliação posterior pode gerar a limpeza.
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
      // Um CPF explícito e válido no vínculo é a fonte mais confiável. A
      // validação de ativo e regional acontece logo abaixo, pelo mapa
      // regionalStaffByCpf; não deve ser antecipada aqui como "não localizado".
      if (direct.length === 11) return { cpf: direct, error: null };
      const candidates = staffByName.get(norm(link.colaborador_nome ?? link.colaborador_key)) || [];
      if (candidates.length === 1) {
        const cpf = digits(candidates[0].cpf);
        return cpf.length === 11 ? { cpf, error: null } : { cpf: '', error: 'CPF_AUSENTE' };
      }
      if (candidates.length > 1) return { cpf: '', error: 'NOME_AMBIGUO' };
      return { cpf: '', error: 'COLABORADOR_NAO_LOCALIZADO' };
    };

    const osDateById = new Map(
      (activePrograms || []).map((row) => [clean(row.id), clean(row.data_referencia).slice(0, 10)]),
    );
    const cpfsWithOsByDate = new Map<string, Set<string>>();
    for (const link of globalLinks) {
      const resolved = resolveLinkCpf(link);
      const date = osDateById.get(clean(link.programacao_id));
      if (!resolved.cpf || !date) continue;
      if (!cpfsWithOsByDate.has(date)) cpfsWithOsByDate.set(date, new Set());
      cpfsWithOsByDate.get(date)!.add(resolved.cpf);
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
      const cpfsWithOsOnDate = cpfsWithOsByDate.get(group.date) || new Set<string>();
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

      // Sem vínculo O.S. -> colaborador não existe autorização a publicar,
      // mas isso também nunca é evidência suficiente para limpar a regional.
      if (!currentLinks.length) {
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

      const [aliRes, desRes, extraRes] = await Promise.all([
        service.from('programacao_alimentacao').select('*').in('programacao_id', group.ids),
        service.from('programacao_deslocamento').select('*').in('programacao_id', group.ids),
        service.from('programacao_extras').select('*').in('programacao_id', group.ids),
      ]);
      if (aliRes.error) throw aliRes.error;
      if (desRes.error) throw desRes.error;
      if (extraRes.error) throw extraRes.error;
      const aliIndex = indexSourceRows(aliRes.data || []);
      const desIndex = indexSourceRows(desRes.data || []);
      const extraRows = extraRes.data || [];

      const desired = new Map<string, {
        staff: Record<string, unknown>;
        action: 'APLICAR' | 'LIMPAR';
        rules: ReturnType<typeof canonicalRules>;
        hash: string;
      }>();
      const configProblems: Record<string, unknown>[] = [];

      // A O.S. ATENDER é a fonte operacional da equipe do dia. Colaboradores
      // ativos podem ser emprestados entre regionais; eles devem receber as
      // despesas da O.S. mesmo que o cadastro ainda aponte outra regional.
      // Para LIMPAR, a abrangência continua restrita ao quadro da regional.
      const staffForGroupByCpf = new Map(regionalStaffByCpf);
      for (const cpf of currentCpfs) {
        const linkedStaff = staffByCpf.get(cpf) || linkedStaffFallbackByCpf.get(cpf);
        if (linkedStaff) staffForGroupByCpf.set(cpf, linkedStaff);
      }

      for (const staff of staffForGroupByCpf.values()) {
        const cpf = digits(staff.cpf);
        if (cpf.length !== 11) continue;
        overall.avaliados += 1;

        if (currentCpfs.has(cpf)) {
          const built = buildRulesForStaff({
            staff,
            linkKeys: linkKeysByCpf.get(cpf) || [],
            alimentacao: aliIndex,
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
          const hash = await sha256({ cpf, action: 'APLICAR', rules: built.rules });
          desired.set(cpf, { staff, action: 'APLICAR', rules: built.rules, hash });
          continue;
        }

        // A decisão de limpeza é estritamente diária. Uma O.S. futura não
        // pode manter hoje uma autorização que não pertence à programação de
        // hoje; a versão futura será aplicada somente na própria janela.
        if (!cpfsWithOsOnDate.has(cpf)) {
          const rules: ReturnType<typeof canonicalRules> = [];
          const hash = await sha256({ cpf, action: 'LIMPAR', rules });
          desired.set(cpf, { staff, action: 'LIMPAR', rules, hash });
        } else {
          overall.preservados_por_outra_regional += 1;
        }
      }

      // Uma configuração financeira ausente bloqueia somente o colaborador
      // afetado. Os demais seguem para a fila, e a pendência fica explícita no
      // retorno para não transformar um caso isolado em atraso da regional.

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
            colaboradores_regionais_ativos: regionalStaff.length,
            colaboradores_emprestados: Math.max(0, staffForGroupByCpf.size - regionalStaffByCpf.size),
          },
        })
        .select('id')
        .single();
      if (versionError) throw versionError;
      overall.versoes.push(version.id);

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

      // status_aplicacao sozinho não é confiável: um item da fila pode ter sido
      // marcado IGNORADO_VERSAO_SUPERADA (ou similar) sem que o estado do
      // colaborador tenha sido atualizado, deixando status_aplicacao=PENDENTE
      // "mentindo" que ainda existe um job vivo. Por isso confirmamos que hoje
      // existe mesmo um item PENDENTE/PROCESSANDO com esse hash antes de pular.
      const liveHashesByCpf = new Map<string, Set<string>>();
      for (const cpfChunk of chunk(cpfs)) {
        const { data, error } = await service
          .from('grm_despesas_fila')
          .select('cpf,hash_desejado')
          .in('cpf', cpfChunk)
          .eq('data_referencia', group.date)
          .in('status', ['PENDENTE', 'PROCESSANDO']);
        if (error) throw error;
        (data || []).forEach((row) => {
          const key = clean(row.cpf);
          if (!liveHashesByCpf.has(key)) liveHashesByCpf.set(key, new Set());
          liveHashesByCpf.get(key)!.add(clean(row.hash_desejado));
        });
      }

      for (const [cpf, item] of desired) {
        const previous = existingByCpf.get(cpf);
        const alreadyApplied = previous?.hash_aplicado === item.hash
          && ['APLICADO', 'LIMPO'].includes(clean(previous?.status_aplicacao));
        const hasLiveQueueItem = liveHashesByCpf.get(cpf)?.has(item.hash) ?? false;
        const alreadyDesired = previous?.hash_desejado === item.hash
          && ['PENDENTE', 'PROCESSANDO'].includes(clean(previous?.status_aplicacao))
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

    // Itens futuros ficam preparados na fila, mas o worker só é acordado
    // quando a data já entrou na janela. O cron diário das 01:00 inicia os
    // itens que viraram elegíveis durante a madrugada.
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
