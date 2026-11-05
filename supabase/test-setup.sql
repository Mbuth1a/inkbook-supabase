-- Test copy of the database, kept in its own 'test' schema inside the same Supabase project.
-- The live tables in 'public' are not touched. Run once in the SQL Editor.
create schema if not exists test;
set search_path to test;

-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It creates the same three tables the SQLite version uses.

create table if not exists bookings (
  id                   text primary key,
  status               text not null,          -- requested | pending | confirmed | completed | cancelled | failed | expired | paid_conflict
  name                 text not null,
  phone                text not null,
  email                text,
  style                text not null,
  concept              text not null,
  size                 text not null,
  placement            text not null,
  size_cm              text,
  refs                 text not null default '[]',  -- JSON array of uploaded file names (kept as text, same as SQLite)
  date                 text not null,          -- YYYY-MM-DD, Nairobi
  start_min            integer not null,
  duration_min         integer not null,
  deposit_kes          integer not null,
  hold_expires_at      bigint not null,        -- epoch ms
  checkout_request_id  text unique,
  merchant_request_id  text,
  mpesa_receipt        text,
  paid_amount          integer,
  failure_reason       text,
  needs_review         boolean not null default false,
  created_at           bigint not null,
  confirmed_at         bigint
);

create index if not exists idx_bookings_date on bookings (date, status);

create table if not exists blocked_dates (
  date    text primary key,
  reason  text
);

create table if not exists gallery (
  id          text primary key,
  file        text not null,                   -- processed .webp name (or Storage path once photos move)
  thumb       text,
  alt         text not null default '',
  style       text not null,
  state       text not null,                   -- Fresh | Healed
  width       integer not null,
  height      integer not null,
  featured    boolean not null default false,
  created_at  bigint not null
);

-- Row Level Security: the public (anon) key can't read or write these tables.
-- The website's server uses the service-role key, which bypasses RLS.
alter table bookings enable row level security;
alter table blocked_dates enable row level security;
alter table gallery enable row level security;

-- Run this after schema.sql (SQL Editor -> New query -> paste -> Run).
-- These functions keep "check the slot, then insert" atomic, so two clients can't book the same time.

-- Returns true if the booking was inserted, false if the slot is taken (or the date is blocked).
create or replace function create_booking_request(
  p_id          text,
  p_status      text,          -- 'requested' (request mode) or 'pending' (M-Pesa mode)
  p_name        text,
  p_phone       text,
  p_email       text,
  p_style       text,
  p_concept     text,
  p_size        text,
  p_placement   text,
  p_size_cm     text,
  p_refs        text,
  p_date        text,
  p_start_min   integer,
  p_duration    integer,
  p_deposit     integer,
  p_hold_until  bigint,        -- epoch ms; 0 for requests (no timer)
  p_now         bigint
) returns boolean
language plpgsql
as $$
begin
  -- Serialise bookings for the same date. The lock is released when the transaction ends.
  perform pg_advisory_xact_lock(hashtext(p_date));

  -- Blocked day (artist is away): nothing can be booked.
  if exists (select 1 from blocked_dates where date = p_date) then
    return false;
  end if;

  -- Any live booking that overlaps the requested time range.
  if exists (
    select 1 from bookings b
    where b.date = p_date
      and (
        b.status in ('confirmed', 'completed', 'requested')
        or (b.status = 'pending' and b.hold_expires_at > p_now)
      )
      and b.start_min < p_start_min + p_duration
      and p_start_min < b.start_min + b.duration_min
  ) then
    return false;
  end if;

  insert into bookings (
    id, status, name, phone, email, style, concept, size, placement, size_cm, refs,
    date, start_min, duration_min, deposit_kes, hold_expires_at, created_at
  ) values (
    p_id, p_status, p_name, p_phone, p_email, p_style, p_concept, p_size, p_placement, p_size_cm, p_refs,
    p_date, p_start_min, p_duration, p_deposit, p_hold_until, p_now
  );
  return true;
end;
$$;

-- Lets a client retry a booking whose payment prompt failed or timed out.
-- Returns true if the hold was (re)started, false if the slot was taken in the meantime.
create or replace function retry_booking_hold(
  p_id          text,
  p_hold_until  bigint,
  p_now         bigint
) returns boolean
language plpgsql
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_id for update;
  if not found then return false; end if;

  -- Same lock as create_booking_request, so a retry and a new booking can't both take the slot.
  perform pg_advisory_xact_lock(hashtext(b.date));

  if exists (select 1 from blocked_dates where date = b.date) then return false; end if;

  if exists (
    select 1 from bookings o
    where o.date = b.date
      and o.id <> p_id
      and (
        o.status in ('confirmed', 'completed', 'requested')
        or (o.status = 'pending' and o.hold_expires_at > p_now)
      )
      and o.start_min < b.start_min + b.duration_min
      and b.start_min < o.start_min + o.duration_min
  ) then
    return false;
  end if;

  update bookings
     set status = 'pending', failure_reason = null, hold_expires_at = p_hold_until
   where id = p_id;
  return true;
end;
$$;

-- Let the server (service_role key) use the test schema through the API.
grant usage on schema test to service_role;
grant all on all tables in schema test to service_role;
grant all on all functions in schema test to service_role;
alter default privileges in schema test grant all on tables to service_role;
alter default privileges in schema test grant all on functions to service_role;
