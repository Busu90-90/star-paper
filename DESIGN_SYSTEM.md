# Star Paper Design System · v2 "Forest & Foil"

Star Paper is the artist manager's mainstage: **music × money × management**. The look is a
night-time stage: deep forest greens, gold foil, ivory type. Gold is used for one thing: what
matters most, whether that's the primary action or the money you're looking at.

- Tokens: `sp-design-tokens.css`. Every colour, size, radius, shadow and duration comes from here.
- Signed-out screens: `styles.landing.css` (`.lp-*`).
- Brand mark spin: `styles.brand.css`.
- Signed-in app shell: `styles.app.css` (scoped to `#appContainer` and the overlays it opens), driven by `app.chrome.js`. It was rebuilt section by section (stages B0–B5); B5 deleted the legacy premium, shell and relayering token layers. The few ungated helpers they carried (CSP style replacements, availability results, report tones) live in `styles.utilities.css`; new app styling goes in `styles.app.css`.

## Palette

| Token | Value | Role |
|---|---|---|
| `--sp-night` | `#0A1210` | Page background (dark) |
| `--sp-forest` | `#1B2516` | Surface 2: cards |
| `--sp-forest-2` | `#22301F` | Surface 3: raised / active |
| `--sp-moss` | `#35463A` | Strong hairlines, quiet fills |
| `--sp-moss-2` | `#4A5E4F` | Muted UI |
| `--sp-ivory` | `#F7F3E8` | Text on dark; light-theme page |
| `--sp-sage` | `#A9C2A7` | Secondary accent (team, quiet badges) |
| `--sp-foil` | `#F6E68A → #E3C46B → #B8862B → #A67C2A` | Gold foil gradient (primary actions, wordmark, display italics) |
| `--sp-gold` | `#D9B45A` | Solid gold (dots, focus, hairlines at alpha) |
| `--sp-in` | `#5FD3A0` (dark) / `#13704C` (light) | Money in. Always with `+` or ▲ |
| `--sp-out` | `#F0846C` (dark) / `#A3402B` (light) | Money out. Always with `−` or ▼ |

**Rules**
- **One accent.** Gold marks the primary action and key money figures, nothing decorative. That's what makes the CTA stand out (Von Restorff).
- **Money is never colour-only.** Every amount carries a sign (+/−) or arrow, which matters for colour-blind readers.
- **No violet.** The music cue comes from the record motif (the logo, groove texture and stage lights), not from a second accent colour.
- **The hero art is always a night stage**, even in the light theme, where it becomes a dark panel on the sage page.
- **The light theme is Sage**, a grey-green stage (`#D9E3DA`) with near-white cards (`#F5F8F5`) and forest ink. It's mid-tone on purpose: the stage beams turn into deeper emerald, amber and gold washes that still read on it, and it stays clear of a cream "paper" look.

### Contrast (WCAG 2.2)

| Pair | Ratio | Use |
|---|---|---|
| Ivory on Night | 17.1:1 | Body and headings |
| Ivory on Forest | 14.3:1 | Text in cards |
| Ink-2 `#C9CFC4` on Forest | 10.0:1 | Secondary text |
| Ink-3 `#8E9A8F` on Forest | 5.4:1 | Hints, captions |
| Gold text `#E3C46B` on Night | 11.2:1 | Eyebrows, links |
| Money in on Forest | 8.6:1 | Amounts |
| Money out on Forest | 6.2:1 | Amounts |
| Ink on gold `#16130A` on `#D9B45A` | 9.4:1 | Text on gold buttons |
| Forest ink `#0F1C15` on Sage `#D9E3DA` | 13.3:1 | Light theme body |
| Ink-3 light `#4F5E54` on Sage | 5.2:1 | Light theme hints |
| Gold text light `#7A5818` on Sage | 4.9:1 | Light theme links |
| Money in / out light on Sage | 4.6:1 / 4.8:1 | Light theme amounts |

Every text pair passes AA (4.5:1).

## Type
- **Display: Fraunces** (variable, optical size). Headlines are 700 weight with tight tracking; the second line is an italic in foil. Big and confident: hero up to 5.5rem (`--sp-text-4xl`).
- **Wordmark and taglines:** Fraunces small caps (`font-variant-caps: all-small-caps`), tracking `.14em`; taglines are uppercase at `.24em`.
- **UI: Inter Tight.** Labels are 11px uppercase at `.18em` tracking.
- **Money: JetBrains Mono** with tabular figures, so amounts line up.
- **Scale:** fluid `clamp()` steps from `--sp-text-xs` to `--sp-text-4xl` (360 px → 1440 px).

