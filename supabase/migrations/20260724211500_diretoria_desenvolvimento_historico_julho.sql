-- Histórico executivo dos ajustes realizados no painel durante julho de 2026.
-- Os commits pequenos do mesmo recurso foram consolidados em entregas temáticas
-- para manter a tela da Diretoria legível e evitar cartões duplicados.

WITH seed (
  titulo, modulo, submenu, tipo, status, prioridade, progresso,
  responsavel, descricao, proxima_etapa, impedimentos,
  data_inicio, previsao_conclusao, data_conclusao, ordem, ativo,
  created_by_name, updated_by_name
) AS (
  VALUES
    (
      'Otimização da listagem da Central de E-mails',
      'TI', 'Central de E-mails', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'A listagem da Central de E-mails foi otimizada para reduzir o tempo de carregamento e melhorar a navegação entre mensagens.',
      'Acompanhar o desempenho com maior volume de mensagens.', NULL,
      DATE '2026-07-01', DATE '2026-07-01', DATE '2026-07-01', 10, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Novo layout da Central de E-mails',
      'TI', 'Central de E-mails', 'MELHORIA', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Desenvolvimento',
      'A tela foi reorganizada em dark theme institucional, com menos poluição visual, melhor hierarquia e fluxo mais intuitivo de recebimento, interpretação e redirecionamento.',
      'Acompanhar a adaptação dos usuários ao novo fluxo.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 20, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Geocodificação e aproveitamento dos hotéis cadastrados',
      'Hospedagem', 'Hotéis', 'INTEGRACAO', 'CONCLUIDO', 'ALTA', 100,
      'TI / Hospedagem',
      'Os hotéis com link de localização passaram a ser aproveitados por latitude, longitude e endereço. Hotéis sem diária cadastrada também podem ser sugeridos, priorizando os que possuem valor real e usando estimativa quando necessário.',
      'Completar o cadastro de diárias dos hotéis ainda sem preço.', NULL,
      DATE '2026-07-01', DATE '2026-07-01', DATE '2026-07-01', 30, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Despesas vinculadas à última programação válida',
      'Gestor', 'Programação', 'CORRECAO', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'As despesas passaram a usar a última programação válida do colaborador, com limpeza da equipe anterior e deduplicação por colaborador para evitar lançamentos incorretos.',
      'Monitorar casos de reprogramação no mesmo dia.', NULL,
      DATE '2026-07-01', DATE '2026-07-01', DATE '2026-07-01', 40, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Indicador de O.S. sem colaborador no mapa',
      'Operacional', 'Mapa de Direcionamento', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Operacional',
      'O KPI Sem colaborador voltou a aparecer no mapa para informar quantas O.S. ficaram sem sugestão viável de atendimento.',
      'Usar o indicador para tratar exceções operacionais.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 50, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Roteirização inteligente entre O.S.',
      'Operacional', 'Mapa de Direcionamento', 'AUTOMACAO', 'CONCLUIDO', 'ALTA', 100,
      'TI / Operacional',
      'O cálculo de rota passou a considerar a inserção de cada nova O.S. na rota já existente do colaborador, em vez de calcular viagens isoladas de ida e volta. Pontos aproximados também receberam identificação visual.',
      'Acompanhar rotas com localização aproximada e corrigir cadastros incompletos.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 60, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Identificação MOTORISTA - PLACA no operacional',
      'Operacional', 'Mapa de Direcionamento', 'CORRECAO', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Frotas',
      'A identificação do motorista de frota voltou a exibir corretamente o rótulo MOTORISTA - PLACA e a seleção passou a respeitar os veículos ativos.',
      'Validar novos vínculos de patrimônio e motorista.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 70, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Sincronização de condutor e veículo no BFleet',
      'Frotas', 'Integração BFleet', 'INTEGRACAO', 'CONCLUIDO', 'ALTA', 100,
      'TI / Frotas',
      'A integração foi corrigida para atualizar o veículo pelo cadastro do condutor, usando o endpoint válido e o e-mail do colaborador como apoio quando necessário.',
      'Acompanhar novos condutores ainda não cadastrados no BFleet.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 80, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Correção do loop entre login e dashboard',
      'Sistema', 'Autenticação', 'CORRECAO', 'CONCLUIDO', 'CRITICA', 100,
      'TI / Desenvolvimento',
      'Foi corrigido o redirecionamento infinito entre login e dashboard após instabilidade da consulta de contexto do usuário, com novas tentativas controladas e proteção contra repetição.',
      'Monitorar falhas da RPC de contexto e sessões expiradas.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 90, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Carregamento otimizado em Distribuir O.S.',
      'Conferência', 'Distribuir O.S.', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'O carregamento das atribuições foi paralelizado e o efeito de piscar da tela foi reduzido durante a montagem da distribuição.',
      'Acompanhar desempenho em dias com grande volume de O.S.', NULL,
      DATE '2026-07-02', DATE '2026-07-02', DATE '2026-07-02', 100, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Mapa regional com divisão de MT e PR',
      'Dashboard', 'Mapa Produção x Meta', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Diretoria',
      'O mapa passou a representar as regionais de Mato Grosso e Paraná separadamente, com pontos principais e distribuição geográfica mais aderente à operação. O percentual também passou a atualizar corretamente.',
      'Revisar limites quando houver mudança na estrutura regional.', NULL,
      DATE '2026-07-03', DATE '2026-07-03', DATE '2026-07-03', 110, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Seleção Todas e múltiplas supervisões',
      'Gestor', 'Programação', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'A Programação ganhou a opção Todas e passou a carregar simultaneamente as supervisões permitidas ao gestor, mantendo a separação correta das programações.',
      'Acompanhar desempenho para gestores com muitas supervisões.', NULL,
      DATE '2026-07-08', DATE '2026-07-08', DATE '2026-07-08', 120, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'KPIs compactos nos cards de O.S.',
      'Gestor', 'Programação', 'MELHORIA', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Desenvolvimento',
      'Cliente, local de embarque, remanescente e número da O.S. foram reorganizados em indicadores compactos para facilitar a leitura operacional.',
      'Manter o padrão nos próximos cards operacionais.', NULL,
      DATE '2026-07-08', DATE '2026-07-08', DATE '2026-07-08', 130, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Mapa interativo do gestor',
      'Gestor', 'Programação', 'NOVA_TELA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'Foi criado um mapa interativo para visualizar O.S., candidatos, colaboradores confirmados e motoristas com frota, sem bloquear o carregamento inicial da lista.',
      'Evoluir os indicadores de distância e ocupação de rota.', NULL,
      DATE '2026-07-08', DATE '2026-07-08', DATE '2026-07-08', 140, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Atendimento, Logística e justificativa de equipe',
      'Gestor', 'Programação', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'Motoristas com veículo passaram a ter escolha explícita entre Atendimento e Logística. A inclusão de dois ou mais colaboradores na mesma O.S. passou a exigir justificativa registrada.',
      'Auditar justificativas de equipes adicionais.', NULL,
      DATE '2026-07-08', DATE '2026-07-08', DATE '2026-07-08', 150, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Programação reorganizada em três etapas',
      'Gestor', 'Programação', 'MELHORIA', 'CONCLUIDO', 'CRITICA', 100,
      'TI / Desenvolvimento',
      'A tela do gestor foi dividida em Situação da O.S., Equipe com mapa e Despesas. O novo fluxo reduz campos simultâneos e concentra estadia, alimentação, deslocamento e extras por colaborador.',
      'Acompanhar tempo médio de programação e dúvidas dos gestores.', NULL,
      DATE '2026-07-08', DATE '2026-07-08', DATE '2026-07-08', 160, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Estabilidade e usabilidade do mapa da Programação',
      'Gestor', 'Programação', 'CORRECAO', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'Foram corrigidos abertura automática, arraste, reposicionamento, zoom, atraso percebido e o efeito de piscar ao vincular colaboradores e O.S. no mapa.',
      'Monitorar uso em celulares e conexões mais lentas.', NULL,
      DATE '2026-07-09', DATE '2026-07-09', DATE '2026-07-09', 170, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'PWA do gestor: coordenações, atalhos e Extras',
      'Gestor', 'Aplicativo Gestor', 'MELHORIA', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Desenvolvimento',
      'O aplicativo passou a listar somente coordenações válidas, recebeu atalhos no rodapé, ajustes de descrição e melhoria do fluxo de Extras.',
      'Manter o aplicativo alinhado à versão desktop.', NULL,
      DATE '2026-07-09', DATE '2026-07-09', DATE '2026-07-09', 180, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Notas Fiscais simplificadas em Pendentes e Lançados',
      'Notas Fiscais', 'Painel de Notas Fiscais', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Financeiro',
      'O Resumo Financeiro foi removido do módulo. A operação ficou concentrada somente nas janelas Pendentes e Lançados.',
      'Evoluir a leitura automática e classificação dos documentos.', NULL,
      DATE '2026-07-10', DATE '2026-07-10', DATE '2026-07-10', 190, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Relatório de cargas por diarista no período noturno',
      'Logística', 'Informativos', 'AUTOMACAO', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Logística',
      'Foi ajustado o relatório de cargas por diarista entre 19h e 00h, considerando dias únicos e desconsiderando duplicidades fora do intervalo.',
      'Acompanhar divergências de horário nos próximos fechamentos.', NULL,
      DATE '2026-07-10', DATE '2026-07-10', DATE '2026-07-10', 200, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Fluxo completo de multas',
      'Frotas', 'Multas', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Frotas',
      'Foram ajustados vencimento, ordenação, ações Identificar e Dobrar, conclusão, persistência após a ação e a janela Sem Motorista. O registro não desaparece temporariamente durante a atualização.',
      'Acompanhar integrações com DETRAN e documentos recebidos por OCR.', NULL,
      DATE '2026-07-14', DATE '2026-07-14', DATE '2026-07-14', 210, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Reorganização do módulo de Recursos Humanos',
      'Recursos Humanos', 'Menu e telas', 'NOVO_MODULO', 'CONCLUIDO', 'ALTA', 100,
      'TI / RH',
      'O módulo foi reorganizado em Equipe, Exames, Contratos, Segurança do Trabalho, Indisponibilidade, Cartão Ponto, Advertências, Folha e Holerite e Plantão, mantendo as funções relacionadas dentro de cada tela.',
      'Consolidar os próximos processos de RH dentro dessa estrutura.', NULL,
      DATE '2026-07-16', DATE '2026-07-16', DATE '2026-07-16', 220, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Navegação suave entre módulos do painel',
      'Sistema', 'Navegação', 'MELHORIA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'As páginas compatíveis passaram a trocar somente o conteúdo central, reduzindo recarregamentos completos. Também foram adicionadas proteções contra renderização duplicada e tela preta.',
      'Promover novas páginas para navegação suave após validação individual.', NULL,
      DATE '2026-07-16', DATE '2026-07-16', DATE '2026-07-16', 230, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Aviso de nova versão disponível',
      'Sistema', 'Atualização do painel', 'MELHORIA', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Desenvolvimento',
      'O painel passou a identificar novos deploys e avisar o usuário quando uma versão mais recente estiver disponível, evitando uso prolongado de arquivos antigos em cache.',
      'Acompanhar comportamento em abas mantidas abertas durante todo o dia.', NULL,
      DATE '2026-07-16', DATE '2026-07-16', DATE '2026-07-16', 240, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Organização dos módulos em Usuários e Acessos',
      'Diretoria', 'Usuários e Acessos', 'MELHORIA', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Desenvolvimento',
      'Os módulos passaram a ser agrupados pelas áreas reais do menu, facilitando a liberação e revisão das permissões de cada usuário.',
      'Cadastrar o novo módulo Desenvolvimento para perfis específicos quando necessário.', NULL,
      DATE '2026-07-16', DATE '2026-07-16', DATE '2026-07-16', 250, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Finalização automática de O.S. com volume completo',
      'Logística', 'O.S. · Finalização', 'AUTOMACAO', 'VALIDACAO', 'CRITICA', 90,
      'TI / Logística',
      'Foi criado o agente que identifica O.S. com volume completo e realiza a finalização no GRM, com auditoria, fila de jobs, limites por execução, screenshots de erro e tratamento de modais assíncronos.',
      'Validar execuções automáticas consecutivas e aumentar o limite gradualmente.',
      'Algumas O.S. ainda precisam de validação do fechamento após timeout do modal do GRM.',
      DATE '2026-07-24', DATE '2026-07-25', NULL, 260, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Informativo de efetivos com validação de desligados',
      'Logística', 'Informativos', 'CORRECAO', 'CONCLUIDO', 'ALTA', 100,
      'TI / Logística',
      'A janela de efetivos passou a carregar corretamente, excluir colaboradores desligados usando os registros de rescisão do RH e ordenar os nomes por supervisão.',
      'Acompanhar divergências entre colaboradores e rescisões.', NULL,
      DATE '2026-07-24', DATE '2026-07-24', DATE '2026-07-24', 270, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Pré-conferência de relatórios por OCR',
      'Logística', 'O.S. · Conferência', 'AUTOMACAO', 'CONCLUIDO', 'CRITICA', 100,
      'TI / Logística',
      'As ações foram reorganizadas para Abrir, Pré Conferência e Confirmar. A Pré Conferência lê os relatórios por OCR, cruza placa e carga com as O.S. e classifica cada linha como Não localizada, Falta lançar, Placa errada, Peso errado ou OK. A leitura utiliza OCR.Space gratuito.',
      'Acompanhar documentos com baixa qualidade e evoluir as regras de peso.', NULL,
      DATE '2026-07-24', DATE '2026-07-24', DATE '2026-07-24', 280, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Acompanhamento de Desenvolvimento para a Diretoria',
      'Diretoria', 'Desenvolvimento', 'NOVA_TELA', 'CONCLUIDO', 'ALTA', 100,
      'TI / Desenvolvimento',
      'Foi criada a tela para registrar módulos, telas, integrações, automações, correções e melhorias, com indicadores, filtros, percentual, prazo, responsável, próxima etapa, impedimentos e linha do tempo.',
      'Manter o histórico atualizado a cada nova entrega.', NULL,
      DATE '2026-07-24', DATE '2026-07-24', DATE '2026-07-24', 290, true,
      'Histórico de julho', 'Histórico de julho'
    ),
    (
      'Padronização visual institucional das telas ajustadas',
      'Sistema', 'Design do painel', 'MELHORIA', 'CONCLUIDO', 'MEDIA', 100,
      'TI / Desenvolvimento',
      'As telas ajustadas passaram a seguir o padrão dark institucional, com verde operacional, componentes compactos, maior densidade informacional, hierarquia clara e estrutura mestre-detalhe quando aplicável.',
      'Aplicar o mesmo padrão às próximas telas reformuladas.', NULL,
      DATE '2026-07-24', DATE '2026-07-24', DATE '2026-07-24', 300, true,
      'Histórico de julho', 'Histórico de julho'
    )
)
INSERT INTO public.diretoria_desenvolvimento (
  titulo, modulo, submenu, tipo, status, prioridade, progresso,
  responsavel, descricao, proxima_etapa, impedimentos,
  data_inicio, previsao_conclusao, data_conclusao, ordem, ativo,
  created_by_name, updated_by_name
)
SELECT
  s.titulo, s.modulo, s.submenu, s.tipo, s.status, s.prioridade, s.progresso,
  s.responsavel, s.descricao, s.proxima_etapa, s.impedimentos,
  s.data_inicio, s.previsao_conclusao, s.data_conclusao, s.ordem, s.ativo,
  s.created_by_name, s.updated_by_name
FROM seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.diretoria_desenvolvimento d
  WHERE lower(trim(d.titulo)) = lower(trim(s.titulo))
);

-- Registra uma primeira ocorrência na linha do tempo para que os cartões
-- importados já tenham contexto ao serem abertos pela Diretoria.
INSERT INTO public.diretoria_desenvolvimento_atualizacoes (
  desenvolvimento_id,
  progresso_anterior,
  progresso_novo,
  status_anterior,
  status_novo,
  descricao,
  autor_nome
)
SELECT
  d.id,
  NULL,
  d.progresso,
  NULL,
  d.status,
  CASE
    WHEN d.status = 'CONCLUIDO'
      THEN 'Ajuste concluído e incorporado ao painel durante julho de 2026.'
    ELSE 'Implementação realizada em julho de 2026 e mantida em validação operacional.'
  END,
  'Histórico de julho'
FROM public.diretoria_desenvolvimento d
WHERE d.created_by_name = 'Histórico de julho'
  AND NOT EXISTS (
    SELECT 1
    FROM public.diretoria_desenvolvimento_atualizacoes a
    WHERE a.desenvolvimento_id = d.id
      AND a.autor_nome = 'Histórico de julho'
  );
