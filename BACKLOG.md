# Rentz Arena Backlog

This backlog is ordered from highest to lower priority and mixes functional and non-functional work. It is based on the current state of the project: multiplayer table play exists, the rules engine and ruleset parsing endpoints exist, while account UI, friends, library, and marketplace are still partial or placeholder-only.

Priority guide:
- `P1`: critical for a usable end-to-end product
- `P2`: important for retention, creator workflow, and multiplayer quality
- `P3`: valuable polish or scale work after the core loop is stable

## Functional User Stories


### RA-01 - Session Persistence Across Refresh
Priority: `P1`
Type: `Functional`

User story:
As a signed-in player, I want my session to survive a refresh, so that I do not have to re-authenticate during normal use.

Acceptance criteria:
- The frontend restores the signed-in player on page reload.
- Expired or invalid sessions are cleared safely and the user is sent back to Login.
- Guest and authenticated flows remain clearly separated in the UI.

### RA-02 - Friend Code Search and Add Friend Flow
Priority: `P1`
Type: `Functional`

User story:
As a player, I want to add friends using friend codes, so that I can build a reusable multiplayer network.

Acceptance criteria:
- The Friends page supports searching by friend code and sending a friend request or direct add action.
- The user can see pending, accepted, and rejected states.
- Duplicate friend relationships are prevented.

### RA-03 - Friends List and Presence
Priority: `P1`
Type: `Functional`

User story:
As a player, I want to see my friends list and whether friends are online, so that I know whom I can invite to a table.

Acceptance criteria:
- The Friends page lists saved friends with display name, friend code, and current presence.
- Presence updates when a friend comes online, enters a lobby, or starts a game.
- Offline and unavailable states are visually distinct.

### RA-04 - Invite Friends to a Private Table
Priority: `P1`
Type: `Functional`

User story:
As a host, I want to invite friends directly into my room, so that I do not have to rely only on sharing a room code out of band.

Acceptance criteria:
- A host can invite one or more friends from the lobby.
- Invited players can accept and join the correct room from the app.
- The lobby shows who was invited and whether they accepted, declined, or timed out.

### RA-05 - Reconnect to an Active Match
Priority: `P1`
Type: `Functional`

User story:
As a player with a temporary disconnect, I want to rejoin my in-progress game, so that I do not lose my seat or break the match.

Acceptance criteria:
- A disconnected player can reconnect and recover hand, turn, collected hands, and current trick state.
- The lobby or table reflects player connection state.
- A reconnect timeout policy is defined and enforced.

### RA-06 - Ruleset Preview Simulation in the Editor
Priority: `P1`
Type: `Functional`

User story:
As a ruleset author, I want to simulate a ruleset against sample hand data, so that I can validate the behavior before publishing or using it in a game.

Acceptance criteria:
- The editor exposes a preview form for player count, initial points, hand cards, and non-discarded cards.
- The frontend calls the existing evaluate preview endpoint and shows the result clearly.
- Parse or evaluation errors are explained inline without wiping the draft.

### RA-07 - Save Rulesets to Account Library
Priority: `P1`
Type: `Functional`

User story:
As a ruleset author, I want my saved drafts and published rulesets tied to my account, so that I can access them across devices.

Acceptance criteria:
- The Library page lists authored, saved, and recently used rulesets for the current user.
- A signed-in user can save or update a ruleset from the editor.
- Rulesets are loaded from the backend, not only local storage.

### RA-08 - Publish Rulesets to the Ruleset Rater
Priority: `P2`
Type: `Functional`

User story:
As a creator, I want to publish a ruleset with title, description, tags, and visibility, so that other players can discover and use it.

Acceptance criteria:
- A signed-in author can publish or unpublish a ruleset.
- Published rulesets include author, description, type, tags, and code version metadata.
- Invalid or unsafe rulesets are rejected before publication.

### RA-09 - Ruleset Rater Browse, Filter, and Sort
Priority: `P2`
Type: `Functional`

User story:
As a player, I want to browse and filter public rulesets, so that I can quickly find interesting game variants.

Acceptance criteria:
- The Ruleset Rater page shows public rulesets from the backend.
- Players can filter by type, tags, author, and popularity.
- Sorting supports recent, most upvoted, and most downloaded.

### RA-10 - Upvote, Download, and Save Rulesets
Priority: `P2`
Type: `Functional`

User story:
As a player, I want to upvote and save useful rulesets, so that high-quality variants rise and I can reuse them later.

Acceptance criteria:
- A player can upvote a ruleset once and remove their vote later.
- Download and save counts are updated consistently.
- Saved marketplace rulesets appear in the player library.

### RA-11 - Select Rulesets Before Starting a Match (!!!)
Priority: `P2`
Type: `Functional`

User story:
As a host, I want to choose the active rulesets before starting a match, so that the game uses the intended scoring and end-game behavior.

Acceptance criteria:
- A host can pick from personal drafts, saved rulesets, or marketplace rulesets in the lobby.
- All players see which ruleset is active before the game starts.
- The selected ruleset is persisted with the game record.