## Space, shape and depth
- **Space:** 4pt grid with an 8pt rhythm. One section spacing token, `--sp-section`, and one gutter, `--sp-gutter`.
- **Radius:** 10 / 14 / 22 / pill. Cards are 22.
- **Tap targets:** at least `--sp-tap` (44px). Inputs are 52px tall, primary buttons 52px.
- **Depth:** three levels only, each with one shadow (`--sp-shadow-1/2/3`).
- **Glass:** cards are frosted forest (`--sp-glass`, `--sp-glass-blur`) with a 1px gold hairline (`--sp-glass-line`) and an inner top highlight.
- **Lighting:** one ambient light per section, never competing glows.
- **Texture:** faint record grooves (`--sp-grooves`) at about 3.5% opacity on the page background.

## Motion
- **Feedback:** every press answers within 100ms (`--sp-dur-1`), at scale `.98`. Hover on gold gives a slow foil shine sweep.
- **Waiting:** async buttons show a spinner or an overlay. Nothing is left silent.
- **Success:** success moments animate (the check is drawn) and then move on (~0.9s).
- **Ambient:** the logo spins (24s per turn), stage beams sway and the hero cards float. Tapping any logo pauses all of them, and the choice is remembered.
- **Reduced motion:** with `prefers-reduced-motion`, everything stops. There's no auto-advance and the logo stays still unless the person taps it on.

## Components (signed-out)
- **Header:** logo top-left. On desktop the nav is centred and Sign in / Start free sit on the right. On phones it's the logo, the theme toggle and Sign in, with no hamburger: the story slides carry How it works, Proof and Testimonials.
- **Story slides:** four slides in one horizontal scroll-snap track: Mainstage, How it works, Proof, Voices.
  - A connected stepper sits under the slides. Seen steps fill gold, and the active step shows a progress bar that drives auto-advance.
  - Phones show dots with a "2 / 4" counter.
- **Stage rig:** one SVG truss spans the full width under the header with three moving-head lamps (emerald, warm white, gold) whose beams fall through the whole showcase; in light mode it sits behind the slides so text stays readable, and its beams become deeper coloured washes. Each slide's art is swappable (`<figure class="lp-art lp-art--*">`).
  - The beams are coloured like a real show: emerald stage-left, warm white key light in the centre, gold stage-right. These are the brand's three lights (money in, ivory, foil); the pool on the floor mixes all three.
  - Each head and its beam pivot on the same yoke point and share one animation, so they sweep together: the side heads swing out wide, cross over the centre, hold, then return. Reduced motion leaves them still.
- **Buttons:**
  - `lp-btn--gold` is solid foil, the single primary per view.
  - `lp-btn--foil` is a gold-outline pill that fills with foil, used on auth.
  - `lp-btn--ghost` is the outline secondary; `lp-btn--quiet` is text-only.
- **Auth card:**
  - Spinning record and foil wordmark above the card.
  - A frosted card with a notched medallion whose icon names the step.
  - Icon-led fields with uppercase micro-labels, and a password eye.
  - "Step 1 of 2 → 2 of 2" with a foil progress bar on sign-up.
  - An animated success check, then a trust line under the card.
- **Fields:** a 52px input with a leading icon, a gold hairline plus glow on focus, and coral with a message on error.

## Components (app shell)
- **Sidebar (desktop, 1025px and up):** a floating forest-glass panel.
  - From top to bottom: the spinning record and foil wordmark, then the five primary sections (Home, Money, Schedule, Artists, Team), then a "Workspace" group (Tasks, Settings), then the profile chip and sign out.
  - The active item gets a foil edge light and a gold icon.
  - It collapses to a 76px icon rail with tooltips, and the choice is remembered.
- **Top bar:**
  - On the left, a greeting ("Good evening, Ama") above the page title in Fraunces.
  - In the middle, global search (press `/` to focus it).
  - On the right, a gold **New** button, the sync state, the notification bell with an unread badge, and the avatar.
  - It turns to frosted glass once the page scrolls under it.
