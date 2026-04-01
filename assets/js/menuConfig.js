// assets/js/menuConfig.js

export const MENU_CONFIG = [
  {
    grupo: "INÍCIO",
    itens: [
      { id: "DASHBOARD", nome: "Dashboard", path: "dashboard" },
      { id: "NOTIFICACOES", nome: "Notificações", path: "notificacoes" },
      { id: "HISTORICO_GERAL", nome: "Histórico Geral", path: "historico" }
    ]
  },

  {
    grupo: "GESTOR",
    itens: [
      { id: "PROGRAMACAO", nome: "Programação", path: "programacao" },
      { id: "HOSPEDAGEM", nome: "Hospedagem", path: "hospedagem" },
      { id: "COMPRAS", nome: "Compras", path: "compras" },
      { id: "LOGISTICA", nome: "Logística", path: "logistica" },
      { id: "PATRIMONIOS", nome: "Patrimônios", path: "patrimonios" },
      { id: "CONTATO_CLIENTE", nome: "Contato Cliente", path: "contato-cliente" }
    ]
  },

  {
    grupo: "CONFERÊNCIA",
    itens: [
      { id: "ADM_CONFERENCIA", nome: "Painel de Conferência", path: "adm-conferencia" },
      { id: "PRODUCAO_IMPORT", nome: "Importar Produção", path: "importar-producao" },
      { id: "PRODUCAO_HIST", nome: "Histórico Produção", path: "historico-producao" },
      { id: "EFETIVOS_ZERO", nome: "Efetivos sem Produção", path: "efetivos-sem-producao" }
    ]
  },

  {
    grupo: "COMPRAS",
    itens: [
      { id: "COMPRAS_ADM", nome: "Painel de Compras", path: "adm-compras" }
    ]
  },

  {
    grupo: "PATRIMÔNIOS",
    itens: [
      { id: "PATRIMONIO_ADM", nome: "Painel de Patrimônios", path: "adm-patrimonio" }
    ]
  },

  {
    grupo: "HOSPEDAGEM",
    itens: [
      { id: "ADM_HOTEL", nome: "Painel de Hospedagem", path: "adm-hotel" }
    ]
  },

  {
    grupo: "RECURSOS HUMANOS",
    itens: [
      { id: "RH_FERIAS_ATESTADOS", nome: "Férias e Atestados", path: "ferias-atestados" },
      { id: "RH_HIST_INDISP", nome: "Histórico de Indisponibilidade", path: "historico-indisponibilidade" },
      { id: "BASE_COLAB_IMPORT", nome: "Importar Colaboradores", path: "importar-colaboradores" },
      { id: "BASE_COLAB_HIST", nome: "Histórico de Importações", path: "historico-colaboradores" },
      { id: "BASE_COLAB_CONSULTA", nome: "Consultar Base", path: "consultar-colaboradores" }
    ]
  },

  {
    grupo: "FROTAS",
    itens: []
  },

  {
    grupo: "LOGÍSTICA",
    itens: [
      { id: "LOGISTICA_ADM", nome: "Painel de Logística", path: "adm-logistica" }
    ]
  },

  {
    grupo: "TROCA DE NOTAS",
    itens: []
  },

  {
    grupo: "AUDITORIA",
    itens: [
      { id: "ADMIN_AUDITORIA", nome: "Auditoria do Sistema", path: "admin-auditoria" }
    ]
  },

  {
    grupo: "DIRETORIA",
    itens: [
      { id: "FINANCEIRO", nome: "Financeiro", path: "financeiro" },
      { id: "ADMIN_USUARIOS", nome: "Usuários e Acessos", path: "admin-usuarios" },
      { id: "ADMIN_CONFIG", nome: "Configurações", path: "admin-configuracoes" }
    ]
  }
];

export const PANEL_MENU = MENU_CONFIG.map((section) => ({
  section: section.grupo,
  items: section.itens.map((item) => ({
    code: item.id,
    label: item.nome,
    path: item.path
  }))
}));
