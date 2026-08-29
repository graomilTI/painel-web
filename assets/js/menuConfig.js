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

// Mesmo motivo do CSS acima: os 3 hubs de Frotas (Cadastros/Manutenção/Ocorrências)
// e as janelas que eles abrem usam essa folha de estilo.
if (typeof document !== 'undefined' && !document.getElementById('frotasHubStyles')) {
  const link = document.createElement('link');
  link.id = 'frotasHubStyles';
  link.rel = 'stylesheet';
  link.href = new URL('../css/frotas-hub.css?v=20260829b-abas-flush', import.meta.url).href;
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
      item("historico_inicio", "Histórico", "historico", ["HISTORICO", "HISTORICO_INICIO"]),
      item("notificacoes", "Notificações", "notificacoes", ["NOTIFICACOES"])
    ]
  },

  {
    grupo: "GESTOR",
    itens: [
      item("programacao", "Programação", "programacao", ["PROGRAMACAO", "OS", "O.S", "OPERACIONAL_OS", "GESTOR_OS", "OS_GESTOR"]),
      item("hospedagem", "Hospedagem", "hospedagem", ["HOSPEDAGEM"]),
      item("compras_gestor", "Compras", "compras", ["COMPRAS"]),
      item("logistica_gestor", "Logística", "logistica", ["LOGISTICA_GESTOR", "GESTOR_LOGISTICA"]),
      item("patrimonios_gestor", "Patrimônios", "patrimonios", ["PATRIMONIOS"]),
      item("contato_cliente", "Contato Cliente", "contato-cliente", ["CONTATO_CLIENTE"]),
      item("historico_producao", "Histórico Produção", "consultar-producao", ["RELATORIOS_PROD", "CONSULTAR_PRODUCAO", "PRODUCAO_HISTORICO", "GESTOR_APP", "PROGRAMACAO", "DESEMPENHO"])
    ]
  },

  {
    grupo: "CONFERÊNCIA",
    itens: [
      item("conferencia", "Painel de Conferência", "adm-conferencia", ["ADM_CONFERENCIA"]),
      item("conferencia_bonus", "Bônus", "conferencia-bonus", ["CONFERENCIA_BONUS", "ADM_CONFERENCIA", "CONFERENCIA"]),
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
      // Equipe (Admissões, Integração, Cadastro no Graint, Consultar Base e Contatos vivem como abas dentro desta página)
      item("equipe", "Equipe", "equipe", ["EQUIPE_ADMISSOES", "EQUIPE_INTEGRACAO", "EQUIPE_GRAINT", "BASE_COLAB_CONSULTA", "CONTATOS_EXPORTACOES", "CONTATOS", "GOOGLE_CONTACTS"]),
      // Exames (Admissional, Periódico e Clínicas SST vivem como abas dentro desta página)
      item("exames", "Exames", "exames", ["EXAMES_ADMISSIONAL", "EXAMES_PERIODICO", "RH_CLINICAS", "CLINICAS_SST"]),
      // Contratos (Contrato de Experiência e Rescisões vivem como abas dentro desta página)
      item("contratos", "Contratos", "contratos", ["CONTRATOS_EXPERIENCIA", "CONTRATOS_RESCISOES"]),
      // Segurança do Trabalho (EPIs e CAT vivem como abas dentro desta página)
      item("seguranca_trabalho", "Segurança do Trabalho", "seguranca-trabalho", ["RH_EPI", "SEGURANCA_CAT"]),
      // Indisponibilidade (Férias, Atestados e Histórico vivem como abas dentro desta página)
      item("indisponibilidade", "Indisponibilidade", "indisponibilidade", ["RH_FERIAS_ATESTADOS", "RH_HIST_INDISP"]),
      // Cartão Ponto
      item("cartao_ponto", "Cartão Ponto", "cartao-ponto", ["CARTAO_PONTO"]),
      // Advertências
      item("advertencias", "Advertências", "advertencias", ["ADVERTENCIAS"]),
      // Holerite e Pagamentos
      item("holerite_pagamentos", "Folha e Holerite", "holerite-pagamentos", ["HOLERITE_PAGAMENTOS"]),
      // Plantão
      item("rh_plantao", "Plantão", "plantao", ["RH_PLANTAO", "PLANTAO", "PLANTÃO"])
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
      item("frotas_dashboard", "Dashboard", "frotas-dashboard", ["FROTAS_DASHBOARD", "FROTAS", "EXCESSO_VELOCIDADE", "FROTAS_EXCESSO_VELOCIDADE", "FROTAS_VEICULOS", "VEICULOS", "FROTAS_MOTORISTAS", "MOTORISTAS", "FROTAS_MULTAS", "MULTAS", "FROTAS_HISTORICO", "HISTORICO_FROTAS", "FROTAS_RASTREADORES", "RASTREADORES", "FROTAS_MANUTENCAO", "MANUTENCAO", "FROTAS_TROCA_OLEO", "TROCA_OLEO", "FROTAS_CHECKLISTS", "CHECKLISTS"]),
      // Grupos visíveis na sidebar (janelas dentro de cada hub). Os itens
      // individuais abaixo continuam existindo (rota e permissão válidas,
      // usados pela navegação cruzada interna entre as telas antigas), só
      // ficam ocultos da lista visível via `hidden: true`.
      item("frotas_cadastros", "Cadastros", "frotas-cadastros", ["FROTAS_CADASTROS", "FROTAS_VEICULOS", "VEICULOS", "VEÍCULOS", "FROTA_VEICULOS", "FROTAS_MOTORISTAS", "MOTORISTAS", "FROTAS_RASTREADORES", "RASTREADORES"]),
      item("frotas_manutencao_grupo", "Manutenção", "frotas-manutencao-grupo", ["FROTAS_MANUTENCAO_GRUPO", "FROTAS_MANUTENCAO", "MANUTENCAO", "FROTAS_TROCA_OLEO", "TROCA_OLEO", "FROTAS_CHECKLISTS", "CHECKLISTS"]),
      item("frotas_ocorrencias", "Ocorrências", "frotas-ocorrencias", ["FROTAS_OCORRENCIAS", "FROTAS_EXCESSO_VELOCIDADE", "EXCESSO_VELOCIDADE", "FROTAS_MULTAS", "MULTAS", "FROTAS_HISTORICO", "HISTORICO_FROTAS"]),
      item("frotas_excesso_velocidade", "Notificação", "frotas", ["FROTAS", "EXCESSO_VELOCIDADE", "FROTAS_EXCESSO_VELOCIDADE"], { hidden: true }),
      item("frotas_veiculos", "Veículos", "frotas-veiculos", ["FROTAS_VEICULOS", "VEICULOS", "VEÍCULOS", "FROTA_VEICULOS"], { hidden: true }),
      item("frotas_motoristas", "Motoristas", "frotas-motoristas", ["FROTAS_MOTORISTAS", "MOTORISTAS"], { hidden: true }),
      item("frotas_multas", "Multas", "frotas-multas", ["MULTAS", "FROTAS_MULTAS"], { hidden: true }),
      item("frotas_manutencao", "Manutenção", "frotas-manutencao", ["FROTAS_MANUTENCAO", "MANUTENCAO"], { hidden: true }),
      item("frotas_troca_oleo", "Troca de Óleo", "frotas-troca-oleo", ["FROTAS_TROCA_OLEO", "TROCA_OLEO"], { hidden: true }),
      item("frotas_checklists", "Checklists", "frotas-checklists", ["FROTAS_CHECKLISTS", "CHECKLISTS"], { hidden: true }),
      item("frotas_historico", "Histórico", "frotas-historico", ["FROTAS_HISTORICO", "HISTORICO_FROTAS"], { hidden: true }),
      item("frotas_rastreadores", "Rastreadores", "frotas-rastreadores", ["FROTAS_RASTREADORES", "RASTREADORES"], { hidden: true })
    ]
  },

  {
    grupo: "TI",
    itens: [
      item("ti_agentes", "Agentes", "ti-agentes", ["TI_AGENTES", "AGENTES", "TI"]),
      item("ti_integracoes", "Integrações", "ti-integracoes", ["TI", "INTEGRACOES", "TI_INTEGRACOES", "CONFIG_INTEGRACOES"]),
      item("ti_contatos", "Contatos de Notificação", "ti-contatos", ["TI_CONTATOS", "TI"]),
      item("ti_comunicacao", "Comunicação", "ti-comunicacao", ["TI_COMUNICACAO", "TI"]),
      item("emails", "Central de E-mails", "emails", ["EMAILS", "CENTRAL_EMAILS", "CENTRAL_DE_EMAILS", "TI_EMAILS"]),
      item("chamados_ti", "Chamados de TI", "chamados-ti", ["CHAMADOS_TI", "CHAMADOS", "TI_CHAMADOS", "CHAMADOS_TI_GESTAO"])
    ]
  },

  {
    grupo: "NOTAS FISCAIS",
    itens: [
      item("notas_fiscais", "Painel de Notas Fiscais", "notas-fiscais", ["NOTAS_FISCAIS", "NF", "NFS", "FINANCEIRO_NOTAS_FISCAIS"]),
      item("upload_notas_fiscais", "Enviar Notas Fiscais", "upload-notas-fiscais", ["NOTAS_FISCAIS", "NF", "NFS", "FINANCEIRO_NOTAS_FISCAIS"])
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
      item("financeiro_alimentacao", "Alimentação", "financeiro#despesas?modo=almoco", ["ALIMENTACAO", "ALIMENTAÇÃO", "FINANCEIRO_ALIMENTACAO"]),
      item("financeiro_hospedagem", "Hospedagem", "adm-hotel#financeiro", ["FINANCEIRO_HOSPEDAGEM"])
    ]
  },

  {
    grupo: "LOGÍSTICA",
    itens: [
      item("logistica_adm", "Painel de Logística", "logistica-adm-os", ["LOGISTICA_ADM", "LOGISTICA"]),
      // "O.S" reúne Abertura | Conferência | Ajuste | Finalização num único ponto
      // (logistica-os.html, 4 abas). Os códigos antigos ficam como aliases para
      // preservar as permissões de quem já tinha acesso a essas telas separadas.
      item("logistica_os", "O.S", "logistica-os", ["LOGISTICA_OS", "LOGISTICA_ABERTURA_OS", "LOGISTICA_FINALIZACAO_OS", "FINALIZACAO_OS", "LOGISTICA_CONFERENCIAS", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_fob", "FOB", "logistica-fob", ["LOGISTICA_FOB", "LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_informativos", "Informativos", "logistica-informativos", ["LOGISTICA_INFORMATIVOS", "LOGISTICA_ADM", "LOGISTICA"]),
      // "Clientes" reúne Relatórios | Exportações | BTG num único ponto
      // (logistica-clientes.html, 3 abas — mesmo padrão do "O.S"). Códigos
      // antigos ficam como aliases pra preservar permissão de quem já tinha
      // acesso às telas separadas. Ver [[painel-web-logistica-os-abas-unificadas]].
      item("logistica_clientes", "Clientes", "logistica-clientes", ["LOGISTICA_CLIENTES", "LOGISTICA_EXPORTACOES", "LOGISTICA_RELATORIOS_CLIENTE", "LOGISTICA_BTG", "BTG_LOGISTICA", "BTG", "LOGISTICA_ADM", "LOGISTICA"])
    ]
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
      // "Auditoria Central" foi consolidada em Diretoria > Logs de Usuários
      // (#83) — filtros de módulo/ação/registro/resultado e o diff antes×depois
      // continuam existindo lá. AUDITORIA_CENTRAL fica como alias de
      // logs_usuarios pra não quebrar permissão de quem já tinha acesso.
    ]
  },

  {
    grupo: "RELATÓRIOS",
    itens: [
      // Colaboradores/Produção/Patrimônios removidos do menu (#85-87). Produção
      // segue acessível via GESTOR > Histórico Produção (mesma rota
      // consultar-producao); Colaboradores e Patrimônios ficam só por URL direta.
      item("relatorios_importar", "Importar Relatórios", "importar-relatorios", ["RELATORIOS_IMPORTAR", "RELATORIOS_UPLOAD", "IMPORTAR_RELATORIOS", "RELATORIOS"])
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
      item("logs_usuarios", "Logs de Usuários", "logs-usuarios", ["LOGS_USUARIOS", "AUDITORIA_CENTRAL"]),
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