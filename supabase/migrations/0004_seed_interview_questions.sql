-- Seed bank: onboarding interview questions Q1-Q12, verbatim from
-- sofar-phase0-interview.md §3 (founder-supplied — SPEC §4).
-- user_id is null = seed row (readable by all authenticated users, written
-- only by the service role). Block 0 is a typed form (SPEC §3.2), not seeded.
-- Scripted follow-ups are NOT seeded: follow-ups are generated at interview
-- time and must quote the user's words (SPEC §4); the §3 follow-up templates
-- reach the interviewer through its prompt context in M2.
-- kind values are an implementation classification of the founder questions;
-- the question text itself is untouched.
-- Q12 carries block '4' and order_idx 12; the state machine treats it as the
-- announced last question by position (SPEC §4).

insert into public.questions (user_id, kind, block, text, source, order_idx) values
  (null, 'event', '1', 'Walk me through yesterday. From the moment you woke up to the moment you fell asleep. Not a typical day — yesterday.', 'seed', 1),
  (null, 'event', '1', 'What''s the thing you keep coming back to this week — the thought that shows up when you''re driving or in the shower?', 'seed', 2),
  (null, 'event', '1', 'Who did you talk to most this week, and what was the last thing you talked about?', 'seed', 3),
  (null, 'event', '2', 'What''s the most recent decision that changed how your days look? Not the biggest — the most recent. When exactly did you make it?', 'seed', 4),
  (null, 'event', '2', 'Who did you tell first? What did you leave out when you told them?', 'seed', 5),
  (null, 'event', '2', 'What did you think would happen, and what actually happened?', 'seed', 6),
  (null, 'stance', '3', 'Tell me something you''re sure about that most people around you aren''t.', 'seed', 7),
  (null, 'event', '3', 'When did you first know that? Where were you, and what had just happened?', 'seed', 8),
  (null, 'rationale', '3', 'What has believing that cost you? A job, a relationship, a conversation you didn''t have.', 'seed', 9),
  (null, 'event', '4', 'What''s the earliest memory that connects to what you just told me?', 'seed', 10),
  (null, 'rationale', '4', 'Who in your life would tell that story differently?', 'seed', 11),
  (null, 'stance', '4', 'What''s one thing that belongs in this book that you''ve never said out loud? You can skip this one.', 'seed', 12);
