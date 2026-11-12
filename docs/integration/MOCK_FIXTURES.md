# Demo data (`shikkhaos-api seed-demo`, dev/test only)

Guard: refuses to run unless `ALLOW_DEMO_SEED=true`. All demo accounts use the password `Demo@Pass2026` (never use outside development).

| Username | Role | Notes |
|---|---|---|
| `headmaster` | HEADMASTER | |
| `registrar` | REGISTRAR | |
| `teacher.rahim` | TEACHER | Mathematics for Class 6 A and B; class teacher of 6-A |
| `teacher.salma` | TEACHER | English and Bangla for Class 6 A and B |
| `student.ayesha`, `student.farhan`, `student.nusrat`, `student.tahmid`, `student.rafi` | STUDENT | Class 6-A (IDs `S-2026-001..005`) |
| `student.mitu`, `student.sabbir`, `student.tania` | STUDENT | Class 6-B (IDs `S-2026-006..008`) |

Data: session 2026 (current), Class 6 with sections A/B (capacity 40), subjects MATH/ENG/BAN (100/33), class groups synced from enrollment, announcements + staff channels.
Production: create the first Headmaster with `shikkhaos-api bootstrap-admin <username>` (prints a one-time temporary password).
