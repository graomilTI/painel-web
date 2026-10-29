# Frotas · Manutenção (Corretiva) — arquitetura e regras para mexer sem quebrar

Objetivo: um ajuste em uma parte (uma janela, um bloco da ficha, um estilo) não pode mudar o comportamento de outra. A tela foi dividida por
assunto; cada arquivo tem um dono e um contrato. Tudo vive em `assets/js/modules/` com o prefixo `frotas-manutencao-`.

## Camadas (de baixo para cima)

| Camada | Arquivos | O que faz | Pode importar |
|---|---|---|---|
| Regras (puras) | `-regras.js`, `-etapas.js`, `-sugestoes.js`, `-leitor.js`, `-cidades.js` | Transições do fluxo, quem pode o quê, contas (totais, compra dividida), leitura de NF/comprovante. Sem DOM, sem banco. | só `core/` e outras regras |
| Dados | `-dados.js` | Única porta para o Supabase (consultas, RPCs, storage). | nada da tela |
| HTML (puro) | `-html.js` (ficha + reexporta o resto), `-html-base.js`, `-html-nova.js`, `-html-orcamento.js`, `-html-notas.js`, `-cards.js`, `-seletor.js` | Funções que recebem dados e devolvem texto HTML. Sem estado, sem eventos, sem banco. | regras, `core/ui.js`, outras peças de HTML |
| Janelas e ações | Corretiva: `-janela-aprovacao.js`, `-janela-orcamento.js`, `-janela-consulta.js`, `-nova.js`, `-notas.js`; Preventiva: `-preventiva-painel.js`, `-preventiva-historico.js`, `-preventiva-solicitacao.js` | Cada uma é uma fábrica `criarX(ctx)`: abre a janela, liga os eventos e grava (via dados). | regras, dados, HTML, `ctx` |
| Controlador | `frotas-manutencao.js` (Corretiva) e `frotas-manutencao-preventiva.js` (Preventiva) | Estado da tela, carga, lista, ficha/painel, ligação das janelas. | tudo acima |
| Estilos | `-estilos.js` (composição) + `-css-*.js` + `-tema.js` | CSS em texto, dividido por assunto; `verdear()` aplica o tema verde. | — |

Regra de ouro: **a dependência só desce**. HTML não importa janela; janela não importa controlador; regras não importam nada da tela.

## O contexto (`ctx`) das janelas

O controlador monta `ctx = { state, dados, indices, executar, recarregarUma, renderFicha, renderLista, podeAprovar, rolarPara, val, norm, garantirBase,
fichaAtual, abrirFicha }` e cria cada janela com `criarX(ctx)`. Uma janela só enxerga isso — não toca em variáveis do controlador.
- `executar(fn, { sucesso, id })` é o único jeito de gravar com trava contra clique duplo, aviso de erro e recarga da manutenção.
- Janela nova? Crie `frotas-manutencao-janela-<nome>.js` com `export function criar<Nome>(ctx)`, e ligue no controlador.

## Onde vai cada tipo de ajuste

| Quero mudar… | Mexo em… |
|---|---|
| Uma regra (quem aprova, o que a etapa oferece, uma conta) | `-regras.js` / `-etapas.js` (+ teste de regra) |
| O texto/estrutura de uma janela ou bloco | a peça `-html-*.js` do assunto |
| O que acontece ao clicar / gravar | a janela do assunto (`-janela-*.js`, `-notas.js`, `-nova.js`) |
| Uma consulta ao banco | `-dados.js` |
| A aparência | o `-css-<assunto>.js` do bloco |
| Cores gerais (tema) | `-tema.js` |

## CSS: o que evita um estilo estragar outro

