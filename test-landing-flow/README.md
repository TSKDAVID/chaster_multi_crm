# Test Landing Flow

Standalone local app to simulate Chaster customer acquisition:

1. choose package modules (CRM/widget),
2. submit fake card checkout,
3. call `provision_tenant` edge function,
4. validate invite-email-first onboarding.

## Local run

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_CHASTER_PROVISIONING_SECRET`
3. Install and run:

```bash
npm install
npm run dev
```

Open the shown local URL (typically `http://localhost:5174` or `http://localhost:5173`).

## End-to-end test checklist

1. On `/`, choose CRM/widget toggles.
2. Continue to `/checkout` and submit test data.
3. Confirm `/success` shows tenant details and invite status.
4. Open CRM route `/landing-test` in `atomic-crm` app to test equivalent in-app flow.
5. Use invite email to set password, then verify:
   - `/portal/subscription` shows enabled/disabled modules.
   - `/portal/settings` shows widget controls only when widget module is enabled.

## Troubleshooting

- **401 invalid provisioning secret**: ensure `.env` secret matches `CHASTER_PROVISIONING_SECRET` on Supabase function.
- **CORS error in browser**: verify function CORS includes your local dev origin.
- **Invite not sent**: check Supabase Auth SMTP and function logs.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
