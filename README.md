# 🏠 Homepage — Orbit Dashboard

A personal browser homepage with Google Search, bookmarks, tasks, notes, alarms, Pomodoro timer, and Gemini AI assistant. Built with React + Vite + Firebase + Tailwind CSS.

---

## 🚀 Cloudflare Pages Deployment (Free)

### Step 1 — Push code to GitHub (main branch)
```bash
git add .
git commit -m "Cloudflare Pages ready"
git push origin main
```

### Step 2 — Create Cloudflare Pages project
1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages** in the left sidebar
3. Click **Create application** (blue button, top right)
4. At the bottom of the popup, click **"Looking to deploy Pages? Get started"**
5. Click **Connect to Git** → select your GitHub repo
6. Set build settings:

| Field | Value |
|---|---|
| **Framework preset** | None |
| **Build command** | `npm install && npm run build` |
| **Build output directory** | `dist` |
| **Production branch** | `main` |

### Step 3 — Add Gemini API Key
Expand **"Environment variables (advanced)"** and add:

| Variable name | Value |
|---|---|
| `GEMINI_API_KEY` | Your key from https://aistudio.google.com/apikey |

Click **Save and Deploy** — your site will be live at `your-project.pages.dev` in ~2 minutes.

---

### Step 4 — Fix Firebase Google Login
After deploy, Google Login will be blocked unless you whitelist your domain.

1. Go to https://console.firebase.google.com
2. Select your Firebase project
3. Click **Authentication** → **Settings** tab
4. Scroll to **Authorized domains**
5. Click **Add domain** and add:
   ```
   your-project.pages.dev
   ```

---

### Step 5 — Set Firestore Security Rules
1. Go to https://console.firebase.google.com
2. Select your Firebase project
3. Click **Firestore Database** → **Rules** tab
4. Replace everything with the rules below and click **Publish**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner() {
      return request.auth != null && request.auth.uid == resource.data.userId;
    }
    function isAuth() {
      return request.auth != null;
    }
    function isMyData() {
      return request.auth != null && request.resource.data.userId == request.auth.uid;
    }

    match /tasks/{id} {
      allow read: if isOwner();
      allow create: if isMyData();
      allow update: if isOwner() && isMyData();
      allow delete: if isOwner();
    }

    match /bookmarks/{id} {
      allow read: if isOwner();
      allow create: if isMyData();
      allow update: if isOwner() && isMyData();
      allow delete: if isOwner();
    }

    match /notes/{id} {
      allow read: if isOwner();
      allow create: if isMyData();
      allow update: if isOwner() && isMyData();
      allow delete: if isOwner();
    }

    match /categories/{id} {
      allow read: if isOwner();
      allow create: if isMyData();
      allow update: if isOwner() && isMyData();
      allow delete: if isOwner();
    }

    match /alarms/{id} {
      allow read: if isOwner();
      allow create: if isMyData();
      allow update: if isOwner() && isMyData();
      allow delete: if isOwner();
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## ✨ Features

- 🔍 Google Search with autocomplete suggestions
- 🔖 Bookmarks with categories (synced via Firebase when logged in)
- ✅ Tasks / To-Do list (localStorage for guests, Firebase for logged-in users)
- 📝 Quick Notes (synced via Firebase when logged in)
- ⏰ Alarms with classic beep sound, repeats for 5 minutes, dismiss anytime
- 🤖 Orbit AI — Gemini-powered assistant
- 🖼️ Dynamic wallpapers from Unsplash
- 🔐 Google Sign-In (optional, enables cloud sync across devices)

---

## 📁 Project Structure

```
homepage/
├── functions/
│   └── api/
│       ├── suggestions.ts   # Cloudflare Function: Google search suggestions proxy
│       └── gemini.ts        # Cloudflare Function: Gemini AI proxy (API key stays secret)
├── src/
│   ├── App.tsx              # Main React app
│   ├── lib/
│   │   ├── firebase.ts      # Firebase Auth + Firestore
│   │   └── gemini.ts        # Calls /api/gemini serverless function
│   └── main.tsx
├── wrangler.toml            # Cloudflare Pages config
├── vite.config.ts           # Vite build config
└── package.json
```

---

## 🛠 Local Development

```bash
npm install
cp .env.example .env    # Add your GEMINI_API_KEY inside .env
npm run dev
```

> **Note:** Gemini AI won't work in local dev unless you also run Cloudflare's local emulator:
> ```bash
> npx wrangler pages dev dist --compatibility-date=2024-01-01
> ```

---

## 🔧 Tech Stack

- **React 19** + **TypeScript**
- **Vite 6** — build tool
- **Tailwind CSS v4** — styling
- **Firebase** — Auth (Google Login) + Firestore (data sync)
- **Gemini AI** — AI assistant via Cloudflare serverless function
- **Framer Motion** — animations
- **Cloudflare Pages** — hosting + serverless functions

---

## ⚠️ Notes

- Tasks work without login (saved to browser localStorage)
- Logging in syncs tasks, bookmarks, notes, and alarms to Firebase across all your devices
- Favicon 404 errors in the console for bookmarks with fake URLs are harmless
