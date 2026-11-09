-- ENDUS database. Run the whole file in the Supabase SQL editor; it is safe to run again.
-- Tables from the first version (readings.counts, calibrations.rs_air) are renamed to *_legacy, never dropped.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'readings' and column_name = 'counts') then
    alter table public.readings rename to readings_legacy;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'calibrations' and column_name = 'rs_air') then
    alter table public.calibrations rename to calibrations_legacy;
  end if;
end $$;

-- ---------- tables ----------

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_code text unique not null,
  name text,
  location text,
  is_active boolean not null default true,
  last_seen_at timestamptz,               -- server arrival time of the latest message
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Set by the dashboard buttons (nasi / mi / tidak ada); overrides the label the firmware sends.
alter table public.devices add column if not exists sample_label text not null default 'unknown';

-- Server only: RLS on, no policies, no grants for anon/authenticated.
create table if not exists public.device_secrets (
  device_id uuid primary key references public.devices (id) on delete cascade,
  calibration_token_hash text not null,   -- scrypt$<salt>$<hash>, see lib/secret.ts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  label text not null default 'unknown',
  note text,
  planned_hours numeric,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sessions_device_started on public.sessions (device_id, started_at desc);
create unique index if not exists sessions_one_open on public.sessions (device_id) where ended_at is null;

create table if not exists public.readings (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  recorded_at timestamptz not null,       -- device NTP clock, else arrival time
  uptime_ms bigint not null default 0,
  uptime_min integer,
  preheated boolean not null default false,
  mq2 integer, mq3 integer, mq4 integer, mq5 integer,
  mq6 integer, mq7 integer, mq8 integer, mq135 integer,   -- raw ADS1115 counts, -1 = not read
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (device_id, recorded_at, uptime_ms)
);
create index if not exists readings_device_recorded on public.readings (device_id, recorded_at desc);
create index if not exists readings_session_recorded on public.readings (session_id, recorded_at);

create table if not exists public.calibrations (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  baseline_counts integer[] not null check (cardinality(baseline_counts) = 8),  -- mq2..mq135, clean air
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  note text,
  calibrated_at timestamptz not null default now()
);
create index if not exists calibrations_device_at on public.calibrations (device_id, calibrated_at desc);

-- ---------- views (security_invoker so RLS of the caller applies) ----------

create or replace view public.v_reading_series with (security_invoker = on) as
select r.*, d.device_code, s.label as session_label
from public.readings r
join public.devices d on d.id = r.device_id
left join public.sessions s on s.id = r.session_id;

create or replace view public.v_latest_readings with (security_invoker = on) as
select r.*, d.device_code, d.name as device_name, s.label as session_label
from public.devices d
cross join lateral (
  select * from public.readings x where x.device_id = d.id order by x.recorded_at desc limit 1
) r
left join public.sessions s on s.id = r.session_id;

-- d.* expands at creation, so a new devices column can only be added by recreating the view (grants are re-applied below).
drop view if exists public.v_device_status;
create or replace view public.v_device_status with (security_invoker = on) as
select d.*,
  coalesce(d.last_seen_at > now() - interval '30 seconds', false) as online,
  s.id as session_id, s.label as session_label, s.note as session_note,
  s.planned_hours as session_planned_hours, s.started_at as session_started_at
from public.devices d
left join public.sessions s on s.device_id = d.id and s.ended_at is null;

-- ---------- functions ----------

-- One transaction per telemetry message: upsert device, follow the session, insert the reading.
-- Returns the new reading id, or null when the reading was already stored (EMQX retry).
create or replace function public.ingest_telemetry(
  p_device_code text, p_recorded_at timestamptz, p_uptime_ms bigint, p_uptime_min integer,
  p_preheated boolean, p_label text, p_planned_hours numeric, p_note text, p_counts integer[],
  p_temperature_c numeric, p_humidity_pct numeric, p_raw jsonb
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_device uuid;
  v_open public.sessions%rowtype;
  v_has_open boolean;
  v_session uuid;
  v_id bigint;
  v_label text;
begin
  insert into public.devices (device_code, last_seen_at) values (p_device_code, now())
  on conflict (device_code) do update set last_seen_at = now(), updated_at = now()
  returning id, sample_label into v_device, v_label;

  if coalesce(v_label, 'unknown') not in ('', 'unknown') then
    select * into v_open from public.sessions where device_id = v_device and ended_at is null for update;
    v_has_open := found;
    if v_has_open and p_recorded_at < v_open.started_at then
      v_session := null;  -- replayed reading older than the open session: leave sessions alone
    elsif v_has_open and v_open.label = v_label
      and v_open.planned_hours is not distinct from p_planned_hours
      and coalesce(v_open.note, '') = coalesce(p_note, '') then
      v_session := v_open.id;
    else
      if v_has_open then
        update public.sessions set ended_at = p_recorded_at where id = v_open.id;
      end if;
      insert into public.sessions (device_id, label, note, planned_hours, started_at)
      values (v_device, v_label, nullif(p_note, ''), p_planned_hours, p_recorded_at)
      returning id into v_session;
    end if;
  else
    -- "unknown" = nothing under the sensor: close the open session now, not when the next sample starts.
    update public.sessions set ended_at = p_recorded_at
    where device_id = v_device and ended_at is null and started_at <= p_recorded_at;
  end if;

  insert into public.readings (device_id, session_id, recorded_at, uptime_ms, uptime_min, preheated,
    mq2, mq3, mq4, mq5, mq6, mq7, mq8, mq135, temperature_c, humidity_pct, raw_payload)
  values (v_device, v_session, p_recorded_at, p_uptime_ms, p_uptime_min, p_preheated,
    p_counts[1], p_counts[2], p_counts[3], p_counts[4], p_counts[5], p_counts[6], p_counts[7], p_counts[8],
    p_temperature_c, p_humidity_pct, p_raw)
  on conflict (device_id, recorded_at, uptime_ms) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Readings averaged into fixed time buckets, so a 24 h chart stays under PostgREST's 1000-row cap.
create or replace function public.reading_buckets(p_device_code text, p_from timestamptz, p_bucket_seconds integer)
returns table (
  t timestamptz, mq2 real, mq3 real, mq4 real, mq5 real, mq6 real, mq7 real, mq8 real, mq135 real,
  temperature_c real, humidity_pct real, preheated boolean
)
language sql stable security invoker set search_path = '' as $$
  select date_bin(make_interval(secs => p_bucket_seconds), r.recorded_at, timestamptz '2000-01-01'),
    avg(r.mq2)::real, avg(r.mq3)::real, avg(r.mq4)::real, avg(r.mq5)::real,
    avg(r.mq6)::real, avg(r.mq7)::real, avg(r.mq8)::real, avg(r.mq135)::real,
    avg(r.temperature_c)::real, avg(r.humidity_pct)::real, bool_and(r.preheated)
  from public.readings r
  join public.devices d on d.id = r.device_id
  where d.device_code = p_device_code and r.recorded_at >= p_from
  group by 1
  order by 1
$$;

-- ---------- access ----------

alter table public.devices enable row level security;
alter table public.device_secrets enable row level security;
alter table public.sessions enable row level security;
alter table public.readings enable row level security;
alter table public.calibrations enable row level security;

revoke all on public.device_secrets from anon, authenticated;
revoke insert, update, delete, truncate on public.devices, public.sessions, public.readings, public.calibrations
  from anon, authenticated;
grant select on public.devices, public.sessions, public.readings, public.calibrations,
  public.v_reading_series, public.v_latest_readings, public.v_device_status to anon, authenticated;

drop policy if exists "dashboard read" on public.devices;
drop policy if exists "dashboard read" on public.sessions;
drop policy if exists "dashboard read" on public.readings;
drop policy if exists "dashboard read" on public.calibrations;
create policy "dashboard read" on public.devices for select to anon, authenticated using (true);
create policy "dashboard read" on public.sessions for select to anon, authenticated using (true);
create policy "dashboard read" on public.readings for select to anon, authenticated using (true);
create policy "dashboard read" on public.calibrations for select to anon, authenticated using (true);

revoke execute on function public.ingest_telemetry from public, anon, authenticated;
grant execute on function public.ingest_telemetry to service_role;
revoke execute on function public.reading_buckets from public;
grant execute on function public.reading_buckets to anon, authenticated, service_role;

-- Calibration token per device (plaintext never stored). Hash it locally first:
--   node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log('scrypt$'+s+'$'+c.scryptSync(process.argv[1],s,32).toString('hex'))" "<token>"
-- then:
--   insert into public.device_secrets (device_id, calibration_token_hash)
--   select id, '<hash>' from public.devices where device_code = 'i2aspo-XXXXXX'
--   on conflict (device_id) do update set calibration_token_hash = excluded.calibration_token_hash, updated_at = now();
