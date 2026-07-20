# Iron Log

A macro, workout, and weekly-review tracker — standalone version, no Claude account
needed. Uses your own Supabase project for storage and real name+password accounts.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In your project dashboard, go to **SQL Editor > New query**, paste in the
   contents of `supabase-setup.sql` from this folder, and run it. This creates
   the table the app needs, with row-level security so each account can only
   see its own data.
3. Go to **Settings > API**. Copy your **Project URL** and **anon public** key.

## 2. Turn off email confirmation

This app signs people up with a name instead of a real email address, so
Supabase can't send a confirmation email. Turn that requirement off:

1. Go to **Authentication > Providers > Email**.
2. Turn **off** "Confirm email".
3. Save.

(Without this step, new accounts won't be able to log in until confirmed —
which they never will be, since the email address isn't real.)

## 3. Configure the app

1. Copy `.env.example` to `.env`.
2. Fill in the two values from step 1:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

## 4. Run it locally (optional, to test)

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

## 5. Deploy so others can use it

The easiest free option is **Vercel**:

1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) > New Project > import that repo.
3. When it asks for environment variables, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` with the same values from your `.env`.
4. Deploy. Vercel gives you a public URL — send that to anyone and they can
   create their own account and start using the app immediately.

(Netlify works the same way if you'd rather use that.)

## How sign-in works now

Real accounts: a name and a password. Under the hood it uses Supabase's own
auth system (the same thing that powers "real" logins), just without asking
for an email — the app builds one internally from the name. Passwords are
hashed and verified by Supabase, not stored in plain text, and each account's
data is walled off at the database level, not just in the app's code.

Two people can't take the same name — the second person to try will be told
to log in instead, or pick a different name.

## What's different from the Claude artifact version

The storage layer changed from `window.storage` to Supabase (a small
`app_data` table, one row per user per data type), and sign-in now uses real
accounts instead of a name-only picker. Everything else — the weekly macro
block, workout day-plan boxes, progress charts, weekly review slides — is
unchanged.
