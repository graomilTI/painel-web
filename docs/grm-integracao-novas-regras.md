# Resposta ao comunicado "Acesso automatizado ao GrainT — novas regras"

**Para:** Raphael Ehlers — GRM / GrainT
**De:** Tecnologia — Grão 1000
**Data:** [DATA DO ENVIO]
**Assunto:** Aceite das novas regras, respostas às perguntas e proposta de rotas e cotas

---

Raphael,

Obrigado pelo detalhamento. Concordamos com a análise: o padrão de acesso que mantínhamos gerava carga desnecessária nos servidores compartilhados e concentrava riscos de segurança e de rastreabilidade. Este documento traz o aceite, as respostas às perguntas, os compromissos que assumimos e, no Anexo A, o catálogo de rotas que a nossa integração precisa, com a cota que propomos para cada uma. O Anexo C explica, por área, para que usamos cada dado do GrainT e o que acontece com a operação se uma rota não for autorizada, para que o GRM possa avaliar o pedido com o contexto completo.

## 1. Aceite

Aceitamos as condições do documento "Acesso automatizado ao GrainT — novas regras", incluindo a rota de token (`/user/loginIntegration`), o uso de IP fixo e exclusivo, as cotas por rota e o tratamento das respostas de recusa. Entendemos que o uso atual segue bloqueado até este aceite e que, depois dele, será liberado até a data combinada para a migração.

## 2. Respostas às perguntas

### 2.1 Sobre o acesso

**Qual é o IP fixo de onde a integração vai chamar?**

A integração chamará o GrainT de um único IP fixo, o do servidor que já opera os nossos robôs:

IP: **144.126.131.137** (servidor de nuvem fora do Brasil, contratado na Contabo)

- **Uso exclusivo:** nenhuma pessoa acessa o GrainT por esse servidor. Ele também executa outros serviços internos nossos (e-mail e transferência de arquivos), que não têm relação com o GrainT.
- **É o IP que o GRM identificou** nos registros da Cloudflare. Sabemos que isso exige cautela da parte de vocês, e por isso assumimos os compromissos da seção 3 desde o primeiro dia.
- **Dados pessoais:** o servidor apenas processa as respostas e as envia ao nosso banco de dados, que fica no Brasil. A lista de funcionários não será mantida em arquivo permanente no servidor e não será replicada para outros destinos.
- **Alternativa:** se o GRM entender que a origem fora do Brasil é um risco para o cadastro, podemos migrar a integração para um servidor em São Paulo antes da data de início das novas regras. Nesse caso, informaremos o novo IP e o IP da Contabo deixará de chamar o GrainT. Pedimos que nos indiquem a preferência.

Avisaremos antes de qualquer troca de IP.

### 2.2 Sobre as rotas bloqueadas

**`serviceOrder/distribution/getDistributionData` — o que a automação faz com os dados da distribuição?**

Aplicamos no GrainT a distribuição de colaboradores por O.S. que a nossa Programação já confirmou para o dia. Lemos o estado atual da supervisão/data, comparamos com a Programação e só gravamos (`setDistributionData`) quando há diferença. O código do colaborador (`staCode`) vem da própria resposta de `getDistributionData`, sem precisar da lista de funcionários.

Reconhecemos que o modo atual, que consulta todas as supervisões a cada poucos minutos, é excessivo e foi o que o GRM observou em rajadas. Vamos mudar para:

- comparar **localmente**, no nosso banco, a distribuição esperada com a última aplicada e confirmada, sem chamar o GrainT;
- chamar o GrainT **somente para a supervisão/data cuja Programação mudou**;
- fazer uma conferência completa a cada 2 horas, para detectar alterações feitas diretamente no GrainT.

Estimativa depois do ajuste: menos de **600 leituras por dia**, mais uma gravação por supervisão/data efetivamente alterada. A janela de datas continua a que o GrainT aceita (hoje a +3 dias). Esse ajuste será entregue antes da data de início das novas regras.

**`staff/setRecord` — por que a automação grava cadastros de funcionários? De onde vêm os dados, quais campos ela altera e quantos cadastros por dia?**

São dois usos, ambos originados no nosso painel interno (módulo de Programação), nunca de planilha ou de outro sistema externo:

1. **Regras de caixa operacional (liberação de despesas).** O gestor define, por tipo de despesa, o que cada colaborador pode lançar (valor máximo, se aparece no celular, lançamento automático, quantidade por dia). Gravamos essas regras no cadastro do colaborador. Campo alterado: somente as regras de caixa (`oFlowRules`). Volume medido nos últimos 7 dias: 2.888 gravações (cerca de 410 por dia), com picos quando o gestor republica regras em massa.
2. **Transferência de supervisão.** Quando o gestor de destino aceita uma transferência pedida pelo gestor de origem, alteramos supervisão e coordenação (`olsCode`, `olcCode`) e a opção de levar os patrimônios (`changeAssetSupervision`). Volume: 4 transferências aplicadas nos últimos 30 dias.

