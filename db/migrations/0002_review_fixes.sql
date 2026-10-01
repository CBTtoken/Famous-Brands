-- Fixes from the first code review (1 October 2026).

-- S.O.S counts a checklist as due only from the day it was first put in use,
-- and keeps counting its past periods after it is retired.
alter table checklist_templates add column published_at timestamptz;
alter table checklist_templates add column retired_at timestamptz;
update checklist_templates set published_at = updated_at where status in ('published', 'retired') and published_at is null;
update checklist_templates set retired_at = updated_at where status = 'retired' and retired_at is null;

-- A notification being sent is claimed, so two senders never send it twice.
-- A claim older than two minutes is treated as abandoned and retried.
alter table notifications add column claimed_at timestamptz;
drop index if exists notifications_queue_idx;
create index notifications_queue_idx on notifications(status, created_at) where status in ('queued', 'sending');

-- Sign-in throttling reads recent failed attempts from the event log.
create index events_type_time_idx on events(type, created_at);

-- An answer takes a share lock on its checklist, so it waits for a submit in
-- progress and then sees it was submitted, rather than slipping in after.
create or replace function guard_answer() returns trigger language plpgsql as $$
declare s text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Answers cannot be deleted';
  end if;
  select status into s from checklist_runs where id = new.run_id for share;
  if s = 'submitted' then
    raise exception 'This checklist was submitted and cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.run_item_id <> old.run_item_id then
    raise exception 'An answer cannot move to another item';
  end if;
  return new;
end $$;
