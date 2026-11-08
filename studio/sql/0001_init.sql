-- PMF Engine: an AI venture studio. Several founder agents each run one company at a time.
-- Applied once by `naive up` (apps[].migrations). Add new files; never edit an applied one.

-- One row per company a founder starts. A pivot is a new company with parent_id set.
create table if not exists companies (
  id            text primary key,
  slug          text not null unique,
  founder       text not null,
  name          text not null,
  problem       text not null,                     -- the pain, in the words of the people who have it
  audience      text not null,                     -- who has it and where they can be reached
  evidence      jsonb not null default '[]'::jsonb, -- links to real posts and threads showing the problem
  solution      text not null,                     -- what the product does about it
  status        text not null default 'building',  -- building | live | killed | winner
  parent_id     text references companies(id),
  pivot_reason  text,
  thresholds    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  launched_at   timestamptz,
  ended_at      timestamptz
);
create index if not exists companies_founder on companies(founder);

-- The product's current files, served by the studio at /p/<slug>/<path>.
create table if not exists product_files (
  company_id    text not null references companies(id),
  path          text not null,
  content       text not null,
  updated_at    timestamptz not null default now(),
  primary key (company_id, path)
);

-- Every ship, so the dashboard can show the product changing.
create table if not exists product_versions (
  id            text primary key,
  company_id    text not null references companies(id),
  version       integer not null,
  note          text not null,
  file_count    integer not null,
  bytes         integer not null,
  created_at    timestamptz not null default now(),
  unique (company_id, version)
);

-- A tiny document store each product can use as its backend (/p/<slug>/api/items).
create table if not exists items (
  id            text primary key,
  company_id    text not null references companies(id),
  collection    text not null,
  owner         text,
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists items_lookup on items(company_id, collection, created_at desc);

-- Product analytics from /t.js: view, use (the product's core action), signup, feedback.
-- One row per user, event and name per hour.
create table if not exists events (
  id            bigserial primary key,
  company_id    text not null references companies(id),
  uid           text not null,
  type          text not null,
  name          text not null default '',
  bucket        timestamptz not null,
  path          text,
  source        text,                              -- ?ref= on the first view: x, email, …
  created_at    timestamptz not null default now()
);
create unique index if not exists events_dedupe on events(company_id, uid, type, name, bucket);
create index if not exists events_company on events(company_id, type);

create table if not exists signups (
  id            text primary key,
  company_id    text not null references companies(id),
  email         text not null,
  uid           text,
  source        text,
  created_at    timestamptz not null default now(),
  unique (company_id, email)
);

-- What users said: from the product's feedback box or from email.
create table if not exists feedback (
  id            text primary key,
  company_id    text not null references companies(id),
  source        text not null,                     -- product | email
  email         text,
  text          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists feedback_company on feedback(company_id, created_at desc);

-- One row per outreach action: a social post, a cold email, a reply.
create table if not exists touches (
  id             text primary key,
  company_id     text not null references companies(id),
  channel        text not null,                    -- x | email | social | other
  kind           text not null,                    -- post | email | reply | dm
  target         text,
  content        text not null,
  external_id    text,
  url            text,
  impressions    integer not null default 0,
  engagements    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists touches_company on touches(company_id);
create index if not exists touches_created on touches(created_at);

-- Every launch / iterate / keep / kill / pivot / scale call, with the numbers it was made on.
create table if not exists decisions (
  id             text primary key,
  company_id     text references companies(id),
  decision       text not null,
  reasoning      text not null,
  snapshot       jsonb not null default '{}'::jsonb,
  agent          text not null,
  created_at     timestamptz not null default now()
);
create index if not exists decisions_created on decisions(created_at);

-- A founder's detailed write-up of a test's outcome: required with every iterate, scale and kill.
create table if not exists reports (
  id             text primary key,
  company_id     text not null references companies(id),
  kind           text not null,                    -- iterate | scale | kill | winner | checkpoint
  title          text not null,
  body           text not null,                    -- markdown, written by the founder
  snapshot       jsonb not null default '{}'::jsonb, -- the studio's own numbers at that moment
  agent          text not null,
  created_at     timestamptz not null default now()
);
create index if not exists reports_company on reports(company_id, created_at desc);
create index if not exists reports_created on reports(created_at desc);

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