1. A ordem dos arquivos em `-estilos.js` **é** a cascata (quem vem depois vence entre regras de mesma especificidade). Não reordene.
2. CSS novo vai no arquivo do assunto, **dentro de um seletor com a classe do bloco** (`.fm-fin-nota .x`, `.fm-apr-orc .y`), nunca em seletor solto
   como `.fm-field label` ou `label` — foi assim que a mão vermelha e os ícones de anexo (labels dentro de `.fm-field`) pegaram estilo de rótulo.
3. Cores: nada de cinza azulado (`#94a3b8`, `rgba(15,23,42,…)`) novo; escreva no tema verde (`#eef7f2` texto, `#8ba79a` apoio, fundos quase pretos).
   Azul só em campos digitáveis, listas suspensas e selos de status. Mesmo que escreva cinza azulado, `verdear()` converte — mas prefira já escrever certo.
4. Janela larga: classes `fm-mod fm-modal-largo fm-modal-orc` (topo fixo; só a base cresce).

## Versão (`?v=`) e cache

Todos os imports entre módulos `frotas-*.js` usam o **mesmo** token `?v=AAAAMMDD-frotas-manutNN` (um teste confere). Mudou um arquivo? Troque o token em
todos de uma vez (`sed -i 's/…manutNN/…manutNN+1/g'` nos arquivos que o contêm) — senão o navegador mistura versões.

## Como provar que um ajuste não quebrou nada

1. `npm test` (unidade; os testes que leem código por texto usam `tests/helpers/frotas-manutencao-fontes.mjs`, então não dependem de em qual arquivo a
   função está).
2. **Harness de regressão no navegador** (Corretiva e Preventiva; a Preventiva com `&cenario=preventiva` na URL): `tests/harness/manutencao/` abre a tela com Supabase simulado, percorre o fluxo inteiro (cotação,
   comparativo, histórico, aprovação por item, notas, lançamento, Financeiro, nova manutenção) e tira uma "foto" do DOM a cada passo.
   - O servidor do harness (`servir.py`) não usa cache; abra `comparar.html` por uma terceira porta para que as duas versões rodem em iframes de outra origem (com a mesma origem do pai a Preventiva mostrava um falso `≠` no filtro de cartões).
   - `bash tests/harness/manutencao/comparar.sh [ref-git]` copia a versão de referência (padrão `HEAD`), sobe dois servidores (8766 = antes, 8765 = depois)
     e mostra a URL de comparação. A página dá **IGUAL** quando todos os passos, as chamadas ao banco e o estado final batem.
   - Ajuste intencional de HTML aparece como `≠` com o trecho que mudou; se for o esperado, ótimo. Refatoração tem de dar IGUAL.
3. Mudou o banco (migration)? Teste em transação desfeita (`do $t$ … raise exception …`) antes de aplicar, como nas migrations de Frotas.

## Mapa rápido dos arquivos

```
frotas-manutencao.js                    controlador (estado, carga, lista, ficha, etapas)
  -janela-aprovacao.js                  aprovar: uma cotação ou vários fornecedores por item (+ emite a OS)
  -janela-orcamento.js                  cotação (adicionar/editar) e as contas do formulário
  -janela-consulta.js                   histórico e comparativo (leitura)
  -notas.js                             anexar NF/comprovante (lê o arquivo), lançamento, Financeiro
  -nova.js                              nova solicitação
-html.js (ficha)  -html-base  -html-nova  -html-orcamento  -html-notas   HTML puro
-cards.js  -seletor.js  -sugestoes.js   cartões da lista, seletor de grupos/itens, sugestões
-regras.js  -etapas.js  -leitor.js  -cidades.js                          regras puras
-dados.js                                Supabase
-estilos.js + -css-*.js + -tema.js       CSS por assunto + tema verde
frotas-manutencao-preventiva.js         lista da Preventiva (+ -preventiva-painel, -historico, -solicitacao; -registro e -pagamento são assistentes)
-painel.js  -veiculos.js  -agenda.js  -custos.js  -pecas.js  -oficinas.js   outras abas (ainda não reorganizadas)
```
