-- PMF Engine: everything the company knows about its own experiments.
-- Applied once by `naive up` (apps[].migrations). Add new files; never edit an applied one.

create table if not exists experiments (
  id            text primary key,
  slug          text not null unique,
  name          text not null,
  hypothesis    text not null,
  audience      text not null,
  offer         text not null,
  deliverable   text not null,
  headline      text not null,
  subhead       text not null,
  bullets       jsonb not null default '[]'::jsonb,
  cta           text not null,
  ask_label     text not null default 'What do you need help with?',
  channels      jsonb not null default '[]'::jsonb,
  status        text not null default 'live',      -- live | paused | killed | winner
  parent_id     text references experiments(id),
  pivot_reason  text,
  thresholds    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);

-- One row per outreach action: an X post, a cold email, a reply.
create table if not exists touches (
  id             text primary key,
  experiment_id  text not null references experiments(id),
  channel        text not null,                    -- x | email | other
  kind           text not null,                    -- post | email | reply | dm
  target         text,
  content        text not null,
  external_id    text,
  url            text,
  impressions    integer not null default 0,
  engagements    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists touches_experiment on touches(experiment_id);
create index if not exists touches_created on touches(created_at);

-- Landing-page views, deduplicated per visitor per day.
create table if not exists views (
  id             bigserial primary key,
  experiment_id  text not null references experiments(id),
  visitor        text not null,
  source         text,
  day            date not null default current_date,
  created_at     timestamptz not null default now(),
  unique (experiment_id, visitor, day)
);
create index if not exists views_experiment on views(experiment_id);

create table if not exists signups (
  id             text primary key,
  experiment_id  text not null references experiments(id),
  email          text not null,
  name           text,
  need           text not null,
  link           text,
  source         text,
  status         text not null default 'new',      -- new | working | delivered | failed
  created_at     timestamptz not null default now(),
  claimed_at     timestamptz,
  delivered_at   timestamptz
);
create index if not exists signups_experiment on signups(experiment_id);
create index if not exists signups_status on signups(status);

create table if not exists deliveries (
  id          text primary key,
  signup_id   text not null references signups(id),
  summary     text not null,
  content     text,
  created_at  timestamptz not null default now()
);

-- Every keep / kill / pivot / scale call, with the reasoning and the numbers it was made on.
create table if not exists decisions (
  id             text primary key,
  experiment_id  text references experiments(id),
  decision       text not null,                    -- launch | keep | kill | pivot | scale | note
  reasoning      text not null,
  snapshot       jsonb not null default '{}'::jsonb,
  agent          text not null default 'strategist',
  created_at     timestamptz not null default now()
);
create index if not exists decisions_created on decisions(created_at);

-- People who asked not to be contacted again. Outreach checks this before every send.
create table if not exists optouts (
  target      text primary key,
  reason      text,
  created_at  timestamptz not null default now()
);

-- Where a human stepped in. Judges ask for this; keep it honest.
create table if not exists interventions (
  id           text primary key,
  description  text not null,
  created_at   timestamptz not null default now()
);
