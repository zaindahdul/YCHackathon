-- The browser's user agent on each product event, so automated visits (link scanners, the
-- founders' own browser) can be told apart from people.
alter table events add column if not exists ua text;
