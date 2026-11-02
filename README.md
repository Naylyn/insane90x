# Insane90X

A personalized P90X/Insanity hybrid workout tracker, built from your
90-day fit test and weight tracker spreadsheet. Backed by Supabase,
deployed to GitHub Pages.

See "Insane90X - Supabase Setup Guide.docx" for full setup instructions:
creating the Supabase project, running the schema and seed data,
deploying the Edge Function, and configuring GitHub Actions.

## What is included

- **Calendar** (`index.html`) - the full 90-day schedule. Every day's
  text is editable in place. Check a day off when it is done and it
  strikes through. Days with a weight or rep workout (Chest & Back,
  Legs & Back, Shoulders & Arms, Chest/Shoulders/Tri, Back & Biceps)
  show a link straight to that exercise's log, already scrolled to and
  highlighting the correct week.
- **Fit Test** (`fittest.html`) - the Insanity Fit Test, P90X Fit Test,
  body measurements, and four comparison photos (front, both sides,
  back), each logged across all 7 tests plus a graduation column. Photos
  can be taken directly with the camera or chosen from the library.
- **Weight & Rep Logs** (`weights.html`) - one page, five tabs (via
  `?tab=`), covering every exercise from the original spreadsheet with
  its original variants (RW/LW, NC1/C1, and so on) preserved exactly.
  Typing a value and hitting Enter saves it immediately.
- Login shared with your other household apps: email and password,
  the device stays signed in for 30 days, and more logins can be added
  from Manage Users without touching Supabase directly.

## Local testing

1. Copy `public/config.js` and replace `__SUPABASE_URL__` and
   `__SUPABASE_ANON_KEY__` with your project's real values.
2. Serve the `public/` folder with any static file server:
   ```
   cd public
   python3 -m http.server 8080
   ```
3. Open http://localhost:8080.

Do not commit your real config.js values - the deploy workflow restores
the placeholders automatically, so the repo itself should always keep
`__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` as-is.

## Deployment

Push to `main` and GitHub Actions builds and deploys `public/` to GitHub
Pages automatically. See the setup guide for the one-time configuration
of repository secrets and Supabase.

## Multiple programs (migrations 4 and 5)

Every calendar, day header and logged value now belongs to a **program**. Use the Program bar at the top of any page to switch, start a new program, or finish one.

- **Latest first:** opening the site lands on your newest active program.
- **Log style per program:** *Insane90X-style* (weight tabs, Fit Test, calendar links) or *Custom weights and reps* (your own exercises; each workout is a date plus sets of weight x reps, on the Workout Log page).
- **Finish / Archive:** archiving hides a program but keeps every logged value and date. You can optionally start a fresh round with the same calendar (nothing marked done, no logged values). Archived programs can be restored or deleted (typed confirmation).
- **Progress page:** each exercise in the current program next to the last time the same exercise (matched by name) was worked in an earlier program, with dates and the change in top weight.
- **Calendar cells** are all the same height - the tallest cell sets the height for every cell.

**Upgrade order matters:** run `insane90x-migration-4-multi-program.sql`, then `insane90x-migration-5-custom-logs.sql`, in the Supabase SQL Editor **before** deploying this version of the site. The previous version of the site stops working once migration 4 has run.

## Where the data came from

`supabase-backend/sql/seed_data.sql` was generated directly from your
uploaded spreadsheet (not retyped by hand) - every schedule cell, fit
test row, and weight-tracking row matches the original workbook.

## Folder structure

- `public/` - the entire site (deployed as-is to GitHub Pages)
- `.github/workflows/deploy.yml` - the CI/CD pipeline
