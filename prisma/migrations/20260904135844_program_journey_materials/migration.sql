create type erp."ProgramLessonTrack" as enum ('H', 'HB', 'B', '2B');

alter table erp.program_lesson_topics
  drop constraint program_lesson_topics_program_sequence_key,
  add constraint program_lesson_topics_program_sequence_key
    unique (program_id, sequence) deferrable initially immediate;

create table erp.program_lesson_materials (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references erp.program_lesson_topics(id) on delete cascade,
  track erp."ProgramLessonTrack" not null,
  subject text not null,
  objective text not null,
  homework text not null,
  image_object_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_lesson_materials_topic_track_key unique (topic_id, track),
  constraint program_lesson_materials_subject_length_check
    check (char_length(trim(subject)) between 2 and 200),
  constraint program_lesson_materials_objective_length_check
    check (char_length(trim(objective)) between 2 and 1000),
  constraint program_lesson_materials_homework_length_check
    check (char_length(trim(homework)) between 2 and 2000),
  constraint program_lesson_materials_image_path_check
    check (
      image_object_path is null
      or image_object_path ~ '^program-journey/[0-9a-f-]{36}/(?:H|HB|B|2B)/[0-9a-f-]{36}\.(?:jpg|png|webp)$'
    )
);

create index program_lesson_materials_topic_id_idx
  on erp.program_lesson_materials(topic_id);

alter table erp.program_lesson_materials enable row level security;
revoke all on table erp.program_lesson_materials from anon, authenticated;
