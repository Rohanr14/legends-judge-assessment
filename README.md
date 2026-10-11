# DDN Legends Judging Assessment

The web app Desi Dance Network uses to run the Legends Dance Championship mock-judging assessment for prospective judges. Candidates register, watch a set of back-row performances, take timed notes, rank the teams with written justifications, and can upload handwritten notes. Every submission is saved to Google Drive as a PDF report.

The same site also runs the **Judge Endorsement application** at `/endorse`, a separate, stricter flow for judges applying to be endorsed: rubric scoring per performance, server-enforced timers, and an admin review queue.

Live site: https://ddn-legends-judge-assessment.vercel.app

## How it works

### For judges

1. Register with a name and email, read the instructions, and start.
2. Each video plays once, start to finish, with no player controls. Judges type notes alongside it. When a video ends, a timer gives extra note-taking time, then the notes save automatically and the next video starts.
3. Judges drag the teams into their ranking and write a justification for each. The ranking timer auto-submits at zero.
4. Optionally, judges upload photos or PDFs of handwritten notes. Large photos are resized in the browser.
5. A folder named `<Name>_<YYYY-MM-DD>` is created in the submissions Drive folder, containing the PDF report and any uploaded notes.

Judge progress lives in the browser tab. Reloading or closing the tab mid-assessment loses it, and the site warns before that happens.

### Judge endorsement application (`/endorse`)

1. The judge registers with a name and email (one application per email) and reads the instructions.
2. For each video (3 by default), the judge takes notes and enters a score for every rubric category while it plays, and answers "What should this team improve before their next competition?" (required, 500 characters max). When the video ends, a timer (5 minutes by default) starts. At zero the performance submits automatically and is locked. Judges can also submit early once the video has ended.
3. The judge ranks the performances 1st to last and explains the ranking, with a 20-minute timer by default. It submits automatically at zero.
4. A PDF with the judge's information, every score and note, the feedback, the ranking and the explanation is saved to the Judging Drive folder as `<Name>_<YYYY-MM-DD>_endorsement.pdf`.

Progress is saved on the server as the judge types. A signed cookie ties the browser to the application, so reloading or reopening the page resumes exactly where the judge was. Deadlines are enforced by the server, so a reload never resets a timer and closing the tab doesn't stop it: an expired section is locked with whatever was last saved. If a judge reloads during a video, it resumes at the point it would have reached, not from the start.

### For admins

Sign in with the **Admin** button in the header (`/admin/login`).

- **Endorsement → Applications** lists every application with its progress, links to its PDF in Drive, and sets its status (Submitted, Under Review, Endorsed, Not Endorsed). Opening an application shows all of its answers. Deleting one lets that judge apply again with the same email. Opening the list also finishes and saves applications whose final timer ran out after the judge closed the tab.
- **Endorsement Settings** sets the videos and the labels judges see, the rubric categories (name, description, maximum score), the time after each video, the ranking time, and the Judging Drive folder. Changes apply to judges who register afterwards; applications in progress keep the settings they started with.
- **Settings** (mock assessment) sets the number of videos (1–5), the YouTube video for each, the note time after each video, the ranking time, and the Google Drive submissions folder. Changes apply to judges who start afterwards.
- **Submissions** opens the Drive folder.

