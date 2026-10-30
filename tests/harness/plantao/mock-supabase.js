// Supabase simulado para a tela de Plantão (Início): tabelas em memória e a função rh_plantao_salvar_setor.
// Serve só para ver e exercitar a tela sem login. `?papel=master|leitura` muda o que o usuário pode editar (padrão: só Frotas).
export const log = [];

const NOMES = [
  ['ANA CAROLINA DUCATTI BRITO FERNANDES', '45998420389', 'frota.grao1000@gmail.com'], ['BRUNA BOEING DALLAGNOL', '45998390522', 'conferencia@grao1000.com.br'],
  ['CATIA MARIA DUCATTI FRESCHI', '45998389123', 'rh@grao1000.com.br'], ['CLEVERSON CORDEIRO DE CASTRO', '42991592810', ''],
  ['ISABELLA EDUARDA FELIX', '45999347545', 'conferencia@grao1000.com.br'], ['JOSIANE DOS SANTOS', '45998199420', 'josiane.santos@grao1000.com.br'],
  ['MARIA GRAZIELA DA SILVA ROSA', '45998610826', ''], ['TAINA GOTARDO DE SOUZA', '45999260363', ''], ['THATYELLY DE OLIVEIRA', '42999826630', ''],
  ['VINICIOS DALLAGNOL BUZINARO', '45998610822', 'conferencia@grao1000.com.br'], ['WENDY DOS SANTOS MACIEL', '45998560033', 'rh2@grao1000.com.br'],
  ['ANDREA APARECIDA DE MORAIS OLIVERIO', '42999077593', 'andrea@grao1000.com.br'], ['JOSÉ CARLOS PEREIRA', '65999991111', ''], ['LUCAS ANACLETO', '', ''],
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dia = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d); };

function proximoSabado() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1); else d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return d;
}

function linha(data, setor, nome, ordem = 1, extra = {}) {
  const base = NOMES.find((n) => n[0] === nome) || [nome, '', ''];
  return {
    id: `l${Math.random().toString(36).slice(2, 9)}`, data_plantao: data, evento: new Date(`${data}T12:00:00`).getDay() === 6 ? 'Sábado' : 'Domingo', setor,
    colaborador_key: nome.split(' ')[0], cpf: null, nome, apelido: nome.split(' ')[0], telefone: base[1], email_corporativo: base[2], ordem,
    hora_inicio: '08:00:00', hora_fim: '12:00:00', hora_inicio_2: '13:30:00', hora_fim_2: '18:00:00', observacoes: null, ...extra,
  };
}

export function criarDb() {
  const sab = proximoSabado();
  const s0 = iso(sab); const d0 = dia(sab, 1);
  const sm1 = dia(sab, -7); const dm1 = dia(sab, -6);
  return {
    rh_plantao_setores: [{ nome: 'RH', ordem: 1 }, { nome: 'Caixas', ordem: 2 }, { nome: 'Frotas', ordem: 3 }, { nome: 'Logística', ordem: 4 }, { nome: 'Troca de notas', ordem: 5 }].map((s) => ({ ...s, ativo: true })),
    colaboradores: NOMES.map(([nome, whatsapp, email_empresa], i) => ({ id: i + 1, cpf: String(10000000000 + i * 7919), nome, whatsapp, email_empresa, email_pessoal: 'pessoal@gmail.com', situacao: 'Ativo' })),
    rh_plantao_contatos: [
      { colaborador_key: 'ANA', nome: 'ANA CAROLINA DUCATTI BRITO FERNANDES', telefone: '45998420389', email_corporativo: 'frota.grao1000@gmail.com', setor_preferencial: 'Frotas' },
      { colaborador_key: 'CLEVERSON', nome: 'CLEVERSON CORDEIRO DE CASTRO', telefone: '42991592810', email_corporativo: '', setor_preferencial: 'Frotas' },
      { colaborador_key: 'THATYELLY', nome: 'THATYELLY DE OLIVEIRA', telefone: '42999826630', email_corporativo: '', setor_preferencial: 'Frotas' },
      { colaborador_key: 'WENDY', nome: 'WENDY DOS SANTOS MACIEL', telefone: '45998560033', email_corporativo: 'rh2@grao1000.com.br', setor_preferencial: 'RH' },
    ],
    rh_plantao_escalas: [
      // Fim de semana passado: RH e Frotas completos (fonte para "Copiar de outro período")
      linha(sm1, 'RH', 'WENDY DOS SANTOS MACIEL'), linha(dm1, 'RH', 'WENDY DOS SANTOS MACIEL'),
      linha(sm1, 'Frotas', 'CLEVERSON CORDEIRO DE CASTRO'), linha(dm1, 'Frotas', 'CLEVERSON CORDEIRO DE CASTRO'),
      // Fim de semana da vez: Caixas completo, Frotas só no sábado, Logística completo (somente leitura para o gestor de Frotas)
      linha(s0, 'Caixas', 'MARIA GRAZIELA DA SILVA ROSA'), linha(d0, 'Caixas', 'MARIA GRAZIELA DA SILVA ROSA'),
      linha(s0, 'Frotas', 'THATYELLY DE OLIVEIRA'),
      linha(s0, 'Logística', 'BRUNA BOEING DALLAGNOL', 1, { hora_inicio: '07:30:00', hora_fim_2: '19:30:00' }), linha(d0, 'Logística', 'BRUNA BOEING DALLAGNOL', 1, { hora_inicio: '07:30:00', hora_fim_2: '19:30:00' }),
      // Um feriado já programado numa data fora do fim de semana
      linha(dia(sab, 20), 'RH', 'CATIA MARIA DUCATTI FRESCHI', 1, { evento: 'Feriado de teste' }),
    ],
  };
}

