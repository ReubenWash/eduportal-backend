# Goreb — Backend Setup Guide

Follow these steps in exact order to get the backend running.

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | [Neon Console](https://console.neon.tech) → your project → Connection string |
| `JWT_ACCESS_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Run same command again — must be different |
| `CLOUDINARY_CLOUD_NAME` | [Cloudinary Dashboard](https://console.cloudinary.com) |
| `CLOUDINARY_API_KEY` | Cloudinary Dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary Dashboard |
| `SMTP_HOST` / `SMTP_PASS` | [Resend](https://resend.com) → API Keys |
| `CLIENT_URL` | `http://localhost:5173` for local dev |
| `TENANT_ROOT_DOMAIN` | Your verified school portal root domain, e.g. `schools.example.com` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON contents of a Firebase service-account key (store as a deployment secret; never commit it) |
| `FIREBASE_PROJECT_ID` | Firebase project ID; optional when provided by the service account |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional path to a service-account JSON file when using Application Default Credentials |

### Firebase Cloud Messaging (backend)

In Firebase Console, create or select the project used by the mobile/web clients, then open **Project settings → Service accounts** and generate a private key. Set the complete JSON key contents in the backend deployment's secret/environment settings as `FIREBASE_SERVICE_ACCOUNT_JSON`. Do not commit the key or put it in client-side environment variables. Restart the backend after setting credentials.

The backend stores authenticated users' FCM device tokens through `POST /api/v1/notifications/device-token` with `{ "token": "<FCM token>", "platform": "web" }`; `platform` may be `web`, `android`, or `ios`. Remove a signed-in user's token with `DELETE /api/v1/notifications/device-token` and `{ "token": "<FCM token>" }`. School broadcasts and system notifications send to the intended users' registered devices, and super admins can send audience broadcasts through `POST /api/v1/admin/notifications/push`. FCM delivery is reported separately from in-app notification creation; missing credentials or unregistered device tokens do not prevent in-app notifications from being saved.

### Arkesel SMS

Configure these values in the backend host's secret/environment settings, then restart the backend:

| Variable | Purpose |
|---|---|
| `ARKESEL_API_KEY` | Arkesel API key; keep it backend-only |
| `ARKESEL_SENDER_ID` | Approved Arkesel sender ID |
| `ARKESEL_SMS_URL` | Optional API URL override; defaults to `https://sms.arkesel.com/api/v2/sms/send` |

The Super Admin Notifications Center can send SMS announcements to selected audiences (parents, teachers, and school admins). SMS delivery is opt-in per broadcast and reports accepted/failed counts; Arkesel acceptance is not a handset delivery receipt. Newly recorded absences automatically alert linked guardians, and releasing examination reports alerts the student and guardians. Guardian/staff phone numbers should include their country code. If the Arkesel credentials are missing or a provider request fails, attendance/report release still completes and the SMS failure is logged and surfaced separately.

### Educational study assistant

The assistant uses the Google Gemini API. Configure `GEMINI_API_KEY` as a backend-only secret and optionally set `GEMINI_MODEL` (defaults to `gemini-2.5-flash`). Google AI Studio may provide a free usage tier, subject to Google's current availability, limits, and terms; it is not an unlimited or guaranteed-free service. If no key is set, the authenticated assistant endpoint returns an explicit configuration error.

Students and teachers can use the assistant at `POST /api/v1/study-assistant/ask` with `{ "question": "..." }`. It is school-tenant scoped, limited to 10 requests per user every 10 minutes, and constrained to educational questions. The service sends the question to Google for generation; do not include student-identifying or other sensitive information. Conversation history is not persisted by Goreb.

Generate a structured, class-appropriate quiz with `POST /api/v1/study-assistant/quiz` and `{ "subject": "ALL", "count": 5 }`. Student class placement is read from the signed-in student's current enrollment; teachers can optionally send a `classId` they teach. The response is a validated array of multiple-choice questions and explanations. The same per-user assistant rate limit applies.

### Student, parent, and teacher portal data

The following authenticated, school-scoped endpoints provide the portal data not available from the earlier APIs:

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/v1/guardians/me` | Parent | Signed-in guardian profile |
| `GET /api/v1/guardians/me/children/:studentId/timetable` | Linked parent | Child's current enrolled class timetable |
| `GET /api/v1/guardians/me/children/:studentId/assignments` | Linked parent | Homework and the child's submission/grade status |
| `GET /api/v1/guardians/me/children/:studentId/teacher-contact` | Linked parent | Class teacher and school contact details |
| `GET /api/v1/guardians/me/children/:studentId/conduct-log` | Linked parent | Child's achievements and conduct records |
| `GET /api/v1/timetable/classes/:classId?termId=...` | School admin or assigned teacher | Class timetable |
| `GET /api/v1/timetable/teachers/me?termId=...` | Teacher | Signed-in teacher's timetable |
| `POST /api/v1/timetable/slots` | School admin | Create or update a timetable slot; validates school scope and time conflicts |
| `GET /api/v1/assignments` | School staff, student, or parent | Lists assignments visible to the caller; parents supply `studentId` |
| `POST /api/v1/assignments` | School admin or assigned teacher | Create homework for an assigned class and term |
| `POST /api/v1/assignments/:id/submissions` | Student | Submit or replace the student's response before the due date |
| `GET /api/v1/assignments/:id/submissions` | School admin or assigned teacher | Review submissions |
| `PATCH /api/v1/assignments/submissions/:submissionId` | School admin or assigned teacher | Grade a submission with a score and optional feedback |
| `GET /api/v1/discipline/incidents` | School admin or assigned teacher | Search scoped conduct records |
| `POST /api/v1/discipline/incidents` | School admin or assigned teacher | Record an achievement, conduct note, or disciplinary incident |
| `PATCH /api/v1/discipline/incidents/:id` | School admin or assigned teacher | Add action taken or resolve a record |

These features require the `20261113170000_portal_academic_data` Prisma migration. In a deployment, apply committed migrations with `npx prisma migrate deploy`; for local development use `npx prisma migrate dev`. Then regenerate the Prisma client with `npx prisma generate` and restart the API.

---

## 3. Generate Prisma client

```bash
npx prisma generate
```

---

## 4. Run database migrations

This creates all tables in your Neon database.

```bash
npx prisma migrate dev --name init
```

If you see "drift detected", run:

```bash
npx prisma migrate reset
npx prisma migrate dev --name init
```

---

## 5. Seed demo data

Creates a demo school, admin, teacher, class, subjects, and 5 students.

```bash
npm run db:seed
```

Demo credentials after seeding:
- **School Admin** → `admin@demo.edu.gh` / `Admin@1234`
- **Class Teacher** → `teacher@demo.edu.gh` / `Teacher@1234`

---

## 6. Create the Platform Super Admin

Run this once. It's interactive — it will ask for email and password.

```bash
node scripts/createSuperAdmin.js
```

---

## 7. Start the dev server

```bash
npm run dev
```

Server runs at: `http://localhost:5000`

Test it: `GET http://localhost:5000/api/health`

---

## 8. Test auth in Postman

```
POST http://localhost:5000/api/v1/auth/login
Content-Type: application/json

{
  "portal": "school-administration",
  "email": "admin@demo.edu.gh",
  "password": "Admin@1234"
}
```

The `portal` field is required. Use `school-administration`, `teaching-staff`,
`parents-guardians`, or `students`; the account's role must be authorized for
the selected portal.

Copy the `accessToken` from the response.
Use it as `Bearer <token>` in the Authorization header for all other requests.

---

## School subdomain setup

The backend creates a unique school slug during school registration and
super-admin school creation. It is stored in the existing unique
`schools.slug` column. A school portal is served at
`https://<slug>.<TENANT_ROOT_DOMAIN>`.

For Vercel frontend hosting:

1. Add the root domain and wildcard domain (`*.example.com`) to the frontend
   project's Domains settings. Configure the DNS records Vercel displays for
   your domain provider. Vercel provisions SSL after the domain and DNS are
   verified.
2. Set `VITE_TENANT_ROOT_DOMAIN=example.com` in the frontend project's
   production environment and redeploy.
3. Set `TENANT_ROOT_DOMAIN=example.com` on the backend host. Ensure
   `CLIENT_URL` is the frontend's canonical HTTPS root URL, then redeploy.

Use the same root domain value in both environments. Wildcard DNS and SSL are
hosting-provider settings and cannot be enabled by application code alone.
Tenant-host login requests are checked against the account's saved school
slug; authenticated API routes continue to use the existing school ID tenant
scope and role permissions. The public school lookup exposes only the school's
name, slug, logo, and motto.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:seed` | Seed demo data |
| `npx prisma migrate reset` | Wipe DB and re-run all migrations |

---

## Deployment to Koyeb

1. Push code to GitHub
2. Create a new Koyeb service → connect GitHub repo
3. Set all `.env` variables in Koyeb environment settings
4. Set build command: `npm install && npx prisma generate && npx prisma migrate deploy`
5. Set run command: `node src/server.js`
6. After deploy, copy the Koyeb URL into `KEEP_ALIVE_URL` in your env vars

## Deployment to Render

Use the backend repository root as the service root directory. Set the build command to:

```bash
npm ci --production=false && npx prisma generate && npx prisma migrate deploy
```

Set the start command to:

```bash
npm start
```

Do not use `prisma db push` or `prisma db push --force-reset` for production. The configurable class-level migration converts existing `JHSLevel` values to text while preserving class data. Deploy the latest `main` commit so Render uses the committed migration files and migration lock.

The Phase 2 school fee invoicing migration (`20261103090000_school_fee_invoicing`) is applied automatically by `prisma migrate deploy`. It adds school-scoped fee structures, fee invoices, concessions, and invoice links on financial transactions; it does not enable later finance phases.

### Existing production database without Prisma migration history

The existing Neon database was originally created without Prisma Migrate, so `migrate deploy` first needs to baseline its existing schema. After deploying the commit containing `20261001000000_existing_schema_baseline`, temporarily use this Render build command once:

```bash
npm ci --production=false && npx prisma generate && npx prisma migrate resolve --applied 20261001000000_existing_schema_baseline && npx prisma migrate deploy
```

This records the existing database as having the baseline; it does not recreate or clear tables. The remaining migrations then add the audit action and convert existing class levels from the enum to text. After this deploy succeeds, return the Render build command to the normal command above (without `migrate resolve`) for future deploys. Do not run this baseline command against a new/empty database; an empty database should use `migrate deploy` directly so Prisma creates the baseline schema.

---

## Project structure reminder

```
src/
├── config/         # DB, logger, email, cloudinary
├── middleware/     # auth, tenant, roles, validate, upload, rateLimit, errorHandler
├── routes/         # one file per resource
├── controllers/    # request/response handlers
├── services/       # all business logic
├── validators/     # express-validator rules
└── utils/          # gradeEngine, generateToken, generateId, apiResponse, paginate, keepAlive
```
