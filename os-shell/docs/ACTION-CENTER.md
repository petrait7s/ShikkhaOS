# Unified Action Center

**Where:** bell in the menu bar (badge = item count; red if anything is urgent or needs action, grey if only informational), Spotlight → "Needs attention", and the Action Center desktop widget. On phones it is an app on the home grid.

**Who:** Registrar, Teacher, Student. Petra Admin does not get it: Petra must not see school task data.

## Sources (all existing repository calls, no new data)
| Item | Role | Source | Priority | Opens |
|---|---|---|---|---|
| Sign-up waiting | Registrar | `approval.pendingSignups()` | Needs action | Approvals |
| Ready to publish (class) | Registrar | `exam.matrix()` — every subject verified, not published | Urgent | Results Center → publish dialog |
| Review submitted sheets (one per class) | Registrar | `exam.matrix()` — cells `submitted` / `uploaded` | Needs action | Results Center → that cell's panel |
| Scheduled publication | Registrar | `exam.matrix()` publications | Info | Results Center |
| Returned for correction | Teacher | `marks.myCells()` with `returnComment`, state draft | Urgent | Marks Entry → that sheet |
| Enter marks | Teacher | `marks.myCells()` not started / draft | Needs action | Marks Entry → that sheet |
| Result published / scheduled | Student | `result.myExams()` | Needs action / Info | My Results |
| Unread notice (last 30 days) | Teacher, Student | `notice.list()` (`readBy`) | Pinned: needs action, else info | Notices → that notice |
| Updates | All school roles | `notice.notifications()` unread | Info | (mark read in place) |

The exam used for marks/results items is the same "current exam" the widgets use (`pickExam`: Annual, else the latest term exam).

## Behaviour
- Sorted by priority, then newest first. Filter by category, search by text.
- **Mark read** (notices, updates) writes through the repository. **Mark all read** does the same for every readable item.
- **Hide** is available for items that do not need a write (publish-ready, review, enter marks, results). Hidden items are stored per device under `dismissed` in the UI store, keyed by user and item id. Item ids include a version (e.g. last update time), so a sheet that changes again reappears. "Show N hidden" restores them.
- Items that represent required work and cannot be hidden: pending sign-ups, returned sheets.
- Duplicates: per-subject review items are grouped into one per class; the same task is not listed twice. Free-text notifications cannot be matched to tasks reliably, so they stay in their own "Updates" category.

## Limits (Phase 2)
- Notification read state is per role within a school (mock), not per user.
- Hidden items are per device, not synced.
- No push delivery; queries refresh on their existing intervals (matrix 30 s, notifications 20 s) and after mutations.