### RA-12 - Match History and Final Standings Archive (!!!!!!!)
Priority: `P2`
Type: `Functional`

User story:
As a player, I want to review previous games and standings, so that I can track outcomes and revisit memorable matches.

Acceptance criteria:
- A player can open a history view of completed games.
- Each record includes room code, date, players, ruleset, and final standings.
- A completed game can be opened from history for a summary view.

### RA-13 - Post-Game Summary and Replay Timeline (legat de tabel, nu joc in sine)
Priority: `P2`
Type: `Functional`

User story:
As a player, I want a richer post-game breakdown, so that I can understand how the match unfolded and why someone won.

Acceptance criteria:
- The end-of-game screen shows hand-by-hand winners and scoring changes.
- Players can inspect collected hands and round events after the match ends.
- The summary makes it easy to compare player performance.

### RA-14 - Public and Friends-Only Room Visibility
Priority: `P3`
Type: `Functional`

User story:
As a host, I want to choose whether a room is private, friends-only, or public, so that I can control who can discover and join it.

Acceptance criteria:
- Room visibility can be chosen when creating a lobby.
- Friends-only and public rooms respect the selected visibility rules.
- Players can browse joinable public or friends-only rooms from the app.

### RA-15 - In-App Notifications and Activity Inbox
Priority: `P3`
Type: `Functional`

User story:
As a player, I want to see invites, friend activity, and Ruleset Rater updates in one place, so that I stay aware of relevant events without leaving the app.

Acceptance criteria:
- The app records unread invites and social or content notifications.
- The user can review and dismiss notifications from a dedicated inbox.
- Notification badges appear in the shell when unread items exist.

## Non-Functional User Stories

### RA-16 - Accessibility Baseline
Priority: `P1`
Type: `Non-Functional`

User story:
As a player with accessibility needs, I want the interface to meet a strong accessibility baseline, so that the game is readable and usable for more people.

Acceptance criteria:
- All major interactive flows are keyboard navigable.
- Theme palettes meet agreed color-contrast targets for primary and secondary text.
- UI controls expose accessible names, focus states, and semantic roles.

### RA-17 - Responsive Quality and Device Support
Priority: `P1`
Type: `Non-Functional`

User story:
As a mobile or tablet player, I want consistent responsive behavior across screen sizes, so that matches remain playable and readable on smaller devices.

Acceptance criteria:
- Core flows are verified on common phone, tablet, and desktop breakpoints.
- Overflow behavior is intentional and documented for dense layouts such as card hands.
- Settings-based font scaling and subpage zoom do not make the app unusable.

### RA-18 - Automated Test Coverage for Core Flows
Priority: `P1`
Type: `Non-Functional`

User story:
As a developer, I want automated test coverage for game logic and critical user flows, so that new changes do not break multiplayer, auth, or ruleset execution.

Acceptance criteria:
- Rules engine tests cover parsing, evaluation, and failure cases.
- API tests cover auth, rulesets, and game retrieval.
- Frontend or end-to-end tests cover login, lobby join, gameplay, and ruleset preview.

### RA-19 - Security Hardening for Auth and User Input
Priority: `P1`
Type: `Non-Functional`

User story:
As a platform owner, I want authentication and user input to be hardened, so that accounts and backend services are protected from abuse.

Acceptance criteria:
- User-entered fields are sanitized and validated consistently.
- Sensitive tokens and secrets are never exposed to the client or logs.

### RA-20 - Performance and Real-Time Reliability Targets
Priority: `P2`
Type: `Non-Functional`

User story:
As a player in a live match, I want responsive table updates and stable socket behavior, so that the game feels immediate and trustworthy.

Acceptance criteria:
- The team defines latency and render targets for turn updates and hand transitions.
- Socket reconnect and retry behavior is monitored and tested.
- Heavy UI views such as collected hands and history remain responsive on modest devices.

### RA-21 - Observability and Support Diagnostics
Priority: `P2`
Type: `Non-Functional`

User story:
As a maintainer, I want structured logs and actionable diagnostics, so that multiplayer issues and production failures are easier to investigate.

Acceptance criteria:
- Backend logs include request context, room code, and failure metadata.
- Client-side errors can be correlated to backend events where appropriate.
- Health and readiness checks are sufficient for deployment monitoring.

### RA-22 - CI/CD and Release Quality Gate
Priority: `P2`
Type: `Non-Functional`

User story:
As a development team, I want a repeatable release pipeline, so that changes are validated before they reach shared environments.

Acceptance criteria:
- Linting, tests, and production builds run automatically in CI.
- Pull requests must pass the agreed quality gate before merge.
- Deployment steps are documented and reproducible.

### RA-23 - Data Retention and Recovery
Priority: `P3`
Type: `Non-Functional`

User story:
As a product owner, I want backup and recovery guidance for user, game, and ruleset data, so that accidental loss or infrastructure failure does not wipe the platform state.

Acceptance criteria:
- The team defines what data must be retained and for how long.
- Backup and restore procedures are documented and tested.
- Recovery objectives are agreed for critical production data.
