// Supabase simulado para a tela de Sinistros: tabelas em memória, filtros básicos, storage e o que os triggers do banco fazem
// (número, placa em maiúsculas, carimbo e histórico de etapa). Serve só para ver e exercitar a tela sem login.
export const log = [];
let seq = 100;
const agora = () => new Date().toISOString();

const MODELO = [
  ['cnh_condutor', 'empresa', 'CNH do colaborador', 'Foto ou PDF da CNH do condutor do veículo da empresa.', null, false, 'sempre', 10],
  ['telefone_condutor', 'empresa', 'Telefone do colaborador', 'Preencha em Dados > Condutor.', ['condutor_telefone'], false, 'sempre', 20],
  ['crlv_veiculo', 'empresa', 'CRLV do veículo', 'Documento do veículo.', null, false, 'sempre', 30],
  ['relato', 'empresa', 'Relato do acidente', 'Preencha em Dados > Ocorrência.', ['relato'], false, 'sempre', 40],
  ['data_hora_local', 'empresa', 'Data, hora e local', 'Preencha em Dados > Ocorrência.', ['ocorrido_em', 'local_texto'], false, 'sempre', 50],
  ['boletim_ocorrencia', 'empresa', 'Boletim de ocorrência', 'Obrigatório quando há terceiro.', null, false, 'terceiro', 60],
  ['dados_oficina', 'empresa', 'Dados da oficina', 'Oficina indicada pela seguradora.', ['oficina_nome'], false, 'sempre', 70],
  ['prontuario_medico', 'empresa', 'Prontuário médico do colaborador', 'Só quando foi socorrido.', null, true, 'sempre', 80],
  ['fotos_veiculo', 'empresa', 'Fotos do acidente e do veículo', null, null, false, 'sempre', 90],
  ['t_cnh', 'terceiro', 'CNH do condutor', null, null, false, 'sempre', 10],
  ['t_crlv', 'terceiro', 'CRLV do veículo', null, null, false, 'sempre', 20],
  ['t_contato', 'terceiro', 'Telefone e e-mail do condutor', null, ['telefone', 'email'], false, 'sempre', 30],
  ['t_residencia', 'terceiro', 'Comprovante de residência', null, null, false, 'sempre', 40],
  ['t_oficina', 'terceiro', 'Dados da oficina de preferência', null, ['oficina_preferencia'], false, 'sempre', 50],
  ['t_fotos', 'terceiro', 'Fotos do veículo', null, null, false, 'sempre', 60],
  ['t_seguro', 'terceiro', 'Verificar se possui seguro', 'Informe se o terceiro tem seguro.', ['tem_seguro'], false, 'sempre', 70],
];

export function criarDb() {
  return {
    frotas_veiculos: [
      { id: 'v1', placa: 'AAA1A11', marca_modelo: 'FIAT/STRADA', coordenacao: 'MT1', supervisao: 'SORRISO', status: 'ATIVO', motorista_atual: 'JOSE LIMA', apolice_seguro: 'AP-123' },
      { id: 'v2', placa: 'BBB2B22', marca_modelo: 'RENAULT/KWID', coordenacao: 'MT1', supervisao: 'LUCAS', status: 'ATIVO', motorista_atual: 'MARIA SOUZA', apolice_seguro: null },
    ],
    colaboradores_atuais: [{ nome: 'JOSE LIMA', ativo: true }, { nome: 'MARIA SOUZA', ativo: true }],
    frotas_sinistro_checklist_modelo: MODELO.map(([codigo, grupo, rotulo, dica, campos, so_se_ferido, obrigatorio_quando, ordem]) => ({ codigo, grupo, rotulo, dica, campos, so_se_ferido, obrigatorio_quando, ordem, ativo: true })),
    frotas_sinistros: [{
      id: 's1', numero: 1, veiculo_id: 'v1', placa: 'AAA1A11', etapa: 'solicitado', condutor_nome: 'JOSE LIMA', condutor_telefone: '(65) 99999-0000', ocorrido_em: '2026-10-27T17:30:00Z',
      local_texto: 'BR-163, Sorriso/MT', relato: 'Colisão traseira em baixa velocidade.', houve_terceiro: true, houve_ferido: false, guincho: true,
      proxima_acao: 'Cobrar a corretora', proxima_acao_em: '2026-10-28', solicitado_corretora_em: '2026-10-28T12:00:00Z', created_at: '2026-10-27T18:00:00Z',
    }],
    frotas_sinistro_terceiros: [{ id: 't1', sinistro_id: 's1', nome: 'Carlos Pereira', telefone: '(65) 98888-1111', email: null, tem_seguro: false, created_at: '2026-10-27T19:00:00Z' }],
    frotas_sinistro_marcas: [],
    frotas_sinistro_anexos: [{ id: 'a1', sinistro_id: 's1', terceiro_id: null, item_codigo: 'cnh_condutor', storage_bucket: 'frotas-sinistros', storage_path: 's1/empresa/cnh_condutor/1-cnh.pdf', nome_arquivo: 'cnh.pdf', tamanho_bytes: 120000, criado_em: '2026-10-27T19:00:00Z', criado_por_nome: 'Ana' }],
    frotas_sinistro_historico: [
      { id: 'h1', sinistro_id: 's1', tipo: 'etapa', de_etapa: null, para_etapa: 'preparando', texto: 'Sinistro registrado', por_nome: 'Ana', criado_em: '2026-10-27T18:00:00Z' },
      { id: 'h2', sinistro_id: 's1', tipo: 'etapa', de_etapa: 'preparando', para_etapa: 'solicitado', texto: null, por_nome: 'Ana', criado_em: '2026-10-28T12:00:00Z' },
    ],
  };
}

