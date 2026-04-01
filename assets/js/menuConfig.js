// menuConfig.js atualizado com RELATÓRIOS

export const MENU_CONFIG = [
  {
    id: 'conferencia',
    nome: 'CONFERÊNCIA',
    itens: []
  },
  {
    id: 'compras',
    nome: 'COMPRAS',
    itens: []
  },
  {
    id: 'relatorios',
    nome: 'RELATÓRIOS',
    icone: '📊',
    itens: [
      {
        id: 'importar-producao',
        nome: 'Importar Produção',
        rota: '/painel/importar-producao.html'
      },
      {
        id: 'importar-relatorio',
        nome: 'Importar Relatório Externo',
        rota: '/painel/importar-relatorio.html'
      }
    ]
  }
];
