create table erp.program_lesson_topics (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references erp.programs(id) on delete cascade,
  sequence integer not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_lesson_topics_program_sequence_key unique (program_id, sequence),
  constraint program_lesson_topics_sequence_check check (sequence between 1 and 120),
  constraint program_lesson_topics_title_length_check check (char_length(trim(title)) between 2 and 200)
);

update erp.enrollments
set lessons_per_month = null
where lessons_per_month = 0;

revoke all on table erp.program_lesson_topics from anon, authenticated;
