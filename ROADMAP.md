# SyncPad Roadmap

This roadmap describes the current project and possible next steps. The **Available now** section reflects functionality in the repository; the remaining items are planned work, not promises or completed features.

## Available now

- Account registration and login, password hashing, and HTTP-only authentication cookies.
- Public and private collaborative rooms, owner invitations by email, member removal, and member leave.
- A Monaco code editor and collaborative whiteboard backed by a shared Yjs document.
- Realtime synchronization, awareness/presence, reconnect recovery, and per-user editor undo.
- MongoDB persistence with debouncing, idle-session eviction, room expiry, and graceful shutdown flushing.
- Server/client type checks, production builds, and a smoke test covering collaboration and room access.

## Roadmap

### 1. Release and operational readiness

- [ ] Document and verify a production deployment path for the web app, API/WebSocket server, and MongoDB.
- [ ] Add a repeatable staging environment and deployment checklist, including origins, HTTPS/WSS, secrets, and database backups.
- [ ] Add structured logs and operational guidance for diagnosing API, socket, and persistence failures.
- [ ] Review room expiry and backup/restore procedures against the intended data-retention policy.

**Done when:** a clean deployment can be configured and operated from documented steps, with health checks and a tested restore procedure.

### 2. Automated quality and reliability

- [ ] Add focused unit tests for authentication, room authorization, room-code handling, and session persistence.
- [ ] Expand integration coverage for reconnects, simultaneous room updates, persistence failures, and member access changes.
- [ ] Run type checks, tests, and production builds automatically on pull requests.
- [ ] Add a repeatable isolated test database setup and cleanup strategy.

**Done when:** core behavior is covered by automated checks that run without using production data.

### 3. Collaboration experience

- [ ] Improve connection and synchronization status feedback, including actionable reconnect errors.
- [ ] Review keyboard accessibility, responsive layouts, and screen-reader labels across authentication, dashboard, editor, and whiteboard flows.
- [ ] Add clear empty, loading, and error states for room and member management.
- [ ] Evaluate collaborative editing behavior in larger rooms and document supported room-size expectations.

**Done when:** common collaboration failures and primary workflows are understandable and usable across supported screen sizes and input methods.

### 4. Product and workspace improvements

- [ ] Evaluate richer whiteboard controls such as selection, erasing, and undo.
- [ ] Evaluate room history or export/import workflows for code and whiteboard content.
- [ ] Gather usage feedback before committing to additional workspace features.

**Done when:** each feature has an agreed scope, persistence behavior, and user-facing acceptance criteria before implementation.

## Guiding principles

- Preserve correct collaborative editing and room authorization as the highest priorities.
- Validate behavior end-to-end, including reconnects and persisted state, rather than relying only on UI checks.
- Keep new operational and product features documented and covered by relevant automated tests.