- **Floating tab bar (phones and tablets):** a pill with Home · Schedule · **(+)** · Money · Artists.
  - The raised foil (+) opens the quick-add sheet.
  - Tasks, Team and Settings sit in the avatar menu. There is no hamburger.
- **Sheets:**
  - On phones they are bottom sheets with a grab handle. On desktop they become panels anchored under the top bar.
  - **Quick add** offers Booking, Income, Expense, Artist and Task as icon tiles. Money in is mint and money out is coral.
  - **Notifications** collects today's nudges and team messages, with new ones marked by a gold dot.
  - **Account** holds the profile, Team and messages, Tasks, Settings, the theme, About and Sign out.
  - Escape, the scrim or the close button dismisses a sheet, and focus stays inside while it is open.
- **Surfaces:**
  - Cards are forest with a sheen, a 1px gold hairline and a 22px radius. Inner tiles sit one step lighter.
  - Eyebrow labels are 11px uppercase. Values are JetBrains Mono.
- **Controls:** one foil pill is the primary per view, with outline pills as secondaries. Segmented tabs are used for Money and Schedule. Inputs are 48px with a gold focus ring.
- **State is never an inline style.**
  - JavaScript toggles the `hidden` attribute, classes and `data-*` attributes.
  - Progress bars are SVG `<rect width>`, the gauge needle is an SVG `transform` attribute, and the toast countdown runs on Web Animations.
  - **The one documented exception:** the Schedule globe's pin card and drag sheet follow a moving 3D point or a finger every frame, as does the fallback tour map's pin position. These are redesigned in stage B3. Preflight caps them so they can't grow.

## UX laws → where Star Paper applies them

| Law | Applied |
|---|---|
| Jakob's law | Logo top-left, Sign in top-right, a familiar email + password form; in the app, search in the top bar, a bell and an avatar menu on the right, and a bottom tab bar on phones |
| Hick's law | One gold primary per screen; no hamburger on the landing or in the app; five primary sections; sign-up asks only for what it needs |
| Fitts's law | 44px+ targets, full-width primary buttons on auth, large tap areas on the stepper; the app's (+) sits in the thumb zone at the centre of the tab bar |
| Miller's law | Sign-up split into 2 steps; 3 job cards; 4 slides |
| Proximity | Label, field and error grouped tight; a section's actions sit together |
| Similarity | The same anatomy for every job card and slide card; one button style per role |
| Common region | Each idea lives inside a single glass card |
| Prägnanz | One simple medallion icon per auth step; a clean single-card sign-in |
| Uniform connectedness | Slide stepper dots joined by a line; the run-of-show timeline |
| Von Restorff | Gold reserved for the primary action and key money |
| Serial position | "Start free" first in the hero and last in the closing CTA |
| Peak-end | An animated "You're in" moment after the email code; a calm, centred footer |
| Tesler's law | The app absorbs complexity: auto-submitted code, phone formatting, remembered logo spin |
| Doherty threshold | Under 100ms press feedback, spinners on every wait |
| Aesthetic-usability | A polished stage, foil and glass make the tool feel trustworthy |
| Goal-gradient | "Step 1 of 2" and a progress bar; seen slide steps fill gold |
| Zeigarnik | A visible, unfinished step 2 pulls the person through confirmation |
| Postel's law | Phone accepts spaces, dashes and brackets; email is trimmed; the code field accepts a pasted string |
| Occam's razor | Split auth art panel removed: one card, one focus |
| Pareto | The landing leads with the 20% that matters: bookings, money, team |

## 2026 trends adopted (and skipped)
- **Adopted**
  - **Bold typography:** the 5.5rem display with a foil italic.
  - **Glassmorphism evolved:** frosted forest with gold hairlines and subtle saturation.
  - **Dark mode refined:** soft forest darks instead of pure black, with AA contrast throughout.
  - **Micro-interactions:** press scale, foil sweep, check draw, logo spin toggle.
  - **Inclusive by design:** AA contrast, reduced motion, money never colour-only, labelled controls.
  - **Visual depth:** a layered card stack, stage lighting, floating cards.
- **Skipped**
  - **Neo-brutalism:** it fights the luxury tone.
  - **AI personalisation:** it belongs in the app shell (Phase 2), e.g. a greeting and smart summaries.
