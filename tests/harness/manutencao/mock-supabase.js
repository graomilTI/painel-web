// Supabase simulado para o harness da Manutenção (Corretiva): tabelas em memória, filtros básicos e as RPCs registradas.
// Sem triggers: o banco real valida o fluxo; aqui só se aplica o que a tela grava.
export const log = [];
let seq = 100;

const ISO = '2026-10-20T10:00:00Z';
const veiculo = (id, placa, modelo) => ({ id, placa, marca_modelo: modelo, coordenacao: 'MATO GROSSO MT1', supervisao: 'SORRISO', status: 'ATIVO', motorista_atual: 'JOSE LIMA' });
const man = (id, numero, status, extra = {}) => ({
  id, numero, veiculo_id: 'v1', status, natureza: 'corretiva', responsavel_pagamento: 'empresa', descricao: 'Freio com ruído', prioridade: 'normal',
  solicitante_nome: 'Ana', cidade: 'Sorriso', uf: 'MT', solicitado_em: ISO, previsao_entrega: null, veiculo_parado: false, escolha_itens: {},
  linha_tempo: [{ em: ISO, de: null, para: 'solicitada', por: 'Ana', nota: null }, { em: ISO, de: 'solicitada', para: status, por: 'Ana', nota: null }], ...extra,
});

export function criarDb() {
  return {
    frotas_veiculos: [veiculo('v1', 'AAA1A11', 'FIAT/STRADA'), veiculo('v2', 'BBB2B22', 'RENAULT/KWID')],
    frotas_manutencao_categorias: [
      { codigo: 9, nome: 'Freios', grupo_codigo: 2, ativo: true }, { codigo: 7, nome: 'Pneus', grupo_codigo: 7, ativo: true },
    ],
    frotas_manutencao_grupos: [
      { codigo: 7, nome: 'Pneus, alinhamento e balanceamento', ordem: 1, categoria_codigo: 7, ativo: true }, { codigo: 2, nome: 'Freios', ordem: 2, categoria_codigo: 9, ativo: true },
    ],
    frotas_manutencao_componentes: [
      { id: 'c1', grupo_codigo: 2, categoria_codigo: 9, nome: 'Pastilhas de freio', ordem: 1, tipo: 'peca', ativo: true },
      { id: 'c2', grupo_codigo: 2, categoria_codigo: 9, nome: 'Discos de freio', ordem: 2, tipo: 'peca', ativo: true },
      { id: 'c3', grupo_codigo: 7, categoria_codigo: 7, nome: 'Pneus', ordem: 1, tipo: 'peca', ativo: true },
    ],
    frotas_manutencao_planos: [
      { id: 'p1', ativo: true, codigo: 'pastilhas_freio', nome: 'Troca de pastilhas de freio', tipo: 'servico', categoria_codigo: 9, intervalo_km: 20000, intervalo_km_max: 40000 },
      { id: 'p2', ativo: true, codigo: 'discos_freio', nome: 'Troca de discos de freio', tipo: 'servico', categoria_codigo: 9, intervalo_km: 40000 },
      { id: 'p3', ativo: true, codigo: 'pneus', nome: 'Troca de pneus', tipo: 'servico', categoria_codigo: 7, intervalo_meses: 60 },
      { id: 'p4', ativo: true, codigo: 'calibragem', nome: 'Calibragem dos pneus', tipo: 'verificacao', categoria_codigo: 7, intervalo_dias: 15 },
    ],
    frotas_preventiva_pendencias_v: [
      { manutencao_id: 'r1', veiculo_id: 'v1', placa: 'AAA1A11', data_execucao: '2026-01-10', km_execucao: 30000, custo: 350, pendente: true, itens: ['Troca de pastilhas de freio'], sem_nf: true, sem_comprovante: true },
    ],
    frotas_manutencao_pecas: [], colaboradores_atuais: [{ nome: 'ANA', ativo: true }],
    frotas_oficinas: [{ id: 'of1', nome: 'Oficina A', razao_social: 'OFICINA A LTDA', cnpj: '12.345.678/0001-90', pix_chave: 'pix@a.com', ativo: true }],
    frotas_manutencoes: [
      man('m1', 81, 'em_orcamento'),
      man('m2', 82, 'em_execucao', { valor_aprovado: 800, oficina: 'Oficina A', os_numero: 'OS-000082', veiculo_parado: true, aprovado_em: ISO }),
      man('m3', 83, 'concluida', { custo: 1000, data_execucao: '2026-10-25', km_execucao: 50000, valor_aprovado: 1000, oficina: 'Oficina A', aprovado_em: ISO, concluida_em: ISO }),
    ],
    frotas_manutencao_itens: [
      { id: 'i1', manutencao_id: 'm1', categoria_codigo: 9, tipo_item: 'peca', descricao: 'Pastilhas de freio, Discos de freio', componentes: ['Pastilhas de freio', 'Discos de freio'], created_at: ISO },
      { id: 'i2', manutencao_id: 'm2', categoria_codigo: 7, tipo_item: 'peca', descricao: 'Pneus', componentes: ['Pneus'], created_at: ISO },
      { id: 'i3', manutencao_id: 'm3', categoria_codigo: 9, tipo_item: 'servico', descricao: 'Mão de obra', componentes: ['Mão de obra'], created_at: ISO },
    ],
    frotas_manutencao_orcamentos: [
      { id: 'o1', manutencao_id: 'm1', fornecedor: 'Oficina A', valor_total: 900, valor_pecas: 700, valor_mao_obra: 200, prazo_dias: 3, selecionado: false, created_at: ISO,
        linhas: [{ nome: 'Pastilhas de freio', valor: 400, tipo: 'peca' }, { nome: 'Discos de freio', valor: 300, tipo: 'peca' }, { nome: 'Mão de obra', valor: 200, tipo: 'servico' }] },
      { id: 'o2', manutencao_id: 'm1', fornecedor: 'Loja B', valor_total: 650, valor_pecas: 650, prazo_dias: 5, selecionado: false, created_at: ISO,
        linhas: [{ nome: 'Pastilhas de freio', valor: 350, tipo: 'peca' }, { nome: 'Discos de freio', valor: 300, tipo: 'peca' }, { nome: 'Mão de obra', faltante: true, tipo: 'servico' }] },
      { id: 'o3', manutencao_id: 'm2', fornecedor: 'Oficina A', valor_total: 800, selecionado: true, created_at: ISO, linhas: [] },
    ],
    frotas_manutencao_notas: [
      { id: 'n1', manutencao_id: 'm3', tipo: 'peca', fornecedor: 'Oficina A', oficina_id: 'of1', numero: '111', valor: 400, anexo_url: 'https://x/storage/v1/object/public/notas-fiscais/n1.pdf', comprovante_url: 'https://x/c1.png', pago_em: ISO, enviada_em: null, pagamento_id: null, created_at: ISO },
      { id: 'n2', manutencao_id: 'm3', tipo: 'servico', fornecedor: 'Loja B', numero: '222', valor: 500, anexo_url: 'https://x/storage/v1/object/public/notas-fiscais/n2.pdf', comprovante_url: null, pago_em: null, enviada_em: null, pagamento_id: null, created_at: ISO },
    ],
  };
}

