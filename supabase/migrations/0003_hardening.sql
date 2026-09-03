-- Advisor fixes (security lints 0011, 0014):
-- pin the trigger function's search_path; keep extensions out of public.

alter function public.set_updated_at() set search_path = '';

create schema if not exists extensions;
alter extension vector set schema extensions;
