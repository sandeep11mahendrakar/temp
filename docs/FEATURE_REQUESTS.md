# FEATURE REQUESTS — Review 3 ranked use cases (vision-only)

Owner: REVIEW-3-LANE3 (R3-T4a). Offline doc; no code changes, no browser runs.
Source policy: sites are stable demo/QA-practice targets only (Tier-1 lesson:
prove the pipeline on forgiving apps first). Goal strings are written to match
the Lane 1 planner templates (`login`, `signup`, `add-to-cart`, `checkout`,
`search`, `form-submit`, generic fallback). Success signals use observable
evidence only (url change, new rendered text such as Logout/Cart, `input_value`
verified) — never LLM self-report. Ranking = demo order for Review 3.

---

## UC-1 (rank 1): Login — FIRST demo target per D15

- **Goal string:** `log in to saucedemo.com with the on-page standard credentials`
- **Site:** https://www.saucedemo.com
- **Planner template:** `login`
- **Phases:**
  1. Reach the login form (initial state).
  2. Fill username with the on-screen standard username.
  3. Fill password with the on-screen password (different field from phase 2).
  4. Submit / click Login.
  5. Verify authenticated state.
- **Success signals:**
  - `input_value` verified on both fields before submit.
  - URL change to `/inventory.html`.
  - New rendered text: `Products`, `Swag Labs`, hamburger menu / `Logout`.
- **Risks:**
  - OCR misread of the on-page credential text (README: OCR noise is real);
    mitigate by using exactly the detected strings.
  - Filling the same field twice while the other stays empty (known explorer
    failure class) — planner/explorer must target a different empty field.
  - Quota: each action-selection step costs one free-tier LLM call.

## UC-2 (rank 2): Login-to-checkout chain — long-horizon flagship

- **Goal string:** `log in to saucedemo.com, add the backpack to the cart, and complete checkout`
- **Site:** https://www.saucedemo.com
- **Planner template:** `checkout` (embeds `login` + `add-to-cart` phases)
- **Phases:**
  1. Login (UC-1 phases 1-5).
  2. Add backpack to cart.
  3. Open cart, verify badge `1`.
  4. Start checkout, fill first/last/postal form.
  5. Overview page, finish.
  6. Verify order confirmation.
- **Success signals:**
  - Cart badge text `1`; `Cart` page lists the backpack.
  - URL chain: `/cart.html` -> `/checkout-step-one.html` ->
    `/checkout-step-two.html` -> `/checkout-complete.html`.
  - Final text: `Thank you for your order`.
  - `input_value` verified on all three checkout fields.
- **Risks:**
  - Long horizon (6+ phases): needs Lane 2 wiring (goal + current phase in
    every prompt, reject `done` while phases are open) plus the stuck rule
    (3 failed actions in one phase -> blocked).
  - Price/OCR text noise on overview page; quota multiplies with steps.

## UC-3 (rank 3): Form validation (positive + negative)

- **Goal string:** `fill and submit the DemoQA practice form, including one empty-submit to observe validation`
- **Site:** https://demoqa.com/automation-practice-form
- **Planner template:** `form-submit`
- **Phases:**
  1. Reach the practice form.
  2. Submit empty (negative case) and record validation markers.
  3. Fill each required field (name, email, mobile, address).
  4. Submit and confirm the success modal.
- **Success signals:**
  - `input_value` verified per field after each fill.
  - Negative case: validation error text /Required/ markers appear, no modal.
  - Positive case: modal text `Thanks for submitting the form`.
- **Risks:**
  - Banner/footer pseudo-links misclassified as candidates (README known
    limitation) — wasted steps, honestly recorded.
  - Date-picker/modal widgets and ad iframes are weak spots for
    coordinate replay; ads may shift fingerprints between captures.

## UC-4 (rank 4): Broken-link / broken-image sweep

- **Goal string:** `sweep every link and image on the DemoQA broken page and report which are broken`
- **Site:** https://demoqa.com/broken
- **Planner template:** generic fallback (enumeration goal, never empty plan)
- **Phases:**
  1. Navigate to the broken-links page.
  2. Enumerate link/image candidates from the visual DOM.
  3. Activate each candidate once and observe the outcome.
  4. Record per-target verdict (healthy vs broken) with evidence.
