alter table realisations
  add column if not exists video_urls jsonb not null default '[]'::jsonb;

create table if not exists video_analysis_settings (
  id integer primary key check (id = 1),
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into video_analysis_settings (id, rules)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
