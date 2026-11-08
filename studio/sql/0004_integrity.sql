-- Forward-only integrity repair. Refuse conflicting historic rows rather than deleting evidence.
create unique index if not exists companies_one_active_founder
  on companies(founder) where status in ('building', 'live', 'winner');
create unique index if not exists signups_canonical_email
  on signups(company_id, lower(trim(email)));

alter table runs add column if not exists expires_at timestamptz;
update runs set expires_at = started_at + interval '28 minutes' where expires_at is null;
alter table runs alter column expires_at set not null;

-- Existing links have no run receipt and are deliberately invalid after this repair.
alter table uploads add column if not exists run_token text;

-- Shared means publicly readable, never publicly writable. Existing anonymous shared rows remain
-- readable but are immutable because no creator capability was recorded for them.
alter table items add column if not exists shared boolean not null default false;
update items set shared = true where owner is null;
create index if not exists items_owner_lookup on items(company_id, owner, collection);

create unique index if not exists touches_provider_receipt
  on touches(channel, external_id) where external_id is not null;
