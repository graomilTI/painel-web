-- Generaliza a fila do OCR local (hoje só "cargas" da Pré-Conferência) pra
-- também servir a leitura de texto livre (Abertura de O.S.). document_type
-- controla se o worker exige achar placa (cargas) ou só devolve o texto
-- reconhecido (texto_livre) — ver server/paddleocr/logistica_ocr_worker.py.
alter table public.logistica_ocr_jobs
  add column if not exists document_type text not null default 'cargas'
    check (document_type in ('cargas', 'texto_livre'));

comment on column public.logistica_ocr_jobs.document_type is
  'cargas: exige achar ao menos 1 placa (Pré-Conferência). texto_livre: só devolve raw_text, sem exigir placa (ex.: Abertura de O.S.).';

select pg_notify('pgrst', 'reload schema');;
