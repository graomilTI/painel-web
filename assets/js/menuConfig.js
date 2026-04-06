// assets/js/menuConfig.js
// Versão compatível com códigos reais do Supabase + aliases legados.

function item(code, label, path, aliases = []) {
  return { code, label, path, aliases };
}

export const PANEL_MENU = [
  {
    section: 'INÍCIO',
    items: [
      item('dashboard', 'Dashboard', 'dashboard'),
      item('notificacoes', 'Notificações', 'notificacoes'),
      item('historico_geral', 'Histórico Geral', 'historico', ['HISTORICO_GERAL'])
    ],
  },

  {
    section: 'GESTOR',
    items: [
      item('programacao', 'Programação', 'programacao', ['PROGRAMACAO']),
      item('hospedagem', 'Hospedagem', 'hospedagem', ['HOSPEDAGEM']),
      item('compras_gestor', 'Compras', 'compras', ['COMPRAS', 'compras']),
      item('logistica_gestor', 'Logística', 'logistica', ['LOGISTICA', 'logistica']),
      item('patrimonios_gestor', 'Patrimônios', 'patrimonios', ['PATRIMONIOS', 'patrimonios']),
      item('contato_cliente', 'Contato Cliente', 'contato-cliente', ['CONTATO_CLIENTE']),
      item('conferencia', 'Conferência', 'adm-conferencia', ['ADM_CONFERENCIA']),
    ],
  },

  {
    section: 'COMPRAS',
    items: [
      item('compras_adm', 'Painel de Compras', 'adm-compras', ['COMPRAS_ADM']),
    ],
  },

  {
    section: 'PATRIMÔNIOS',
    items: [
      item('patrimonio', 'Painel de Patrimônios', 'adm-patrimonio', ['PATRIMONIO_ADM']),
    ],
  },

  {
    section: 'HOSPEDAGEM',
    items: [
      item('hotel', 'Painel de Hospedagem', 'adm-hotel', ['ADM_HOTEL']),
    ],
  },

  {
    section: 'RECURSOS HUMANOS',
    items: [
      item('ferias_atestados', 'Férias e Atestados', 'ferias-atestados', ['RH_FERIAS_ATESTADOS']),
      item('historico_geral', 'Histórico Geral', 'historico', ['RH_HIST_INDISP']),
    ],
  },

  {
    section: 'LOGÍSTICA',
    items: [
      item('logistica_adm', 'Painel de Logística', 'adm-logistica', ['LOGISTICA_ADM']),
    ],
  },

  {
    section: 'DIRETORIA',
    items: [
      item('financeiro', 'Financeiro', 'financeiro', ['FINANCEIRO']),
      item('usuarios_acessos', 'Usuários e Acessos', 'admin-usuarios', ['ADMIN_USUARIOS', 'USUARIOS_E_ACESSOS']),
    ],
  },
];
