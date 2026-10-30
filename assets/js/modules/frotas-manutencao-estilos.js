import { ESTILOS_LISTA } from './frotas-ui-lista.js?v=20261030-frotas-manut-solic';
import { ESTILOS_TEMA_VERDE, verdear } from './frotas-manutencao-tema.js?v=20261030-frotas-manut-solic';
import { CSS_BASE_A } from './frotas-manutencao-css-base-a.js?v=20261030-frotas-manut-solic';
import { CSS_BASE_B } from './frotas-manutencao-css-base-b.js?v=20261030-frotas-manut-solic';
import { CSS_JANELA } from './frotas-manutencao-css-janela.js?v=20261030-frotas-manut-solic';
import { CSS_FICHA } from './frotas-manutencao-css-ficha.js?v=20261030-frotas-manut-solic';
import { CSS_SELETOR } from './frotas-manutencao-css-seletor.js?v=20261030-frotas-manut-solic';
import { CSS_COTACAO_LINHAS } from './frotas-manutencao-css-cotacao-linhas.js?v=20261030-frotas-manut-solic';
import { CSS_NOVA } from './frotas-manutencao-css-nova.js?v=20261030-frotas-manut-solic';
import { CSS_SELETOR_GRUPOS } from './frotas-manutencao-css-seletor-grupos.js?v=20261030-frotas-manut-solic';
import { CSS_ITENS_PECAS } from './frotas-manutencao-css-itens-pecas.js?v=20261030-frotas-manut-solic';
import { CSS_FICHA_DADOS_NOTAS } from './frotas-manutencao-css-ficha-dados-notas.js?v=20261030-frotas-manut-solic';
import { CSS_FICHA_BLOCOS } from './frotas-manutencao-css-ficha-blocos.js?v=20261030-frotas-manut-solic';
import { CSS_PREVENTIVA_LISTA } from './frotas-manutencao-css-preventiva-lista.js?v=20261030-frotas-manut-solic';
import { CSS_PREVENTIVA_CARDS } from './frotas-manutencao-css-preventiva-cards.js?v=20261030-frotas-manut-solic';
import { CSS_SUGESTOES } from './frotas-manutencao-css-sugestoes.js?v=20261030-frotas-manut-solic';
import { CSS_ORCAMENTO_JANELAS } from './frotas-manutencao-css-orcamento-janelas.js?v=20261030-frotas-manut-solic';
import { CSS_CORRETIVA_LISTA } from './frotas-manutencao-css-corretiva-lista.js?v=20261030-frotas-manut-solic';
import { CSS_EXTRAS } from './frotas-manutencao-css-extras.js?v=20261030-frotas-manut-solic';

// Estilos da tela de Manutenção, montados a partir de arquivos por assunto (frotas-manutencao-css-*.js). A ordem abaixo é a ordem da
// cascata (quem vem depois vence entre regras de mesma especificidade): não reordene sem conferir. Reaproveita o prefixo .fm- das
// demais listas do Frotas (ESTILOS_LISTA, que entra entre a primeira e a segunda parte da base) e passa tudo por verdear()
// (frotas-manutencao-tema.js), que troca os cinzas azulados pelo tema verde.
const juntar = (...pecas) => pecas.map((p) => p.replace(/^\n|\n$/g, '')).join('\n');

export const ESTILOS_MANUTENCAO = verdear(`
<style>
${juntar(CSS_BASE_A)}
${ESTILOS_LISTA}
${juntar(CSS_BASE_B, CSS_JANELA, CSS_FICHA, CSS_SELETOR, CSS_COTACAO_LINHAS, CSS_NOVA, CSS_SELETOR_GRUPOS, CSS_ITENS_PECAS, CSS_FICHA_DADOS_NOTAS, CSS_FICHA_BLOCOS, CSS_PREVENTIVA_LISTA, CSS_PREVENTIVA_CARDS, CSS_SUGESTOES, CSS_ORCAMENTO_JANELAS, CSS_CORRETIVA_LISTA, CSS_EXTRAS)}
</style>`) + ESTILOS_TEMA_VERDE;
