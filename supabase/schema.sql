-- Run once in the Supabase SQL editor.
create table if not exists readings (
  id bigint generated always as identity primary key,
  device text not null,
  ts timestamptz not null,              -- measurement time (device NTP clock, else arrival time)
  received_at timestamptz not null default now(),
  esp_ms bigint,
  uptime_min int,
  preheated boolean not null,
  label text,                           -- session label from i2aspo/<dev>/session, e.g. "nasi"
  hours real,                           -- storage hours from the session (-1 = not set)
  note text,
  counts int[] not null,                -- raw ADS1115 counts: mq2,mq3,mq4,mq5,mq6,mq7,mq8,mq135
  temp_c real,
  humidity real
);
create index if not exists readings_device_ts on readings (device, ts desc);

create table if not exists calibrations (
  id bigint generated always as identity primary key,
  device text not null,
  created_at timestamptz not null default now(),
  rs_air double precision[] not null    -- clean-air Rs/RL per channel
);
create index if not exists calibrations_device on calibrations (device, created_at desc);

-- Only the server (secret key) reads and writes; no public access.
alter table readings enable row level security;
alter table calibrations enable row level security;
