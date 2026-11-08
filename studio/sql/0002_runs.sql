-- One lease per founder, so two runs of the same founder never work on its company at once.
-- A run takes it in get_my_company (and gets its token back), passes the token on later calls,
-- and gives the lease back with end_run. A lease nobody gave back expires on its own.
create table if not exists runs (
  founder      text primary key,
  token        text not null,
  started_at   timestamptz not null,
  ended_at     timestamptz
);
