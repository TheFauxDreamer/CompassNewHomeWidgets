# Compass Homepage Widgets

Compass Homepage Widgets is a browser extension for Compass (compass.education).
It adds live widgets to the Compass homepage, and it adds features to some Compass widgets.
The extension uses your current Compass login. It does not send Compass data to other services.
Only the Weather widget uses another service: it gets public weather data from the Bureau of Meteorology (see below).

## Widgets and features

### Attendance

This widget shows a pie chart of the attendance for the most recent roll session.

- The chart shows five groups: Present, Excursion, Approved absence, Unapproved absence and Not marked.
- The colours are safe for users with colour blindness. The Unapproved absence group also has stripes.
- Click **Groups** to show one slice for each group. Click **Codes** to show one slice for each Compass attendance code.
- Click the **(i)** button to see your school's Compass codes in each group.
- The line above the chart shows the counted students and the enrolled students, for example "AM roll · 475 of 530 enrolled".
  The enrolled students are the active students in the selected year groups or Custom Groups.
  Put the pointer on the line to see why some students are not counted: a code that means they are not expected at school (for example, Q), no record for the session (for example, kindy on their days off), or a code that the extension doesn't know.
  The chart and its percentages show the counted students.
- The chip below the title shows the year groups in the chart. Click the chip to change the year groups.
- The widget refreshes every 15 minutes. Click the refresh button to refresh it immediately.

The widget selects the session automatically:

- On a school day, the widget shows the AM roll. When more than 100 students have a PM code, the widget shows the PM roll.
- On other days, the widget shows the most recent session that has marked students.

For today's session, the widget also checks the unmarked rolls that have started. The students in those rolls count as **Not marked**, even when the Compass half-day grid already shows a code for them.
The widget opens each unmarked roll to find its students, so a day with many unmarked rolls takes a little longer to load.

Students who don't come every day (for example, kindy) are counted only on their own days. On their other days Compass has no attendance record for them, so they aren't in the chart and they don't count as **Not marked**. This needs no setting.

#### Count by period (optional)

Compass has attendance by period only class by class. To count the current period from every class roll:

1. Click the **(i)** button on the Attendance widget.
2. Under **Count attendance**, select **By period, from each class roll**.

The chart then follows the period structure: it shows the period that is on now, or the last period that finished today, for example "Period 3 · 42 class rolls · 610 students". The date and the time of the last update show at the bottom of the chart.
Before the first period, and on days with no school, the chart shows the AM or PM roll and says why.
Students who are not in a class in that period are not counted.

This setting opens every class roll on each refresh (one request for each class), so it loads more slowly, especially in a large school.
It uses the class list from Schedule Builder and the period structure from Compass. If your Compass account can't see these, the chart shows the AM or PM roll.
To go back, select **By the AM or PM roll**.


### Attendance Today

This widget shows the attendance across the school day, on one time axis. A red line marks the current time.
Click **Periods** or **On site** to change the graph. The browser keeps your choice.

- **Periods** shows one bar for each period of the Compass period structure (AM and PM in many primary schools).
  Each bar shows Present, Excursion, Approved absence, Unapproved absence and Not marked, with the same colours as the Attendance widget.
  The white number in a bar is the percentage present. Periods that haven't started show as dashed outlines.
  The line above the graph shows the latest period, the counted and enrolled students (for example "AM · 475 of 530 enrolled · 92% present"). Put the pointer on it to see why some students are not counted.
- **On site** shows the percentage of students at school through the day. The line starts from the first roll,
  goes up when a late student arrives and goes down when a student leaves early (from Arrivals & Departures). Students on an excursion are not on site.
  Click **By year** (at the start of the legend) to also show one coloured line for each year group. Each year group's line is the percentage of that year group on site.
  The dark line is the total. The legend shows each year group's percentage now. Put the pointer on the graph to see every year group at that time.
  The colours stay the same for each year group, also when you change the filter. The graph shows up to eight year groups. Click **Total** to show only the total.
- Put the pointer on a bar or on the line to see the numbers. The legend shows the counts for the latest period.
- The chip below the title shows the year groups or the Custom Groups. Click the chip to change the selection.
- The widget shows counts only. It never shows a student's name.
- The widget refreshes every 15 minutes. Click the refresh button to refresh it immediately.

