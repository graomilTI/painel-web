-- Gestor > Logística > Abrir OS pedia "Cidade de embarque"/"Cidade destino"
-- como texto livre (placeholder "Cidade-UF"), sem UF separada e sem lista
-- fixa — usuário pedia UF antes da cidade + listas fixas (IBGE). Cidade
-- continua sem UF embutida (buscarOsExistente em
-- logistica-abertura-os-workflow.js faz `os.embarque.includes(cidadeEmbarque)`
-- contra o texto solto do GRM; prefixar "UF - " ali quebraria esse match de
-- O.S. já existente). UF vai em colunas novas, nullable pra não quebrar
-- histórico sem esse dado.
ALTER TABLE public.logistica_abertura_os
  ADD COLUMN IF NOT EXISTS uf_embarque text,
  ADD COLUMN IF NOT EXISTS uf_destino text;
