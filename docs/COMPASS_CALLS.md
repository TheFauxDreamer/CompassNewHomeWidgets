# Compass calls

This file lists every Compass request that the extension makes, and the requests that we have seen in Compass but don't use yet.
Use it to find which widget depends on which request, and to find data for new widgets.

## How the calls work

- The scripts run inside the Compass page, so each request uses the user's own Compass login (`credentials: "include"`). The user sees only the data that their Compass account can see.
- Most calls are `POST` with a JSON body, and the headers `Content-Type: application/json`, `Accept: application/json` and `X-Requested-With: XMLHttpRequest`.
- Most `.svc` responses are `{ "d": … }`. A list is `d` (an array), or `d.data` with `d.total`. Paged calls take `page`, `start` and `limit`.
- `?sessionstate=readonly` is on most read calls, as Compass's own pages send it.
- When Compass sends a redirect, 401 or 403, the login has expired. Each widget shows "Check you're still logged in".
- In the attendance grid, `amStatus`/`pmStatus` is a colour: `GREEN` (present), `ORANGE` (an absence with a reason, for example Notified as Sick, but also Unauthorised Vacation) or `RED` (unexplained). It is `null` for Not Marked. The colour is not the same as approved/unapproved, so the extension uses it only for codes that `STATUSES` doesn't list.
- Field names are short (for example `n` = name, `s` = start, `f` = finish). The tables give the meaning.
- The only request to a service that isn't Compass is the Weather widget's request to the Bureau of Meteorology (see README.md).

All examples in this file use made-up names.

## Calls that the extension makes

### Students and year levels

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `PeopleManagement.svc/GetUserIdsBySearchApiQuery` | `{ query: "'role'='student' AND 'status'IN('active','left')" }` | `d.data`: the user IDs of all students. `d.success` must be true. | Attendance, Attendance Today, Enrolment (`attendance/data.js`) |
| `User.svc/GetStudentYearLevels` | `{ page: 1, start: 0, limit: 200 }` | `d[]`: `id`, `n` (the year level name, for example "Year 3"). | Unmarked Rolls, Arrivals & Departures, Recent Chronicle (the year filter) |
| `PeopleManagement.svc/GetCustomGroupsByBaseRole` | `{ baseRole: "1" }` (1 = student) | `d[]`: `id`, `name`, `userBaseRole` (we keep only 1), `memberCount`. | The Custom Groups filter (`shared/groups.js`) |
| `PeopleManagement.svc/GetCustomGroupMembers` | `{ customGroupId, page, start, limit: 500 }` | `d[]`: `id` (the user ID). No total: we stop at a short page. | The Custom Groups filter |

