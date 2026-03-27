
import { mountRequestModule } from './requestModuleFactory.js';

const STATUS_LABELS = {
  "aberto": "Aberto",
  "em_analise": "Em análise",
  "programado": "Programado",
  "concluido": "Concluído",
  "cancelado": "Cancelado"
};

mountRequestModule({
  pageTitle: "Logística",
  key: "logistica",
  table: "logistica_solicitacoes",
  description: "Solicitações logísticas do gestor com acompanhamento de origem, destino e tipo de deslocamento.",
  badge: "GESTOR",
  dateField: "data_solicitacao",
  createdByField: "created_by",
  orderBy: "data_solicitacao",
  formHint: "Use para deslocamentos e apoios logísticos não contemplados automaticamente na Programação.",
  listHint: "Registros logísticos enviados ao fluxo administrativo.",
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
    "name": "origem",
    "label": "Origem",
    "type": "text",
    "placeholder": "Cidade / ponto inicial"
  },
  {
    "name": "destino",
    "label": "Destino",
    "type": "text",
    "placeholder": "Cidade / ponto final"
  },
  {
    "name": "tipo_deslocamento",
    "label": "Tipo",
    "type": "text",
    "placeholder": "Frota, Uber, Rodoviário..."
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
        "value": "programado",
        "label": "Programado"
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
    "placeholder": "Detalhes do deslocamento",
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
    "field": "origem",
    "label": "Origem"
  },
  {
    "field": "destino",
    "label": "Destino"
  },
  {
    "field": "tipo_deslocamento",
    "label": "Tipo"
  },
  {
    "field": "status",
    "label": "Status",
    "type": "status"
  }
].map((col) => col.field === 'status' ? ({ ...col, statusLabel: (value) => STATUS_LABELS[value] || value || '-' }) : col),
  statusOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  searchFields: ["colaborador", "origem", "destino", "tipo_deslocamento", "observacoes", "status"]
});