const params = new URLSearchParams(location.search);
const papel = params.get('papel') || 'gestor-frotas';
const EDITA = papel === 'master' ? ['RH', 'Caixas', 'Frotas', 'Logística', 'Troca de notas'] : papel === 'leitura' ? [] : ['Frotas'];

class Q {
  constructor(db, t) { this.db = db; this.t = t; this.f = []; this.ord = []; this.rg = null; }
  select() { return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  gte(c, v) { this.f.push((r) => String(r[c]) >= v); return this; }
  lte(c, v) { this.f.push((r) => String(r[c]) <= v); return this; }
  order(c, { ascending = true } = {}) { this.ord.push([c, ascending]); return this; }
  range(a, b) { this.rg = [a, b]; return this; }
  then(ok, ko) {
    let rows = (this.db[this.t] || []).filter((r) => this.f.every((fn) => fn(r)));
    for (const [c, asc] of [...this.ord].reverse()) rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
    if (this.rg) rows = rows.slice(this.rg[0], this.rg[1] + 1);
    log.push({ tabela: this.t, filtros: this.f.length, linhas: rows.length });
    return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(ok, ko);
  }
}

export function criarSupabase() {
  const db = criarDb();
  window.__db = db;
  return {
    from: (t) => new Q(db, t),
    rpc: async (nome, args) => {
      log.push({ rpc: nome, args });
      if (nome === 'rh_plantao_setores_acesso') {
        return { data: ['Caixas', 'Frotas', 'Logística', 'RH', 'Troca de notas'].map((setor) => ({ setor, hora_inicio: setor === 'Logística' ? '07:30:00' : '08:00:00', hora_fim: '12:00:00', hora_inicio_2: '13:30:00', hora_fim_2: setor === 'Logística' ? '19:30:00' : '18:00:00', pode_editar: EDITA.includes(setor) })), error: null };
      }
      if (nome === 'rh_plantao_salvar_setor') {
        if (!EDITA.includes(args.p_setor)) return { data: null, error: { message: `Você não possui permissão para editar o plantão do setor ${args.p_setor}.` } };
        if (params.get('falha') === '1') return { data: null, error: { message: 'Falha simulada ao salvar.' } };
        db.rh_plantao_escalas = db.rh_plantao_escalas.filter((r) => !(r.setor === args.p_setor && args.p_datas.includes(r.data_plantao)));
        for (const l of args.p_linhas) db.rh_plantao_escalas.push({ id: `n${Math.random().toString(36).slice(2, 9)}`, setor: args.p_setor, ...l });
        return { data: args.p_linhas.length, error: null };
      }
      return { data: null, error: { message: `rpc ${nome} não simulada` } };
    },
  };
}
