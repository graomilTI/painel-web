// menuConfig.js CORRIGIDO (completo + RELATÓRIOS)

export const MENU_CONFIG = [
  {
    id: 'conferencia',
    nome: 'CONFERÊNCIA',
    itens: [
      { nome: 'Irregularidades', rota: '/painel/adm-conferencia.html' },
      { nome: 'Lançamentos', rota: '/painel/adm-conferencia.html' }
    ]
  },
  {
    id: 'compras',
    nome: 'COMPRAS',
    itens: [
      { nome: 'Pedidos', rota: '/painel/adm-compras.html' },
      { nome: 'Fornecedores', rota: '/painel/adm-compras.html' }
    ]
  },
  {
    id: 'patrimonios',
    nome: 'PATRIMÔNIOS',
    itens: [
      { nome: 'Controle', rota: '/painel/adm-patrimonio.html' }
    ]
  },
  {
    id: 'hospedagem',
    nome: 'HOSPEDAGEM',
    itens: [
      { nome: 'Gestão', rota: '/painel/adm-hotel.html' }
    ]
  },
  {
    id: 'rh',
    nome: 'RECURSOS HUMANOS',
    itens: [
      { nome: 'Colaboradores', rota: '/painel/consultar-colaboradores.html' }
    ]
  },
  {
    id: 'frotas',
    nome: 'FROTAS',
    itens: []
  },
  {
    id: 'logistica',
    nome: 'LOGÍSTICA',
    itens: [
      { nome: 'Operações', rota: '/painel/adm-logistica.html' }
    ]
  },
  {
    id: 'troca_notas',
    nome: 'TROCA DE NOTAS',
    itens: []
  },
  {
    id: 'auditoria',
    nome: 'AUDITORIA',
    itens: [
      { nome: 'Logs', rota: '/painel/admin-auditoria.html' },
      { nome: 'Relatórios', rota: '/painel/admin-auditoria.html' }
    ]
  },
  {
    id: 'relatorios',
    nome: 'RELATÓRIOS',
    itens: [
      {
        nome: 'Importar Produção',
        rota: '/painel/importar-producao.html'
      },
      {
        nome: 'Importar Relatório Externo',
        rota: '/painel/importar-relatorio.html'
      }
    ]
  },
  {
    id: 'diretoria',
    nome: 'DIRETORIA',
    itens: []
  }
];
