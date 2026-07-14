// assets/js/menuConfig.js
// Menu alinhado com os códigos reais do Supabase, mantendo compatibilidade com IDs legados.

// O dashboard de Frotas também pode abrir pela navegação suave, que não recarrega o HTML.
// Mantém o CSS específico disponível em ambos os modos de navegação.
if (typeof document !== 'undefined' && !document.getElementById('frotasDashboardStyles')) {
  const link = document.createElement('link');
  link.id = 'frotasDashboardStyles';
  link.rel = 'stylesheet';
  link.href = new URL('../css/frotas-dashboard.css?v=20260713-layout2', import.meta.url).href;
  document.head.appendChild(link);
}

function item(code, label, path, aliases = [], opts = {}) {
  return { code, label, path, aliases, ...opts };
}

export const MENU_CONFIG = [
  {
    grupo: "INÍCIO",
    itens: [
      item("dashboard", "Dashboard", "dashboard", ["DASHBOARD"]),
      item("notificacoes", "Notificações", "notificacoes", ["NOTIFICACOES"]),
      item("historico_geral", "Histórico Geral", "historico", ["HISTORICO_GERAL"])
    ]
  },

  {
    grupo: "GESTOR",
    itens: [
      item("programacao", "Programação", "programacao", ["PROGRAMACAO", "OS", "O.S", "OPERACIONAL_OS", "GESTOR_OS", "OS_GESTOR"]),
      item("hospedagem", "Hospedagem", "hospedagem", ["HOSPEDAGEM"]),
      item("compras_gestor", "Compras", "compras", ["COMPRAS"]),
      item("logistica_gestor", "Logística", "logistica", ["LOGISTICA"]),
      item("patrimonios_gestor", "Patrimônios", "patrimonios", ["PATRIMONIOS"]),
      item("contato_cliente", "Contato Cliente", "contato-cliente", ["CONTATO_CLIENTE"]),
      item("historico_producao", "Histórico Produção", "consultar-producao", ["RELATORIOS_PROD", "CONSULTAR_PRODUCAO", "PRODUCAO_HISTORICO", "GESTOR_APP", "PROGRAMACAO", "DESEMPENHO"])
    ]
  },

  {
    grupo: "CONFERÊNCIA",
    itens: [
      item("conferencia", "Painel de Conferência", "adm-conferencia", ["ADM_CONFERENCIA"]),
      item("conferencia_deslocamento", "Deslocamento", "conferencia-deslocamento", ["CONFERENCIA_DESLOCAMENTO", "ADM_CONFERENCIA"]),
      item("conferencia_uber", "Uber · Conferência", "uber", ["CONFERENCIA_UBER", "UBER"]),
      item("distribuir_os", "Distribuir O.S", "distribuir-os", ["DISTRIBUIR_OS", "CONFERENCIA_DISTRIBUIR_OS"]),
      item("termos", "Termos", "termos", ["TERMOS_CELULAR", "TERMOS_VEICULOS", "TERMOS"])
    ]
  },

  {
    grupo: "COMERCIAL",
    itens: [
      item("propostas", "Propostas", "propostas", ["PROPOSTAS", "COMERCIAL_PROPOSTAS", "PROPOSTAS_COMERCIAIS"])
    ]
  },

  {
    grupo: "COMPRAS",
    itens: [
      item("compras_adm", "Painel de Compras", "adm-compras", ["COMPRAS_ADM"]),
      item("compras_estoque", "Estoque", "compras-estoque", ["COMPRAS_ESTOQUE", "ESTOQUE", "ALMOXARIFADO", "COMPRAS_ADM"])
    ]
  },

  {
    grupo: "PATRIMÔNIOS",
    itens: [
      item("patrimonio", "Painel de Patrimônios", "adm-patrimonio", ["PATRIMONIO_ADM"])
    ]
  },

  {
    grupo: "HOSPEDAGEM",
    itens: [
      item("hotel", "Hotéis", "adm-hotel#hoteis", ["ADM_HOTEL", "HOTEL"]),
      item("hotel_alojamentos", "Alojamentos", "adm-hotel#alojamentos", ["HOTEL_ALOJAMENTOS", "HOSPEDAGEM_ALOJAMENTOS", "ALOJAMENTO", "ALOJAMENTOS"]),
      item("hotel_relatorio", "Relatório", "hotel-relatorio", ["ADM_HOTEL", "HOTEL", "HOTEL_RELATORIO"])
    ]
  },

  {
    grupo: "RECURSOS HUMANOS",
    itens: [
      item("ferias_atestados", "Férias e Atestados", "ferias-atestados", ["RH_FERIAS_ATESTADOS"]),
      item("rh_plantao", "Plantão", "plantao", ["RH_PLANTAO", "PLANTAO", "PLANTÃO"]),
      item("rh_epi", "EPI", "epi-rh", ["RH_EPI"]),
      item("historico_geral", "Histórico Geral", "historico", ["RH_HIST_INDISP"]),
      item("rh_clinicas_sst", "Clínicas SST", "clinicas-sst", ["RH_CLINICAS", "CLINICAS_SST"]),
      item("base_colab_consulta", "Consultar Base", "consultar-colaboradores", ["BASE_COLAB_CONSULTA"]),
      item("contatos_exportacoes", "Contatos e Cadastros", "contatos", ["CONTATOS_EXPORTACOES", "CONTATOS", "GOOGLE_CONTACTS"])
    ]
  },

  {
    grupo: "OPERACIONAL",
    itens: [
      item("operacional_mapa", "Mapa de Direcionamento", "adm-operacional", ["OPERACIONAL", "OPERACIONAL_MAPA", "MAPA_DIRECIONAMENTO"])
    ]
  },

  {
    grupo: "FROTAS",
    itens: [
      item("frotas_dashboard", "Dashboard", "frotas-dashboard", ["FROTAS_DASHBOARD", "FROTAS", "EXCESSO_VELOCIDADE", "FROTAS_EXCESSO_VELOCIDADE", "FROTAS_VEICULOS", "VEICULOS", "FROTAS_MOTORISTAS", "MOTORISTAS", "FROTAS_MULTAS", "MULTAS", "FROTAS_HISTORICO", "HISTORICO_FROTAS", "FROTAS_RASTREADORES", "RASTREADORES"]),
      item("frotas_excesso_velocidade", "Excesso de Velocidade", "frotas", ["FROTAS", "EXCESSO_VELOCIDADE", "FROTAS_EXCESSO_VELOCIDADE"]),
      item("frotas_veiculos", "Veículos", "frotas-veiculos", ["FROTAS_VEICULOS", "VEICULOS", "VEÍCULOS", "FROTA_VEICULOS"]),
      item("frotas_motoristas", "Motoristas", "frotas-motoristas", ["FROTAS_MOTORISTAS", "MOTORISTAS", "FROTAS_VEICULOS", "VEICULOS"]),
      item("frotas_multas", "Multas", "frotas-multas", ["MULTAS", "FROTAS_MULTAS"]),
      item("frotas_historico", "Histórico", "frotas-historico", ["FROTAS_HISTORICO", "HISTORICO_FROTAS"]),
      item("frotas_rastreadores", "Rastreadores", "frotas-rastreadores", ["FROTAS_RASTREADORES", "RASTREADORES"])
    ]
  },

  {
    grupo: "TI",
    itens: [
      item("ti_agentes", "Agentes", "ti-agentes", ["TI_AGENTES", "AGENTES", "TI"]),
      item("ti_integracoes", "Integrações", "ti-integracoes", ["TI", "INTEGRACOES", "TI_INTEGRACOES", "CONFIG_INTEGRACOES"]),
      item("ti_contatos", "Contatos de Notificação", "ti-contatos", ["TI_CONTATOS", "TI"]),
      item("ti_comunicacao", "Comunicação", "ti-comunicacao", ["TI_COMUNICACAO", "TI"]),
      item("emails", "Central de E-mails", "emails", ["EMAILS", "CENTRAL_EMAILS", "CENTRAL_DE_EMAILS", "TI_EMAILS"])
    ]
  },

  {
    grupo: "NOTAS FISCAIS",
    itens: [
      item("notas_fiscais", "Painel de Notas Fiscais", "notas-fiscais", ["NOTAS_FISCAIS", "NF", "NFS", "FINANCEIRO_NOTAS_FISCAIS"])
    ]
  },

  {
    grupo: "FATURAMENTO",
    itens: [
      item("faturamento", "Painel de Faturamento", "faturamento", ["FATURAMENTO", "FATURAMENTO_PAINEL", "FINANCEIRO_FATURAMENTO", "FATURAS", "BOLETOS"])
    ]
  },

  {
    grupo: "FINANCEIRO",
    itens: [
      item("financeiro_fluxo_caixa", "Fluxo de Caixa", "financeiro", ["FINANCEIRO", "FLUXO_CAIXA", "FINANCEIRO_FLUXO_CAIXA"]),
      item("financeiro_pagamentos", "Pagamentos", "financeiro#pagamentos", ["FINANCEIRO", "PAGAMENTOS", "FINANCEIRO_PAGAMENTOS"]),
      item("financeiro_adiantamentos", "Adiantamentos", "financeiro#despesas?modo=adiantamentos", ["ADIANTAMENTOS", "FINANCEIRO_ADIANTAMENTOS"]),
      item("financeiro_alimentacao", "Alimentação", "financeiro#despesas?modo=almoco", ["ALIMENTACAO", "ALIMENTAÇÃO", "FINANCEIRO_ALIMENTACAO"])
    ]
  },

  {
    grupo: "LOGÍSTICA",
    itens: [
      item("logistica_adm", "Painel de Logística", "adm-logistica", ["LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_informativos", "Informativos", "logistica-informativos", ["LOGISTICA_INFORMATIVOS", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_finalizacao_os", "Finalização de O.S", "adm-logistica#finalizacao", ["LOGISTICA_FINALIZACAO_OS", "FINALIZACAO_OS", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_classificadores", "Classificadores", "adm-logistica#classificadores", ["LOGISTICA_CLASSIFICADORES", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_conferencias", "Conferências", "adm-logistica#conferencias", ["LOGISTICA_CONFERENCIAS", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_exportacoes", "Exportações clientes", "adm-logistica#exportacoes", ["LOGISTICA_EXPORTACOES", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_relatorios_cliente", "Relatórios ao Cliente", "adm-logistica#relatorios", ["LOGISTICA_RELATORIOS_CLIENTE", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_btg", "BTG", "btg-logistica", ["LOGISTICA_BTG", "BTG_LOGISTICA", "BTG", "LOGISTICA_ADM"])
    ]
  },

  {
    grupo: "TROCA DE NOTAS",
    itens: []
  },

  {
    grupo: 'CORREIOS',
    itens: [
      item('envios',    'Correios',  'envios',    ['ENVIOS', 'CORREIOS', 'PREPOSTAGEM']),
      item('telegrama', 'Telegrama', 'telegrama', ['TELEGRAMA', 'SMT']),
    ]
  },

  {
    grupo: "AUDITORIA",
    itens: [
      item("admin_auditoria", "Auditoria do Sistema", "admin-auditoria", ["ADMIN_AUDITORIA"])
    ]
  },

  {
    grupo: "RELATÓRIOS",
    itens: [
      item("relatorios_importar", "Importar Relatórios", "importar-relatorios", ["RELATORIOS_IMPORTAR", "RELATORIOS_UPLOAD", "IMPORTAR_RELATORIOS", "RELATORIOS"]),
      item("relatorios_colab", "Colaboradores", "consultar-colaboradores", ["RELATORIOS_COLAB", "RELATORIOS"]),
      item("relatorios_prod", "Produção", "consultar-producao", ["RELATORIOS_PROD", "RELATORIOS"]),
      item("relatorios_patrimonios_importar", "Patrimônios", "importar-patrimonios", ["RELATORIOS_PATRIMONIOS_IMPORTAR", "RELATORIOS"])
    ]
  },

  {
    grupo: "DIRETORIA",
    itens: [
      item("dashboard_socio", "Dashboard do Sócio", "dashboard-socio", ["DASHBOARD_SOCIO"]),
      item("diretoria_dre", "DRE", "dre", ["DRE", "DIRETORIA_DRE"]),
      item("diretoria_metas", "METAS", "metas", ["METAS", "DIRETORIA_METAS"]),
      item("diretoria_desempenho", "Desempenho", "desempenho", ["DESEMPENHO", "DIRETORIA_DESEMPENHO"]),
      item("diretoria_contato_cliente", "Contato Cliente", "contato-cliente", ["DIRETORIA_CONTATO_CLIENTE"]),
      item("usuarios_acessos", "Usuários e Acessos", "admin-usuarios", ["ADMIN_USUARIOS", "USUARIOS_E_ACESSOS"]),
      item("logs_usuarios", "Logs de Usuários", "logs-usuarios", ["LOGS_USUARIOS"]),
      item("admin_config", "Configurações", "admin-configuracoes", ["ADMIN_CONFIG"])
    ]
  }
];

export const PANEL_MENU = MENU_CONFIG.map((section) => ({
  section: section.grupo,
  items: section.itens.map((item) => ({
    code: item.code,
    label: item.label,
    path: item.path,
    aliases: item.aliases || [],
    hidden: item.hidden || false
  }))
}));
