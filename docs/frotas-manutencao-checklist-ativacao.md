# Manutenção de frota: checklist de ativação

Tudo que o código já entrega está no ar (fases 0 a 6, 16/10/2026). Este checklist é o que **depende de você** para o fluxo funcionar de verdade. Siga na ordem: cada passo habilita o seguinte.

Estado em 16/10/2026: 0 manutenções, 0 oficinas, 0 alçadas, 139 leituras de km do BFleet, 0 usuários com "pode aprovar" (só os 3 Master aprovam).

---

## 1. Antes de qualquer uso

### 1.1 Aprovadores e tetos de valor
> **Decisão de 16/10/2026:** por enquanto ficam **sem aprovador cadastrado**; quem aprova é um Master (Douglas, Juliana e mais um). O usuário do administrativo registra os pedidos que chegam pelo WhatsApp em **Manutenção › + Nova manutenção** (campo "Quem pediu") e um Master aprova na ficha. Os passos abaixo ficam para quando houver aprovadores.

- [ ] Definir quem aprova manutenção. Hoje ninguém tem "pode aprovar" no módulo Manutenção; os avisos de aprovação vão para os Master (Douglas, Juliana e mais um). Assim que alguém receber a permissão, só essas pessoas passam a receber e os Master saem do aviso.
- [ ] Conceder a permissão (não há tela para isso ainda; é SQL). Troque os e-mails:

```bash
supabase db query --linked "update app_usuario_modulos um set pode_aprovar = true from app_usuarios u, app_modulos m where um.usuario_id = u.id and um.modulo_id = m.id and m.codigo = 'frotas_manutencao' and lower(u.email) in ('aprovador1@grao1000.com.br','aprovador2@grao1000.com.br')"
```

- [ ] (Opcional) Teto de valor por aprovador. Sem linha na tabela = sem teto; Master nunca tem teto. Acima do teto o banco recusa a aprovação e outro aprovador precisa decidir:

```bash
supabase db query --linked "insert into frotas_manutencao_alcadas (usuario_id, limite_valor) select id, 5000 from app_usuarios where lower(email) = 'aprovador1@grao1000.com.br'"
```

Ou me diga os nomes e valores que eu executo.

### 1.2 Quem paga a manutenção (responsável pelo pagamento)
Aprovar exige que a manutenção tenha o responsável (empresa, locadora, colaborador ou proprietário). O veículo já traz um padrão: 264 estão como "empresa" (donos CAR1000, Grão 1000 e Elizeu Mota). **19 veículos ATIVOS ainda não têm responsável** (mais 2 inativos e 1 em manutenção, que não importam agora):

`FWW0B82` e `MJP5A78` (empresa "TRANSFERINDO") e `QBD6E38, RNQ0E61, RSA8A72, RTA8E27, RUC2D77, RVN7E53, SHH7C65, SHV7F36, SIB5J70, SIC3F35, SYI0B24, SYO6H53, SYS8H39, TCA6C76, TDK8I19, TEG1B55, TEX1B34` (empresa em branco).

- [ ] Opção A (sem fazer nada agora): o responsável é escolhido na ficha de cada manutenção ("Quem paga") antes de aprovar.
- [ ] Opção B (padrão por veículo, em lote): rodar SQL por placa, por exemplo `update frotas_veiculos set responsavel_manutencao = 'empresa' where placa in ('QBD6E38','RNQ0E61')`. Valores: `empresa`, `locadora`, `colaborador`, `proprietario`. Não existe campo na tela de Veículos para isso.

### 1.3 Cadastrar as oficinas
- [ ] Manutenção › **Oficinas**: nome, razão social, **CNPJ** (ou CPF), contato, **PIX**, cidade. O CNPJ é o que o agente usa para achar o fornecedor no GRM; o PIX vai para o pagamento no Financeiro.
- [ ] Conferir no GRM se cada oficina já existe como **fornecedor** (por CNPJ). Se não existir, o lançamento da NF dá erro "Fornecedor não encontrado no GRM" (o painel avisa a equipe, mas não cria fornecedor sozinho).

### 1.3 Testar a tela com um usuário real (nunca foi exercitada com RLS real)
Use um veículo de teste e cancele no fim.
- [ ] Com um usuário do módulo (não Master): abrir **Frotas › Manutenção**, criar solicitação com 1 item, ver a ficha.
- [ ] Preencher orçamento (oficina cadastrada), enviar para aprovação, aprovar com um aprovador, emitir OS, concluir (sem NF, para não acionar o GRM ainda) e conferir o histórico da ficha e os avisos no sino.
- [ ] Com um **gestor** (sem o módulo): app do gestor › Patrimônio › Manutenção de veículo: pedir uma manutenção de um veículo da regional e conferir que chegou como "solicitada".

---

## 2. Vencimentos e solicitações automáticas

### 2.1 Importar o histórico de trocas (sem isso nada vence)
Todo plano está "sem histórico" e o job diário só abre solicitação para plano vencido ou próximo.
- [ ] Manutenção › **Vencimentos › Importar histórico › Baixar modelo**. Colunas: Placa, Plano (código da aba PLANOS do modelo), Data (dd/mm/aaaa), Km do veículo na data.
- [ ] Preencher com a **última vez** de cada serviço por veículo. Prioridade: troca de óleo (`oleo_motor`), pastilhas, fluido de freio, correia dentada, pneus. Pode importar aos poucos; reimportar a mesma linha não duplica.
- [ ] Conferir o resultado (linhas com placa ou plano desconhecido voltam como erro sem impedir as demais) e abrir a aba **Vencimentos** para ver vencidas e próximas.