Como o GrainT exige o cadastro completo no corpo da gravação, reenviamos todos os demais campos exatamente como foram lidos, sem alterar nenhum deles (salário, conta bancária e PIX incluídos). Retiramos apenas `staMobPhoneID`, que é do aplicativo do colaborador, e reformatamos as datas. Antes de gravar, comparamos o estado atual com o desejado e não gravamos quando já estão iguais: nos últimos 7 dias, 3.111 verificações terminaram assim.

Pedimos que o GRM avalie disponibilizar uma rota específica para regras de caixa e outra para troca de supervisão, que dispensem o reenvio do cadastro. Enquanto isso não existir, aceitamos teto diário e controle de vazão do nosso lado (no máximo 150 gravações por hora).

**`staffOFlowRules/getRecords` — para que a automação lê as regras de caixa operacional de cada funcionário?**

Para saber, antes de gravar, quais regras o colaborador já tem: evita gravar quando já estão corretas e evita duplicar ou sobrescrever. Na troca de supervisão, o GrainT recria as regras a cada gravação, então as lemos para reenviá-las intactas (um corpo vazio apagaria as regras do colaborador). Passaremos a usar cache diário e a consultar a rota somente quando houver gravação pendente.

**`oFlow/setRecord` — que lançamento de caixa operacional a automação grava, e em que situação?**

Gravamos:

- **Despesas retroativas** de alimentação e pernoite que o colaborador esqueceu de lançar, somente quando a Programação e a produção ou NHE do dia comprovam o trabalho.
- **Aprovação ou reprovação de pendências** do Caixa (`oFlow/approve` e `oFlow/disapprove`) segundo regras fixas, e eliminação de lançamentos duplicados. Casos como "Almoço com Pernoite" não são decididos pela automação; seguem para conferência humana.
- **Adiantamentos** de bônus, desconto de auditoria de bônus, ajuda de custo, gorjeta de corrida por aplicativo e uso de veículo fora do expediente, originados em planilhas e dados aprovados pelo RH, pelo Financeiro e por Frotas.

Hoje as retroativas, as aprovações e a eliminação de duplicados já usam chamada direta (`oFlow/setRecord`, `oFlow/approve`, `oFlow/disapprove`). Os adiantamentos ainda são gravados pela tela do Caixa Operacional; vamos migrá-los para chamada direta e pedimos que o GRM **confirme qual rota deve ser usada** (esperamos `oFlow/setRecord`). Antes de qualquer lançamento conferimos o Caixa do colaborador (`reports/finance/operatingFlow`) para nunca duplicar.

Volume das retroativas nos últimos 8 dias: de 11 a 156 gravações por dia (652 em 7 dias). Os demais fluxos somam poucas gravações por semana. Propomos usuário de integração dedicado, teto de 400 gravações por dia (somando `setRecord`, `approve` e `disapprove`) e envio semanal do log.

**Outras gravações que fazemos hoje** (não citadas no comunicado, mas que dependem de autorização para continuar):

- **Abertura de O.S.** (`serviceOrder/setRecord`): quando a Logística aprova uma solicitação no nosso painel, o robô abre a O.S. no GrainT. Volume baixo (12 execuções em 7 dias).
- **Lançamento de NHE** (`loadNoShip/setRecord`): lançamos a NHE de uma O.S. somente quando a geofence da carga e a produção do dia comprovam a ocorrência. Volume: 286 lançamentos em 14 dias, pico de 43 por dia.
- **Lançamento e baixa de notas fiscais** (`payInvoice/setRecord`, `payInvoice/uploadFiles`, `payInvoice/payment`): a partir das notas e comprovantes enviados pelo Financeiro e por Compras. Volume baixo, em lotes de até 20.
- **Cadastro de veículo** (`patrimonies/setRecord`, `vehicle/setRecord`): quando Frotas cadastra um veículo no painel. Esporádico.

### 2.3 Sobre as rotas liberadas

**Os relatórios de login e de produção diária alimentam um painel? Onde é exibido, quem o acompanha e como cada análise é feita?**

Sim. Ambos alimentam telas do nosso painel web interno (capturas de tela no Anexo B).

