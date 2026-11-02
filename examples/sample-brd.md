# Business Requirements Document (BRD)

## Project: Parent Absence Notification

**Organisation:** SAMS – School Attendance Management System
**Version:** 1.0
**Date:** 20 October 2026
**Business Owner:** Head of Student Affairs

---

## 1. Background

Teachers already record daily attendance in SAMS (web and QR-code check-in). Today, when a student is absent, the school office phones parents manually. This takes about two hours every morning, many parents are not reached, and there is no record of who was contacted.

## 2. Business Objectives

- BO-1: Inform parents the same morning when their child is marked absent or late.
- BO-2: Reduce manual phone calls by the office by at least 80%.
- BO-3: Keep a record of every notification for audits and parent disputes.
- BO-4: Let parents explain an absence (submit a reason) without calling the school.

## 3. Stakeholders

| Stakeholder | Interest |
|---|---|
| Parents / guardians | Know quickly when the child is absent; submit reasons |
| Teachers | Record attendance once; see absence reasons |
| School office staff | Fewer calls; follow up only on unanswered cases |
| School administrator | Configure rules, templates and cut-off times |
| Head of Student Affairs | Reports on absence trends and parent response |

## 4. Business Requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-01 | When a student is marked Absent after the morning cut-off time (configurable, default 08:30), the system notifies each linked parent. | Must |
| BR-02 | Late arrivals (status Late) also notify parents, if the school enables it. | Should |
| BR-03 | Notifications are sent by email and in-app (parent portal). SMS is a later phase. | Must |
| BR-04 | If a teacher corrects the record to Present within 30 minutes, a correction message is sent. | Must |
| BR-05 | A parent can submit an absence reason (sick, family, other + text, optional attachment) from the notification link. | Must |
| BR-06 | Teachers and office staff can see the reason next to the attendance record. | Must |
| BR-07 | Office staff see a follow-up list of absences with no parent response by 11:00. | Should |
| BR-08 | Administrators can edit message templates in English and Khmer. | Must |
| BR-09 | Parents can choose which channels they receive (email, in-app) but cannot switch off all channels. | Should |
| BR-10 | The system keeps a log of every notification: recipient, channel, time, delivery status. | Must |
| BR-11 | A monthly report shows absence counts, notification delivery rate and parent response rate by class. | Should |

## 5. Constraints and Assumptions

- Must reuse the existing SAMS backend (Node.js / Express / PostgreSQL) and existing user, student, class and attendance data.
- Email is sent through the existing SendGrid account.
- Student–parent links already exist for most students; some records are missing.
- About 2,500 students, 4,000 parents; peak of 300 absences on a bad morning.
- Personal data must follow the school's data-protection policy; notification logs kept for one academic year.

## 6. Out of Scope

- SMS and Telegram notifications (phase 2).
- Automatic absence prediction.
- Changes to how teachers take attendance.

## 7. Success Measures

- 95% of absence notifications delivered within 10 minutes of cut-off.
- Office phone calls reduced by 80% within one term.
- 60% of absences have a parent reason within the same school day.
