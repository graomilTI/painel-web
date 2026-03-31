
import { mountRequestModule } from './requestModuleFactory.js';

const STATUS_LABELS = {
  "aberto": "Aberto",
  "em_analise": "Em análise",
  "aprovado": "Aprovado",
  "concluido": "Concluído",
  "cancelado": "Cancelado"
};

mountRequestModule({
  pageTitle: "Patrimônios",
  key: "patrimonios",
  table: "patrimonio_solicitacoes",
  description: "Controle básico de solicitações e movimentações patrimoniais do gestor no Supabase.",
  badge: "GESTOR",
  dateField: "data_solicitacao",
  createdByField: "created_by",
  orderBy: "data_solicitacao",
  formHint: "Use para solicitações, troca, devolução ou manutenção de patrimônio.",
  listHint: "Registros patrimoniais enviados pelo gestor.",
  fields: [
  {
    "name": "data_solicitacao",
    "label": "Data da solicitação",
    "type": "date",
    "required": true,
    "defaultToday": true
  },
  {
    "name": "colaborador",
    "label": "Colaborador",
    "type": "text",
    "placeholder": "Responsável / solicitante"
  },
  {
    "name": "item",
    "label": "Item",
    "type": "text",
    "placeholder": "Descrição do patrimônio"
  },
  {
    "name": "acao",
    "label": "Ação",
    "type": "text",
    "placeholder": "Entrega, troca, manutenção..."
  },
  {
    "name": "patrimonio_tag",
    "label": "Tag / patrimônio",
    "type": "text",
    "placeholder": "Código ou identificação"
  },
  {
    "name": "status",
    "label": "Status",
    "type": "select",
    "defaultValue": "aberto",
    "options": [
      {
        "value": "aberto",
        "label": "Aberto"
      },
      {
        "value": "em_analise",
        "label": "Em análise"
      },
      {
        "value": "aprovado",
        "label": "Aprovado"
      },
      {
        "value": "concluido",
        "label": "Concluído"
      },
      {
        "value": "cancelado",
        "label": "Cancelado"
      }
    ]
  },
  {
    "name": "observacoes",
    "label": "Observações",
    "type": "textarea",
    "placeholder": "Detalhes do registro",
    "span2": true,
    "rows": 4
  }
],
  columns: [
  {
    "field": "data_solicitacao",
    "label": "Data",
    "type": "date"
  },
  {
    "field": "colaborador",
    "label": "Colaborador"
  },
  {
    "field": "item",
    "label": "Item"
  },
  {
    "field": "acao",
    "label": "Ação"
  },
  {
    "field": "patrimonio_tag",
    "label": "Tag"
  },
  {
    "field": "status",
    "label": "Status",
    "type": "status"
  }
].map((col) => col.field === 'status' ? ({ ...col, statusLabel: (value) => STATUS_LABELS[value] || value || '-' }) : col),
  statusOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  searchFields: ["colaborador", "item", "acao", "patrimonio_tag", "observacoes", "status"]
});
