<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>



## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from [.env.example](.env.example) and set at least `ADMIN_PASSCODE`. Add `GEMINI_API_KEY` if you use AI features and Stripe keys if you use card payments.
3. Run the app:
   `npm run dev`

## Full app modes

- `npm run dev`: starts the Express server with the Vite middleware and keeps the admin API available.
- `npm run preview`: builds the frontend and serves the production app through Express, including `/api/*`.

## Admin security

- In production, the Back Office login is disabled unless `ADMIN_PASSCODE` is explicitly configured.
- After 5 failed admin login attempts from the same client within 10 minutes, login is blocked for 15 minutes.

Do not open `dist/index.html` directly in the browser and do not use a static-only preview for the admin panel, because the back office depends on the Express API.
