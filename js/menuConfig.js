// menuConfig.js

export const MENU_CONFIG = [
  {
    grupo: "INÍCIO",
    itens: [
      { id: "DASHBOARD", nome: "Dashboard", path: "./dashboard.html" },
      { id: "NOTIFICACOES", nome: "Notificações", path: "./notificacoes.html" },
      { id: "HISTORICO_GERAL", nome: "Histórico Geral", path: "./historico.html" }
    ]
  },

  {
    grupo: "GESTOR",
    itens: [
      { id: "PROGRAMACAO", nome: "Programação", path: "./programacao.html" },
      { id: "HOSPEDAGEM", nome: "Hospedagem", path: "./hospedagem.html" },
      { id: "COMPRAS", nome: "Compras", path: "./compras.html" },
      { id: "LOGISTICA", nome: "Logística", path: "./logistica.html" },
      { id: "PATRIMONIOS", nome: "Patrimônios", path: "./patrimonios.html" },
      { id: "CONTATO_CLIENTE", nome: "Contato Cliente", path: "./contato-cliente.html" }
    ]
  },

  {
    grupo: "ADMINISTRAÇÃO OPERACIONAL",
    itens: [
      { id: "ADM_CONFERENCIA", nome: "ADM Conferência", path: "./adm-conferencia.html" },
      { id: "ADM_HOTEL", nome: "ADM Hotel", path: "./adm-hotel.html" },
      { id: "COMPRAS_ADM", nome: "Compras ADM", path: "./adm-compras.html" },
      { id: "FINANCEIRO", nome: "Financeiro", path: "./financeiro.html" },
      { id: "PATRIMONIO_ADM", nome: "Patrimônio ADM", path: "./adm-patrimonio.html" },
      { id: "LOGISTICA_ADM", nome: "Logística ADM", path: "./adm-logistica.html" },
      { id: "RH_FERIAS_ATESTADOS", nome: "Férias e Atestados", path: "./ferias-atestados.html" },
      { id: "RH_HIST_INDISP", nome: "Histórico de Indisponibilidade", path: "./historico-indisponibilidade.html" }
    ]
  },

  {
    grupo: "BASE DE COLABORADORES",
    itens: [
      { id: "BASE_COLAB_IMPORT", nome: "Importar Colaboradores", path: "./importar-colaboradores.html" },
      { id: "BASE_COLAB_HIST", nome: "Histórico de Importações", path: "./historico-colaboradores.html" },
      { id: "BASE_COLAB_CONSULTA", nome: "Consultar Base", path: "./consultar-colaboradores.html" }
    ]
  },

  {
    grupo: "PRODUÇÃO DIÁRIA",
    itens: [
      { id: "PRODUCAO_IMPORT", nome: "Importar Produção", path: "./importar-producao.html" },
      { id: "PRODUCAO_HIST", nome: "Histórico Produção", path: "./historico-producao.html" },
      { id: "EFETIVOS_ZERO", nome: "Efetivos sem Produção", path: "./efetivos-sem-producao.html" }
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