Where the data comes from:

- With an AM/PM period structure, the widget uses the Compass half-day grid (one request), and the students in unmarked rolls count as **Not marked**.
- With more periods, the widget opens the class roll of every class for each period that has started, so it loads more slowly.
  A circle with a count shows the progress. Rolls that are fully marked are kept until you reload the page, so a refresh opens only the rolls that can still change.
  This uses the class list from Schedule Builder. If your Compass account can't see it, the widget shows an error.

### Attendance Trend

This widget shows the percentage present for each roll session (AM and PM) of this week and last week, as one line, oldest to newest.

- Each point is one session. Put the pointer on a point to see the session, the percentage and the numbers, for example "Tue 14 Oct · AM · 92% present (440 of 478)".
- The line above the graph shows the latest session and the change from the session before, for example "▲2 pts from AM".
- Under the graph, each day shows its weekday and date. A dashed line shows where a new week starts.
- The graph shows a session after it has marks. Today's PM shows when more than 100 students have a PM mark, as in the Attendance widget.
- The percentage is the Present group of the counted students, the same as the Attendance Today bars.
- The chip below the title shows the year groups or the Custom Groups. Click the chip to change the selection.
- The widget refreshes every hour. Click the refresh button to refresh it immediately.

### Unmarked Rolls

This widget shows today's rolls that are not marked.

- A roll shows in the list 10 minutes after it starts. This gives the teacher time to mark the roll.
- Click **Teacher** to sort the rolls by teacher. Click **Time** to sort the rolls by start time. Click **Year** to sort the rolls by year group.
- When a relief teacher has the class, the list shows the relief teacher.
- Click the email button to send Compass's "You have unmarked rolls" email to the teachers in the list. This sends real emails, so the widget asks first:
  1. The widget loads the list again, then shows the teachers and the number of rolls, for example "Email 3 teachers about 5 unmarked rolls?".
  2. Click **Send email** to send, or **Cancel**.
  3. A green **Unmarked reminder sent** message shows at the top of the widget for 20 seconds, and the list refreshes.
  4. The footer shows "Reminder sent 9:41am" for the rest of the day, also after a refresh or a page reload. After more than one email, it shows each time, for example "Reminders sent 9:41am, 11:02am".

  Only the teachers in the list get the email. Teachers whose rolls are only in other year groups, or whose rolls started less than 10 minutes ago, do not get it.
  Compass adds each teacher's unmarked rolls of today to the email, so a teacher can also see rolls that the year-group filter hides.
- The chip below the title shows the year groups in the list. Click the chip to change the year groups.
- The widget refreshes every 15 minutes. Click the refresh button to refresh it immediately.

### Arrivals & Departures

This widget shows the students who arrived late or left early today, newest first.

- Each row shows the student, the year group, the class, the time and the reason. For a late arrival, the row also shows the minutes late.
- A blue arrow into a door shows an arrival. An orange arrow out of a door shows a departure.
- A **new** chip shows on rows from the last 30 minutes. A **returned** chip shows when a student who left came back later.
- Click **All**, **Arrivals** or **Departures** to select the rows to show.
- The chip below the title shows the year groups in the list. Click the chip to change the year groups.
- The widget refreshes every 5 minutes. Click the refresh button to refresh it immediately.

### Recent Chronicle

This widget shows the newest Chronicle entries, newest first.
Compass sends only the entries that you have permission to see.

- Click **Today** to show the entries of today. Click **7 days** to show the entries of the last 7 days.
- Each row shows the student, the entry type (the Chronicle template), the staff member who made the entry, and the time.
  Positive types (+) show in blue. Negative types (-) show in orange.
- When an entry has more than one student, the row shows "+1", "+2" and so on. Put the pointer on the name to see all the students.
- A **new** chip shows on entries from the last 30 minutes.
- To see the full entry, click **View** (or click the row). The entry opens on the Chronicle page in a new tab.
- The first chip below the title shows the year groups or the Custom Groups. The second chip shows the entry types. Click a chip to change the selection.
- The widget refreshes every 5 minutes. Click the refresh button to refresh it immediately.

### Current Period

This widget shows a timeline of the school day, with a red playhead at the current time.