class Q {
  constructor(db, tabela) { this.db = db; this.t = tabela; this.op = 'select'; this.f = []; this.rows = null; this.patch = null; this.sg = false; this.ord = []; this.lim = null; this.rg = null; this.ret = false; }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  insert(r) { this.op = 'insert'; this.rows = Array.isArray(r) ? r : [r]; return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  in(c, vs) { this.f.push((r) => vs.includes(r[c])); return this; }
  neq(c, v) { this.f.push((r) => r[c] !== v); return this; }
  order(c, { ascending = true } = {}) { this.ord.push([c, ascending]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rg = [a, b]; return this; }
  single() { this.sg = true; return this; }
  maybeSingle() { this.sg = true; return this; }
  then(a, b) { return Promise.resolve(this.exec()).then(a, b); }
  exec() {
    const t = this.db[this.t] || (this.db[this.t] = []);
    log.push([this.op, this.t, this.op === 'select' ? null : JSON.stringify(this.patch || this.rows)]);
    if (this.op === 'insert') {
      const novos = this.rows.map((r) => ({ id: `x${++seq}`, created_at: ISO, ...r }));
      t.push(...novos);
      const d = this.ret ? novos : null;
      return { data: this.sg ? d?.[0] : d, error: null };
    }
    if (this.op === 'update') {
      const alvo = t.filter((r) => this.f.every((fn) => fn(r)));
      alvo.forEach((r) => Object.assign(r, this.patch));
      const d = this.ret ? alvo.map((r) => ({ ...r })) : null;
      return { data: this.sg ? d?.[0] : d, error: null };
    }
    if (this.op === 'delete') { for (let i = t.length - 1; i >= 0; i -= 1) if (this.f.every((fn) => fn(t[i]))) t.splice(i, 1); return { data: null, error: null }; }
    let rows = t.filter((r) => this.f.every((fn) => fn(r))).map((r) => ({ ...r }));
    for (const [c, asc] of [...this.ord].reverse()) rows.sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (asc ? 1 : -1));
    if (this.rg) rows = rows.slice(this.rg[0], this.rg[1] + 1);
    if (this.lim) rows = rows.slice(0, this.lim);
    return { data: this.sg ? rows[0] || null : rows, error: null };
  }
}

export function criarSupabase(db) {
  return {
    from: (t) => new Q(db, t),
    rpc: async (nome, args) => {
      log.push(['rpc', nome, JSON.stringify(args)]);
      const S = (p, st, extra = {}) => ({ p, st, ...extra });
      const painel = [
        { v: 'v1', placa: 'AAA1A11', mm: 'FIAT/STRADA', co: 'MATO GROSSO MT1', su: 'SORRISO', km: 50000, s: [
          S('p1', 'vencida', { du: '2026-01-10', ku: 30000, vk: 50000, vd: '2026-12-01', kr: -500, dr: 30 }), S('p2', 'proxima', { du: '2026-03-01', ku: 20000, vk: 60000, kr: 3000, dr: 100 }),
          S('p3', 'sem_historico'), S('p4', 'em_dia', { du: '2026-10-20', ku: 49000, vd: '2026-11-04', dr: 6 })] },
        { v: 'v2', placa: 'BBB2B22', mm: 'RENAULT/KWID', co: 'MATO GROSSO MT1', su: 'SORRISO', km: 80000, s: [S('p1', 'sem_historico'), S('p2', 'sem_historico'), S('p3', 'sem_historico'), S('p4', 'sem_historico')] },
      ];
      const respostas = { frotas_preventiva_painel: painel, frotas_manutencao_solicitar: 'x900', frotas_manutencao_programacoes_afetadas: [], frotas_manutencao_aprender_pecas: 0, frotas_veiculo_km_atual: 51000, frotas_manutencao_nf_status: null };
      return { data: nome in respostas ? respostas[nome] : { ok: true }, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }), getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ upload: async (caminho) => { log.push(['upload', caminho, '']); return { error: null }; }, getPublicUrl: (caminho) => ({ data: { publicUrl: `https://x/storage/v1/object/public/notas-fiscais/${caminho}` } }) }) },
    functions: { invoke: async () => ({ data: {}, error: null }) },
  };
}
