// Constante usada pra representar "todas as supervisões" no combo de filtro
// (antes vivia em programacao-gestor-filtro-fix.js, incorporado nesta consolidação).
export const TODAS_SUPERVISOES = '__TODAS__';

const STEPS = [
  { code: 'A', label: 'Disponibilidade' },
  { code: 'B', label: 'Estadia' },
  { code: 'C', label: 'Alimentação' },
  { code: 'D', label: 'Deslocamento' },
  { code: 'E', label: 'Extras' },
];

const DISPONIBILIDADES = ['OK', 'LOGISTICA', 'DESLOCAMENTO', 'SEM EMBARQUE', 'INDISPONIVEL', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];

// Etapa C (Disponibilidade) só lista quem não atende OS — "OK" agora é
// decidido só pela confirmação na etapa B (Organizar Equipe).
const DISPONIBILIDADES_ETAPA_C = ['LOGISTICA', 'DESLOCAMENTO', 'SEM EMBARQUE', 'INDISPONIVEL'];

const INDISPONIBILIDADE_MOTIVOS = ['ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];

const TIPOS_ESTADIA = ['CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];

const TIPOS_ESTADIA_BOTOES = ['PERNOITE', 'ALOJAMENTO', 'HOTEL'];

const TIPOS_DESLOCAMENTO = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM', 'ÔNIBUS', 'OUTRO'];

const TIPOS_EXTRA = ['ESTADIA', 'RECARGA', 'LAVAGEM', 'MANUTENÇÃO VEÍCULO', 'PEDÁGIO', 'ESTACIONAMENTO', 'MATERIAL', 'OUTRO'];

const SUPERVISAO_UF_MAP = {
  'BAHIA': 'BA',
  'CASCAVEL': 'PR',
  'GOIAS': 'GO',
  'LONDRINA': 'PR',
  'MARANHAO': 'MA',
  'MARINGA': 'PR',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO': 'MT',
  'MINAS GERAIS': 'MG',
  'PARA': 'PA',
  'PONTA GROSSA': 'PR',
  'RIO GRANDE DO SUL': 'RS',
  'SP': 'SP',
  'TOCANTINS': 'TO',
};

const SUPERVISAO_UF_CHAVES = Object.keys(SUPERVISAO_UF_MAP).sort((a, b) => b.length - a.length);

const DISPONIBILIDADES_LIBERADAS = new Set(['', 'OK', 'DISPONIVEL', 'LIBERADO', 'LOGISTICA', 'DESLOCAMENTO']);

  const CIDADES_CACHE_KEY = 'grm:cidades_ibge:v1';

  const CIDADES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // municípios não mudam — cache de 30 dias

export { STEPS, DISPONIBILIDADES_ETAPA_C, INDISPONIBILIDADE_MOTIVOS, TIPOS_ESTADIA_BOTOES, TIPOS_DESLOCAMENTO, TIPOS_EXTRA, SUPERVISAO_UF_MAP, SUPERVISAO_UF_CHAVES, DISPONIBILIDADES_LIBERADAS, CIDADES_CACHE_KEY, CIDADES_CACHE_TTL_MS };