- The title line shows the period that is on now, its times and the time left. The next line shows the next period.
- On the timeline, past periods are faded, the current period is dark blue and breaks are grey with stripes. Put the pointer on a period to see its times.
- Before school, between periods and after school, the widget says so and shows the next period.
- On a day with no periods (for example, the weekend), the widget shows the next school day's timeline, faded.

The widget uses the school's default period structure from Compass (Configure > Period Structures).
It uses the Compass calendar for the cycle day of each date, and it knows the days with no school (for example, a School Development Day shows its name).
Between two periods, the widget shows "Between periods" and the next period.

Use a custom timetable when the teaching timetable is different from the Compass period structure,
for example in a primary school that marks AM/PM rolls. The custom timetable is for this widget only. It does not change the attendance.

To set up a custom timetable:

1. Click the gear button on the widget, then click **Custom timetable**.
2. Click **+ Add a period**, then type the name, the start and the finish. Tick **Break** for recess or lunch.
3. **Mon–Fri** is the timetable for every school day. To make one day different, click the day, then click **Give … its own timetable**.
4. Click **Save**. The browser keeps the timetable.

To go back to the Compass period structure, click the gear button, click **Compass periods**, then click **Save**.

#### Share a custom timetable

Set up the timetable one time, then share it with the other staff as a code. They don't type the periods again.

1. Click the gear button, then click **Copy timetable code**. The code (one line that starts with `CPT1.`) goes on the clipboard.
   If the browser blocks the clipboard, the code shows in a box. Select it and copy it (Ctrl+C).
2. Send the code to the other staff, for example in an email.
3. Each staff member clicks the gear button on their widget, clicks **Custom timetable**, then **Paste a code**. They paste the code and click **Load**.
4. They check the periods, then click **Save**.

The code includes the Mon–Fri timetable and the days that have their own timetable.

#### Times on the timeline

The labels below the timeline show the hours (the default). To show the start time of each period instead, click the gear button,
click **Period starts** below **Times on the timeline**, then click **Save**. The last label shows the end of the last period.
When two periods start very close together, the second label is left out so that the labels don't overlap. Put the pointer on a period to see its times.

### Enrolment

This widget shows how many students are enrolled, with the number in each group.

- Click **Faction** to show the students in each faction (the house in Compass). Click **Class** to show the students in each class (the form group in Compass). Click **Year** to show the students in each year group.
- Each row shows the number of students and a bar. The **Faction** view also shows each faction's percentage of the school. Students with no faction or class show in the last row.
- Each faction has its own colour: the colour in its name (for example, Red, Blue, Green or Yellow). A faction without a colour in its name gets a colour from a fixed list.
- In the **Year** and **Class** views, click **By faction** to see the factions in each year group or class. Each row then shows a bar in the faction colours and the number of students in each faction.
  The line at the top shows each faction's total. Put the pointer on a row to see the faction names with their numbers. The browser keeps your choice.
- The widget shows counts only. It never shows a student's name.
- The widget refreshes every hour. Click the refresh button to refresh it immediately.

The data comes from the same Compass attendance grid as the Attendance widget (active students only).

### Relief

This widget shows the classes that have a relief teacher, with the teacher who is away and the relief teacher.
It uses the same data as Organise > Daily Org.

- Click **Today** to show the relief of today. Click **Tomorrow** to show the relief of the next school day (on a Friday, the button shows **Mon**).
- Click **Away** to sort the classes by the teacher who is away. Click **Relief** to sort the classes by the relief teacher. Click **Time** to sort the classes by start time.
- Each chip is one class. Put the pointer on a chip to see the class, the time and the room.
- A red **No relief yet** row or chip shows a class whose teacher is away but has no relief teacher.
- Orange chips show classes in progress. Faded chips show classes that have finished.
- The widget gets the staff names from the Compass staff list. Put the pointer on a name to see the staff code. If the list does not load, the widget shows the staff codes.
- The widget refreshes every 15 minutes. Click the refresh button to refresh it immediately.

### Weather

This widget shows the weather for a town in Western Australia, from the Bureau of Meteorology (BOM).
Use it when the Compass Weather widget does not work because the campus address is not set.

