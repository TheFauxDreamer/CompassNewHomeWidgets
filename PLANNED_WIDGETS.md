# Planned widgets

This file lists ideas for new widgets. No widget in this list is built yet.
Before we build a widget, we must confirm that Compass supplies the necessary data.
To confirm this, record a HAR file of the related Compass page (see "Record a HAR file" below).

When a widget is built, move it to the "Widgets and features" section of README.md and remove it from this file.

## Status

- **Known data**: the widget can use data that the extension already gets from Compass.
- **HAR necessary**: we must record a HAR file to find the Compass request and its fields.

## Quick wins (known data)

| Widget | What it shows | Data |
| --- | --- | --- |
| **Unexplained absences today** | The students with a U, W or P code, or with no mark after the roll, in groups by year group. The office can then contact the families. | The attendance grid in `attendance.js`. The query must also get the student names. A HAR file must confirm the name field. |
| **Attendance trend** | A small line chart of the whole-school % present for the last 10 sessions (this week and last week). It uses the year-group filter. | The same two weeks of data that `attendance.js` already gets. |
| **Attendance watchlist** | The students with less than 90% (or less than 80%) attendance for the term, by year group. | Many weeks of the attendance grid (slow), or a term summary request. HAR necessary: Attendance > Reports, or the attendance summary of a student. |

## High value (HAR necessary)

| Widget | What it shows | Compass page for the HAR file |
| --- | --- | --- |
| **Sick bay today** | The students in the sick bay now and today, with the time and the status. Entries that are not resolved show first. | Chronicle > Sickbay, for today. |
| **Chronicle approvals** | The Chronicle entries that wait for the approval of the user. The Recent Chronicle widget already shows the list of entries. | Known request: `ChronicleV2.svc/GetEntriesRequiringMyApproval`. A HAR file with an entry that waits for approval must confirm the fields. |
| **Upcoming events and consent** | The excursions in the next 14 days, with the consent count (for example 18/24) and the payment count (for example 20/24). | Organise > Events, and the attendee or consent tab of one event. |

## Other ideas (lower priority or seasonal)

| Widget | What it shows | Compass page for the HAR file |
| --- | --- | --- |
| **Room changes today** | The room swaps that change the classes of today. | Organise > Room Swap. |
| **My bookings** | The resource bookings of today, for example laptop trolleys and rooms. | Resource Bookings. |
| **Learning tasks to mark** | The tasks with submissions that are not marked, and the next due dates. | Learning Tasks, for one class. |
| **Report writing progress** | The report completion % for each teacher or class. Use it only in the report period. | Reports > the progress page of the report cycle. |
| **Conference bookings** | The next parent-teacher interviews of the user. | Conferences. |
| **Staff on site** | The staff sign-ins from Time Card, for emergencies. | Time Card, or the staff kiosk log. |
| **Open maintenance issues** | The Issue Tracker items that the user reported or must do. | Issue Tracker. |
| **Birthdays today** | The students in the classes of the user who have a birthday today. | The profile of one student, to find if the date of birth is available. |

## Additions to the Compass widgets

These ideas change the Compass widgets, as the Term Calendar dots do:

- **Schedule widget**: highlight relief classes, room changes and rolls that are not marked in the "My Schedule" widget of Compass.
- **News feed**: show a badge on posts that wait for approval.

## Additions to the extension widgets

- **Unmarked Rolls: email staff button.** Add the Compass "Email staff with unmarked rolls" action to the Unmarked Rolls widget, so the user does not have to open Attendance > Unmarked Rolls.
  - HAR necessary: on Attendance > Unmarked Rolls, record the request that the button sends. **Caution:** the button sends real emails, so click it only when the emails are necessary. Right-click the request, then select **Copy > Copy as fetch**.
  - Find out: whether Compass shows a dialog before it sends (subject, message or a list of staff), and whether it emails all staff with unmarked rolls or only the rolls that the tab's filters show.
  - Plan: an email button in the widget header, next to the refresh button (not in the layout-editor preview). A confirmation step shows the counts, for example "Email 7 teachers about 12 unmarked rolls?". Before it sends, the widget loads the list again so the counts are correct. If the request can select rolls, send only the rolls that the widget shows (the 10-minute grace time and the year-group filter), but confirm this first. Show the result in the footer, then refresh the list. Update README.md.

## Rules for each new widget

- Add the widget to the `CARDS` list in `homepage.js`. This gives the widget the move and hide actions in the layout editor.
- Use the `mount(host, { preview })` function that returns `{ refresh, stop }`. Use `unmarked.js` or `movements.js` as the model.
- For year groups, use `CompassYears.filter` from `years.js`. Give each widget its own storage key.
- Keep the card at the same height in all states: loading, data, error, and with the filter open.
- Show student names only when the purpose of the widget needs them.
- Update README.md when you add the widget.

## Record a HAR file

**Caution:** A HAR file contains student data and your login cookies. Use a test school where possible. Do not put HAR files in this repository.

1. Open the Compass page from the tables above.
2. Open the browser DevTools, select the **Network** tab, then select **Preserve log**.
3. Refresh the page, then do the action (for example, select today, or open one event).
4. Right-click the list of requests, then select **Save all as HAR with content**.
