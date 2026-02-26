# Foundation — Event Scheduler Application

> Infrastructure, authentication, deployment, and project scaffolding.

---

## 1. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js 14+ (App Router) | React 18, TypeScript, TailwindCSS |
| **Backend / API** | Next.js API Routes (Route Handlers) | Full-stack in one repo |
| **Database** | Firestore (Firebase) | NoSQL, real-time, serverless |
| **SDK** | Firebase Admin SDK + Client SDK | Server-side & client-side data access |
| **Auth** | Firebase Auth | Email/password + OAuth providers |
| **AI / LLM** | Google Gemini API (Gemini 1.5) | For AI features (see `ai-features.md`) |
| **Email** | Resend or SendGrid | Invitation emails, notifications |
| **Hosting** | Vercel | Auto-deploy from GitHub, preview URLs |
| **Package Manager** | pnpm | Fast, disk-efficient |

---

## 2. Project Structure

```
/
├── public/                    # Static assets
├── src/
│   ├── app/
│   │   ├── (auth)/            # Auth pages (login, register)
│   │   ├── (dashboard)/       # Authenticated app pages
│   │   │   ├── events/        # Event list, detail, create, edit
│   │   │   ├── invitations/   # Invitation management
│   │   │   └── settings/      # User profile / settings
│   │   ├── api/
│   │   │   ├── auth/          # Auth route handlers (register)
│   │   │   ├── events/        # Event CRUD endpoints
│   │   │   ├── invitations/   # Invitation endpoints
│   │   │   ├── search/        # Search endpoint
│   │   │   └── ai/            # AI feature endpoints
│   │   ├── layout.tsx
│   │   └── page.tsx           # Landing / redirect
│   ├── components/
│   │   ├── ui/                # Reusable UI primitives (shadcn/ui)
│   │   ├── events/            # Event-specific components
│   │   └── layout/            # Header, sidebar, footer
│   ├── context/
│   │   └── AuthContext.tsx     # Firebase Auth context provider
│   ├── lib/
│   │   ├── firebase.ts        # Firebase Client SDK initialization
│   │   ├── firebase-admin.ts  # Firebase Admin SDK initialization
│   │   ├── auth.ts            # Auth helpers (requireAuth, etc.)
│   │   ├── gemini.ts          # Gemini client setup
│   │   ├── email.ts           # Email service helpers
│   │   └── validators.ts      # Zod schemas for request validation
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # Shared TypeScript types
│   └── utils/                 # General helpers (dates, formatting)
├── shared/                    # Cross-concern documentation / assets
├── .env.local                 # Local environment variables (git-ignored)
├── .env.example               # Template for required env vars
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 3. Data Models — User & Auth

> Firebase Auth manages authentication state, sessions, and OAuth accounts automatically. Only the `User` profile document needs to be stored in Firestore.

### 3.1 `User` (Firestore: `users/{uid}`)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `String` | Document ID = Firebase UID | Unique user identifier |
| `email` | `String` | NOT NULL | Login email |
| `name` | `String` | NOT NULL | Display name |
| `avatarUrl` | `String?` | Nullable | Profile picture URL |
| `createdAt` | `Timestamp` | Set on creation | Account creation timestamp |

> **Note:** There are no separate `Account` or `Session` models. Firebase Auth handles password hashing, OAuth provider linking, session tokens, and token refresh internally.

### Firestore Document Structure (Auth)

```typescript
// Collection: users
// Document ID: Firebase Auth UID

interface UserDocument {
  id: string;          // Firebase UID (matches document ID)
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: Timestamp; // Firestore server timestamp
}

// Example document at users/abc123uid:
// {
//   "id": "abc123uid",
//   "email": "jane@example.com",
//   "name": "Jane Doe",
//   "avatarUrl": null,
//   "createdAt": Timestamp(2026-02-26T10:00:00.000Z)
// }
```

---

## 4. Authentication API

All auth is handled by **Firebase Auth**. The client SDK manages sign-in/sign-out and provides ID tokens. The server verifies tokens using the Firebase Admin SDK.

### 4.1 `POST /api/auth/register`

> Create a new user account with email + password using Firebase Admin SDK.

**Request Body**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "SecureP@ss123"
}
```

**Validation (Zod)**

```typescript
const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128)
});
```

**Response — 201 Created**

```json
{
  "id": "abc123uid",
  "email": "jane@example.com",
  "name": "Jane Doe",
  "createdAt": "2026-02-26T10:00:00.000Z"
}
```

**Error Responses**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Validation failed", "details": [...] }` | Invalid input |
| 409 | `{ "error": "Email already registered" }` | Duplicate email |

