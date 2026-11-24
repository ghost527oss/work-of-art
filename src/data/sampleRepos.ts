// @node: F1.6
// Three small bundled sample repositories. They go through the same inventory,
// planning, and coverage code as a real GitHub repository (`buildSnapshotFromFiles`),
// so their coverage figures are computed, not hand-written.
//
// Samples exist only because the user picks one. They are never substituted for a
// repository that failed to load. The `source` field is 'sample' and the owner is
// 'sample', so every screen that shows the name can label it.
import { buildSnapshotFromFiles, type SampleFile } from '../engine/ingestPipeline';
import type { RepoSnapshot } from '../types/contracts';

export type SampleId = 'static-site' | 'react-frontend' | 'fullstack-api';

export interface SampleInfo {
  id: SampleId;
  label: string;
  description: string;
}

export const SAMPLES: readonly SampleInfo[] = [
  { id: 'static-site', label: 'Static site', description: 'Plain HTML, CSS, and JavaScript.' },
  { id: 'react-frontend', label: 'React frontend', description: 'A small Vite + React + TypeScript app with a login form.' },
  { id: 'fullstack-api', label: 'Full-stack API', description: 'A static client with a Node server, routes, middleware, and a service.' },
];

export function isSampleId(value: unknown): value is SampleId {
  return SAMPLES.some((s) => s.id === value);
}

// ---------------------------------------------------------------------------
// Sample files
// ---------------------------------------------------------------------------

const STATIC_SITE: Record<string, SampleFile> = {
  'README.md': '# Static site\n\nA sample project with plain HTML, CSS, and JavaScript.\n',
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sample Bakery</title>
    <link rel="stylesheet" href="css/styles.css" />
  </head>
  <body>
    <header><h1>Sample Bakery</h1></header>
    <main>
      <img src="img/logo.png" />
      <p>Fresh bread every morning.</p>
      <button id="order" class="btn">Order now</button>
      <p id="message"></p>
    </main>
    <script src="js/app.js"></script>
  </body>
</html>
`,
  'about.html': `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>About</title><link rel="stylesheet" href="css/styles.css" /></head>
  <body><h1>About us</h1><p>We bake bread.</p><a href="index.html">Home</a></body>
</html>
`,
  'css/styles.css': `body { font-family: sans-serif; margin: 0; }
header { padding: 1rem; border-bottom: 1px solid #000; }
.btn { padding: 0.5rem 1rem; border: 1px solid #000; background: #fff; }
`,
  'js/app.js': `document.getElementById('order').addEventListener('click', function () {
  document.getElementById('message').textContent = 'Thanks for your order!';
});
`,
  'img/logo.png': { size: 2048 },
  'node_modules/left-pad/index.js': 'module.exports = function leftPad(s, n) { return String(s).padStart(n); };\n',
};

const REACT_FRONTEND: Record<string, SampleFile> = {
  'README.md': '# React frontend\n\nA sample Vite + React + TypeScript app.\n',
  'package.json': `{
  "name": "react-frontend-sample",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": { "typescript": "^5.0.0", "vite": "^6.0.0" }
}
`,
  'package-lock.json': { size: 90_000 },
  'vite.config.ts': `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [react()] });
`,
  'index.html': `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sample app</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`,
  'src/main.tsx': `import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<App />);
`,
  'src/App.tsx': `import { LoginForm } from './components/LoginForm';
export function App() {
  return (
    <main>
      <h1>Sample app</h1>
      <LoginForm />
    </main>
  );
}
`,
  'src/components/LoginForm.tsx': `import { useState } from 'react';
import { signIn } from '../api/auth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await signIn(email);
    } catch {
      setError('Sign-in failed');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit"></button>
      {error && <p>{error}</p>}
    </form>
  );
}
`,
  'src/api/auth.ts': `export async function signIn(email: string): Promise<void> {
  const res = await fetch('/api/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('sign-in failed');
}
`,
  'src/styles.css': `main { max-width: 32rem; margin: 2rem auto; font-family: sans-serif; }
button { padding: 0.5rem 1rem; border: 1px solid #000; background: #fff; }
`,
  'public/favicon.ico': { size: 1150 },
};

const FULLSTACK_API: Record<string, SampleFile> = {
  'README.md': '# Full-stack API\n\nA sample static client with a small Node server.\n',
  'package.json': `{
  "name": "fullstack-api-sample",
  "private": true,
  "scripts": { "start": "node server/index.js" },
  "dependencies": { "express": "^4.19.0" }
}
`,
  '.env.example': 'PORT=3000\nDATABASE_URL=\nSESSION_SECRET=\n',
  'server/index.js': `const express = require('express');
const profileRoutes = require('./routes/profile');

const app = express();
app.use(express.json());
app.use('/api/profile', profileRoutes);
app.listen(process.env.PORT || 3000);
`,
  'server/routes/profile.js': `const express = require('express');
const { validateProfile } = require('../middleware/validate');
const { updateProfile } = require('../services/profileService');

const router = express.Router();

router.put('/:id', validateProfile, async (req, res) => {
  const profile = await updateProfile(req.params.id, req.body);
  res.json(profile);
});

module.exports = router;
`,
  'server/middleware/validate.js': `function validateProfile(req, res, next) {
  if (typeof req.body.name !== 'string' || req.body.name.length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }
  next();
}
module.exports = { validateProfile };
`,
  'server/services/profileService.js': `const profiles = new Map();

async function updateProfile(id, data) {
  const next = { id, name: data.name };
  profiles.set(id, next);
  return next;
}
module.exports = { updateProfile };
`,
  'client/index.html': `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Profile</title></head>
  <body>
    <form id="profile-form"><input id="name" /><button>Save</button></form>
    <script src="app.js"></script>
  </body>
</html>
`,
  'client/app.js': `document.getElementById('profile-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  await fetch('/api/profile/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: document.getElementById('name').value }),
  });
});
`,
  'client/favicon.ico': { size: 1150 },
  'node_modules/express/index.js': "module.exports = function express() { /* placeholder for the sample */ };\n",
};

const SAMPLE_FILES: Record<SampleId, Record<string, SampleFile>> = {
  'static-site': STATIC_SITE,
  'react-frontend': REACT_FRONTEND,
  'fullstack-api': FULLSTACK_API,
};

/** Builds a fresh snapshot for a bundled sample. `loadedAt` is injectable for tests. */
export function buildSampleSnapshot(id: SampleId, loadedAt: number = Date.now()): RepoSnapshot {
  return buildSnapshotFromFiles(
    { owner: 'sample', name: id, ref: 'sample', source: 'sample', loadedAt },
    SAMPLE_FILES[id],
  );
}
