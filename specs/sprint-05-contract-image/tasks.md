# Sprint 5 — Contract image generation

Reference: `docs/spec.md` §4.2 (status-column retry pattern), §6.4 (`contracts.imageGenerated`), §7 (contract image generation).

Dependency note: these largely build on each other in order — the config needs the template asset, the wrapping helper and money formatting are used by the generation function, which is then wired into the confirm step, which is what the retry action and visual QA operate on.

- [ ] **1. Add the base template asset.** Commit the client's existing JPEG contract template to the repo as a versioned asset. Done when the file is committed and loadable by the app at a stable path.

- [ ] **2. Define the field-coordinate config.** A single declarative config object (e.g. `lib/contract-template/fields.ts`) with one entry per field that appears on the template (folio, client name, event date, amounts, etc.), including `x`/`y` and `maxWidth` where relevant — per the shape shown in spec §7. Done when every contract field that appears on the printed template has a corresponding config entry, and there are no coordinates hardcoded anywhere outside this file.

- [ ] **3. Build the shared text-wrapping helper.** A single `drawWrappedText(ctx, text, field)` helper used for every field, not only the ones expected to be long — per spec §7's explicit requirement. Done when a field whose text exceeds its `maxWidth` wraps to multiple lines instead of overflowing, verified with a deliberately long test string in at least one short-looking field (e.g. venue address).

- [ ] **4. Implement money formatting.** Format all monetary fields (total, deposit, balance, extra charge) with `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })` per spec §7. Done when formatted output matches the expected `$X,XXX.XX` style across a range of test amounts, including values under $10 and over $10,000.

- [ ] **5. Build the image generation function.** Using `@napi-rs/canvas`: load the template, draw every configured field via the wrapping helper, output a JPEG buffer. Done when calling the function with a sample contract's data returns a valid JPEG that visually matches the template with all fields correctly placed.

- [ ] **6. Wire generation into the confirm step, and expose it on demand.** After Sprint 4's confirm-and-create endpoint creates the contract, call the generation function and set `contracts.imageGenerated = true` on success. Also expose an endpoint that regenerates the image on demand from stored contract data (to be reused by Drive upload, email attachment, and the public viewer in later sprints — the image is derived data, not something that needs separate persistent storage yet). Done when both the automatic generation at confirm time and the on-demand endpoint produce equivalent images for the same contract.

- [ ] **7. Add manual retry for failed generation.** Per the §4.2 status-column pattern: if generation fails at confirm time, a "retry image generation" action on the contract detail page re-runs it. Since generation is derived from stored data, retrying is naturally idempotent — no special dedup logic is needed. Done when retrying a contract with `imageGenerated = false` regenerates the image and flips the flag to `true` on success.

- [ ] **8. Visual QA against edge cases.** Manually generate images for a handful of deliberately awkward contracts: a very long client name, a long venue address, and a contract with many packages/services listed. Done when none of these overlap another field or run off the template's edges, and the results are documented (e.g. as saved sample images) for future reference.

---
When all 8 tasks are checked off, stop. Do not start Sprint 6 work until `specs/sprint-06-google-integration/tasks.md` exists.