**Implementation Notes**
- Use `firebase-admin` `auth().createUser({ email, password, displayName })` to create the user.
- Create a corresponding Firestore document in the `users` collection with the returned UID.
- Send verification email via Firebase Auth `generateEmailVerificationLink()` or Resend.
- Do NOT auto-login; redirect to login page.

### 4.2 Client-Side Auth (Firebase Auth SDK)

> Sign-in, sign-out, and session state are managed entirely on the client via Firebase Auth SDK. No server-side catch-all route is needed.

**Supported Providers**
- **Email + Password** — `signInWithEmailAndPassword(auth, email, password)`
- **Google OAuth** — `signInWithPopup(auth, googleProvider)`
- **GitHub OAuth** — `signInWithPopup(auth, githubProvider)`

**Session Observation**

```typescript
// src/context/AuthContext.tsx
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

// onAuthStateChanged listens for login/logout and provides the current User object.
// Use this instead of GET /api/auth/session.
onAuthStateChanged(auth, (user: User | null) => {
  if (user) {
    // User is signed in — user.uid, user.email, user.displayName available
  } else {
    // User is signed out
  }
});
```

### 4.3 Server-Side Auth Middleware

```typescript
// src/lib/auth.ts
import { adminAuth } from "@/lib/firebase-admin";

export async function requireAuth(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return { id: decodedToken.uid, email: decodedToken.email, name: decodedToken.name };
  } catch {
    throw new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

---

## 5. Environment Variables

Create `.env.example` with the following:

```env
# Firebase Client SDK (public — safe to expose in browser)
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""

# Firebase Admin SDK (server-only — keep secret)
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""

# Gemini (for AI features)
GEMINI_API_KEY=""

# Email (Resend)
RESEND_API_KEY=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 6. Deployment

### Target Platform: **Vercel**

| Step | Action |
|------|--------|
| 1 | Push code to a GitHub repository |
| 2 | Connect the repo to Vercel via the Vercel dashboard |
| 3 | Set all environment variables in Vercel project settings |
| 4 | Vercel auto-detects Next.js — builds and deploys on every push |
| 5 | Provide the live Vercel URL (e.g., `https://event-scheduler-xxx.vercel.app`) |

### Firebase Project Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Authentication** and configure providers (Email/Password, Google, GitHub).
3. Create a **Firestore Database** in production mode.
4. Generate a **Service Account** key (Project Settings > Service Accounts > Generate New Private Key) for the Admin SDK.
5. Copy the **Web App** config values (apiKey, authDomain, projectId, etc.) into `NEXT_PUBLIC_FIREBASE_*` environment variables.
6. Copy the service account `project_id`, `client_email`, and `private_key` into `FIREBASE_*` environment variables.

### Build Command (Vercel)

```bash
next build
```

---

## 7. README Requirements

The project `README.md` must include:

1. **Project Title & Description** — One-paragraph overview.
2. **Live Demo URL** — Link to the deployed Vercel app.
3. **Tech Stack** — Table or list of technologies used.
4. **Getting Started**
   - Prerequisites (Node.js >= 18, pnpm, Firebase project)
   - Clone -> install -> configure env -> run
5. **Environment Variables** — Reference to `.env.example`.
6. **Available Scripts** — `dev`, `build`, `start`, `lint`, `test`.
7. **API Documentation** — Brief summary or link to detailed docs.
8. **AI Features** — Highlight the AI capabilities.
9. **Architecture** — Brief overview of folder structure and design decisions.
10. **Deployment** — How the app is deployed and how to redeploy.

### Example Quick Start

```bash
git clone https://github.com/your-username/event-scheduler.git
cd event-scheduler
pnpm install
cp .env.example .env.local
# Fill in .env.local with your Firebase and Gemini values
pnpm dev
# Open http://localhost:3000
```

---

## 8. Acceptance Criteria — Foundation

| # | Criterion | Verification |
|---|-----------|-------------|
| F-1 | User can register with email + password | `POST /api/auth/register` returns 201 |
| F-2 | User can log in with email + password | Firebase Auth signInWithEmailAndPassword succeeds |
| F-3 | User can log in with Google OAuth | Firebase Auth Google provider sign-in redirects and creates account |
| F-4 | User can log in with GitHub OAuth | Firebase Auth GitHub provider sign-in redirects and creates account |
| F-5 | User can log out | Session destroyed, redirected to login |
| F-6 | Unauthenticated requests to protected endpoints return 401 | Middleware blocks access |
| F-7 | App is deployed to Vercel with a public URL | URL accessible in browser |
| F-8 | Firestore collections are accessible in production | Documents can be read/written without errors |
| F-9 | README contains all required sections | Manual review |
| F-10 | Environment variables are documented in `.env.example` | File exists with all keys |
