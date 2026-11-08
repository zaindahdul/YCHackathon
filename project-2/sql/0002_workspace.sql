-- The founder's private workspace: grounded facts, reach, replies, attribution and follow-through.
-- Writes are single statements or idempotent upserts, so a retried request cannot duplicate work.
create table if not exists workspaces (
  launch_id         text primary key references launches(id),
  facts             jsonb not null default '{}'::jsonb,
  missing           jsonb not null default '[]'::jsonb,
  producer          text,
  communities       jsonb not null default '[]'::jsonb,
  demo              jsonb,
  wave_plan         jsonb not null default '[]'::jsonb,
  trial_accepted_at timestamptz,
  hours_saved       numeric,
  updated_at        timestamptz not null default now()
);

create table if not exists outreach (
  id          text primary key,
  launch_id   text not null references launches(id),
  name        text not null,
  contact     text not null default '',
  why         text not null,
  draft       text not null,
  status      text not null default 'draft',
  approved_at timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (launch_id, name, contact)
);

create table if not exists launch_comments (
  id         text primary key,
  launch_id  text not null references launches(id),
  hash       text not null,
  platform   text not null,
  author     text not null,
  url        text,
  body       text not null,
  category   text not null,
  status     text not null,
  draft      text not null default '',
  fact_refs  jsonb not null default '[]'::jsonb,
  unknown    text,
  created_at timestamptz not null default now(),
  unique (launch_id, hash)
);

create table if not exists wave_checks (
  id                 text primary key,
  launch_id          text not null references launches(id),
  channel            text not null,
  minutes_since_post integer not null,
  impressions        integer not null,
  likes              integer not null,
  replies            integer not null,
  created_at         timestamptz not null default now()
);
create index if not exists wave_checks_launch on wave_checks(launch_id, created_at);

create table if not exists product_events (
  id         text primary key,
  launch_id  text not null references launches(id),
  visitor    text not null,
  event      text not null,
  qa         boolean not null default false,
  day        text not null,
  created_at timestamptz not null default now(),
  unique (launch_id, visitor, event, day)
);

create table if not exists commitments (
  id         text primary key,
  launch_id  text not null references launches(id),
  person     text not null,
  context    text not null default '',
  promise    text not null,
  due        text,
  status     text not null default 'open',
  followup   text not null,
  created_at timestamptz not null default now()
);

-- One channel link per launch even if two requests race to mint it.
create unique index if not exists links_one_per_channel on links(launch_id, channel) where boost_id is null;