To set up a new season, upload the performance videos to YouTube as **Unlisted** (Private videos can't be embedded), paste their links into Settings, adjust the timers, save, and share the site link with judges.

## Architecture

- Next.js 15 (Pages Router), React 18, TypeScript, Tailwind CSS, hosted on Vercel.
- Admin settings are JSON records (`siteSettings`, `endorsementSettings`) in Upstash Redis, connected through the Vercel Marketplace. Endorsement applications are also stored there (`endorsement:*` keys), which is what makes auto-save, reload-safe timers, and the admin review list work.
- Submissions go to Google Drive through a Google Cloud service account.
- The admin area uses NextAuth with one shared username and password from environment variables.

| Path | Purpose |
| --- | --- |
| `pages/` | Judge flow (`index` → `instructions` → `assessment` → `assessment/ranking` → `upload-notes` → `farewell`) and the admin pages |
| `pages/api/submit-assessment.ts` | Validates a submission, creates the judge's Drive folder, uploads the PDF, and returns a short-lived signed ticket for note uploads |
| `pages/api/upload-note.ts` | Uploads one handwritten-note file (4 MB max) into that folder |
| `pages/api/admin/settings.ts` | Saves admin settings (requires an admin session) |
| `pages/endorse/` | Endorsement flow (`index` → `instructions` → `session`) |
| `pages/api/endorsement/session.ts` | Every judge action in the endorsement flow (start/end a video, auto-save, submit), with deadlines and locks enforced on the server |
| `pages/admin/endorsement/` | Endorsement applications list, application detail, and settings |
| `utils/endorsement.ts` | Endorsement settings, deadlines, and validation, shared with the browser |
| `utils/endorsementStore.ts`, `utils/endorsementService.ts` | Endorsement storage in Redis, and saving finished applications to Drive (server only) |
| `utils/settings.ts` | Settings defaults and validation, shared with the browser |
| `utils/settingsStore.ts` | Redis access (server only) |
| `utils/googleDrive.ts` | Drive uploads (server only) |
| `utils/assessmentPdf.ts` | PDF report |

## Local development

Requires Node.js 22 (`nvm use` reads `.nvmrc`).

```bash
npm install
npm run dev
```

The app runs without any configuration: settings and endorsement applications are kept in memory (until the dev server restarts) and submissions are written to `.local-submissions/` instead of Google Drive. To use the admin pages locally, copy `.env.example` to `.env.local` and set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `NEXTAUTH_SECRET`. Only add the Redis or Google credentials if you mean to work against real data.

Before pushing, run `npm run lint`, `npm run typecheck`, and `npm run build`.

## Configuration

Set these in Vercel under Project → Settings → Environment Variables. `.env.example` lists them all.

| Variable | Purpose |
| --- | --- |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin login. Use a long random password. |
| `NEXTAUTH_SECRET` | Signs admin sessions, note-upload tickets, and endorsement applicants' session cookies. Changing it signs every judge out of an application in progress. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | The site's public URL, e.g. `https://ddn-legends-judge-assessment.vercel.app` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis. Added automatically when the store is connected to the project. |
| `GOOGLE_CREDENTIALS_CLIENT_EMAIL`, `GOOGLE_CREDENTIALS_PRIVATE_KEY`, `GOOGLE_CREDENTIALS_PRIVATE_KEY_ID`, `GOOGLE_CREDENTIALS_PROJECT_ID`, `GOOGLE_CREDENTIALS_CLIENT_ID` | Fields from the service account's JSON key file |

Secrets must stay on the server: never give them a `NEXT_PUBLIC_` prefix, and never add an `env` block to `next.config.mjs`. Both inline values into the JavaScript every visitor downloads.

### Google Drive

1. In a Google Cloud project owned by DDN, enable the Google Drive API.
2. Create a service account, then create a JSON key for it.
3. Copy the key's fields into the `GOOGLE_CREDENTIALS_*` variables.
4. Give the service account's email Editor access to the submissions folder. A Shared Drive (with the service account as Content manager) is best: files the service account creates in a regular My Drive folder are owned by the service account, so they disappear if it is ever deleted.
5. Paste the folder link into Admin → Settings (mock assessment) and Admin → Endorsement Settings (endorsement applications). They can be the same folder or different ones.

## Deployment

Pushes to `main` deploy to production on Vercel. Other branches get preview deployments, which are protected by Vercel Authentication.

## Maintenance notes

- Keep Next.js on a supported major version. Next.js 16 removes `next lint`; migrate with `npx @next/codemod@canary next-lint-to-eslint-cli .` when upgrading.
- `npm audit` reports a PostCSS advisory for the copy bundled inside Next.js. It only matters when processing untrusted CSS at build time, so it doesn't affect this app.
- The PDF uses the standard Helvetica font, so characters outside Western European alphabets (for example Devanagari or emoji) won't render in the report.

## Contact

For any questions or support, please contact legendsjudging@desidancenetwork.org.

## License

MIT. See [LICENSE](LICENSE).
