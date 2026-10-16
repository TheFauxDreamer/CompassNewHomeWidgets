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
| `/graphql/`, operation `GetHalfDaySummaryGridLinesByWeekStart` | `{ weekStart: "2026/10/12", gridGroupId: "", gridGroupType: "UNIFIEDGROUP", unifiedUserIds: [ids] }` | One line for each student: `userId`, `isActive`, `yearLevelString`, `formGroup` (class), `houseGroup` (faction), and `days[]` with `date` ("yyyy/mm/dd") and for AM and PM: `…ExtendedStatusIdRaw`, `…StatusName`, `…StatusExportIdentifier`, `…StatusPeriodCalcNotMarked`, `amStatus`/`pmStatus` (the colour, for codes not in `STATUSES`). | Attendance, Attendance Today, Attendance Trend (this week and last week), Enrolment, toolbar panel, Period inconsistencies (`attendance/data.js`). The Period inconsistencies page alone also asks for `reportName` (the student's name) and `lastName` (for sorting by surname), with one request for each week of its range. |
| `/graphql/`, operation `GetExtendedStatuses` | none | `extendedStatuses[]`: `id` (an encoded ID), `extendedStatusIdRaw` (the number, as in the grid), `schoolSystemExportIdentifier` (the code, for example "U"), `name` (the school's name for it). Also `attendanceGridDisplayMode`, `attendanceGridOrdinal` (null at the school we tested). No group. | The (i) panel of the Attendance widget, and the code names in the Codes view (`attendance/data.js`) |
| `Attendance.svc/GetAllUnmarkedRolls` | `{ unifiedUserIds: null, page, start, limit: 200, filter: "[{property:'start',value:'…T00:00:00',type:'>='},{property:'finish',…,type:'<='}]" }` | `d.data[]`: `id` (roll instance ID), `s`/`f` (start and finish, ISO), `n` (class), `p` (period), `l` (room), `m` (teacher HTML, see below), `yl` (year level). `d.total`. | Unmarked Rolls; Attendance and Attendance Today (to find the students in unmarked rolls) |
| `Attendance.svc/GetRollPackage` | `{ instanceId: "<roll instance ID>" }` | `d.success`, `d.data.start`, `d.data.rollData[]`: `uid`, `userTimeLinePeriods[]` (every period of the student's day: `start`, `finish`, `name`, `status`, `statusName`, `exportId`, `extendedStatus.id`, `extendedStatus.periodCalc_NotMarked`). `d.data.previousMarkings[]`: each save of the roll, with `n` (who saved it, "First Last (username)"), `dt` (when, ISO in UTC), `isReset` (a reset of the roll, not a save), `id`, `auto` (null at the school we tested). `d.data.activityName` (the class). | Attendance, Attendance Today and Period inconsistencies (`attendance/data.js`). Period inconsistencies opens past days' rolls too, one period at a time, until every student with a grid record that day is found. For the rows it shows, it also reads `previousMarkings` to show who last saved the roll and when (`loadMarkings`). Compass keeps who saved the roll, not who set one student's code. |
| `AttendanceV2.svc/GetDailySummaryForTimeline?_dc=<time>` | `{ userId: <number>, date: "<local midnight as ISO>", page: 1, start: 0, limit: 25 }` | `d[]`: one student's classes and events that day: `instanceId` (the roll), `activityId`, `name` (class), `subjectName`, `code`, `start`/`finish`, `rollMarked`, `manager` (teacher codes, HTML: struck-through codes are away), `location`, `priority`, `type`, `status`, `runningStatus`, `attendanceMode`, `layerName`, `hasAttendeeGroups`, `attendeeGroupId`, `approvalId`, `attendanceNoteDescription`, `id`. | Period inconsistencies: finds the roll of each period of a flagged student's day (`loadMarkings`). The same call as the Attendance tab of a student's profile. |
| `Attendance.svc/GetArrivalsAndDepartures` | `{ fromFilter: null, toFilter: null, typeFilter: null, filter: "[]", page, start, limit }` | `d.data[]`: `id`, `uid`, `n` (student), `ct` (1 = arrival, 2 = departure), `t` (time), `c` (reason), `minutesLate`, `formGroup`, `yearLevelId`, `userCreatorName`. | Arrivals & Departures, and the On site line in Attendance Today (today only: they stop at the first page with an older row). Period inconsistencies pages back (newest first, up to 60 pages of 100) until a row is older than the start of its range, for the sign-out notes. |

Fields of `GetRollPackage` that we don't use: `d.data`: `instanceId`, `finish`, `location`, `managerId`, `managerIi`, `isCurrentlyMarked`, `needsMarking`, `readonly`, `canResetRoll`, `resetVersion`, `loadedOn`, `tooEarly`, `attendanceMode`, `viewMode`, `viewingUserId`, `forms[]`, `attendeeGroups[]`, `flagsInfo[]` (`id`, `d`, `i`, `EncodedFields[]`, `systemFlagType`), `tpString`, `bannerMessage`, `assetPath`, `idPhotosPath`, `isBreakfastClubRegister`, `sickBayAdmin`, `smsEnabled`, `showFlags`, `showImportIdentifiers`, `showAutomaticInternationalStudentFlag`, the Chronicle switches (`chronEnabled`, `chronUserView`/`Edit`, `chronPowerView`/`Edit`, `chronAdminView`/`Edit`, `chronicleOutcomesEnabled`). Each `rollData[]` line also has the student's `n` (name), `ln`, `frm` (form), `ii`, `di`, `img`, `s` (the roll status), `chk`, `ex`, `f[]`, `c`, `linkedRollInstanceId`, `predicted`, `detectedApprovalId`, `detectedApprovingInstanceId`, `chroniclePinnedCount`, `isBirthday`, `isUnder18`, `userBaseRole`, `rfid[]`, `tagEntryIds`, `tagTemplateIds`, `entryTagUnicodeCollection`, and many welfare and support flags (for example `hasStudentAlerts`, `hasLearningNeeds`, `hasDietaryNeeds`, `dietaryTitles[]`, `mc_titles[]`, `medicalConditionImage`, `inCare`, `indigenousStudent`, `indigenousDetails`, `internationalStudent`, `freeMeals`, the photo-publishing switches and UK-specific flags). These are sensitive: use them only when a widget needs them. Each `userTimeLinePeriods[]` entry also has `attendanceOverride`, `onCampus`, `periodId`, `importIdentifier`, `teachingTime` and `userId`; its `extendedStatus` has the full code record (see `Subjects.svc/GetExtendedStatusOptionsFor` below).

A class roll's instance ID is the activity ID + the date (`ddmmyyyy`) + the UTC start time (`hhmm`). See `instanceIds()` in `attendance/data.js`.

The teacher field `m` in the unmarked rolls is HTML. A relief teacher shows as `<s>(cstrife) Cloud STRIFE</s>&nbsp; (bwallace) Barret WALLACE`: struck-through names are away. We read it as text only.

### Classes and timetable

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `Subjects.svc/GetSubjectsInAcademicGroup` | `{ academicGroupId: -1, includeDataSyncSubjects: true, page: 1, start: 0, limit: 1000 }` | `d.data[]`: `id`. | Attendance "by period"; Attendance Today and Period inconsistencies with more than AM/PM |
| `Subjects.svc/GetStandardClassesOfSubject` | `{ subjectId, page: 1, start: 0, limit: 1000 }` | `d.data[]`: `id` (activity ID), `start`, `finish` (when the class runs). | As above (one request for each subject) |
| `ReferenceData.svc/GetAllActivePeriodStructures` | `{ year, page: 1, start: 0, limit: 25 }` | `d[]`: `id`, `name`, `isDefault`, `cycleLength`. | Current Period, Attendance Today, Attendance "by period", Period inconsistencies (`shared/periods.js`) |
| `ReferenceData.svc/GetPeriodDaysBySelectedPeriodStructure` | `{ year: "2026", periodStructureId: "<id>" }` | `d[]`: `id` (period day ID), `d` (cycle day number). | As above |
| `ReferenceData.svc/GetAllPeriodsForStructure` | `{ structureId, year, page: 1, start: 0, limit: 500 }` | `d[]`: `n` (name), `pn` (number), `s`/`f` (time of day on a fixed date), `pdid` (period day ID). | As above |
| `ReferenceData.svc/GetCalendarDataForPeriodStructure` | `{ year: "2026", periodStructureId: "<id>" }` | `d.d[]`: `dateEqualityProperty` (the date, "20261014"), `td` (a teaching day), `pdid` (period day ID), `n` (the day's name, for example "School Development Day"). | As above. Optional: without it, the widget uses the cycle days only. |
| `Newsfeed.svc/GetAllExpiredNewsItems` | `{ start, limit: 500, sort: "string", filterOptions: {} }` (Compass's News page sends the same; the homepage sends `limit: 10`) | `d.total` (all expired posts, more than 1,000 at the school we tested) and `d.data[]`: `NewsItemId`, `Title`, `Content1` (the post body, HTML), `Content2`, `Start`, `Finish`, `PostDateTime`, `UserId`, `UserName`, `CreatedByAdmin`, `Attachments[]`, `Tags[]`, `Priority`, `Locked`, `NewsItemGroupTargets[]` (`BaseRole`, `YearLevels`, `FormGroups`, `Houses`, `CampusIds`, `ActivityIds`, `UserIds`, `Future`), `NewsItemCustomGroupTargets` (`CampusIds`, `CustomGroupIds`), `NewsItemAlumTargets`, the comment and reaction switches (`IsFeed…Enabled`) and the publishing flags (`PublicWebsite`, `PublishTo…`). Newest first. Seen with an account that can manage news; not yet confirmed for an ordinary staff account. | Current Period, School timetable source (`shared/periods.js`): looks through up to 4 pages for the newest post with a timetable code (`CPT1.…`) in `Content1`/`Content2`, and keeps the timetable for 6 hours. |

### Staff and relief

| Call | Body | What we use | Used by |
| --- | --- | --- | --- |
| `Instance.svc/GetClassManagerLinesForClassChanges?_dc=<time>` | `{ startTime, finishTime (ISO), activityName: "", teacherId: null, runningStatus: 1, yearLevelId: null, page: 0, start: -500, limit: 500 }` (the same odd paging as the Daily Org page) | `d.data[]`: `id`, `s`/`f`, `n` (class), `p` (period), `ls[].l` (rooms), `teachers[].t` (HTML: struck-through codes are away). `d.total`. | Relief |
| `ChronicleV2.svc/GetStaff` | `{}` (falls back to a `GET`). Compass's own pages send `{ page, start, limit }`. | `d[]`: `displayCode` (staff code), `n` (name). Also `id`, `ii`, `ln`, `p`, `pv`, `nameFirstPrefLastIdForm`, `isSystemAccount`, `userStatus`. | Relief (code → name) |

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

The homepage cards (`homepage.js`) read `Compass.organisationUserBaseRole` from the page's inline script (see the homepage `GET /` below). While a staff member impersonates another user it is that user's role, and the cards don't show when it is 1 (student) or 3 (parent).

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
| `GetHalfDaySummaryGridLinesByWeekStart` (more fields) | as above | Fields we don't request yet: `displayCode` (names: use only when a widget needs them; `reportName` and `lastName` are used by Period inconsistencies), `campus`, `attendancePercentage` (each student's percentage), `timeAmountArrivedLateAm`/`Pm` (minutes late), `amExtendedStatusId`/`pmExtendedStatusId` (an encoded ID; we use the `…Raw` number instead), `userFlags[]` (`description`, `imageUrl`), `chroniclePinnedCount`, `displayFormatName`. |
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
| `Newsfeed.svc/GetMyOwnNewsItems` | `{ start: 0, limit: 10, sort: "string", filterOptions: {} }` | The user's own posts: the same fields as above, in `d.data[]`, and `d.total`. |
| `Newsfeed.svc/SaveNew` | not in the HAR | A news post with the same fields as above (the new or saved post). |
| `Newsfeed.svc/GetGroupTargetOptions` | not in the HAR | `d`: `BaseRole`, `YearLevels[]`, `FormGroups[]`, `Houses[]`, `CampusIds`, `ActivityIds`, `UserIds`, `Future`: the audiences a post can target. |
| `Newsfeed.svc/GetMyAlerts` | not in the HAR | `d[]`: `AlertItemId`, `Title`, `Body`, `Content`, `LinkText`, `LinkUrl`, `ImageSourceUrl`, `IsWarning`, `Dismissible`, `Type`. |
| `NewsFeed.svc/GetArchivedYearLevelShortNames` | not in the HAR | `d[]`: `Key`, `Value` (a year level's short name). |
| `Feed.svc/GetFeedItems` | not in the HAR | The homepage feed: `d[]` with `feedItemId`, `newsFeedItemId`, `title`, `itemContent` (HTML), `start`, `createdTimestamp`, `createdUserName`, `userIdCreator`, `attachments[]` (`attachmentId`, `name`, `path`, `type`), `tags[]`, `isPriority`, `isRead`, `isSaved`, `isViewed`, `viewCount`, `commentCount`, `comments[]`, `reactionCount[]`, `canComment`, `canReact`. Current posts only. |
| `Feed.svc/GetUnreadCount`, `GetSavedCount`, `GetFilterViewUserAttribute` | no body (`GetFilterViewUserAttribute` not in the HAR) | `d`: a number. |
| `Feed.svc/GetFeedItemsByActivityId` | no body in the HAR | A class page's feed: `d[]` with the same fields as `GetFeedItems`, plus `chronicleEntryId`, `feedItemIdParent`, `feedItems`, `overrideCreatorName`, `reaction`, `sourceSchoolId`, `userIdUpdater`, `userPhotoPath`, `tags[]` (`displayValue`, `name`, `value`). |
| `NewsFeed.svc/GetMyUpcoming` | `{ userId: "<id>" }` | `d[]`: the same fields as `GetMyAlerts` (`AlertItemId`, `Title`, `Body`, `Content`, `LinkText`, `LinkUrl`, `ImageSourceUrl`, `IsWarning`, `Dismissible`, `Type`). |
| `NewsFeed.svc/GetUserProfileAlerts` | `{ userId: "<id>" }` | `d[]` (empty in the HAR). |
| `FileDownload/FileRequestHandler` | `GET ?FileDownloadType=…&attachmentId=…&preview=true&source=feed` | A news attachment (an image or a file), not JSON. |

### Homepage, settings and reference data

| Call | Body | Response |
| --- | --- | --- |
| `Calendar.svc/GetCalendarEventsByUser` | `{ userId, homePage: true, activityId: null, subjectId: null, locationId: null, staffIds: null, startDate, endDate, page, start, limit }`, with `?ExcludeNonRelevantPd=true` | `d[]`: the user's events, with `activityId`, `activityType`, `instanceId`, `start`, `finish`, `allDay`, `title`, `description`, `location`, `backgroundColor`, `calendarId`, `attendanceMode`, `isRecurring` and more. The older call beside `GetCalendarEventsByUserWeb`. |
| `GET /` (the homepage, HTML) | none | An inline script sets the page globals, including `Compass.organisationUserId`, `organisationUserBaseRole` (1 student, 3 parent; while impersonating, the impersonated user's), `organisationUserFirstAndLastname`, `organisationUserSussiId`, `organisationUserRoles` ({ role name: true }), `compassPersonId`, `schoolId`, `organisationId`, `schoolName`, `schoolPrimaryFqdn`, `headAncestorId`, `hasChildOrganisations`, `isInHierarchy`, `isNetworkPortal`, `isCrtAccount`, `isSaMode`, `isBoardingSchool`, `yearLevels[]`, `identifications[]`, `uiLanguage`, `lingo`, the photo paths (`idPhotosPath`, `idSquarePhotosPath`, …), `authUrl`/`externalAuthUrl`, `mfeConfig.*Url` (the micro-frontend scripts), `attributes.*` (school settings) and `features`. Also on `Compass`: more photo paths (`idBiblioPhotosPath`, `idCardPhotosPath`, `idRollPhotosPath`, strings), `assetPath`, `assemblyVersion` (the Compass version), `DefaultIntakeId`, the switches `core`, `isDev`, `isTesting`, `isCenet`, `isCompassFms`, `isHeadOfThreeTierAncestry`, `isTargetingAncestry` and `showCookieBanner`, the service addresses `pulseURL`, `tokeniserUrl` and `largeFileUploadsPortal`, `facebookAppId`, `stripeConnectPublishableKey`, and the objects `chat`, `mfeLocalConfig`, `referenceDataCacheKeys` (the `v=` keys for `ReferenceDataCache.svc` calls, by the look of the name) and `verification`. The menu's Impersonate item (`.impersonate-element`) opens `Compass.widgets.ImpersonateWidget`. |
| `Configure.svc/GetTeachingDaysForPeriod` | not in the HAR | `d`: a number of teaching days. |
| `Configure.svc/GetMyFavouriteModules`, `GetAvailableWebFavouriteDefinitions` | not in the HAR | `d[]`: `name`, `url` (the menu favourites). |
| `Configure.svc/GetModuleSchoolAttributes` | not in the HAR | `d[]`: the school's settings for a module (`attributeName`, `attributeGroup`, `attributeType`, `defaultValue`, `description`, …). |
| `Device.svc/HasDevice` | not in the HAR | `d`: true when the user has the Compass app. |
| `PeopleManagement.svc/GetCustomGroups` | not in the HAR | `d[]`: `id`, `name`, `description`, `memberCount`, `userBaseRole`. All groups, not only student groups: the extension must keep using `GetCustomGroupsByBaseRole`. |
| `User.svc/GetAllStaffWithoutActiveAt` | `{}` | `d[]`: all staff with `id`, `displayCode`, `fn`/`ln`/`f`/`n`/`ns`/`nif`/`reportName`/`namePrefFirst`/`namePrefLastId`/`nameFirstPrefLastIdForm` (names), `u` (username), `ii`, `baseRole`, `campusId`, `userStatus`, `start`, `finish`, `ce`, `h`, `phoneExtension`, `mobileNumber`, `doNotContact`, `govtCode1`/`govtCode2`, `sussiId`, `rfid`, `rfidCards[]`, `groupA`–`groupE`, `parentIds[]`, `p`, `pv`, `hasRegisteredDevice`, `idPhotoVisibleInCompass`, `y`, `yln`, and the `Formatted…` name fields (null in the HAR). Personal data: use only when a widget needs it. |
| `ReferenceDataCache.svc/GetAllTerms`, `GetCurrentTerm` | `GET ?v=…&page=1&start=0&limit=25` | `d` (one term) or `d[]`: `id`, `n` (name), `s`/`f` (start and finish), `sl`, `cy`. Could give term-based ranges (for example a term attendance trend). |
| `ReferenceDataCache.svc/GetAllCampuses` | `GET ?v=…&page&start&limit` | `d[]`: `campusId`, `campusName`, `name`, `defaultCampus`, `active`, `archived`, `campusGuid`, `importIdentifier`, `ageId`. |
| `ReferenceDataCache.svc/GetActiveCategories` | `GET ?page=1&start=0&limit=25` | `d[]` (empty at the school we tested). |
| `ReferenceDataCache.svc/GetTranslation` | `GET ?language=en&namespace=translation` | Compass's interface text, not JSON. |

### Classes and class rolls (seen when opening and marking a roll)

| Call | Body | Response |
| --- | --- | --- |
| `Attendance.svc/GetRollExtraInfo` | `{ userId: "<id>", instanceId: "<roll instance ID>" }` | One student's extra roll details: `d.attendanceLines[]` with `an` (class code), `as` (status name) and `t` (a time range text, "dd/mm - hh:mm AM to dd/mm - hh:mm AM"); also `uid`, `baseRole`, `hasAnyChronicleEntries`, `hasPinnedChronicleItems`, `learningNeedLines[]`, `medicalLines[]`, `freeMeals[]`, `sendNeeds[]`, `sendStatuses[]`. No marker or save time. |
| `Activity.svc/CanMarkRoll` | `{ instanceId, activityId }` | `d`: true when the user can mark the roll. |
| `Activity.svc/GetEnrolmentsByActivityId?_dc=<time>` | `{ activityId, page, start, limit }` | `d[]`: a class's students: `uid`, `n` (name), `f`, `ii`, `yl`/`yln` (year level), `ss`/`fs` (enrolment start and finish), `aid`, `acid`, `ea`, `pi`, `uf[]`, `managerId`, `managerImportIdentifier`, `aii`, `an`. |
| `Activity.svc/GetLessonsByInstanceIdQuick` | `{ instanceId }` | One class session: `ActivityId`, `ActivityDisplayName`, `SubjectId`/`SubjectName`/`SubjectShortname`, `st`/`fn` (start and finish), `l` (room), `m` (teacher), `managers[]` (`ManagerUserId`, `ManagerName`, `ManagerImportIdentifier`, `ManagerPhotoPath`, `Covering…` for a relief teacher), `CoveringUid`, `AttendeeUserIdList[]`, `AttendeeCount`, `AttendanceMode`, `ExtendedStatusId`, `RunningStatus`, `irm`, `LocationDetails` (room record), `locations[]`, the `Is…` type switches (`IsStandardClass`, `IsMeeting`, `IsExam`, …), the `…Instance` timing switches, and the user's permissions (`UserCanEdit`, …). |
| `Activity.svc/GetLessonsByInstanceId`, `GetLessonsByActivityId` | `{ instanceId }` or `{ activityId }` | A class with every session: `ActivityId`, `ActivityDisplayName`, `AcademicYearLevel`, `SubjectId`/`SubjectName`/`SubjectShortName`, `FacultyId`, `ActivityPermissions`, `Instances[]` (each with the fields of `GetLessonsByInstanceIdQuick`), `RollTapThreshold`. |
| `Activity.svc/GetPermissionsForActivity` | `{ activityId }` | `d`: `canEdit`, `canDelete`, `canGenerateLessonPlans`. |
| `Activity.svc/GetHeaderImageUrlByActivityId` | `{ activityId }` | `d`: the class banner image path. |
| `Activity.svc/GetGroupActiviesList?_dc=<time>` | `{ page, start, limit }` | `d[]` (empty in the HAR). |
| `LearningTasks.svc/GetActivityAttendees?_dc=<time>` | `{ activityId, includeWithdrawn, page, start, limit }` | `d[]`: `uid`, `n` (name), `l`, `pi`, `c`. |
| `LearningTasks.svc/GetAllLearningTasksByActivityId?_dc=<time>` | `{ activityId, page, start, limit, sort }` | `d.data[]` (and `d.total`): a class's learning tasks with `id`, `name`, `activityId`/`activityName`, `categoryId`, `createdTimestamp`, `dueDateTimestamp`, `description`, `hidden`, `gradingItems[]`, `attachments[]`, `securityOptions[]`, `students[]` (`userId`, `userName`, `submissionStatus`, `submittedTimestamp`, `lastSubmittedTimestamp`, `dueDateTimestamp`, `results[]`, …) and many report settings. |
| `LearningTasks.svc/GetAllTaskCategories?_dc=<time>` | `{ page, start, limit }` | `d[]`: `categoryId`, `categoryName`, `categoryColour`. |
| `RollFlag.svc/GetAllRollFlags?_dc=<time>` | `{ page, start, limit }` | `d[]`: the flags that can show on a roll: `id`, `d` (description), `i` (icon), `onRoll`, `onId`, `npuChronicleTemplateId`. |
| `Subjects.svc/GetExtendedStatusOptionsFor?_dc=<time>` | `{ activityType, page, start, limit }` | `d[]`: the attendance codes for that kind of activity, with the full code record: `id`, `n` (name), `c`, `d`, `shortCode`, `shortName`, `schoolSystemExportIdentifier`, `schoolSystemType`, `schoolSystemCountedAbsence`, `note`, `ordinal`, `def`, `pdef`, `isCustom`, `uiStatus`, `acaraGrouping`, the `periodCalc_…` switches (`Present`, `NotMarked`, `LateUnapproved`, `LateParentApproved`, `NotPresentUnapproved`), where it shows (`standardClassesUi`, `eventsUi`, `parentApprovalsUi`, `studentApprovalsUi`, `schoolActivitiesUi`), `isAttendanceAdminDefault`, `attendanceGridDisplayMode`, `attendanceGridOrdinal`, `lastModified`/`lastModifiedUserId` (about the code itself, not a mark; null in the HAR), `rowGuid`, `sourceRowGuid`. The `.svc` version of the GraphQL query above. |
| `Attendance.svc/GetNotesForStaffApprovingStudents` | `{ page, start, limit }` | `d[]`: the codes staff can use for an approval, with the code record fields above. |
| `Attendance.svc/GetParentApprovalEditorPackage?_dc=<time>` | `{ page, start, limit }` | The approval editor: `id`, `n`, `s`/`f` (start and finish), `r[]` (the codes, as above), `sr`, `da`, `prefillDate`, `approvalStatus`, `authorisationComment`, `authoriserName`, `approvalAttachments`, `c`, `cn`, `studentNames`, `studentNameDisplayFormat`, `studentNamesDisplayFormat`. |
| `Attendance.svc/GetApprovalStatuses` | `{}` | `d[]`: `enumValue`, `description`, `ordinal` (approval states). |
| `Attendance.svc/GetAuthorisationStatuses` | `{ authorisationMode }` | `d[]`: `enumValue`, `description`, `ordinal`. |
| `Configure.svc/GetThermalPrinterClients?_dc=<time>` | `{ page, start, limit }` | `d[]`: the school's sync and printer devices: `uid`, `name`, `type`, `connected`, `connectionMethod`, `version`, `environment`, `lastCommunicated`, `dateRegistered`, `isDefault`, `has…` switches and more. Not attendance data. |

### A student's profile (seen on a student's Attendance tab)

| Call | Body | Response |
| --- | --- | --- |
| `AttendanceV2.svc/GetPeriodsForTimeline?_dc=<time>` | `{ userId: <number>, date: "<ISO>", page, start, limit }` | `d[]`: one student's periods that day, the same shape as a roll's `userTimeLinePeriods[]` (with the full `extendedStatus`). One request gives one student's day, without opening a roll. |
| `AttendanceV2.svc/GetDayOverviewForTimeline?_dc=<time>` | as above | `d[]`: the same fields, without `extendedStatus` (null). |
| `AttendanceV2.svc/GetCheckInsForUserInTp` | as above | `d[]` (empty in the HAR). |
| `AttendanceV2.svc/GetHalfDaySummaryGridLines` | `{ userId: <number>, year: <number>, page, start, limit }` | One student's half-day grid for the year, one line per day: `date`, `dateEqualityProperty`, `dayOfWeek`, `amExtendedStatusId`/`pmExtendedStatusId`, `amStatus`/`pmStatus` (numbers here), `amStatusName`/`Desc`/`ExportIdentifier`/`PeriodCalcNotMarked` and the PM ones, `countedAbsence` and its `…ExportIdentifier`/`ReasonDesc`/`ReasonStatus`, `wholeDayAbsence`, `partialAbsence`, `wholeDayExportIdentifier`, `partialDayExportIdentifier`, `mostPrevalentStatus`/`Desc`/`ExportIdentifier`, `timeAmountExpected`, `timeAmountAbsent`, `timeAmountAbsentCounted`/`NotCounted`, `timeAmountNotMarked`, `timeAmountUnscheduled`, `timeAmountArrivedLateAm`/`Pm`, `qldHalfDayCodeAM`/`PM`, `userId`. |
| `Attendance.svc/GetAttendanceSummary` | `{ startDate, endDate, studentStatus, inClass[], overall[], okClass[], vce[], schl[], perspective, totalWholeDayLimit, totalPartialDayLimit, userId }` | `d[]`: attendance totals for a date range: `uid`, `un`/`fn`/`ln`/`sn` (names), `fg` (form), `aid`/`an`, `p`/`pa` (present), `ta`, `tna`, `la`/`l`/`lu` (late), `npa`/`npu` (not present approved/unapproved), `authorizedabsence`, `unauthorizedabsence`, `counted`, `notcounted`, `c`, `im`, `po`, `pok`, `ovp`, `spc`, `vpc`, `vceok`, `notPresentCountedVceOk`, `aea`, `Uktna`. With the student filter left out it may give the whole school: a possible source for an attendance watchlist (check with a HAR first). |
| `ReferenceData.svc/GetTermAttendanceDays?_dc=<time>` | `{ userId, year, includeYearSummaryRow, page, start, limit }` | `d[]`: one student's totals per term: `termName`, `termCount`, `wholePresent`, `wholeCounted`, `wholeNotCounted`, `partialPresent`, `partialCounted`, `partialNotCounted`, `fullDayAbsence`, `halfDayAbsence`, `attendanceRatePercent`. |
| `ReferenceData.svc/GetDefaultCalendarDays?_dc=<time>` | `{ year, page, start, limit }` | `d[]`: every day of the year: `d`, `dateEqualityProperty`, `tzDate`, `day`, `month`, `year`, `dayOfWeek`, `dow`, `td` (a teaching day), `ph` (public holiday), `n` (the day's name), `pdid`, `periodDayNumber`, `periodStructureId`, `isDefaultPeriodStructure`, `tdid`, `isCustom`, `ylIds`, `rowGuid`, `sourceOrgName`. |
| `User.svc/GetUserDetailsBlobByUserId?_dc=<time>` | `{ targetUserId, targetSchoolId, page, start, limit }` | A user's profile: names (`userFullName`, `userFirstName`, `userLastName`, `userPreferredName`, `userReportName`, …), `userYearLevel`/`Id`, `userHouse`, `contextualFormGroup`, `userEmail`, `userDisplayCode`, `userRole`, `userStatus`, `userCampusId`, `userPhotoPath`, `age`, `birthday`, `gender`, `userFlags[]`, `userTimeLinePeriods[]` (today's periods, as in a roll) and more. Personal data. |
| `User.svc/GetAllByIdsBasic` | `{ userIds: [<number>], page, start, limit }` | `d[]`: `id`, `n`/`f`/`lastName`/`p`/`pv` and the name-format fields, `displayCode`, `ii`, `compassPersonId`, `y`/`yearLevelName`, `userStatus`, `checkInMarkingMode`, `isPrimaryAccountHolder`. |
| `User.svc/GetNamesById` | `{ userIds: [<number>] }` | `d[]`: `id`, `n`, `firstName`, `lastName`, `preferredName`, `title`, `p`, `pv`, `namePrefLastId`, `nameFirstPrefLastIdForm`. |
| `Communications.svc/GetClassTeacherDetailsByStudent?_dc=<time>` | `{ userId: "<id>", page, start, limit }` | `d[]`: `subjectName`, `ids[]` (the teachers' user IDs). |
| `Calendar.svc/GetEventsByUser?_dc=<time>` | `{ userId, homePage, activityId, subjectId, locationId, staffIds, startDate, endDate, page, start, limit }` | `d[]` (empty in the HAR). |
| `Calendar.svc/GetCurrentWhereabouts` | `{ userId, includeParentApprovals }` | `d`: `currentEvents[]`, `nextEvent`, `activeApprovals[]` (all empty in the HAR). |
| `ChronicleV2.svc/GetSummaryByUserId?_dc=<time>` | `{ targetUserId, page, start, limit }` | `d[]`: per Chronicle category: `category`, `categoryName`, `totalCount`, `yearCount`, `totalPoints`, `useForAggregatedPoints`, `pinnedEntries[]`. |
| `ChronicleV2.svc/GetUserChronicleFeedThin` | `{ targetUserId, startDate, endDate, filterCategoryIds[], asParent, start, pageSize, sortOrder }` | `d.data[]` (and `d.total`): `parentEntryId`, `feedComments[]`, `chronicleEntries[]` with `id`, `templateName`, `categoryId`/`categoryName`, `createdTimestamp`, `occurredTimestamp`, `creatorName`, `userNameCreated`/`userNameModified`, `attendeeNames`, `primaryAttendeeId`, `points`, `rating`, `needsApproval`, `sickbayEntry`, `meetingEntry`, `visibleToParents`/`Students` and more. |
| `ChronicleV2.svc/GetGraphDataByUserId` | `{ targetUserId, startDate, endDate }` | `d[]` (empty in the HAR). |
| `ChronicleV2.svc/GetRelevantCategories` | `{ targetUserId }` | `d[]`: Chronicle categories, the same fields as `GetAllChronicleCategories`. |
| `ChronicleV2.svc/GetAllEntryTemplates?_dc=<time>` | `{ page, start, limit }` | `d[]`: every Chronicle template with its settings: `id`, `name`, `category`, `masterCategory`, `description`, `inputFields[]`, `communications[]`, `chronicleRoleGroups[]`, `approvalProcessLines[]`, `sickbayTemplate`, `rollFlagId`, `rollTagUnicode`, `enableRollTag`, `points`, `rating`, the visibility and security switches, and more. |
| `UserRecords.svc/GetGenders?_dc=<time>` | `{ showSelfDescribedGender, page, start, limit }` | `d[]`: `enumValue`, `name`, `description`, `ordinal`. |
| `Search.svc/GetSearchBarSuggestions` | `{ input }` | `d[]` (empty in the HAR). |
| `Attendance.svc/GetCheckinsDateFilterUserAttribute` | `{}` | `d`: a number (a saved filter setting). |

### Reference lists

| Call | Body | Response |
| --- | --- | --- |
| `ReferenceDataCache.svc/GetAllYearLevels` | `GET ?v=…&page&start&limit` | `d[]`: `k` (name), `v` (ID), `default`. |
| `ReferenceDataCache.svc/GetAllAcademicGroups` | `GET ?v=…&page&start&limit` | `d[]`: `id`, `name`, `importIdentifier`, `isRelevant`. |
| `ReferenceDataCache.svc/GetAllChronicleCategories` | `GET ?v=…&page&start&limit` | `d[]`: `id`, `name`, `archived`, `isSystemCategory`, `systemCategoryType`, `meetingCategory`, the graph and summary visibility switches, the points-compensation settings, `triggers[]`, `rowGuid`. |
| `ReferenceDataCache.svc/GetChronicleRatings`, `GetChronicleSharingTypes`, `GetChronicleMasterCategories`, `GetChronicleSecurityLevels` | `GET ?v=…&page&start&limit` | `d[]`: `enumValue`, `name`, `description`, `ordinal`, `group`, `stringEnumValue`. |
| `ReferenceDataCache.svc/GetAllMeasures`, `GetGradingSchemesForLearningTasks` | `GET ?v=…&page&start&limit` | `d[]`: grading schemes: `measureUniqueId`, `name`, `description`, `status`, `options[]` (`id`, `value`, `displayValue`, `ordinal`, …). |
| `ReferenceData.svc/GetChronicleFaculties?_dc=<time>` | `{ page, start, limit }` | `d[]` (empty in the HAR). |
| `StationeryManager.svc/GetAllStationeryTemplatesThinList?_dc=<time>` | `{ page, start, limit }` | `d[]`: letter templates: `id`, `name`, `isDefault`, `includeSchoolLogoHeader`, `includeSchoolLogoFooter`. |
| `ReferenceDataCache.svc/GetTranslation` | `GET ?language=en&namespace=translation` | Compass's interface text, not JSON (as above). |

### Other

| Call | Notes |
| --- | --- |
| `ChronicleV2.svc/GetEntry` | `{ id, archived: true }`: one full Chronicle entry with its fields. It is in `chronicle.js`, switched off (the details dialog didn't show all entries correctly). |
| `User.svc/GetAllStaff` | `{ page: 1, start: 0, limit: 5000 }`: all staff. In the switched-off code in `chronicle.js`. |
| `ReferenceDataCache.svc/GetAllLocations` | `GET` with `?page=1&start=0&limit=5000`: all rooms, `d[]` with `id`, `n`, `longName`, `roomName`, `building`, `archived`. In the switched-off code in `chronicle.js`. |
| `ChronicleV2.svc/GetEntriesRequiringMyApproval` | The Chronicle entries that wait for the user's approval. Named in `PLANNED_WIDGETS.md`, not confirmed with a HAR file yet. |

A student's profile page is `/Records/User.aspx?userId=<id>` (Compass redirects it to `/Records/UserNew.aspx?userId=<id>`). The Period inconsistencies page links to it. A class page is `/Organise/Activities/Activity.aspx` (seen with `?targetUserId=<id>`).

## Add a call to this file

When you add a Compass call to a widget, add a row here with the call, the body, the fields that the widget uses and the widget's name.
When you find a new call in a HAR file, add it to "Calls that we know but don't use". Replace all real names and IDs with made-up ones (see `.claude/rules/placeholder-names.md`).
