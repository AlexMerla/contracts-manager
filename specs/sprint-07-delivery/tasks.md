# Sprint 7 — Delivery: email, WhatsApp, and public viewer

Reference: `docs/spec.md` §3 (WhatsApp delivery via ManyChat — the app only produces the link), §4.2 (status-column retry pattern), §6.4 (`contracts.emailSent`, `viewerToken`), §10 (public contract viewer).

Dependency note: 1 must come first — it produces the public link the WhatsApp tasks depend on. 2-3 are the email group. 4-5 are the WhatsApp group. 6 depends on 2 and 4 being independently functional before wiring them into one sequence. 7-8 depend on 6.

- [ ] **1. Build the public contract viewer page.** Route `/contracts/view/[viewerToken]`, no authentication, looks up the contract by `viewerToken` only — never by internal `id` — and renders the contract image (regenerated on demand via the Sprint 5 endpoint). Done when a valid token shows the correct contract, and an invalid or unknown token returns a generic not-found response that doesn't reveal whether other tokens exist.

- [ ] **2. Integrate Resend for email.** On contract confirmation, send an email to `clientEmail` with the contract image attached (or a link to the viewer page). Set `contracts.emailSent = true` on success. Done when a test contract triggers a real delivery to a test inbox with correct content and attachment.

- [ ] **3. Add manual retry for email.** Per the §4.2 pattern: a "resend email" action on the contract detail page re-runs task 2 for that contract. Done when retrying a contract with `emailSent = false` sends the email and updates the flag on success.

- [ ] **4. Trigger the outbound ManyChat send.** On contract confirmation, call ManyChat's API with the client's `clientMobile` and the public viewer URL (built from `viewerToken`), so ManyChat sends the WhatsApp message — the app's responsibility per spec §3 is only to produce this link and hand it off, not to send WhatsApp messages directly. Done when a test contract results in a verified call to ManyChat (sandbox/test mode) with the correct phone number and link.

- [ ] **5. Add a manual "copy WhatsApp link" fallback.** The spec's `contracts` table has no `whatsappSent` status column — the ManyChat trigger in task 4 isn't tracked with the same retry-by-status mechanism as the other pipeline steps (see the note at the end of this file). Because of that, every contract's detail page must show the public viewer link with a copy-to-clipboard action, so staff can send it manually if the automatic trigger fails silently. Done when the link is visible and copyable on every contract regardless of whether task 4's automatic trigger succeeded.

- [ ] **6. Wire the full sequential pipeline into the confirm step.** In order: generate image (Sprint 5) → upload to Drive (Sprint 6) → create Calendar event (Sprint 6) → send email (task 2) → trigger ManyChat (task 4). Each tracked step's status column is independent, so a failure partway through must not prevent the remaining steps from running or being retried individually, per spec §4.2. Done when a deliberately-failed step (e.g. simulate Resend being down) still allows the pipeline to complete Drive/Calendar and leaves only the email step marked for retry.

- [ ] **7. Add delivery-status indicators to the contract list.** Small badges/icons per contract showing the state of `imageGenerated`/`driveUploaded`/`calendarCreated`/`emailSent`, so staff can spot incomplete contracts without opening each one. Done when a contract with any pending step is visually distinguishable in the list view.

- [ ] **8. Run one real end-to-end test.** Take a single test contract through the entire pipeline in a staging environment and confirm the image, Drive file, Calendar event, email, and WhatsApp link all work together correctly. Done when all five outputs are verified for the same contract and the result is documented.

---
**Open point worth deciding before or during this sprint:** unlike image/Drive/Calendar/email, the WhatsApp trigger has no status column in §6.4, so it can't be retried the same structured way. If you'd rather have parity across all five steps, add a `whatsappTriggered` boolean to `contracts` in the spec before starting task 4 — otherwise task 5's manual link is the intended safety net.

When all 8 tasks are checked off, stop. Do not start Sprint 8 work until `specs/sprint-08-payments-reports/tasks.md` exists.
