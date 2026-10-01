-- S.O.S Shop Operational Status, initial schema.
--
-- Every schema change is a new numbered file in db/migrations. Never edit a
-- migration that has already run anywhere; add a new one instead.
--
-- Time: every server timestamp is timestamptz, stamped by the database, never
-- by the phone. Where a phone time is useful (offline capture) it is stored
-- next to the server time as client_*, and never replaces it.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Organisations, people, access
-- ---------------------------------------------------------------------------

create type tier as enum ('critical', 'urgent', 'important', 'be_aware');
create type member_role as enum ('admin', 'area_manager', 'shop_manager', 'supervisor');

-- An organisation is one franchisee group: an owner and their stores. Nobody
-- in one organisation can see anything belonging to another.
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Which tier an automatic alert carries. Admin can change these from the
  -- notification screen. Null means "record it, but do not alert anyone".
  checkin_mismatch_tier tier default 'important',
  stock_broken_tier tier default 'important',
  stock_stolen_tier tier default 'urgent',
  stock_worn_tier tier default 'be_aware',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  email citext unique,
  phone text unique,
  password_hash text not null,
  -- Platform admin is DigitalFlyer or a Famous Brands operations contact:
  -- can create organisations and see across them.
  is_platform_admin boolean not null default false,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions(user_id);

