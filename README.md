# FitTrack

Personal training, nutrition and body tracker. It's a web app (PWA): install it on your
iPhone home screen, use it on your laptop, and it works offline. Data syncs through your
own free Supabase project.

**Tabs**
- **Training**: log workouts (sets × reps × kg, or cardio as km and minutes), routines with last session's weights pre-filled, calendar, week streak, history.
- **Nutrition**: breakfast / lunch / snack / dinner, ~200 built-in foods, Open Food Facts search and barcode scanning, custom foods, saved meals, calories in vs. out.
- **Body**: weight and measurements with trend charts.
- **Profile**: targets, account and sync, Apple Health steps, backup.

## One-time setup (~10 min)

### 1. Supabase (database + login)
1. Create a free account at <https://supabase.com> → **New project** (any name, pick a region near you, save the DB password somewhere).
2. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Sign In / Providers → Email**: turn **off** “Confirm email” (simplest for a personal app).
4. **Project Settings → API Keys**: copy the **Publishable key**. **Project Settings → Data API** (or the Connect button): copy the **Project URL**.
5. Put both values in `config.js`, or paste them in the app under **Profile → Account & sync**.
6. In the app: **Create account** (email + password). Then, back in Supabase **Authentication → Sign In / Providers**, turn off “Allow new users to sign up” so nobody else can create an account in your project.

### 2. Faster product search (optional, recommended)
Supabase → **Edge Functions → Deploy a new function → Via Editor** → name it `off-search` →
paste [`supabase/functions/off-search/index.ts`](supabase/functions/off-search/index.ts) → **Deploy**.
Without it, product search falls back to an older Open Food Facts endpoint that is sometimes busy.

### 3. Install on iPhone
Open the app URL in **Safari** → Share → **Add to Home Screen**. On the laptop, just bookmark it.
Sign in once on each device.

### 4. Apple Health steps
In the app: **Profile → Apple Health steps → Show Shortcut setup** and follow the 6 steps.
The Shortcut runs each evening and posts the day's step count to your account.

## How calories out are estimated
- **BMR** (Mifflin–St Jeor) from sex, age, height and latest weight.
- With step data: BMR × 1.1 (digestion) + steps × 0.0005 kcal × kg.
- Without step data: BMR × 1.2.
- Workouts: (MET − 1) × kg × hours. Strength = MET 5. For step-based cardio (running, walking…), the part already counted by steps is subtracted.
- You can override the day's total with a watch number.

## Development
No build step: plain ES modules. `python3 -m http.server` in this folder, then open <http://localhost:8000>.
Bump `VERSION` in `sw.js` when deploying so phones pick up the new files.