- The widget shows the current temperature, the "feels like" temperature, and today's high and low with an icon.
- The widget shows today's forecast, the chance of rain, the expected rain amount and the rain since 9am.
- The widget shows the UV index for the district, with its level colour and the sun protection times.
- The widget shows the wind and the humidity.
- The rain, UV, wind and humidity show in four tiles. Click **Show details** to show the tiles, and **Hide details** to hide them. The browser keeps your choice.
- The widget finds the town in the school name, if it can. To select a different town, click the location chip below the title. With no town, the chip says **Set your Location**.
  If you select **Perth**, you can also select a Perth area: Armadale, Fremantle, Joondalup, Kalamunda, Mandurah, Midland, Rockingham, Rottnest Island, Scarborough or Swanbourne. BOM does not forecast for smaller suburbs, so select the nearest area.
  You can also select the weather station for the current weather. **Automatic** uses the nearest station that measures the temperature.
- After the forecast low time has passed, BOM does not give today's low. The widget then shows the lowest temperature measured overnight.
- The widget refreshes every hour. Click the refresh button to refresh it immediately.

The data comes from BOM's free public data feeds for Western Australia, at reg.bom.gov.au/fwo/ (IDW14199 town forecasts, IDW12300 Perth metropolitan forecast, IDW60920 observations and IDW13010 district forecasts).
These feeds are free, but they are not for commercial use. The widget sends only requests for these files to BOM. It does not send Compass data.

### Term Calendar dots

This feature adds coloured dots to the Compass "Term Calendar" widget.
A dot shows that a day has one or more events. Put the pointer on a day to see its events, each with its matching coloured dot.

To choose which calendars show dots, click the **All calendars** chip at the bottom of the widget and tick or untick the calendars.
Your choice is saved in this browser. The list shows your school's calendars that appear on the homepage, each with its colour, plus any other kinds of event (for example, Events) that have loaded.

### Countdown colours

This feature lets each Compass "Countdown" widget have its own colour, so several countdowns are easy to tell apart.
Put the pointer on a countdown, then click the round colour button at its top right. Select a colour from the list, or select **Compass default** to go back to the normal colour.
The colour is saved in this browser, by the countdown's title. If you rename a countdown, choose its colour again.

### Task list: full names and sub-tasks

This feature adds to the Compass task list on the homepage.

- **Full name:** put the pointer on a task to see its full name, also when the name is cut off.
- **Sub-tasks:** put ` | ` (a space, a vertical bar, a space) between the parts of a task name. The first part is the task, and each other part is a sub-task.
  For example, "Seventh Heaven newsletter | print | laminate" shows as "Seventh Heaven newsletter" with two sub-tasks below it: "print" and "laminate".
  Each sub-task has its own tick box. A tick doesn't tick, open or change the main task.
  The ticks are saved in this browser only. Compass keeps the full task name, so other browsers and the Compass app show the name with the ` | ` parts.

Use ` | ` because many task names already use " - " as normal punctuation. To add or change sub-tasks, edit the task name in Compass.

### Toolbar panel

Click the extension icon in the browser toolbar to open the Attendance chart on any Compass page.
Click the icon again to close the panel.

## Year-group filter

The Attendance, Unmarked Rolls, Arrivals & Departures and Recent Chronicle widgets use the same year-group filter:

1. Click the chip below the widget title.
2. Select the year groups. Select **All year groups** to show all year groups.
3. Click **Done**.

Each widget keeps its own selection. A change in one widget does not change the other widgets.

### Custom groups (Attendance, Arrivals & Departures and Recent Chronicle)

The Attendance, Arrivals & Departures and Recent Chronicle widgets can also filter by the student Custom Groups in Compass (People > Custom Groups):

1. Click the chip below the widget title.
2. Click **Custom groups**, then select one or more groups. The widget shows the students who are in at least one of the groups. If there are many groups, type in the search box to find a group.
3. Click **Done**.

To filter by year group again, click **Year groups** and select the year groups. If you clear the last group, the widget shows all year groups.

The list shows the student Custom Groups that you can see in Compass, with the number of students in each group.

## Move or remove a widget

The extension widgets work in the same way as the Compass widgets in the layout editor:

