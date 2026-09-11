# Sprint 6 — Google Master integration

Reference: `docs/spec.md` §4.2 (status-column retry pattern), §4.3 (the two separate OAuth flows — this sprint is Flow B only), §5 (permission matrix), §6.4 (`contracts.driveUploaded`/`calendarCreated`/`driveFileId`/`calendarEventId`), §6.13 (`google_connection`).

Dependency note: 1-4 set up the connection itself and must be done in order. 5 depends on 2-3 (it needs a stored, encrypted refresh token to refresh from). 6-7 depend on 5 (they need a working, auto-refreshing API client). 8 depends on 6-7.

- [ ] **1. Set up Master OAuth credentials.** Create a separate Google Cloud OAuth client (distinct `GOOGLE_MASTER_CLIENT_ID`/`SECRET` from the login credentials in Sprint 2 — spec §4.3 is explicit that these must never be shared) with Drive and Calendar scopes and offline access. Done when a manual test of the consent flow returns tokens with the correct scopes.

- [ ] **2. Build the `google_connection` data layer.** Store and retrieve the refresh token encrypted at rest using `TOKEN_ENCRYPTION_KEY` (spec §11), and enforce that only one `google_connection` row can ever exist (spec §6.13 — singleton). Done when a token can be saved encrypted and decrypted correctly, and a second insert attempt is rejected or upserts the existing row instead of creating a duplicate.

- [ ] **3. Build the Master connect/callback flow.** A `super`-only page/route that starts the Google consent flow (separate from Auth.js) and a callback that exchanges the resulting code for tokens, storing them via task 2, including `connectedById` and `connectedAt`. Done when a `super` user can complete the flow and `google_connection.connected` becomes `true` afterward.

- [ ] **4. Build the reconnect banner.** Visible to all roles per spec §5: shows `connected`/`lastError` when disconnected. The reconnect action itself is only clickable for `super`; `normal` sees the same banner but with no way to trigger it. Done when a `normal` user can see a disconnected banner but has no reconnect control, and a `super` user's click leads into task 3's flow.

- [ ] **5. Build an auto-refreshing Google API client wrapper.** Wraps Drive/Calendar calls, transparently refreshing the access token from the stored refresh token. If the refresh itself fails (token revoked/expired), set `google_connection.connected = false` and populate `lastError` with a descriptive message, without throwing an unhandled error in whatever route triggered it. Done when deliberately invalidating the stored token causes the next API call to flip `connected` to `false` with a useful `lastError`, and the calling route still returns a graceful response.

- [ ] **6. Implement Drive upload.** Upload the generated contract image (from Sprint 5) to a designated folder in the Master Drive account; store the resulting `driveFileId` and set `driveUploaded = true`. Done when a successful upload is retrievable by its stored `driveFileId`, and re-running upload for a contract that already has `driveUploaded = true` does not create a duplicate file.

- [ ] **7. Implement Calendar event creation.** Create an event on the Master account's calendar using the contract's event date/time/venue; store `calendarEventId` and set `calendarCreated = true`. Done when re-running this for a contract that already has a `calendarEventId` updates the existing event instead of creating a second one.

- [ ] **8. Wire both into the confirm step with independent per-step retry.** After image generation (Sprint 5), attempt Drive upload and Calendar creation in sequence as part of the confirm flow. Each has its own status column, so a failure in one must not block retrying the other independently, per the §4.2 pattern. Done when a contract with (for example) `driveUploaded = true` but `calendarCreated = false` shows a "retry calendar" action on its detail page that only re-runs that one step.

---
When all 8 tasks are checked off, stop. Do not start Sprint 7 work until `specs/sprint-07-delivery/tasks.md` exists.
