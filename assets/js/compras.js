
import { mountRequestModule } from './requestModuleFactory.js';

const STATUS_LABELS = {
  "aberto": "Aberto",
  "em_cotacao": "Em cotação",
  "em_analise": "Em análise",
  "aprovado": "Aprovado",
  "concluido": "Concluído",
  "cancelado": "Cancelado"
};
const PRIORIDADES = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente'
};

mountRequestModule({
  pageTitle: "Compras",
  key: "compras",
  table: "compras_solicitacoes",
  description: "Módulo de requisições de compras do gestor, agora conectado ao Supabase.",
  badge: "GESTOR",
  dateField: "data_solicitacao",
  createdByField: "created_by",
  orderBy: "data_solicitacao",
  formHint: "Registre necessidades de compra para o fluxo ADM / conferência.",
  listHint: "Acompanhe as solicitações e o retorno do administrativo.",
  fields: [
    { name: "data_solicitacao", label: "Data da solicitação", type: "date", required: true, defaultToday: true },
    { name: "solicitante", label: "Solicitante", type: "text", placeholder: "Nome de quem solicitou" },
    { name: "item", label: "Item", type: "text", placeholder: "Descrição do item" },
    { name: "quantidade", label: "Quantidade", type: "number", placeholder: "0" },
    { name: "prioridade", label: "Prioridade", type: "select", defaultValue: "normal", options: Object.entries(PRIORIDADES).map(([value, label]) => ({ value, label })) },
    { name: "status", label: "Status", type: "select", defaultValue: "aberto", options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "observacoes", label: "Observações", type: "textarea", span2: true, rows: 4, placeholder: "Detalhes da requisição" }
  ],
  columns: [
    { field: "data_solicitacao", label: "Data", type: "date" },
    { field: "solicitante", label: "Solicitante" },
    { field: "item", label: "Item" },
    { field: "quantidade", label: "Qtd" },
    { field: "prioridade", label: "Prioridade" },
    { field: "status", label: "Status", type: "status", statusLabel: (value) => STATUS_LABELS[value] || value || '-' }
  ],
  statusOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  searchFields: ["solicitante", "item", "observacoes", "status", "prioridade"]
});