- **Produção diária** (`dailyProductionReport`) alimenta o Dashboard (produção do dia e meta mensal), Consultar Produção, Histórico de Produção, Efetivos sem Produção, o aplicativo do gestor e as metas da Diretoria. As análises são: produção por classificador e por dia, comparação com a meta e identificação de colaboradores escalados sem produção. Acompanham gestores regionais, logística, Financeiro e Diretoria.
- **Login** (`loginReport`) alimenta a conferência de alimentação no Financeiro (café, almoço e janta). Para cada turno (café 04h–07h, almoço 05h–19h, janta 19h–24h), verificamos se o colaborador fez login a até 1 km do ponto de embarque da O.S. planejada para ele naquele dia; só então a refeição é considerada devida. Acompanham Financeiro e logística.

Observação técnica sobre o `loginReport`: ele devolve apenas o login **mais recente** de cada colaborador, e a API corta o resultado em 300 linhas quando a consulta não é filtrada por coordenação (verificamos que, sem filtro, um login válido ficava fora do corte). Por isso hoje consultamos uma coordenação por vez. Veja o pedido correspondente na seção 4.

Observação técnica sobre a produção diária: hoje, além de buscar o dia atual, reconsultamos os últimos 30 dias a cada 30 minutos, porque o GRM corrige produção de dias já fechados (laudos revisados, reclassificações) e a Meta Mensal e o fechamento precisam refletir isso. Com a regra de um dia por chamada, passaremos a consultar o dia atual e o dia anterior nas cotas previstas, e pedimos uma cota de **reconciliação diária** para os dias anteriores (seção 4).

## 3. Compromissos que assumimos

1. Rodar de um único IP fixo e exclusivo, e avisar antes de qualquer troca.
2. Pedir o token uma vez por dia em `/user/loginIntegration`, guardá-lo em banco e reutilizá-lo durante o dia, inclusive depois de reiniciar a automação.
3. Parar de abrir a aplicação. Não chamar `getSysConfig`, `validateToken`, `getUserDataAccess` nem `getForSelect`; usar somente as rotas autorizadas, direto.
4. Manter banco próprio de funcionários, supervisões, coordenações e tipos de registro, atualizado uma vez por bloco. Buscas por CPF serão feitas nesse banco, exceto a leitura anterior a uma escrita autorizada (pedido 4.5).
5. Ajustar os intervalos de cada rota às cotas, fazendo a chamada no início do bloco.
6. Tratar as recusas: no 429, esperar o `Retry-After`; no 403, parar de chamar a rota; sem repetir em laço.
7. Desligar já as chamadas às rotas bloqueadas até a decisão do GRM.
8. Registrar cada chamada (hora, rota, resposta, Ray ID), enviar o registro em caso de bloqueio e, se o GRM quiser, um resumo semanal.
9. Usar um usuário de integração dedicado, para que o histórico do GrainT separe o que é feito por pessoas do que é feito pela máquina.

## 4. Pedidos

1. **Leituras de relatórios** do Anexo A, a 1 chamada por hora por relatório.
2. **`serviceOrder/getRecords`** autorizada como rotina agendada (4 por hora), e não apenas sob demanda.
3. **`loginReport`:** corrigir o corte de 300 linhas (ou permitir paginação) e/ou contar a cota por varredura completa. Como o relatório traz só o último login do colaborador, pedimos também avaliar uma cota maior dentro das janelas de refeição, porque 1 chamada por hora pode perder um check-in.
4. **Escritas** do Anexo A, com usuário dedicado e os tetos diários propostos.
5. **`staff/getRecords` por CPF** permitida somente como leitura anterior a uma escrita autorizada (liberação de regras e transferência), no limite das gravações do item 4. Os demais fluxos passam a usar o nosso banco.
6. **Rotas específicas** para regras de caixa e para troca de supervisão, sem reenvio do cadastro completo.
7. **Distribuição de O.S.:** autorização de `getDistributionData` e `setDistributionData` nos volumes descritos em 2.2.
8. **Produção diária, reconciliação:** uma chamada por dia anterior (do dia D-2 ao D-30), no máximo uma vez por dia, para trazer correções retroativas (cerca de 30 chamadas por dia).
9. **Catálogos:** hoje a abertura de O.S. monta clientes, produtos, serviços, regionais e supervisões com rotas `getForSelect`. Pedimos o equivalente autorizado (por exemplo, as variantes `getRecords`).
10. **Perfil do usuário de integração:** confirmar que o usuário usado em `/user/loginIntegration` pode ter o perfil necessário para as gravações autorizadas (Caixa Operacional, O.S., Funcionários, Notas Fiscais).
11. **Chamada aceita sem resposta:** se a resposta se perder por falha de rede depois de o GRM aceitar a chamada, ela conta na cota. Pedimos orientação sobre como proceder (por exemplo, repetir uma vez, ou aguardar o próximo bloco).
12. **Canal de emergência** para pedir cota extra pontual (por exemplo, reprocessar um dia depois de uma falha), com contato e prazo de resposta.
13. **Aviso de alteração** (webhook) ou filtro "alterado desde" nas listas de funcionários e O.S., se for viável, para trocar consulta periódica por evento.
14. **Data de transição** que nos permita migrar os agentes em etapas, mantendo as rotas bloqueadas desligadas desde já.

