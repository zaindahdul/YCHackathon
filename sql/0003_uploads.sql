-- Upload links: a founder's sandbox sends product files straight to the studio with curl, so
-- large files never have to pass through the model's tool call. A link is short-lived and can
-- only write to its own company; committing it ships the staged files as a version.
create table if not exists uploads (
  token        text primary key,
  company_id   text not null references companies(id),
  founder      text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create table if not exists upload_files (
  token        text not null references uploads(token) on delete cascade,
  path         text not null,
  content      text not null,
  primary key (token, path)
);
