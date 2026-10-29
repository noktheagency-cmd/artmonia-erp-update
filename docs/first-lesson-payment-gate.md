# First lesson payment eligibility

- A paid monthly admission awaiting its first participation cannot be marked present, absent or excused until its initial course sale is COMPLETE and recorded payments cover the initial fee by the lesson date (inclusive). Partial advances remain blocked. Free/gift packages and legacy admissions keep their existing exemption.
- The slot roster and attendance journal show “Ödəniş edilməyib”. Individual controls are disabled, bulk actions skip these rows, and the server rejects submitted marks even from stale or modified clients. Automatic finalization also skips unpaid first lessons.
- Eligibility is read from the database, never submitted by the browser. Related payment mutations must revalidate the planner as well as the student and finance views.
