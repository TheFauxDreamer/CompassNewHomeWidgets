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
- Click the **(i)** button to see the Compass codes in each group.
- The chip below the title shows the year groups in the chart. Click the chip to change the year groups.
- The widget refreshes every 15 minutes. Click the refresh button to refresh it immediately.

The widget selects the session automatically:

- On a school day, the widget shows the AM roll. When more than 100 students have a PM code, the widget shows the PM roll.
- On other days, the widget shows the most recent session that has marked students.

### Unmarked Rolls

This widget shows today's rolls that are not marked.

- A roll shows in the list 10 minutes after it starts. This gives the teacher time to mark the roll.
- Click **Teacher** to sort the rolls by teacher. Click **Time** to sort the rolls by start time. Click **Year** to sort the rolls by year group.
- When a relief teacher has the class, the list shows the relief teacher.
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
- The first chip below the title shows the year groups. The second chip shows the entry types. Click a chip to change the selection.
- The widget refreshes every 5 minutes. Click the refresh button to refresh it immediately.

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

### Toolbar panel

Click the extension icon in the browser toolbar to open the Attendance chart on any Compass page.
Click the icon again to close the panel.

## Year-group filter

The Attendance, Unmarked Rolls, Arrivals & Departures and Recent Chronicle widgets use the same year-group filter:

1. Click the chip below the widget title.
2. Select the year groups. Select **All year groups** to show all year groups.
3. Click **Done**.

Each widget keeps its own selection. A change in one widget does not change the other widgets.

## Move or remove a widget

The extension widgets work in the same way as the Compass widgets in the layout editor:

1. On the Compass homepage, open **Edit Home Page Layout**.
2. To move a widget, drag the widget with its handle.
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

If Compass sends a code that is not in the list, the Attendance widget shows a note with the code.

## Hide the test date box

The Relief widget has a date box in its header, with a dashed red border. Use it to see the relief of a different day, for example in the school holidays.
The date box is for testing only. Hide it before you release the extension:

1. Open `src/widgets/relief.js`.
2. Find `const DEBUG_DATE = true;` near the start of `CompassReliefUI`.
3. Change `true` to `false`.
4. Reload the extension on the `chrome://extensions` page.

To show the date box again, change `false` to `true`.

Do not only delete the lines that have the comment `DEBUG`. Other lines use the date box too, and the widget stops working without them.

## Files

| Folder or file | Purpose |
| --- | --- |
| `manifest.json` | The extension settings and the list of scripts, in load order. |
| `src/shared/years.js` | The year-group order, the year-group labels and the filter chip. All widgets use this file. The Recent Chronicle widget also uses the filter chip for entry types. |
| `src/shared/theme.js` | The base look (`CompassTheme.CSS`) and the icons (`CompassTheme.ICONS`) for all widgets. |
| `src/widgets/attendance/data.js` | Gets the attendance data from Compass and counts it. Contains the list of attendance codes. |
| `src/widgets/attendance/chart.js` | The Attendance chart, for the homepage widget and the toolbar panel. |
| `src/widgets/unmarked.js` | The Unmarked Rolls widget. |
| `src/widgets/movements.js` | The Arrivals & Departures widget. |
| `src/widgets/chronicle.js` | The Recent Chronicle widget. |
| `src/widgets/relief.js` | The Relief widget. |
| `src/widgets/weather.js` | The Weather widget. `src/toolbar/background.js` gets the BOM files for it. |
| `src/homepage/welcome.js` | The welcome card that shows after a new install. |
| `src/homepage/homepage.js` | Adds the widgets to the Compass homepage and to the layout editor. Moves and hides the widgets. Shows the welcome card while no widget is on the homepage. |
| `src/homepage/calendar-dots.js` | Adds the event dots to the Term Calendar widget. |
| `src/homepage/countdown-colours.js` | Adds the colour choice to the Compass Countdown widgets. |
| `src/toolbar/background.js`, `src/toolbar/panel.js` | Open the Attendance chart from the toolbar icon. `background.js` also gets the BOM files. |
| `icons/` | The extension icons. |
| `docs/PLANNED_WIDGETS.md` | Ideas for new widgets. |

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
5. Add the widget to this README, and remove it from `docs/PLANNED_WIDGETS.md`.
