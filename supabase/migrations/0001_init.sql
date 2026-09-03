-- Sofar — initial schema (SPEC §2)
-- Every table: user_id, created_at, updated_at, RLS user_id = auth.uid().
-- Service role (server functions only) bypasses RLS.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users (app profile; 1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.users (
  id                       uuid primary key references auth.users (id) on delete cascade,
  email                    text not null,
  book_name                text,
  pronoun                  text check (pronoun in ('he', 'she', 'they')),
  age                      int,
  birthplace               text,
  current_city             text,
  prior_cities             text[] not null default '{}',
  occupation               text,
  occupation_since         text,
  household                text,
  family_of_origin         text,
  timezone                 text not null default 'UTC',
  plan                     text not null default 'none' check (plan in ('trial', 'basic', 'full', 'none')),
  trial_ends_at            timestamptz,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  session_minutes_used     int not null default 0,
  session_minutes_reset_at timestamptz,
  style                    text not null default 'third' check (style in ('third', 'first')),
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null check (kind in ('onboarding', 'interview', 'daily', 'weekly')),
  started_at timestamptz,
  ended_at   timestamptz,
  minutes    numeric,
  status     text not null default 'active' check (status in ('active', 'processing', 'done', 'failed')),
  -- interviewer state machine: block, question_idx, followups_used, seconds_left
  state      jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- memory layer (before questions: questions.thread_id references memory_threads)
-- every row links to the answer and span it came from
-- ---------------------------------------------------------------------------

create table public.memory_threads (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users (id) on delete cascade,
  label                  text not null,
  description            text,
  mention_count          int not null default 1,
  first_seen_at          timestamptz,
  last_seen_at           timestamptz,
  status                 text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by_answer_id  uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- questions (user_id null = seed rows, readable by all authenticated users,
-- written only by the service role)
-- ---------------------------------------------------------------------------

create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.users (id) on delete cascade,
  kind               text not null check (kind in ('foundation', 'event', 'stance', 'rationale')),
  block              text check (block in ('0', '1', '2', '3', '4', 'daily', 'weekly')),
  text               text not null,
  source             text not null check (source in ('seed', 'generated', 'thread')),
  thread_id          uuid references public.memory_threads (id) on delete set null,
  asked_at           timestamptz,
  session_id         uuid references public.sessions (id) on delete set null,
  parent_question_id uuid references public.questions (id) on delete set null,
  order_idx          int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint seed_questions_have_no_user check (source <> 'seed' or user_id is null)
);

-- ---------------------------------------------------------------------------
-- answers (transcript column access goes through lib/repo.ts only — SPEC §7)
-- ---------------------------------------------------------------------------

create table public.answers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  session_id       uuid references public.sessions (id) on delete set null,
  question_id      uuid references public.questions (id) on delete set null,
  audio_path       text,
  transcript       text,
  segments         jsonb,
  duration_sec     numeric,
  input            text not null default 'voice' check (input in ('voice', 'text')),
  processed_at     timestamptz,
  audio_deleted_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.memory_threads
  add constraint memory_threads_resolved_by_answer_id_fkey
  foreign key (resolved_by_answer_id) references public.answers (id) on delete set null;

-- ---------------------------------------------------------------------------
-- rest of the memory layer
-- ---------------------------------------------------------------------------

create table public.memory_people (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  label           text not null,
  relationship    text,
  first_answer_id uuid references public.answers (id) on delete set null,
  quotes          jsonb not null default '[]',
  embedding       vector(1536),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.memory_places (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  label         text not null,
  when_text     text,
  what_happened text,
  answer_id     uuid references public.answers (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.memory_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  what       text not null,
  when_text  text,
  when_date  date,
  where_text text,
  who        uuid[] not null default '{}',
  outcome    text,
  answer_id  uuid references public.answers (id) on delete set null,
  span_start int,
  span_end   int,
  embedding  vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_stances (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  statement       text not null,
  rationale       text,
  origin_event_id uuid references public.memory_events (id) on delete set null,
  stated_at       timestamptz,
  answer_id       uuid references public.answers (id) on delete set null,
  superseded_by   uuid references public.memory_stances (id) on delete set null,
  embedding       vector(1536),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.memory_costs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  stance_id    uuid not null references public.memory_stances (id) on delete cascade,
  what_it_cost text not null,
  answer_id    uuid references public.answers (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.memory_voice (
  user_id    uuid primary key references public.users (id) on delete cascade,
  -- sentence_length, vocabulary, humor, avoids, repeats, self_reference
  profile    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- never enters any prompt unless allowed_in_book = true (SPEC §7)
create table public.memory_unsaid (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  answer_id       uuid references public.answers (id) on delete set null,
  text            text not null,
  allowed_in_book boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- never reaches prose; kept for follow-up questions only (SPEC §7)
create table public.memory_inferred (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null,
  content    text not null,
  answer_id  uuid references public.answers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- the book
-- ---------------------------------------------------------------------------

create table public.parts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  number     int not null,
  title      text not null,
  tension    text,
  status     text not null default 'provisional' check (status in ('provisional', 'proposed', 'canon')),
  order_idx  int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chapters (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  part_id           uuid references public.parts (id) on delete set null,
  number            int,
  title             text not null,
  kind              text not null default 'chapter' check (kind in ('prologue', 'chapter', 'interlude', 'sofar')),
  body_md           text not null,
  status            text not null default 'draft' check (status in ('draft', 'canon')),
  version           int not null default 1,
  model             text,
  source_answer_ids uuid[] not null default '{}',
  source_memory_ids uuid[] not null default '{}',
  word_count        int,
  canon_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.chapter_revisions (
  id                 uuid primary key default gen_random_uuid(),
  chapter_id         uuid not null references public.chapters (id) on delete cascade,
  user_id            uuid not null references public.users (id) on delete cascade,
  proposed_body_md   text not null,
  rationale          text not null,
  trigger_answer_ids uuid[] not null default '{}',
  status             text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined')),
  model              text,
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- marks, push, deletion
-- ---------------------------------------------------------------------------

create table public.marks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  key        text not null check (key in ('first_three', 'thirty_days', 'spine_found', 'hundred_pages', 'one_year')),
  earned_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.deletion_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  kind       text not null check (kind in ('audio', 'account')),
  run_after  timestamptz not null default now(),
  status     text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------

create index sessions_user_id_idx on public.sessions (user_id);
create index questions_user_id_idx on public.questions (user_id);
create index questions_session_id_idx on public.questions (session_id);
create index answers_user_id_idx on public.answers (user_id);
create index answers_session_id_idx on public.answers (session_id);
create index answers_audio_retention_idx on public.answers (created_at) where audio_path is not null and audio_deleted_at is null;
create index memory_people_user_id_idx on public.memory_people (user_id);
create index memory_places_user_id_idx on public.memory_places (user_id);
create index memory_events_user_id_idx on public.memory_events (user_id);
create index memory_stances_user_id_idx on public.memory_stances (user_id);
create index memory_costs_user_id_idx on public.memory_costs (user_id);
create index memory_threads_user_id_idx on public.memory_threads (user_id);
create index memory_unsaid_user_id_idx on public.memory_unsaid (user_id);
create index memory_inferred_user_id_idx on public.memory_inferred (user_id);
create index parts_user_id_idx on public.parts (user_id);
create index chapters_user_id_idx on public.chapters (user_id);
create index chapter_revisions_user_id_idx on public.chapter_revisions (user_id);
create index chapter_revisions_chapter_id_idx on public.chapter_revisions (chapter_id);
create index marks_user_id_idx on public.marks (user_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index deletion_jobs_user_id_idx on public.deletion_jobs (user_id);
create index deletion_jobs_due_idx on public.deletion_jobs (run_after) where status = 'pending';

-- embedding similarity (merge dedupe, SPEC §5.3)
create index memory_people_embedding_idx on public.memory_people using hnsw (embedding vector_cosine_ops);
create index memory_events_embedding_idx on public.memory_events using hnsw (embedding vector_cosine_ops);
create index memory_stances_embedding_idx on public.memory_stances using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- updated_at triggers + RLS on every table (SPEC §7 — non-negotiable)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'sessions', 'questions', 'answers',
    'memory_people', 'memory_places', 'memory_events', 'memory_stances',
    'memory_costs', 'memory_threads', 'memory_voice', 'memory_unsaid',
    'memory_inferred', 'parts', 'chapters', 'chapter_revisions',
    'marks', 'push_subscriptions', 'deletion_jobs'
  ]
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- own-row policies; users/memory_voice key on their own pk-equivalent below
  foreach t in array array[
    'sessions', 'questions', 'answers',
    'memory_people', 'memory_places', 'memory_events', 'memory_stances',
    'memory_costs', 'memory_threads', 'memory_unsaid',
    'memory_inferred', 'parts', 'chapters', 'chapter_revisions',
    'marks', 'push_subscriptions', 'deletion_jobs'
  ]
  loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete_own', t);
  end loop;
end;
$$;

-- users / memory_voice: keyed on id / user_id = auth.uid(); no self-service
-- insert or delete (rows are created by server functions, removed by
-- deletion jobs — both via the service role).
create policy users_select_own on public.users for select to authenticated using (id = auth.uid());
create policy users_update_own on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy memory_voice_select_own on public.memory_voice for select to authenticated using (user_id = auth.uid());
create policy memory_voice_update_own on public.memory_voice for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- questions: seed rows (user_id is null) are readable by everyone signed in;
-- replace the generated own-row select policy with one that includes them.
drop policy questions_select_own on public.questions;
create policy questions_select_own_or_seed on public.questions
  for select to authenticated
  using (user_id = auth.uid() or (user_id is null and source = 'seed'));

-- seed rows are service-role-only for writes: the own-row insert/update/delete
-- policies above never match user_id is null, which is exactly what we want.