const CARIMBO = { solicitado: 'solicitado_corretora_em', aberto: 'aberto_seguradora_em', reparo: 'reparo_em', concluido: 'concluido_em', cancelado: 'cancelado_em' };

class Q {
  constructor(db, t) { this.db = db; this.t = t; this.op = 'select'; this.f = []; this.rows = null; this.patch = null; this.one = false; this.ord = []; this.rg = null; }
  select() { return this; }
  insert(r) { this.op = 'insert'; this.rows = Array.isArray(r) ? r : [r]; return this; }
  update(p) { this.op = 'update'; this.patch = { ...p }; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
  order(c, { ascending = true } = {}) { this.ord.push([c, ascending]); return this; }
  range(a, b) { this.rg = [a, b]; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then(a, b) { return Promise.resolve().then(() => this.exec()).then(a, b); }
  historico(sinistroId, de, para, texto) {
    this.db.frotas_sinistro_historico.push({ id: `h${++seq}`, sinistro_id: sinistroId, tipo: 'etapa', de_etapa: de, para_etapa: para, texto, por_nome: 'Ana', criado_em: agora() });
  }
  exec() {
    const tab = this.db[this.t] || (this.db[this.t] = []);
    log.push([this.op, this.t, this.op === 'select' ? null : JSON.stringify(this.patch || this.rows)]);
    const casa = (r) => this.f.every((fn) => fn(r));
    let saida;
    if (this.op === 'insert') {
      saida = this.rows.map((r) => {
        const n = { id: `x${++seq}`, created_at: agora(), ...r };
        if (this.t === 'frotas_sinistros') { n.numero = tab.length + 1; n.placa = String(n.placa).toUpperCase(); n.etapa = 'preparando'; n.houve_terceiro ??= false; n.houve_ferido ??= false; n.guincho ??= false; }
        if (this.t === 'frotas_sinistro_anexos' || this.t === 'frotas_sinistro_historico') n.criado_em = agora();
        if (this.t === 'frotas_sinistro_marcas') n.em = agora();
        tab.push(n);
        if (this.t === 'frotas_sinistros') this.historico(n.id, null, 'preparando', 'Sinistro registrado');
        return n;
      });
    } else if (this.op === 'update') {
      saida = tab.filter(casa).map((r) => {
        if (this.t === 'frotas_sinistros' && this.patch.etapa && this.patch.etapa !== r.etapa) {
          if (this.patch.etapa === 'cancelado' && !this.patch.motivo_status) throw Object.assign(new Error('Informe o motivo do cancelamento.'), { code: '23514' });
          if (CARIMBO[this.patch.etapa]) this.patch[CARIMBO[this.patch.etapa]] = agora();
          this.historico(r.id, r.etapa, this.patch.etapa, this.patch.motivo_status || null);
        }
        return Object.assign(r, this.patch);
      });
    } else if (this.op === 'delete') {
      saida = tab.filter(casa);
      this.db[this.t] = tab.filter((r) => !casa(r));
      if (this.t === 'frotas_sinistro_terceiros') this.db.frotas_sinistro_anexos = this.db.frotas_sinistro_anexos.filter((a) => a.terceiro_id !== saida[0]?.id);
    } else {
      saida = tab.filter(casa);
    }
    for (const [c, asc] of [...this.ord].reverse()) saida = [...saida].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : 1) * (asc ? 1 : -1));
    if (this.rg) saida = saida.slice(this.rg[0], this.rg[1] + 1);
    if (this.one) return { data: saida[0] ?? null, error: null };
    return { data: saida, error: null };
  }
}

export function criarSupabase(db = criarDb()) {
  const arquivos = new Map();
  return {
    db, arquivos,
    from: (t) => new Q(db, t),
    storage: { from: (bucket) => ({
      upload: async (path, file) => { arquivos.set(path, file); log.push(['upload', bucket, path]); return { error: null }; },
      remove: async (paths) => { paths.forEach((p) => arquivos.delete(p)); log.push(['remove', bucket, paths.join(',')]); return { error: null }; },
      download: async (path) => ({ data: arquivos.get(path) || new Blob(['conteudo guardado']), error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: `about:blank#${encodeURIComponent(path)}` }, error: null }),
    }) },
  };
}
