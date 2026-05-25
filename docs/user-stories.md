# User Stories

Acest document centralizează exact user story-urile definite în [BACKLOG.md](../BACKLOG.md), păstrând formularea originală.

## Functional User Stories

- `RA-01 - Session Persistence Across Refresh`
  As a signed-in player, I want my session to survive a refresh, so that I do not have to re-authenticate during normal use.
- `RA-02 - Friend Code Search and Add Friend Flow`
  As a player, I want to add friends using friend codes, so that I can build a reusable multiplayer network.
- `RA-03 - Friends List and Presence`
  As a player, I want to see my friends list and whether friends are online, so that I know whom I can invite to a table.
- `RA-04 - Invite Friends to a Private Table`
  As a host, I want to invite friends directly into my room, so that I do not have to rely only on sharing a room code out of band.
- `RA-05 - Reconnect to an Active Match`
  As a player with a temporary disconnect, I want to rejoin my in-progress game, so that I do not lose my seat or break the match.
- `RA-06 - Ruleset Preview Simulation in the Editor`
  As a ruleset author, I want to simulate a ruleset against sample hand data, so that I can validate the behavior before publishing or using it in a game.
- `RA-07 - Save Rulesets to Account Library`
  As a ruleset author, I want my saved drafts and published rulesets tied to my account, so that I can access them across devices.
- `RA-08 - Publish Rulesets to Rentz Forum`
  As a creator, I want to publish a ruleset with title, description, tags, and visibility, so that other players can discover, discuss, and use it through Rentz Forum.
- `RA-09 - Rentz Forum Feed, Search, and Discovery`
  As a player, I want a public social-feed style forum for rulesets and discussion, so that I can quickly find interesting game variants and community activity.
- `RA-10 - Likes, Bookmarks, Ratings, and Save Actions in Rentz Forum`
  As a player, I want to like posts, bookmark interesting content, rate attached rulesets, and save useful rulesets, so that high-quality variants rise and I can reuse them later.
- `RA-11 - Select Rulesets Before Starting a Match`
  As a host, I want to choose the active rulesets before starting a match, so that the game uses the intended scoring and end-game behavior.
- `RA-12 - Match History and Final Standings Archive`
  As a player, I want to review previous games and standings, so that I can track outcomes and revisit memorable matches.
- `RA-13 - Post-Game Summary and Replay Timeline`
  As a player, I want a richer post-game breakdown, so that I can understand how the match unfolded and why someone won.
- `RA-14 - Public and Friends-Only Room Visibility`
  As a host, I want to choose whether a room is private, friends-only, or public, so that I can control who can discover and join it.
- `RA-15 - In-App Notifications and Activity Inbox`
  As a player, I want to see invites, friend activity, and Rentz Forum updates in one place, so that I stay aware of relevant events without leaving the app.
- `RA-24 - All Players Must Ready Up Before Match Start`
  As a lobby host, I want every player to confirm readiness before the game starts, so that matches do not begin before everyone is prepared.
- `RA-25 - Spectate Live Games`
  As a player or guest, I want to spectate an ongoing match, so that I can watch friends play without interrupting the game.
- `RA-26 - Default, Imported, and Guest-Usable Rulesets`
  As a host, player, or guest, I want built-in rulesets and a way to import or create new ones in the same labeled format, so that I can quickly attach the right ruleset to a game even without an account.
- `RA-27 - AI Bot Players and Bot Replacement`
  As a player, I want AI bot players and bot replacement for abandoned seats, so that live matches can continue even when humans leave or extra seats need filling.
- `RA-28 - Trainer AI Mode`
  As a player, I want a training-focused AI opponent mode with adjustable difficulty and feedback, so that I can practice intentionally and improve.
- `RA-29 - Editor AI Ruleset Judge`
  As a ruleset creator, I want an editor-side AI judge that scores and reviews my custom rulesets, so that I can get guided feedback before sharing or using them.
- `RA-30 - Save Game and Continue Later`
  As a player, I want to save a match and continue it later, so that I can leave a game without losing the table state.

## Non-Functional User Stories

- `RA-16 - Accessibility Baseline`
  As a player with accessibility needs, I want the interface to meet a strong accessibility baseline, so that the game is readable and usable for more people.
- `RA-17 - Responsive Quality and Device Support`
  As a mobile or tablet player, I want consistent responsive behavior across screen sizes, so that matches remain playable and readable on smaller devices.
- `RA-18 - Automated Test Coverage for Core Flows`
  As a developer, I want automated test coverage for game logic and critical user flows, so that new changes do not break multiplayer, auth, or ruleset execution.
- `RA-19 - Security Hardening for Auth and User Input`
  As a platform owner, I want authentication and user input to be hardened, so that accounts and backend services are protected from abuse.
- `RA-20 - Performance and Real-Time Reliability Targets`
  As a player in a live match, I want responsive table updates and stable socket behavior, so that the game feels immediate and trustworthy.
- `RA-21 - Observability and Support Diagnostics`
  As a maintainer, I want structured logs and actionable diagnostics, so that multiplayer issues and production failures are easier to investigate.
- `RA-22 - CI/CD and Release Quality Gate`
  As a development team, I want a repeatable release pipeline, so that changes are validated before they reach shared environments.
- `RA-23 - Data Retention and Recovery`
  As a product owner, I want backup and recovery guidance for user, game, and ruleset data, so that accidental loss or infrastructure failure does not wipe the platform state.