### Attendance

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `/graphql/`, operation `GetHalfDaySummaryGridLinesByWeekStart` | `{ weekStart: "2026/10/12", gridGroupId: "", gridGroupType: "UNIFIEDGROUP", unifiedUserIds: [ids] }` | One line for each student: `userId`, `isActive`, `yearLevelString`, `formGroup` (class), `houseGroup` (faction), and `days[]` with `date` ("yyyy/mm/dd") and for AM and PM: `…ExtendedStatusIdRaw`, `…StatusName`, `…StatusExportIdentifier`, `…StatusPeriodCalcNotMarked`, `amStatus`/`pmStatus` (the colour, for codes not in `STATUSES`). | Attendance, Attendance Today, Attendance Trend (this week and last week), Enrolment, toolbar panel (`attendance/data.js`) |
| `/graphql/`, operation `GetExtendedStatuses` | none | `extendedStatuses[]`: `id` (an encoded ID), `extendedStatusIdRaw` (the number, as in the grid), `schoolSystemExportIdentifier` (the code, for example "U"), `name` (the school's name for it). Also `attendanceGridDisplayMode`, `attendanceGridOrdinal` (null at the school we tested). No group. | The (i) panel of the Attendance widget, and the code names in the Codes view (`attendance/data.js`) |
| `Attendance.svc/GetAllUnmarkedRolls` | `{ unifiedUserIds: null, page, start, limit: 200, filter: "[{property:'start',value:'…T00:00:00',type:'>='},{property:'finish',…,type:'<='}]" }` | `d.data[]`: `id` (roll instance ID), `s`/`f` (start and finish, ISO), `n` (class), `p` (period), `l` (room), `m` (teacher HTML, see below), `yl` (year level). `d.total`. | Unmarked Rolls; Attendance and Attendance Today (to find the students in unmarked rolls) |
| `Attendance.svc/GetRollPackage` | `{ instanceId: "<roll instance ID>" }` | `d.data.start`, `d.data.rollData[]`: `uid`, `userTimeLinePeriods[]` (every period of the student's day: `start`, `finish`, `name`, `status`, `statusName`, `exportId`, `extendedStatus.id`, `extendedStatus.periodCalc_NotMarked`). | Attendance and Attendance Today (`attendance/data.js`) |
| `Attendance.svc/GetArrivalsAndDepartures` | `{ fromFilter: null, toFilter: null, typeFilter: null, filter: "[]", page, start, limit }` | `d.data[]`: `id`, `uid`, `n` (student), `ct` (1 = arrival, 2 = departure), `t` (time), `c` (reason), `minutesLate`, `formGroup`, `yearLevelId`, `userCreatorName`. | Arrivals & Departures, and the On site line in Attendance Today |

A class roll's instance ID is the activity ID + the date (`ddmmyyyy`) + the UTC start time (`hhmm`). See `instanceIds()` in `attendance/data.js`.

The teacher field `m` in the unmarked rolls is HTML. A relief teacher shows as `<s>(cstrife) Cloud STRIFE</s>&nbsp; (bwallace) Barret WALLACE`: struck-through names are away. We read it as text only.

### Classes and timetable

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `Subjects.svc/GetSubjectsInAcademicGroup` | `{ academicGroupId: -1, includeDataSyncSubjects: true, page: 1, start: 0, limit: 1000 }` | `d.data[]`: `id`. | Attendance "by period", Attendance Today with more than AM/PM |
| `Subjects.svc/GetStandardClassesOfSubject` | `{ subjectId, page: 1, start: 0, limit: 1000 }` | `d.data[]`: `id` (activity ID), `start`, `finish` (when the class runs). | As above (one request for each subject) |
| `ReferenceData.svc/GetAllActivePeriodStructures` | `{ year, page: 1, start: 0, limit: 25 }` | `d[]`: `id`, `name`, `isDefault`, `cycleLength`. | Current Period, Attendance Today, Attendance "by period" (`shared/periods.js`) |
| `ReferenceData.svc/GetPeriodDaysBySelectedPeriodStructure` | `{ year: "2026", periodStructureId: "<id>" }` | `d[]`: `id` (period day ID), `d` (cycle day number). | As above |
| `ReferenceData.svc/GetAllPeriodsForStructure` | `{ structureId, year, page: 1, start: 0, limit: 500 }` | `d[]`: `n` (name), `pn` (number), `s`/`f` (time of day on a fixed date), `pdid` (period day ID). | As above |
| `ReferenceData.svc/GetCalendarDataForPeriodStructure` | `{ year: "2026", periodStructureId: "<id>" }` | `d.d[]`: `dateEqualityProperty` (the date, "20261014"), `td` (a teaching day), `pdid` (period day ID), `n` (the day's name, for example "School Development Day"). | As above. Optional: without it, the widget uses the cycle days only. |

### Staff and relief

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `Instance.svc/GetClassManagerLinesForClassChanges?_dc=<time>` | `{ startTime, finishTime (ISO), activityName: "", teacherId: null, runningStatus: 1, yearLevelId: null, page: 0, start: -500, limit: 500 }` (the same odd paging as the Daily Org page) | `d.data[]`: `id`, `s`/`f`, `n` (class), `p` (period), `ls[].l` (rooms), `teachers[].t` (HTML: struck-through codes are away). `d.total`. | Relief |
| `ChronicleV2.svc/GetStaff` | `{}` (falls back to a `GET`) | `d[]`: `displayCode` (staff code), `n` (name). | Relief (code → name) |

### Unmarked roll emails

These calls send real emails. The widget always asks the user first.

| Call | Body | What we use |
| --- | --- | --- |
| `Attendance.svc/GetUnmarkedRollStaff` | `{ activity: "", yearLevel: "", startDate, endDate (ISO, today), location: "", staff: "", layer: "", unifiedUserIds: [] }` | `d[]`: the user IDs of the staff with unmarked rolls today. |
| `Communications.svc/GetEmailWithUnmarkedRolls` | `{ userIds: ["…"], activityId: null, subjectUserId: null, startDate, endDate, excludeInactiveStudents: false }` | `d[]`: `id`, `name` ("Cloud Strife - cstrife"), `additionalInfo` ("2 unmarked rolls"). |
| `Communications.svc/CheckCompassAllowEmailFlagForUserIds` | `{ userIds, alumniMode: false }` | `d` must be `true`. |
| `Communications.svc/SendEmail` | The subject, the body (Compass's own unmarked-rolls text), `recipients: userIds`, `templateContext: "2"` and the other fields that the Compass page sends (see `sendEmail()` in `unmarked.js`). | `d` must be `true`. |

### Chronicle

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `ChronicleV2.svc/GetAllEntriesThin` | `{ filter: { yearLevelFilter: [ids], studentFilter: [user IDs], entryCreatedStart, entryCreatedFinish, needsApprovalFilter: 3, … }, page, start, limit, sort: "[{property:'createdTimestamp',direction:'DESC'}]" }` | `d.data[]`: `id`, `attendeeNames`, `templateName`, `creatorName`/`userNameCreated`, `createdTimestamp`, `occurredTimestamp`. `d.total`. | Recent Chronicle |

### Homepage additions

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `Calendar.svc/GetCalendarEventsByUserWeb` | `{ userId, startDate: "2026-07-20", endDate, homePage: true }`. `userId` comes from `Compass.organisationUserId` in the page. | `d[]`: `start`, `finish`, `allDay`, `longTitleWithoutTime`/`title`, `backgroundColor`, `calendarId`, `activityType` (1 class, 2 event, 10 learning task), `activityTypeName`. | Term Calendar dots |
| `Calendar.svc/GetActivityLayers` | `{}` | `d[]`: `id`, `name`, `scheduleBgColor`, `showOnHomePage`, `isHidden`. | Term Calendar dots (the calendar chooser) |
| `TaskService.svc/GetTaskItems` | `{ page: 1, start: 0, limit: 100 }` | `d[]`: `id` (the row's `data-recordid`), `status` (true = done), `dueDate` (the format isn't confirmed yet: the parser reads `/Date()/`, ISO and day/month text). Also `taskName`. | My Tasks due-date colours (`task-extras.js`). Loaded again when the task grid changes, at most once every 5 seconds. |

The My Tasks names and sub-tasks, and the Countdown colours, make no Compass calls. They read the widgets on the page.

## Calls that we know but don't use

These calls were seen in Compass pages (HAR files) or are in code that is switched off. They can give data to new widgets. Check them with a new HAR file before you build on them.

### Tasks (the My Tasks widget)

| Call | Body | Response |
| --- | --- | --- |
| `TaskService.svc/UpdateTaskItem` | `{ task: { id, taskName, status, dueDate } }` | `d: null`. Changes a task. It could save sub-task ticks in Compass, but it would change the task name that the user sees. |

### Attendance (GraphQL, at `/graphql/`)

| Operation | Variables | What it gives |
| --- | --- | --- |
| `GetHalfDaySummaryGridLinesByWeekStart` (more fields) | as above | Fields we don't request yet: `displayCode`, `reportName`, `lastName` (names: use only when a widget needs them), `campus`, `attendancePercentage` (each student's percentage), `timeAmountArrivedLateAm`/`Pm` (minutes late), `amExtendedStatusId`/`pmExtendedStatusId` (an encoded ID; we use the `…Raw` number instead), `userFlags[]` (`description`, `imageUrl`), `chroniclePinnedCount`, `displayFormatName`. |
| `GetHistoricalHalfDaySummaryGridLinesByWeekStart` | `{ weekStart }` | The same grid for past weeks (students who have left). For an attendance trend or a watchlist. |
| `GetCurrentAttendanceWeekFilterYearMonthOptions` | `{ gridGroupType: "UNIFIEDGROUP", gridGroupId: "", unifiedUserIds: [ids] }` | `currentAttendanceWeekFilterYearMonthOptions[]`: `month`, `year`, `weekStarts[]` ("yyyy/mm/dd"): the weeks of the year that have attendance data. |
| `GetDisplayModeCurrentExtendedStatuses` | none | `displayModeCurrentExtendedStatuses[]`, the same fields as `GetExtendedStatuses` (which we use). Empty at the school we tested. |
| `GetExtendedStatusOptionsFor(activityType)` | `{ activityType }` | `extendedStatusOptionsFor[]`: `extendedStatusId.entityId`, `name`, `systemCode`, `description`. Seen as query text only. |
| `GetReferenceData` | none | `currentOrganisation`: `id`, `systemType`, `schoolLogo`, `schoolSystemTypeRefData[]` (`id`, `type`, `countryCode`, `isAustralian`, `isCanadian`, `isEnglish`, `isIrish`, `isIndonesian`). |
| `GetGroupActivityTrackingCases`, `GetGroupActivityTrackingCaseDetail(caseId)` | `{ activityId, status, includeExcludedActivities }` | Attendance tracking cases: student, class, missed count, status, attempts. For a "students at risk" widget. |
| `GetInstancesOutsideOfBounds` | `{ activityId, startTime, finishTime }` | Class instances outside the period structure. |

### News and feed

Seen on the homepage and on Communicate > News. Where the body says "not in the HAR", the browser didn't save it, so check it with a new HAR before using the call.

| Call | Body | Response |
| --- | --- | --- |
| `Newsfeed.svc/GetAllExpiredNewsItems` | `{ start: 0, limit: 10, sort: "string", filterOptions: {} }` (Compass's News page also asks with `limit: 500`) | `d.total` (all expired posts, more than 1,000 at the school we tested) and `d.data[]`: `NewsItemId`, `Title`, `Content1` (the post body, HTML), `Content2`, `Start`, `Finish`, `PostDateTime`, `UserId`, `UserName`, `CreatedByAdmin`, `Attachments[]`, `Tags[]`, `Priority`, `Locked`, `NewsItemGroupTargets[]` (`BaseRole`, `YearLevels`, `FormGroups`, `Houses`, `CampusIds`, `ActivityIds`, `UserIds`, `Future`), `NewsItemCustomGroupTargets` (`CampusIds`, `CustomGroupIds`), `NewsItemAlumTargets`, the comment and reaction switches (`IsFeed…Enabled`) and the publishing flags (`PublicWebsite`, `PublishTo…`). Newest first. Seen with an account that can manage news; not yet confirmed for an ordinary staff account. |
| `Newsfeed.svc/GetMyOwnNewsItems` | `{ start: 0, limit: 10, sort: "string", filterOptions: {} }` | The user's own posts: the same fields as above, in `d.data[]`, and `d.total`. |
| `Newsfeed.svc/SaveNew` | not in the HAR | A news post with the same fields as above (the new or saved post). |
| `Newsfeed.svc/GetGroupTargetOptions` | not in the HAR | `d`: `BaseRole`, `YearLevels[]`, `FormGroups[]`, `Houses[]`, `CampusIds`, `ActivityIds`, `UserIds`, `Future`: the audiences a post can target. |
| `Newsfeed.svc/GetMyAlerts` | not in the HAR | `d[]`: `AlertItemId`, `Title`, `Body`, `Content`, `LinkText`, `LinkUrl`, `ImageSourceUrl`, `IsWarning`, `Dismissible`, `Type`. |
| `NewsFeed.svc/GetArchivedYearLevelShortNames` | not in the HAR | `d[]`: `Key`, `Value` (a year level's short name). |
| `Feed.svc/GetFeedItems` | not in the HAR | The homepage feed: `d[]` with `feedItemId`, `newsFeedItemId`, `title`, `itemContent` (HTML), `start`, `createdTimestamp`, `createdUserName`, `userIdCreator`, `attachments[]` (`attachmentId`, `name`, `path`, `type`), `tags[]`, `isPriority`, `isRead`, `isSaved`, `isViewed`, `viewCount`, `commentCount`, `comments[]`, `reactionCount[]`, `canComment`, `canReact`. Current posts only. |
| `Feed.svc/GetUnreadCount`, `GetSavedCount`, `GetFilterViewUserAttribute` | not in the HAR | `d`: a number. |
| `FileDownload/FileRequestHandler` | `GET ?FileDownloadType=…&attachmentId=…&preview=true&source=feed` | A news attachment (an image or a file), not JSON. |

### Homepage, settings and reference data

| Call | Body | Response |
| --- | --- | --- |
| `Calendar.svc/GetCalendarEventsByUser` | `{ userId, homePage: true, activityId: null, subjectId: null, locationId: null, staffIds: null, startDate, endDate, page, start, limit }`, with `?ExcludeNonRelevantPd=true` | `d[]`: the user's events, with `activityId`, `activityType`, `instanceId`, `start`, `finish`, `allDay`, `title`, `description`, `location`, `backgroundColor`, `calendarId`, `attendanceMode`, `isRecurring` and more. The older call beside `GetCalendarEventsByUserWeb`. |
| `Configure.svc/GetTeachingDaysForPeriod` | not in the HAR | `d`: a number of teaching days. |
| `Configure.svc/GetMyFavouriteModules`, `GetAvailableWebFavouriteDefinitions` | not in the HAR | `d[]`: `name`, `url` (the menu favourites). |
| `Configure.svc/GetModuleSchoolAttributes` | not in the HAR | `d[]`: the school's settings for a module (`attributeName`, `attributeGroup`, `attributeType`, `defaultValue`, `description`, …). |
| `Device.svc/HasDevice` | not in the HAR | `d`: true when the user has the Compass app. |
| `PeopleManagement.svc/GetCustomGroups` | not in the HAR | `d[]`: `id`, `name`, `description`, `memberCount`, `userBaseRole`. All groups, not only student groups: the extension must keep using `GetCustomGroupsByBaseRole`. |
| `User.svc/GetAllStaffWithoutActiveAt` | not in the HAR | `d[]`: all staff with `id`, `displayCode`, `fn`/`ln`/`f` (names), `baseRole`, contact fields and more. Personal data: use only when a widget needs it. |
| `ReferenceDataCache.svc/GetAllTerms`, `GetCurrentTerm` | `GET ?page=1&start=0&limit=25` | `d` (one term) or `d[]`: `id`, `n` (name), `s`/`f` (start and finish), `sl`, `cy`. Could give term-based ranges (for example a term attendance trend). |
| `ReferenceDataCache.svc/GetAllCampuses` | `GET` | `d[]`: `campusId`, `campusName`, `name`, `defaultCampus`, `active`, `archived`, `campusGuid`, `importIdentifier`, `ageId`. |
| `ReferenceDataCache.svc/GetActiveCategories` | `GET ?page=1&start=0&limit=25` | `d[]` (empty at the school we tested). |
| `ReferenceDataCache.svc/GetTranslation` | `GET ?language=en&namespace=translation` | Compass's interface text, not JSON. |

### Other

| Call | Notes |
| --- | --- |
| `ChronicleV2.svc/GetEntry` | `{ id, archived: true }`: one full Chronicle entry with its fields. It is in `chronicle.js`, switched off (the details dialog didn't show all entries correctly). |
| `User.svc/GetAllStaff` | `{ page: 1, start: 0, limit: 5000 }`: all staff. In the switched-off code in `chronicle.js`. |
| `ReferenceDataCache.svc/GetAllLocations` | `GET` with `?page=1&start=0&limit=5000`: all rooms. In the switched-off code in `chronicle.js`. |
| `ChronicleV2.svc/GetEntriesRequiringMyApproval` | The Chronicle entries that wait for the user's approval. Named in `PLANNED_WIDGETS.md`, not confirmed with a HAR file yet. |

## Add a call to this file

When you add a Compass call to a widget, add a row here with the call, the body, the fields that the widget uses and the widget's name.
When you find a new call in a HAR file, add it to "Calls that we know but don't use". Replace all real names and IDs with made-up ones (see `.claude/rules/placeholder-names.md`).
