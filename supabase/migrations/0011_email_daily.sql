-- 0011: the morning question by email. The question is the product, and a
-- question nobody sees is not asked: over three weeks the founder was written
-- twenty-four and read none, because Today only shows them to someone who
-- already opened it. On by default for that reason; one tap in the email or a
-- box in Settings turns it off.

alter table public.users
  add column email_daily boolean not null default true;

comment on column public.users.email_daily is
  'When true the morning question is also sent by email (lib/daily/email.ts). Off via Settings or the unsubscribe link.';
