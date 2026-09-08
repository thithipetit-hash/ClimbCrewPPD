alter table realisations
  add column if not exists technical_analysis jsonb not null
  default '{"version":1,"videos":{}}'::jsonb;