1. On the Compass homepage, open **Edit Home Page Layout**.
2. To move a widget, drag the widget with its handle.
   While you drag a Compass widget, the extension widgets fold to a thin blue line, so the Compass widget lands where you point.
   The extension widgets then open again in their places: each one stays above the Compass widget that was below it (or at the end of its column).
   To change the place of an extension widget, drag the extension widget.
   A Compass widget can't go between two extension widgets: put it above or below them, then drag the extension widgets. A notice at the top of the editor says this; click its close button to hide it.
   As in Compass without the extension, a drop on the gap between two widgets puts the widget at the end of the column.
3. To remove a widget, click the delete button on the widget.
4. To add a removed widget again, click **Add Widget**, then select the widget. The extension widgets are at the end of the list.
5. Click **Save** or **Save and Close** to keep the changes. If you click **Close**, the changes are not kept.

The browser keeps the positions and the removed widgets. Compass does not keep them.
Thus, the settings apply only to the browser that you use.
Compass shows a different number of columns for each screen width. The extension keeps a different position for each number of columns.

## Install the extension

The extension is not in a web store. Install it as an unpacked extension:

1. Download or clone this repository.
2. In Chrome or Edge, open `chrome://extensions` (or `edge://extensions`).
3. Set **Developer mode** to on.
4. Click **Load unpacked**, then select the repository folder.
5. Open your Compass homepage.

After a new install, the extension widgets are not on the homepage. A **Welcome!** card shows at the top of the left column instead.
Click **Add custom widgets** to open the layout editor, then add the widgets from the **Add Widget** menu (see "Move or remove a widget").
The welcome card goes away when you add a widget and click **Save**. To close it without adding a widget, click its close button.

To install an update, get the new files, then click the reload button on the extension card.

## Change the attendance groups

The `STATUSES` list in `src/widgets/attendance/data.js` puts each Compass attendance code into a group.
To change the groups for your school policy, edit this list.
The **(i)** panel shows the changes automatically.

The extension also gets your school's list of codes from Compass (the same list as the Compass attendance page). The **(i)** panel shows the codes with your school's names.
A code that is not in `STATUSES` shows under **Other codes** in the panel, with an **auto** tag.

When Compass sends a mark with a code that is not in `STATUSES`, the chart groups it by the colour that Compass gives the mark:
green is Present, red is Unapproved absence and orange is Approved absence. The chart shows a note with the code, so you can check the group.
Orange is only a guess: Compass also shows Unauthorised Vacation as orange. To choose the group yourself, add the code to `STATUSES`.
If the mark has no colour, the code is left out and the note says so.

## Hide the test date box

The Relief widget has a date box in its header, with a dashed red border. Use it to see the relief of a different day, for example in the school holidays.
The date box is for testing only. Hide it before you release the extension:

1. Open `src/widgets/relief.js`.
2. Find `const DEBUG_DATE = true;` near the start of `CompassReliefUI`.
3. Change `true` to `false`.
4. Reload the extension on the `chrome://extensions` page.

To show the date box again, change `false` to `true`.

Do not only delete the lines that have the comment `DEBUG`. Other lines use the date box too, and the widget stops working without them.

## Show test names

For demonstrations and screenshots, the widgets can show Final Fantasy VII names instead of the real names of students, staff and Custom Groups.
Only the names on the screen change. The widgets still use the real data.

1. Open `src/shared/names.js`.
2. Change `const TEST_NAMES = false;` to `true`.
3. Reload the extension on the `chrome://extensions` page.
4. On the Compass homepage, hold Alt (Option on a Mac) and click the title of an extension widget. A red **Test names** chip shows on each widget.
5. To show the real names again, Alt+click a title again.

Set `TEST_NAMES` back to `false` before you release the extension.

## Files

