# EduTrack JHS — Backend Setup Guide

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
  "email": "admin@demo.edu.gh",
  "password": "Admin@1234"
}
```

Copy the `accessToken` from the response.
Use it as `Bearer <token>` in the Authorization header for all other requests.

---

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
