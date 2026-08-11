alter table public.grm_sync_jobs
  add column if not exists vps_memory_peak_mb numeric(12,2),
  add column if not exists vps_memory_total_mb numeric(12,2),
  add column if not exists vps_disk_used_mb numeric(14,2),
  add column if not exists vps_disk_total_mb numeric(14,2);

comment on column public.grm_sync_jobs.vps_memory_peak_mb is
  'Maior RAM global usada no VPS durante a execução do job, em MB (MemTotal - MemAvailable).';
comment on column public.grm_sync_jobs.vps_memory_total_mb is
  'RAM total visível ao worker no VPS durante a execução, em MB.';
comment on column public.grm_sync_jobs.vps_disk_used_mb is
  'Espaço usado no filesystem do projeto durante a última amostra do job, em MB.';
comment on column public.grm_sync_jobs.vps_disk_total_mb is
  'Capacidade total do filesystem do projeto durante a última amostra do job, em MB.';
