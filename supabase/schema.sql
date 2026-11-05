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
