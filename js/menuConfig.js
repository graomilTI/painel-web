// menuConfig.js

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
    grupo: "ADMINISTRAÇÃO OPERACIONAL",
    itens: [
      { id: "ADM_CONFERENCIA", nome: "Conferência", path: "adm-conferencia" },
      { id: "ADM_HOTEL", nome: "Hotel", path: "adm-hotel" },
      { id: "COMPRAS_ADM", nome: "Compras", path: "adm-compras" },
      { id: "FINANCEIRO", nome: "Financeiro", path: "financeiro" },
      { id: "PATRIMONIO_ADM", nome: "Patrimônio", path: "adm-patrimonio" },
      { id: "LOGISTICA_ADM", nome: "Logística", path: "adm-logistica" },
      { id: "RH_FERIAS_ATESTADOS", nome: "Férias e Atestados", path: "ferias-atestados" },
      { id: "RH_HIST_INDISP", nome: "Histórico de Indisponibilidade", path: "historico-indisponibilidade" }
    ]
  },

  {
    grupo: "BASE DE COLABORADORES",
    itens: [
      { id: "BASE_COLAB_IMPORT", nome: "Importar Colaboradores", path: "importar-colaboradores" },
      { id: "BASE_COLAB_HIST", nome: "Histórico de Importações", path: "historico-colaboradores" },
      { id: "BASE_COLAB_CONSULTA", nome: "Consultar Base", path: "consultar-colaboradores" }
    ]
  },

  {
    grupo: "PRODUÇÃO DIÁRIA",
    itens: [
      { id: "PRODUCAO_IMPORT", nome: "Importar Produção", path: "importar-producao" },
      { id: "PRODUCAO_HIST", nome: "Histórico Produção", path: "historico-producao" },
      { id: "EFETIVOS_ZERO", nome: "Efetivos sem Produção", path: "efetivos-sem-producao" }
    ]
  },

  {
    grupo: "ADMINISTRAÇÃO",
    itens: [
      { id: "ADMIN_USUARIOS", nome: "Usuários e Acessos", path: "admin-usuarios" },
      { id: "ADMIN_AUDITORIA", nome: "Auditoria", path: "admin-auditoria" },
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