| Folder or file | Purpose |
| --- | --- |
| `manifest.json` | The extension settings and the list of scripts, in load order. |
| `src/shared/years.js` | The year-group order, the year-group labels and the filter chip. All widgets use this file. The Recent Chronicle widget also uses the filter chip for entry types. |
| `src/shared/groups.js` | The Compass Custom Groups for the Attendance, Arrivals & Departures and Recent Chronicle filters. |
| `src/shared/names.js` | The test names (Final Fantasy VII names instead of real names). |
| `src/shared/periods.js` | The periods of a school day (custom timetable) for the Current Period widget. |
| `src/shared/theme.js` | The base look (`CompassTheme.CSS`) and the icons (`CompassTheme.ICONS`) for all widgets. |
| `src/widgets/attendance/data.js` | Gets the attendance data from Compass and counts it. Contains the list of attendance codes. |
| `src/widgets/attendance/chart.js` | The Attendance chart, for the homepage widget and the toolbar panel. |
| `src/widgets/unmarked.js` | The Unmarked Rolls widget. |
| `src/widgets/movements.js` | The Arrivals & Departures widget. |
| `src/widgets/dayattendance.js` | The Attendance Today widget (period bars and the on-site line). |
| `src/widgets/trend.js` | The Attendance Trend widget (the % present of each session of this week and last week). |
| `src/widgets/chronicle.js` | The Recent Chronicle widget. |
| `src/widgets/relief.js` | The Relief widget. |
| `src/widgets/period.js` | The Current Period widget, with the timetable share code. |
| `src/widgets/enrolment.js` | The Enrolment widget (students by faction, class or year group). |
| `src/widgets/weather.js` | The Weather widget. `src/toolbar/background.js` gets the BOM files for it. |
| `src/homepage/welcome.js` | The welcome card that shows after a new install. |
| `src/homepage/homepage.js` | Adds the widgets to the Compass homepage and to the layout editor. Moves and hides the widgets. Shows the welcome card while no widget is on the homepage. |
| `src/homepage/calendar-dots.js` | Adds the event dots to the Term Calendar widget. |
| `src/homepage/countdown-colours.js` | Adds the colour choice to the Compass Countdown widgets. |
| `src/homepage/task-extras.js` | Adds the full names on hover and the sub-tasks to the Compass task list. |
| `src/toolbar/background.js`, `src/toolbar/panel.js` | Open the Attendance chart from the toolbar icon. `background.js` also gets the BOM files. |
| `icons/` | The extension icons. |
| `docs/PLANNED_WIDGETS.md` | Ideas for new widgets. |
| `tests/` | The automated tests (see "Run the tests"). `tests/load.js` loads the scripts into Node. |
| `package.json` | Only the `npm test` command. Chrome ignores this file. |
| `docs/COMPASS_CALLS.md` | Every Compass request that each widget makes, and the requests we know but don't use yet. |

### Load order

The scripts share global objects (for example `CompassYears` and `CompassTheme`), so the order in `manifest.json` is important:

1. `src/shared/`: other scripts use these files.
2. `src/widgets/`: `data.js` before `chart.js`, then the other widgets.
3. `src/homepage/`: these files add the widgets to the page, so they load last.

The toolbar panel loads its own list of scripts. This list is in `src/toolbar/background.js`.

## Planned widgets

[docs/PLANNED_WIDGETS.md](docs/PLANNED_WIDGETS.md) lists the ideas for new widgets and the data that each widget needs.

## Add a new widget

1. Make a new script in `src/widgets/` that has a `mount(host, { preview })` function. The function shows the widget in `host`.
   It returns `{ refresh, stop }`. Use `CompassTheme.CSS` and `CompassTheme.ICONS` from `src/shared/theme.js` for the base look.
2. Add the script to `content_scripts` in `manifest.json`, after the other widgets and before `src/homepage/homepage.js`.
3. Add the widget to the `CARDS` list in `src/homepage/homepage.js`.
4. If the widget uses year groups, use `CompassYears.filter` from `src/shared/years.js`.
5. Put the logic that doesn't need the page (counting, sorting, parsing Compass data) in functions that the widget returns, and add tests for them in `tests/` (see "Run the tests").
6. Add each Compass call to `docs/COMPASS_CALLS.md`.
7. Add the widget to this README, and remove it from `docs/PLANNED_WIDGETS.md`.

## Run the tests

The tests check the logic of the widgets with made-up data: the attendance counts, the session choice, the unmarked rolls, the enrolment and trend counts, the timetable code, the period helpers and the on-site line.
They need Node.js 20 or later, and nothing else.

1. Open a terminal in the repository folder.
2. Run `npm test` (or `node --test "tests/*.test.js"`).

Each test shows `ok` or `not ok`. The tests use Perth time and a stub of Compass, so they give the same result on every computer and never contact Compass.
Run the tests before you release the extension.
