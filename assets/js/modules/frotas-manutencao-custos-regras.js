// Frotas · Manutenção › Custos: agregação do custo FINAL das manutenções concluídas (sem DOM, sem Supabase).
// Conta só manutenção concluída com custo > 0; por padrão só a paga pela empresa (a que vai para NF, Financeiro e DRE).
// Importação de histórico (custo 0) e solicitações em andamento ficam de fora.

export const AGRUPAMENTOS = [
  { id: 'placa', rotulo: 'Veículo (placa)' },
  { id: 'coordenacao', rotulo: 'Coordenação' },
  { id: 'supervisao', rotulo: 'Supervisão' },
  { id: 'categoria', rotulo: 'Categoria do guia' },
  { id: 'natureza', rotulo: 'Natureza' },
  { id: 'oficina', rotulo: 'Oficina' },
  { id: 'mes', rotulo: 'Mês' },
];

const arredondar = (n) => Math.round(n * 100) / 100;

// Uma linha por manutenção concluída com custo, já com os dados do veículo e as categorias dos itens.
export function linhasDeCusto(manutencoes, { itens = [], veiculos = [], categorias = [] } = {}, { somenteEmpresa = true } = {}) {
  const veic = new Map(veiculos.map((v) => [v.id, v]));
  const nomeCat = new Map(categorias.map((c) => [Number(c.codigo), c.nome]));
  const catsPorManut = new Map();
  for (const i of itens) {
    const set = catsPorManut.get(i.manutencao_id) || new Set();
    set.add(Number(i.categoria_codigo));
    catsPorManut.set(i.manutencao_id, set);
  }
  return manutencoes
    .filter((m) => m.status === 'concluida' && Number(m.custo) > 0 && (!somenteEmpresa || m.responsavel_pagamento === 'empresa'))
    .map((m) => {
      const v = veic.get(m.veiculo_id) || {};
      const data = String(m.data_execucao || '').slice(0, 10);
      return {
        id: m.id,
        codigo: m.numero != null ? `MAN-${String(m.numero).padStart(6, '0')}` : '',
        data,
        mes: data.slice(0, 7),
        placa: v.placa || '(sem placa)',
        modelo: v.marca_modelo || '',
        coordenacao: v.coordenacao || '(sem coordenação)',
        supervisao: v.supervisao || '(sem supervisão)',
        natureza: m.natureza || '(sem natureza)',
        oficina: m.oficina || '(sem oficina)',
        custo: Number(m.custo),
        categorias: [...(catsPorManut.get(m.id) || [])].sort((a, b) => a - b).map((codigo) => ({ codigo, nome: nomeCat.get(codigo) || '' })),
      };
    });
}

export function filtrarPeriodo(linhas, { inicio = '', fim = '' } = {}) {
  return linhas.filter((l) => (!inicio || l.data >= inicio) && (!fim || l.data <= fim));
}

// Agrupa e totaliza. Categoria: o custo da manutenção é dividido igualmente entre as categorias dos seus itens
// (o custo é um valor só por manutenção); sem itens, vai para "(sem categoria)".
export function agrupar(linhas, por) {
  const grupos = new Map();
  const somar = (chave, rotulo, valor, l, fracao = 1) => {
    const g = grupos.get(chave) || { chave, rotulo, qtd: 0, total: 0, preventiva: 0, corretiva: 0 };
    g.qtd += fracao;
    g.total += valor;
    if (l.natureza === 'preventiva') g.preventiva += valor;
    if (l.natureza === 'corretiva') g.corretiva += valor;
    grupos.set(chave, g);
  };
  for (const l of linhas) {
    if (por === 'categoria') {
      const cats = l.categorias.length ? l.categorias : [{ codigo: 0, nome: '' }];
      for (const c of cats) {
        const rotulo = c.codigo ? `${String(c.codigo).padStart(2, '0')} · ${c.nome}` : '(sem categoria)';
        somar(String(c.codigo), rotulo, l.custo / cats.length, l, 1 / cats.length);
      }
    } else {
      const chave = por === 'mes' ? l.mes : String(l[por] ?? '');
      somar(chave, chave, l.custo, l);
    }
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, qtd: Math.round(g.qtd * 10) / 10, total: arredondar(g.total), medio: g.qtd ? arredondar(g.total / g.qtd) : 0, preventiva: arredondar(g.preventiva), corretiva: arredondar(g.corretiva) }))
    .sort((a, b) => (por === 'mes' ? a.chave.localeCompare(b.chave) : b.total - a.total));
}

export function resumo(linhas) {
  const total = arredondar(linhas.reduce((s, l) => s + l.custo, 0));
  const prev = linhas.filter((l) => l.natureza === 'preventiva').reduce((s, l) => s + l.custo, 0);
  const corr = linhas.filter((l) => l.natureza === 'corretiva').reduce((s, l) => s + l.custo, 0);
  return {
    total,
    qtd: linhas.length,
    medio: linhas.length ? arredondar(total / linhas.length) : 0,
    preventiva: arredondar(prev),
    corretiva: arredondar(corr),
    pctPreventiva: total ? Math.round((prev / total) * 1000) / 10 : 0,
    pctCorretiva: total ? Math.round((corr / total) * 1000) / 10 : 0,
  };
}

const csvCelula = (v) => {
  const t = String(v ?? '');
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csvNumero = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// CSV para o Excel brasileiro (separador ";", decimal com vírgula, BOM para os acentos).
export function csvDosGrupos(grupos, rotuloGrupo) {
  const linhas = [[rotuloGrupo, 'Manutenções', 'Custo total (R$)', 'Custo médio (R$)', 'Preventiva (R$)', 'Corretiva (R$)']]
    .concat(grupos.map((g) => [g.rotulo, String(g.qtd).replace('.', ','), csvNumero(g.total), csvNumero(g.medio), csvNumero(g.preventiva), csvNumero(g.corretiva)]));
  return `﻿${linhas.map((l) => l.map(csvCelula).join(';')).join('\r\n')}`;
}

export function csvDasLinhas(linhas) {
  const cab = ['Código', 'Data', 'Placa', 'Modelo', 'Coordenação', 'Supervisão', 'Natureza', 'Categorias', 'Oficina', 'Custo (R$)'];
  const corpo = linhas.map((l) => [l.codigo, l.data, l.placa, l.modelo, l.coordenacao, l.supervisao, l.natureza,
    l.categorias.map((c) => `${String(c.codigo).padStart(2, '0')} ${c.nome}`).join(' | '), l.oficina, csvNumero(l.custo)]);
  return `﻿${[cab, ...corpo].map((l) => l.map(csvCelula).join(';')).join('\r\n')}`;
}
