# VideoForge Admin Frontend

Standalone React + Vite admin web client for the Flask admin APIs.

## Commands

- `npm run dev` starts the admin frontend at `http://localhost:5173/admin/` and proxies `/api` to `http://127.0.0.1:5000`.
- `npm run lint` validates the React source.
- `npm run build` writes the production admin app to `admin-frontend/dist`.

## Backend Serving

Flask serves the built app from `admin-frontend/dist` for `/admin`, `/admin/login`, `/admin/setup`, `/admin/manage`, and `/admin/users/:id`. The admin API remains in `server/admin_routes.py`.