- **Success signals:**
  - Healthy link: URL change to the linked page and back.
  - Broken link: error status text (`500`, `This page returned a 500 status
    code`) observed on the resulting page.
  - Broken image: image element renders broken (no valid pixels).
- **Risks:**
  - Off-site links will trip the external-domain guard and be recorded as
    skipped — correct behavior, not failure; report must say so.
  - Step count scales with link count; quota budget must cap the sweep
    (MAX_STEPS discipline) rather than degrade into repetition.

## UC-5 (rank 5, discovered): Value-oracle cart-total check

Discovered from STUDENT_NOTES Q7 (mutation study: the verification ceiling —
the system verifies ACTIONS-WORK, not VALUES-CORRECT; a seeded wrong-cart-total
bug went 4/4 PASS undetected) and the README verification ladder
(`input_value` / `checked_state` are action signals, none assert values).

- **Goal string:** `verify the saucedemo cart total equals the sum of the item prices`
- **Site:** https://www.saucedemo.com
- **Planner template:** `checkout` read-only variant (no purchase; observe
  overview totals only, per the read-only public-pages policy)
- **Phases:**
  1. Login (UC-1).
  2. Add two priced items to the cart.
  3. Open cart, read each item price from rendered text.
  4. Open checkout overview, read subtotal/tax/total text.
  5. Compare computed sum vs displayed total; record match or honest mismatch.
- **Success signals:**
  - Price texts present and parsed (`$29.99` style).
  - Arithmetic match recorded with the exact texts as evidence; a mismatch is
    recorded as a FINDING, never massaged into a pass.
- **Risks:**
  - HONEST LIMITATION: no value oracle exists yet (V2 roadmap item), so this
    use case currently demonstrates the ceiling rather than passing it.
  - OCR numeric noise (`$29.99` vs `$29 99`) can fake a mismatch; prices need
    exact-text capture before any normalization claim.

## UC-6 (rank 6, discovered): Unexpected-page / exposure discovery sweep

Discovered from STUDENT_NOTES Q9 (the explorer autonomously found Juice Shop's
public `/ftp/legal.md` exposure) and the README exploration outputs
(`visited_urls` + replayable workflows from real paths).

- **Goal string:** `explore the Juice Shop demo storefront and report any publicly reachable page outside the main navigation`
- **Site:** https://demo.owasp-juice.shop (public demo storefront)
- **Planner template:** generic fallback (open-ended discovery goal)
- **Phases:**
  1. Explore the storefront within the start origin (scope guard on).
  2. Collect the full `visited_urls` set from exploration history.
  3. Diff visited URLs against navigation-linked pages.
  4. Report any unlinked-but-reachable page with screenshot evidence.
- **Success signals:**
  - `visited_urls` artifact with per-state screenshots.
  - Exposure finding backed by: reachable URL + HTTP 200 + non-trivial body
    text (e.g. the `/ftp/legal.md` class of finding).
- **Risks:**
  - Read-only policy is load-bearing here: explore and read only; no logins,
    no purchases, no data modification (pre-registration ToS rule).
  - Juice Shop is heavier/flakier than Tier-1 demo apps; budget and retry
    discipline apply. External-domain guard must stay on (no following
    outbound links off the demo origin).

---

## Rank summary

| Rank | Use case | Site | Template | Why this rank |
|---|---|---|---|---|
| 1 | Login | saucedemo.com | `login` | D15 first target; shortest path to a goal-demo |
| 2 | Login-to-checkout | saucedemo.com | `checkout` | D15 second target; proves long-horizon phases |
| 3 | Form validation | demoqa.com | `form-submit` | Shows `input_value` strength + negative case |
| 4 | Broken-link sweep | demoqa.com/broken | generic | Breadth demo; exercises scope-guard honesty |
| 5 | Cart-total value check | saucedemo.com | `checkout` (read-only) | Research edge; names the verification ceiling |
| 6 | Exposure discovery | Juice Shop demo | generic | Stretch; repeats the /ftp-class win if lucky |

Demos 1-4 run only after the R3-T3 wiring demo lands (board rule: no browser
runs until then). UC-5/UC-6 are stretch and may honestly report ceiling/guard
behavior instead of green.