create table memberships (
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table stores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  brand text,
  address text,
  latitude double precision,
  longitude double precision,
  -- How far from the store's pin a check-in still counts as "at the store".
  geofence_m integer not null default 150 check (geofence_m between 25 and 5000),
  -- Public internet addresses of the store's own connection, as the server
  -- sees them. Recorded and compared at check-in, never read off the phone.
  known_ips text[] not null default '{}',
  -- flag: record a mismatch and alert, never stop the shift (the default).
  -- block: refuse the check-in when location or connection does not match.
  checkin_mode text not null default 'flag' check (checkin_mode in ('flag', 'block')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- Who covers which store. Admins see every store in their organisation
-- without needing a row here; everybody else sees only these.
create table store_assignments (
  user_id uuid not null references users(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  -- Ordering authority: may approve a reorder for this store.
  can_order boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);
create index store_assignments_store_idx on store_assignments(store_id);

-- Keys for other systems (Munch, Aura, OPUS, reporting tools) to call the API.
-- A key acts with a role inside one organisation and is stored only as a hash.
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  role member_role not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Module 1: checklists
-- ---------------------------------------------------------------------------

create type cadence as enum ('daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'as_needed');
create type answer_type as enum ('tick', 'number', 'photo', 'date', 'time', 'text');
create type photo_rule as enum ('never', 'always', 'on_exception');

create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- What it checks: "Opening checks", "Health and safety". Free text so the
  -- categories that emerge in the field are the ones people actually use.
  category text not null default 'General',
  cadence cadence not null default 'daily',
  -- Expected done by this time of day (store time). Late work is flagged.
  due_by time,
  -- Which roles are asked to do it.
  roles member_role[] not null default '{supervisor}',
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checklist_templates_org_idx on checklist_templates(org_id);

-- Which stores a template applies to. No rows means every store in the org.
create table template_stores (
  template_id uuid not null references checklist_templates(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  primary key (template_id, store_id)
);

create table template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  position integer not null,
  label text not null check (length(trim(label)) > 0),
  help_text text,
  answer_type answer_type not null,
  -- Null means the item never raises an alert on its own.
  tier tier,
  unit text,
  min_value numeric,
  max_value numeric,
  -- True while the client has not given us the acceptable range. The item is
  -- recorded but never judged in or out of range until somebody confirms it.
  range_unconfirmed boolean not null default false,
  photo_rule photo_rule not null default 'never',
  -- Date items. 'expiry': warn when the date is this many days away or past
  -- (licences, service dates). 'max_age': flag when the date is more than
  -- this many days ago (last pest control visit, last hygiene log entry).
  date_mode text not null default 'expiry' check (date_mode in ('expiry', 'max_age')),
  date_warn_days integer,
  -- Time items: flag anything later than this (opened by 09:00).
  latest_time time,
  -- Retired items stop appearing on new checklists. They are never deleted,
  -- because past records point at them.
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  check (min_value is null or max_value is null or min_value <= max_value)
);
create index template_items_template_idx on template_items(template_id, position);

-- A visit is a person at a store: check in to check out. The check-in is the
-- geo-timestamp of the shift starting.
create table visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid not null references stores(id),
  user_id uuid not null references users(id),
  started_at timestamptz not null default now(),
  client_started_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  start_accuracy_m double precision,
  start_ip text,
  -- ok / outside / no_fix / store_has_no_location
  start_location_check text not null,
  -- match / mismatch / store_has_no_ip
  start_ip_check text not null,
  start_distance_m double precision,
  mismatch_reason text,
  ended_at timestamptz,
  client_ended_at timestamptz,
  end_lat double precision,
  end_lng double precision,
  end_accuracy_m double precision,
  end_ip text,
  end_location_check text,
  end_ip_check text,
  end_distance_m double precision
);
create index visits_store_idx on visits(store_id, started_at desc);
create index visits_user_idx on visits(user_id, started_at desc);

create table checklist_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid not null references stores(id),
  template_id uuid not null references checklist_templates(id),
  visit_id uuid references visits(id),
  user_id uuid not null references users(id),
  -- Which day / week / month this run covers, e.g. 2026-10-01, 2026-W40.
  period_key text not null,
  template_name text not null,
  cadence cadence not null,
  due_by time,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
-- One run per store, checklist and period, so two phones cannot start the
-- same daily checklist twice. "As needed" checklists are exempt.
create unique index checklist_runs_period_uq on checklist_runs(template_id, store_id, period_key)
  where cadence <> 'as_needed';
create index checklist_runs_store_idx on checklist_runs(store_id, started_at desc);

-- A frozen copy of each item at the moment the run started, so editing a
-- template later never changes what an old record says was asked.
create table run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references checklist_runs(id) on delete restrict,
  template_item_id uuid references template_items(id),
  position integer not null,
  label text not null,
  help_text text,
  answer_type answer_type not null,
  tier tier,
  unit text,
  min_value numeric,
  max_value numeric,
  range_unconfirmed boolean not null default false,
  photo_rule photo_rule not null,
  date_mode text not null default 'expiry',
  date_warn_days integer,
  latest_time time
);
create index run_items_run_idx on run_items(run_id, position);

create table photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid not null references stores(id),
  -- Generated on the phone so a retried upload after lost signal is stored once.
  client_id uuid not null unique,
  storage_key text not null unique,
  sha256 text not null,
  bytes integer not null,
  mime text not null,
  width integer,
  height integer,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  client_captured_at timestamptz,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index photos_store_idx on photos(store_id, created_at desc);

create table answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references checklist_runs(id) on delete restrict,
  run_item_id uuid not null unique references run_items(id) on delete restrict,
  user_id uuid not null references users(id),
  value_bool boolean,
  value_number numeric,
  value_text text,
  value_date date,
  value_time time,
  note text,
  photo_id uuid references photos(id),
  is_exception boolean not null default false,
  exception_reason text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  client_captured_at timestamptz,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index answers_run_idx on answers(run_id);

-- ---------------------------------------------------------------------------
-- Module 2: stock and shop condition (physical items, never food)
-- ---------------------------------------------------------------------------

create type item_condition as enum ('fine', 'broken', 'stolen', 'worn');

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  phone text,
  email citext,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table catalogue_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  code text,
  name text not null check (length(trim(name)) > 0),
  category text not null default 'General',
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0),
  -- Where the price came from, e.g. "Catercare order form, October 2025".
  price_source text,
  default_supplier_id uuid references suppliers(id) on delete set null,
  -- Franchise-locked items may only come from the franchise's own supplier.
  -- Unknown until the client confirms, see Supplier-Findings open item 1.
  franchise_locked text not null default 'unknown' check (franchise_locked in ('yes', 'no', 'unknown')),
  -- Quantity on the standard starter list for a new shop.
  standard_qty integer check (standard_qty is null or standard_qty >= 0),
  -- For safety items with a service or expiry interval (fire extinguishers).
  service_interval_days integer,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index catalogue_items_org_idx on catalogue_items(org_id, category, name);

create table store_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  catalogue_item_id uuid not null references catalogue_items(id) on delete restrict,
  -- Where in the shop: front, kitchen, back, outside.
  area text not null default 'kitchen',
  -- How many the shop should have.
  par_qty integer not null default 1 check (par_qty >= 0),
  -- Store owner's choice of supplier for this item at this shop. Null means
  -- use the catalogue default.
  supplier_id uuid references suppliers(id) on delete set null,
  next_service_date date,
  created_at timestamptz not null default now(),
  unique (store_id, catalogue_item_id)
);

-- A condition walk is a full pass over a shop's items, saved item by item.
create table condition_walks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid not null references stores(id),
  visit_id uuid references visits(id),
  user_id uuid not null references users(id),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table condition_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid not null references stores(id),
  store_item_id uuid not null references store_items(id) on delete restrict,
  walk_id uuid references condition_walks(id),
  visit_id uuid references visits(id),
  condition item_condition not null,
  qty integer not null default 1 check (qty >= 0),
  note text,
  photo_id uuid references photos(id),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  client_captured_at timestamptz,
  reported_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  -- Set when the problem is dealt with (replaced, found, repaired).
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  resolution_note text,
  check (condition <> 'fine' or resolved_at is null)
);
create unique index condition_reports_walk_item_uq on condition_reports(walk_id, store_item_id) where walk_id is not null;
create index condition_reports_store_idx on condition_reports(store_id, created_at desc);

create table reorder_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid not null references stores(id),
  store_item_id uuid not null references store_items(id) on delete restrict,
  supplier_id uuid references suppliers(id),
  qty integer not null check (qty > 0),
  -- Price at the time of the suggestion, so a later price change does not
  -- rewrite what was shown to the person who approved it.
  unit_price_cents integer,
  reason text not null check (reason in ('starter', 'broken', 'stolen', 'worn', 'top_up')),
  source_report_id uuid references condition_reports(id),
  status text not null default 'open' check (status in ('open', 'ordered', 'dismissed')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_note text
);
create index reorder_suggestions_store_idx on reorder_suggestions(store_id, status);

