-- Launchpad: one-click launches for YC founders.
-- Applied once by `naive up` (apps[].migrations). Add new files; never edit an applied one.

-- One row per launch a founder asks for. The kit is what the producer agent writes.
create table if not exists launches (
  id            text primary key,
  slug          text not null unique,
  token         text not null,                      -- the founder's private link to their kit
  company       text not null,
  one_liner     text not null,
  description   text not null,
  url           text not null,
  video_url     text,
  batch         text,                               -- e.g. W26, optional
  email         text not null,
  x_handle      text,
  linkedin_url  text,
  channels      jsonb not null default '[]'::jsonb,
  launch_when   text,                               -- what the founder said about timing
  timezone      text,
  join_squad    boolean not null default true,      -- boost others' launches, get boosted back
  listed        boolean not null default true,      -- show on the public "launches we ran" list
  status        text not null default 'new',        -- new | drafting | ready | launched | reported
  kit           jsonb,
  claimed_at    timestamptz,
  ready_at      timestamptz,
  launched_at   timestamptz,
  reported_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists launches_status on launches(status, created_at);

-- Tracked short links: one per launch per channel, and one per boost.
create table if not exists links (
  code          text primary key,
  launch_id     text not null references launches(id),
  channel       text not null,                      -- x | linkedin | email | boost | kit | other
  boost_id      text,
  target        text not null,
  created_at    timestamptz not null default now()
);
create index if not exists links_launch on links(launch_id);

-- One row per visitor per link per hour, so a refresh is not a new click.
create table if not exists clicks (
  id            bigserial primary key,
  code          text not null references links(code),
  launch_id     text not null references launches(id),
  channel       text not null,
  visitor       text not null,
  bucket        timestamptz not null,
  ua            text,
  referer       text,
  created_at    timestamptz not null default now()
);
create unique index if not exists clicks_dedupe on clicks(code, visitor, bucket);
create index if not exists clicks_launch on clicks(launch_id, channel);

-- A boost: one squad member asked to share one launch.
create table if not exists boosts (
  id            text primary key,
  launch_id     text not null references launches(id),   -- the launch being boosted
  booster_id    text not null references launches(id),   -- the squad member's own launch
  code          text not null unique,                    -- their personal boost page /b/<code>
  status        text not null default 'pending',         -- pending | sent | shared | skipped
  sent_at       timestamptz,
  shared_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (launch_id, booster_id)
);
create index if not exists boosts_status on boosts(status, created_at);

-- Launches seen elsewhere (Launch YC, Product Hunt, Show HN, X): timing data and leads.
create table if not exists radar (
  id            text primary key,
  source        text not null,
  title         text not null,
  url           text not null unique,
  company       text,
  batch         text,
  contact       text,
  seen_at       timestamptz not null default now(),
  launched_at   timestamptz
);
create index if not exists radar_seen on radar(seen_at desc);

-- Outreach to founders (the scout's emails and posts).
create table if not exists touches (
  id             text primary key,
  launch_id      text references launches(id),
  channel        text not null,
  kind           text not null,
  target         text,
  content        text not null,
  external_id    text,
  impressions    integer not null default 0,
  engagements    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists touches_created on touches(created_at);

create table if not exists feedback (
  id            text primary key,
  launch_id     text references launches(id),
  source        text not null,
  email         text,
  text          text not null,
  created_at    timestamptz not null default now()
);

-- What the agents decided and why: timing calls, copy angles, outreach targets.
create table if not exists decisions (
  id             text primary key,
  launch_id      text references launches(id),
  decision       text not null,
  reasoning      text not null,
  agent          text not null,
  created_at     timestamptz not null default now()
);
create index if not exists decisions_created on decisions(created_at desc);

-- The producer's post-launch write-up of what each channel did.
create table if not exists reports (
  id             text primary key,
  launch_id      text not null references launches(id),
  title          text not null,
  body           text not null,
  snapshot       jsonb not null default '{}'::jsonb,
  agent          text not null,
  created_at     timestamptz not null default now()
);

create table if not exists optouts (
  target      text primary key,
  reason      text,
  created_at  timestamptz not null default now()
);

create table if not exists runs (
  agent        text primary key,
  token        text not null,
  started_at   timestamptz not null,
  ended_at     timestamptz
);

create table if not exists interventions (
  id           text primary key,
  description  text not null,
  created_at   timestamptz not null default now()
);
