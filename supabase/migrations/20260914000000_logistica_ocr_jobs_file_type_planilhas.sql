-- A tela de Conferência (Logística > Atualizar, ação "Conferir"/"Finalizar")
-- sempre aceitou anexar planilhas (.xlsx/.xls/.csv) além de imagem/PDF, mas o
-- worker só sabia processar imagem/PDF -- um anexo de planilha era rotulado
-- como "pdf" no front (assets/js/logistica-conferencia-ocr.js) e falhava. O
-- worker agora lê xlsx/xls/csv direto (sem OCR) e docx (Word moderno) via
-- python-docx; amplia aqui a restrição de tipo pra liberar esses valores.
alter table public.logistica_ocr_jobs
  drop constraint if exists logistica_ocr_jobs_file_type_check;

alter table public.logistica_ocr_jobs
  add constraint logistica_ocr_jobs_file_type_check
    check (file_type in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'xlsx', 'xls', 'csv', 'docx'));

select pg_notify('pgrst', 'reload schema');
