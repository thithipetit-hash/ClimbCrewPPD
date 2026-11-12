create table if not exists buddy_availability (
  participant_id bigint primary key references participants(id) on delete cascade,
  days text[] not null default '{}',
  slots text[] not null default '{}',
  note varchar(240) not null default '',
  updated_at timestamptz not null default now()
);
