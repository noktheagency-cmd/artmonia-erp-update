# Student attendance overview

The Students overview includes an attendance card and dialog, loaded through `src/modules/students/attendance-analytics-action.ts`. It is read-only and does not finalize sessions or write attendance.

- Both `student.read` and `attendance.read` are required. ASSIGNED student access restricts records to the student's manager; ASSIGNED attendance access restricts records to the teacher linked to the actor. These restrictions intersect. No shared cache is used.
- Default period: the current Baku calendar month through today. Custom periods are inclusive, at most 93 days, with no future dates. Comparison uses the immediately preceding equal number of calendar days.
- Source: ended, non-cancelled `SlotSession` rows, with date-effective schedule assignments and enrollments. Existing attendance's teacher takes precedence over the slot's current teacher; unmarked rows use the current slot teacher. Sessions without an identifiable teacher are excluded. Standalone legacy `Lesson` reservations are not attendance journal records and are not included.
- Historical frozen, reserved, stopped, declined and completed lifecycle periods and explicit student freeze periods are excluded. Freeze end dates and assignment end dates are inclusive. With no prior lifecycle event, assignment eligibility is used rather than applying today's status retroactively.
- Attendance percentage is PRESENT / (PRESENT + ABSENT), rounded to a whole percent; no denominator displays a dash. EXCUSED and unmarked records are counted separately. School totals are weighted by student-lessons. Automatic ABSENT marks remain absences.
- Expected participation counts all eligible student-lessons, including excused and unmarked. Completion is marked / expected. Incomplete lessons count distinct sessions with at least one unmarked eligible record.
- Risk means at least three consecutive latest ABSENT student-lessons with the same teacher within the selected period/filter. PRESENT, EXCUSED and unmarked lessons break the sequence. This is period-local, not an all-history risk score. Last attendance is also limited to the selected period.
- Teacher and group filters operate on the authorized report. Teacher drill-down shows group rates and student histories, with 20 students per page and a risk-only toggle. Student links use the existing protected profile route.
- The combined current and comparison query is capped at 20,001 rows. Above 20,000 it returns an explicit request to narrow the period instead of presenting incomplete totals.

Historical limitation: schedule assignments and slot teacher/name edits affect reconstruction when a historical attendance record does not exist. Lessons never materialized as slot sessions cannot be counted as missing journal records.

Regression coverage: `src/modules/students/attendance-analytics.test.ts`.
