
import { mountRequestModule } from './requestModuleFactory.js';

const STATUS_LABELS = {
  "aberto": "Aberto",
  "em_analise": "Em análise",
  "confirmado": "Confirmado",
  "concluido": "Concluído",
  "cancelado": "Cancelado"
};

mountRequestModule({
  pageTitle: "Hospedagem",
  key: "hospedagem",
  table: "hospedagem_solicitacoes",
  description: "Solicitações de hospedagem ligadas ao Supabase. Ideal para demandas avulsas e acompanhamento do que a programação gerar.",
  badge: "GESTOR",
  dateField: "data_solicitacao",
  createdByField: "created_by",
  orderBy: "data_solicitacao",
  formHint: "Use esta tela para necessidades avulsas ou complementares ao que vier da Programação.",
  listHint: "Acompanhe pedidos de hospedagem e atualize o status quando necessário.",
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
    "placeholder": "Nome do colaborador"
  },
  {
    "name": "cidade",
    "label": "Cidade",
    "type": "text",
    "placeholder": "Cidade / local"
  },
  {
    "name": "checkin",
    "label": "Check-in",
    "type": "date"
  },
  {
    "name": "checkout",
    "label": "Check-out",
    "type": "date"
  },
  {
    "name": "hotel_sugerido",
    "label": "Hotel sugerido",
    "type": "text",
    "placeholder": "Opcional"
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
        "value": "confirmado",
        "label": "Confirmado"
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
    "placeholder": "Detalhes da hospedagem",
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
    "field": "cidade",
    "label": "Cidade"
  },
  {
    "field": "checkin",
    "label": "Check-in",
    "type": "date"
  },
  {
    "field": "checkout",
    "label": "Check-out",
    "type": "date"
  },
  {
    "field": "status",
    "label": "Status",
    "type": "status"
  }
].map((col) => col.field === 'status' ? ({ ...col, statusLabel: (value) => STATUS_LABELS[value] || value || '-' }) : col),
  statusOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  searchFields: ["colaborador", "cidade", "hotel_sugerido", "observacoes", "status"]
});
