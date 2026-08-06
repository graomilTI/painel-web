
CREATE OR REPLACE FUNCTION sync_compras_solicitacao_status()
RETURNS TRIGGER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT
    CASE
      WHEN bool_and(status = 'comprado') THEN 'comprado'
      WHEN bool_and(status = 'recusado') THEN 'recusado'
      WHEN bool_or(status = 'aguardando_nf') THEN 'aguardando_nf'
      WHEN bool_or(status = 'aguardando_termo') THEN 'aguardando_termo'
      WHEN bool_or(status = 'pendente_pagamento') THEN 'pendente_pagamento'
      WHEN bool_or(status = 'em_analise') THEN 'em_analise'
      WHEN bool_or(status = 'em_cotacao') THEN 'em_cotacao'
      ELSE 'pendente'
    END
  INTO v_status
  FROM compras_itens
  WHERE solicitacao_id = NEW.solicitacao_id;

  UPDATE compras_solicitacoes
  SET status = v_status
  WHERE id = NEW.solicitacao_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS compras_itens_status_sync ON compras_itens;

CREATE TRIGGER compras_itens_status_sync
AFTER INSERT OR UPDATE OF status ON compras_itens
FOR EACH ROW
WHEN (NEW.solicitacao_id IS NOT NULL)
EXECUTE FUNCTION sync_compras_solicitacao_status();
;