-- ---------------------------------------------------------------------------
-- Alerts and notifications
-- ---------------------------------------------------------------------------

create table alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  store_id uuid references stores(id),
  tier tier,
  kind text not null,
  title text not null,
  body text not null,
  source_type text not null,
  source_id uuid not null,
  link text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  acknowledged_by uuid references users(id),
  acknowledged_at timestamptz
);
create index alerts_org_idx on alerts(org_id, created_at desc);

-- Who hears about which tier. Either everybody in a role (limited to the
-- stores they cover, admins see all) or one named person.
create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  tier tier not null,
  recipient_role member_role,
  recipient_user_id uuid references users(id) on delete cascade,
  push boolean not null default true,
  created_at timestamptz not null default now(),
  check ((recipient_role is null) <> (recipient_user_id is null))
);
create index notification_rules_org_idx on notification_rules(org_id, tier);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions(user_id);

-- The notification queue. One row per person per alert. Every attempt to a
-- device is written to push_deliveries with the push service's own answer,
-- so "the push went out" is a record, not an assumption.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  channel text not null default 'push' check (channel in ('push', 'in_app')),
  -- queued / sent / failed / no_device
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  unique (alert_id, user_id, channel)
);
create index notifications_queue_idx on notifications(status, created_at) where status = 'queued';
create index notifications_user_idx on notifications(user_id, created_at desc);

create table push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  ok boolean not null,
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Event log: the audit trail, and the feed other systems read from
-- ---------------------------------------------------------------------------

create table events (
  id bigserial primary key,
  org_id uuid references organisations(id),
  actor_user_id uuid references users(id),
  actor_api_key_id uuid references api_keys(id),
  type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_org_idx on events(org_id, id);

-- ---------------------------------------------------------------------------
-- Nothing recorded can be edited after the fact
-- ---------------------------------------------------------------------------

create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Records in % cannot be changed or deleted', tg_table_name;
end $$;

create trigger events_append_only before update or delete on events
  for each row execute function forbid_change();
create trigger photos_append_only before update or delete on photos
  for each row execute function forbid_change();
create trigger run_items_append_only before update or delete on run_items
  for each row execute function forbid_change();

-- Answers can change while the checklist is still open, never after it is
-- submitted, and never deleted.
create function guard_answer() returns trigger language plpgsql as $$
declare s text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Answers cannot be deleted';
  end if;
  select status into s from checklist_runs where id = new.run_id;
  if s = 'submitted' then
    raise exception 'This checklist was submitted and cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.run_item_id <> old.run_item_id then
    raise exception 'An answer cannot move to another item';
  end if;
  return new;
end $$;
create trigger answers_guard before insert or update or delete on answers
  for each row execute function guard_answer();

-- A run can only move forward: in_progress to submitted. Never deleted,
-- never reopened, and its identity never changes.
create function guard_run() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Checklists cannot be deleted';
  end if;
  if old.status = 'submitted' then
    raise exception 'This checklist was submitted and cannot be changed';
  end if;
  if new.store_id <> old.store_id or new.template_id <> old.template_id
     or new.user_id <> old.user_id or new.period_key <> old.period_key
     or new.started_at <> old.started_at then
    raise exception 'Checklist details cannot be changed';
  end if;
  return new;
end $$;
create trigger checklist_runs_guard before update or delete on checklist_runs
  for each row execute function guard_run();

-- Visits: the check-in is fixed once written. Only the check-out fields can
-- be filled in, once.
create function guard_visit() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Visits cannot be deleted';
  end if;
  if old.ended_at is not null then
    raise exception 'This visit is closed and cannot be changed';
  end if;
  if new.started_at <> old.started_at or new.store_id <> old.store_id
     or new.user_id <> old.user_id
     or new.start_lat is distinct from old.start_lat
     or new.start_lng is distinct from old.start_lng
     or new.start_ip is distinct from old.start_ip
     or new.start_location_check <> old.start_location_check
     or new.start_ip_check <> old.start_ip_check then
    raise exception 'Check-in details cannot be changed';
  end if;
  return new;
end $$;
create trigger visits_guard before update or delete on visits
  for each row execute function guard_visit();

-- Condition reports: only the resolution can be added, once.
create function guard_condition_report() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Condition reports cannot be deleted';
  end if;
  if old.resolved_at is not null then
    raise exception 'This report is already resolved';
  end if;
  if new.condition <> old.condition or new.qty <> old.qty
     or new.store_item_id <> old.store_item_id or new.reported_by <> old.reported_by
     or new.created_at <> old.created_at
     or new.photo_id is distinct from old.photo_id
     or new.note is distinct from old.note then
    raise exception 'Condition report details cannot be changed';
  end if;
  return new;
end $$;
create trigger condition_reports_guard before update or delete on condition_reports
  for each row execute function guard_condition_report();
