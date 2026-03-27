// menuConfig.js

export const MENU_CONFIG = [
  {
    grupo: "INÍCIO",
    itens: [
      { id: "DASHBOARD", nome: "Dashboard", path: "/dashboard.html" },
      { id: "NOTIFICACOES", nome: "Notificações", path: "#" },
      { id: "HISTORICO_GERAL", nome: "Histórico Geral", path: "#" }
    ]
  },

  {
    grupo: "GESTOR",
    itens: [
      { id: "PROGRAMACAO", nome: "Programação", path: "#" },
      { id: "HOSPEDAGEM", nome: "Hospedagem", path: "#" },
      { id: "COMPRAS", nome: "Compras", path: "#" },
      { id: "LOGISTICA", nome: "Logística", path: "#" },
      { id: "PATRIMONIOS", nome: "Patrimônios", path: "#" },
      { id: "CONTATO_CLIENTE", nome: "Contato Cliente", path: "#" }
    ]
  },

  {
    grupo: "ADMINISTRAÇÃO OPERACIONAL",
    itens: [
      { id: "ADM_CONFERENCIA", nome: "ADM Conferência", path: "#" },
      { id: "ADM_HOTEL", nome: "ADM Hotel", path: "#" },
      { id: "COMPRAS_ADM", nome: "Compras ADM", path: "#" },
      { id: "FINANCEIRO", nome: "Financeiro", path: "#" },
      { id: "PATRIMONIO_ADM", nome: "Patrimônio ADM", path: "#" },
      { id: "LOGISTICA_ADM", nome: "Logística ADM", path: "#" }
    ]
  },

  // 🔥 NOVO BLOCO — BASE DE COLABORADORES
  {
    grupo: "BASE DE COLABORADORES",
    itens: [
      { id: "BASE_COLAB_IMPORT", nome: "Importar Colaboradores", path: "/importar-colaboradores.html" },
      { id: "BASE_COLAB_HIST", nome: "Histórico de Importações", path: "/historico-colaboradores.html" },
      { id: "BASE_COLAB_CONSULTA", nome: "Consultar Base", path: "/consultar-colaboradores.html" }
    ]
  },

  // 🔥 NOVO BLOCO — PRODUÇÃO
  {
    grupo: "PRODUÇÃO DIÁRIA",
    itens: [
      { id: "PRODUCAO_IMPORT", nome: "Importar Produção", path: "/importar-producao.html" },
      { id: "PRODUCAO_HIST", nome: "Histórico Produção", path: "/historico-producao.html" },
      { id: "EFETIVOS_ZERO", nome: "Efetivos sem Produção", path: "/efetivos-sem-producao.html" }
    ]
  }
];