### 2.2 Antes do primeiro job diário (07h de Brasília)
Na primeira rodada o job pode abrir muitas solicitações de uma vez (limite de 100 veículos por dia, começando pelos vencidos).
- [ ] Ver o que ele abriria, sem criar nada:

```bash
supabase db query --linked "select placa, planos from jsonb_to_recordset(public.frotas_manutencao_gerar_por_plano(false)) as x(placa text, planos jsonb)"
```

- [ ] Se for muita coisa, importe o histórico só de parte da frota por vez.

### 2.3 Validar o odômetro do BFleet
O km dos vencimentos vem de `bfleet_odometro` (o hodômetro manual de Veículos está zerado em todos). Assumi que está em **km**.
- [ ] Depois de 1 ou 2 dias, comparar a diferença do odômetro de um veículo com o km rodado conhecido dele (tabela `frotas_veiculos_leituras_km`; leituras descartadas aparecem com `descartada = true` e o motivo). Se a unidade for outra, me avise antes de confiar nos vencimentos por km.

---

## 3. NF no GRM e pagamento no Financeiro

### 3.1 Instalar o agente atualizado no servidor (rateio por coordenação)
Sem este passo o fluxo funciona, mas a NF é rateada em `GERAL`. Dois arquivos de `agentes-grm-sync/`: `grm-nf-frotas-regras.js` (novo) e `grmserver-lancar-notas-fiscais-api.js` (alterado).
- [ ] Local: `node agentes-grm-sync/test-nf-frotas.js` e `node --check agentes-grm-sync/grmserver-lancar-notas-fiscais-api.js`.
- [ ] Servidor (`grao100@server.grao1000.com.br`, chave `~/.ssh/grao100_grm_deploy_ed25519`, pasta `/home/grao100/painel-scripts/grm-sync/`): backup do arquivo atual (`cp -p ... .bak-AAAAMMDD`), subir como `.new` e trocar com `mv`. Os arquivos remotos ficam em CRLF; usar `/opt/node22/bin/node` (o `node` do PATH não serve).
- [ ] Rodar manualmente uma vez e conferir o log antes de deixar a fila trabalhar (seção "Deploy de uma correção" do `agentes-grm-sync/README.md`).

### 3.2 Primeiro teste ponta a ponta (nunca houve NF de Frotas no agente)
- [ ] Manutenção de teste, **paga pela empresa**, com oficina cadastrada e existente no GRM, concluída **com NF real e pequena** (PDF ou XML) cadastrada em "Notas fiscais" (se testar várias, uma de peça e uma de serviço); o custo final é a soma das notas.
- [ ] Antes de liberar, simular no servidor com a NF na fila: `/opt/node22/bin/node grmserver-lancar-notas-fiscais-api.js --dry-run --upload-id <id da linha em grm_nf_lancamentos>`. Conferir categoria (`MANUT. VEICULOS SERVICOS`, `... PECAS` ou `PNEUS AQUISICAO`), **rateio na coordenação do veículo**, descrição "Manutenção PLACA - OS - oficina" e o valor.
- [ ] Deixar o agente lançar de verdade e conferir no GRM. A ficha mostra "Lançada no GRM" com o código; em erro, a equipe é avisada e a correção é feita em Financeiro › Notas fiscais (✎).
- [ ] No Financeiro, aba Pagamentos, filtro **Frotas**: o pagamento deve estar pendente, com oficina, CNPJ e PIX. Pagar com comprovante e conferir que "Pago em" e o comprovante voltaram para a ficha.
- [ ] Lembrar do **token diário do GRM** (vence 23:59 BRT): sem ele a NF fica na fila.

---

## 4. Rotina e pequenos ajustes

- [ ] Pedir aos usuários que **ativem as notificações** do painel (push) para receber os avisos de aprovação, OS, NF e pagamento no celular.
- [ ] Prazos dos lembretes (escolha minha): orçamento parado 3 dias, aprovação 2, aprovada sem OS 3, OS sem previsão 15 dias. Se quiser outros, é só pedir.
- [ ] Troca de Óleo e Checklists continuam como abas separadas. Troca de óleo passou a ser o plano `oleo_motor` dentro do fluxo; a aba antiga está vazia e pode ser aposentada quando quiser.
- [ ] Ao longo de algumas semanas, revisar com a equipe: categoria da NF mista (nota do tipo "peça e serviço" sai como serviço; prefira uma nota por tipo), custo por categoria (rateio igual entre itens) e a regra de bloqueio da Programação.

## 5. O que ficou de fora de propósito
Alerta de avaria do BFleet (a API não entrega no painel); canal próprio do motorista; WhatsApp para motorista e oficina; escrever situação "Manutenção" ou hodômetro no GRM (exige autorização do GRM); estoque de peças; agenda ICS de manutenção de veículo; marcar o excesso de velocidade (só o dossiê fora do horário foi marcado); trava automática do Caixa; custo de frota no Panorama do sócio.

## 6. Se algo der errado
- Manutenção travada por regra do banco: a mensagem de erro aparece na tela em português (ex.: "Informe quem paga a manutenção", "Valor acima da sua alçada").
- Placa bloqueada na Programação por veículo em manutenção: concluir ou cancelar a OS libera o veículo; o bloqueio só vale até a previsão de entrega.
- NF com erro: Financeiro › Notas fiscais › ✎ Completar dados (volta para a fila do agente).
- Parar o job de planos: `select cron.unschedule('frotas-manutencao-gerar-por-plano')`; os lembretes: `frotas-manutencao-lembretes`.