Ficamos à disposição para uma conversa e para ajustar qualquer ponto.

Atenciosamente,
Tecnologia — Grão 1000

---

## Anexo A — Catálogo de rotas e cotas propostas

### A.1 Rotas já previstas na tabela do GRM

| Rota | Cota do GRM | Nossa programação |
|---|---|---|
| `user/loginIntegration` | 4 / dia | 1 por dia; token guardado e reutilizado |
| `staff/getRecords` | 1 / bloco de 5 h | 1 no início de cada bloco; lista mantida em banco próprio |
| `supervision/getRecords` | 1 / bloco de 5 h | 1 no início de cada bloco |
| `coordination/getRecords` | 1 / bloco de 5 h | 1 no início de cada bloco |
| `staff/registerType/getRecords` | 1 / dia | 1 por dia |
| `serviceOrder/getRecords` | 4 / hora | 1 a cada 15 minutos (pedido 4.2) |
| `reports/classification/staff/dailyProductionReport` | 1 / 2 h (dia atual) | 1 no início de cada bloco de 2 h (dia atual); dia anterior 2 por dia; reconciliação dos dias anteriores no pedido 4.8 |
| `reports/classification/staff/loginReport` | 1 / hora | Pedido 4.3 |

### A.2 Leituras de relatório que pedimos para incluir

| Rota | Uso | Cota proposta |
|---|---|---|
| `reports/expenses` | Despesas e conferência do Caixa | 1 / hora |
| `reports/finance/invoices` | Notas fiscais no Financeiro | 1 / hora |
| `reports/finance/operatingFlow` | Conferência do Caixa antes de lançar ou aprovar (evita duplicidade); relatório mensal, com cache | 1 / hora |
| `oFlow/request/getRecords` | Adiantamentos solicitados | 1 / hora |
| `manager/boardPanel/getDayBoardingData` | Mapa de embarque do dia (dia inteiro, sem filtro) | 1 / hora |
| `reports/classification/nhe` | NHE (horas extras) | 1 / hora |
| `reports/classification/loads` | Cargas e irregularidades | 1 / hora |
| `reports/classification/servicePlaces` | Locais de embarque (Programação e mapa) | 1 / hora |
| `servicePlaces/getRecords`, `servicePlaces/producer/getProducers`, `servicePlacesType/getRecords` | Cadastro de locais, usado na abertura de O.S. | 1 / dia, em cache |
| `reports/classification/audit` | Auditorias | 1 / hora |
| `classification/getDailyResultReport` | Resultado diário | 1 / hora |
| `payInvoice/getRecords` | Contas a pagar e baixa de notas | 1 / hora |
| `receiveInvoice/getRecords` | Contas a receber | 1 / hora |
| `patrimonies/getRecords`, `vehicle/getRecords` | Frota, rastreadores e patrimônios | 1 / hora |
| `client/national/getRecords`, `client/last/getRecords` | Cadastro de clientes | 1 / dia |
| `oFlowExpenseType/getRecords`, `staffOFlowRules/getRecords`, `sysCompany/getRecords`, `suppliers/getRecords`, `paymentType/getRecords`, `payInvoiceCategory/getRecords`, `payInvoiceDocType/getRecords`, `patrimonyBrand/Category/Model getRecords`, `product/cItems/getRecords`, `productType/getRecords` | Catálogos para montar lançamentos; ficam em cache | 1 / dia cada |

Total de leituras previsto: da ordem de **1.200 por dia**, somando relatórios (~300), O.S. (96), produção (cerca de 45, com a reconciliação), login, catálogos, a conferência da distribuição (menos de 600) e a conferência do Caixa.

### A.3 Escritas

| Rota | Uso | Teto diário proposto |
|---|---|---|
| `oFlow/setRecord`, `oFlow/approve`, `oFlow/disapprove` | Retroativas, pendências, duplicados e adiantamentos (bônus, ajuda de custo, gorjeta, frota) | 400 |
| `staff/setRecord` | Regras de caixa e troca de supervisão | 600 (máx. 150 por hora) |
| `serviceOrder/distribution/setDistributionData` | Aplicar a distribuição da Programação | uma por supervisão/data alterada |
| `serviceOrder/setRecord` | Abertura de O.S. | 50 |
| `loadNoShip/setRecord` | Lançamento de NHE | 100 (pico observado: 43) |
| `payInvoice/setRecord`, `payInvoice/uploadFiles`, `payInvoice/payment` | Lançamento de NF, anexos e baixa | 100 |
| `patrimonies/setRecord`, `vehicle/setRecord` | Cadastro de veículo | 10 |

Todas as escritas serão feitas por evento (nunca por consulta periódica), com o usuário de integração dedicado.

## Anexo B — Capturas de tela

[ANEXAR: capturas do Dashboard (produção e meta mensal), Consultar Produção e da conferência de alimentação no Financeiro.]

## Anexo C — Por que precisamos de cada grupo de rotas

O nosso painel é a ferramenta de trabalho de Logística, Programação, Financeiro, RH, Frotas e Diretoria. O GrainT continua sendo o sistema de registro: o painel **lê** dele e, em poucos fluxos bem definidos, **devolve** a ele o que a operação já decidiu, para evitar digitar duas vezes. O quadro mostra cada área, o que lemos, o que gravamos e o que acontece sem a rota.

| Área | O que lemos do GrainT | O que gravamos no GrainT | Sem autorização |
|---|---|---|---|
| **Logística e campo** | Lista de O.S. aberta, mapa de embarque do dia, locais de embarque, cargas, NHE, auditorias | Distribuição dos colaboradores nas O.S. (`setDistributionData`); abertura de O.S. (`serviceOrder/setRecord`); lançamento de NHE (`loadNoShip/setRecord`) | O gestor confere a Programação e depois redigita a distribuição em cada supervisão e cada O.S. no GrainT; abertura de O.S. e NHE voltam a ser digitadas à mão |
| **Programação e RH** | Cadastro de colaboradores, supervisões e coordenações (banco próprio atualizado a cada bloco) | Regras de caixa operacional por colaborador (`staff/setRecord`); troca de supervisão em transferências aceitas pelos gestores | Cada regra de caixa e cada transferência precisa ser alterada manualmente no cadastro do funcionário (cerca de 410 gravações por dia hoje) |
| **Financeiro e Caixa** | Despesas, Caixa operacional (`operatingFlow`), adiantamentos, notas fiscais, contas a pagar e a receber | Despesas retroativas, aprovação de pendências, eliminação de duplicados, adiantamentos (bônus, ajuda de custo, gorjeta, frota) e lançamento e baixa de notas fiscais | Lançamentos e aprovações voltam a ser digitados à mão; perde-se a conferência automática de duplicidade |
| **Produção e metas** | Produção diária por classificador, resultado diário, login (alimentação) | — | Dashboard, metas, fechamento e a conferência de alimentação ficam sem atualização |
| **Frotas** | Patrimônios e veículos | Cadastro de veículo (patrimônio e veículo) | Veículo novo é cadastrado duas vezes (painel e GrainT) |
| **Diretoria** | Despesas, notas fiscais, contas a pagar e a receber, produção | — | Painéis e DRE ficam com a defasagem da cota |

### Fluxo entre os nossos serviços

1. Um robô lê cada relatório do GrainT no ritmo da cota e grava o resultado em um banco próprio (Supabase, no Brasil).
2. As telas do painel leem **só esse banco**, nunca o GrainT diretamente. Por isso nenhum usuário do painel gera chamada ao GrainT.
3. Só quando um gestor ou o Financeiro toma uma decisão no painel (por exemplo, confirma uma Programação, aprova uma solicitação de O.S. ou envia um lote ao Caixa) um robô grava essa decisão no GrainT, uma vez, por evento.

Por isso as nossas escritas são pequenas e previsíveis (centenas por dia, não milhares), e as leituras podem seguir as cotas por bloco sem prejudicar o trabalho, desde que as rotas de relatório e as gravações listadas no Anexo A estejam autorizadas.

### Prioridade se o GRM preferir liberar por etapas

1. **Primeira etapa (essencial para a operação do dia):** leituras de relatório do Anexo A.2, Lista de O.S., produção diária, `loginReport` e as gravações de Distribuição de O.S., Caixa (`oFlow`) e abertura de O.S.
2. **Segunda etapa:** `staff/setRecord` (regras de caixa e transferência) e NHE.
3. **Terceira etapa:** lançamento e baixa de notas fiscais, cadastro de veículo e catálogos.
