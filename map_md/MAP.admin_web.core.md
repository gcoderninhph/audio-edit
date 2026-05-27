# MAP.admin_web.core

## admin frontend root
- `admin-frontend/index.html` - Hosts the Vite root element for the standalone admin SPA.
- `admin-frontend/package.json` - Declares admin web scripts, dependencies, and build commands.
- `admin-frontend/README.md` - Documents the standalone admin frontend workflow and Flask-served build output.
- `admin-frontend/eslint.config.js` - Defines lint rules for the admin web app.
- `admin-frontend/vite.config.js` - Configures the admin web build, `/admin/` base path, and dev proxy behavior.

## admin bootstrap and shell
- `admin-frontend/src/main.jsx` - Boots the standalone admin React app.
- `admin-frontend/src/App.jsx` - Parses admin routes, verifies sessions, and composes route-level pages and header actions.
- `admin-frontend/src/App.css` - Imports the split admin style modules used across the SPA.
- `admin-frontend/src/index.css` - Defines the global admin theme tokens and resets.
- `admin-frontend/src/components/AdminLayout.jsx` - Renders the shared admin shell, navigation, and logout flow.
- `admin-frontend/src/components/DeveloperMarker.jsx` - Renders developer-only locator markers for admin UI sections.
- `admin-frontend/src/components/LoginPage.jsx` - Renders the admin login page and submits credentials.
- `admin-frontend/src/components/SetupPage.jsx` - Renders the bootstrap-admin setup flow.
- `admin-frontend/src/components/ManagePage.jsx` - Renders the user-management list page with search and paging.
- `admin-frontend/src/components/UserDetailPage.jsx` - Renders the per-user detail page with credit and request management.
- `admin-frontend/src/components/Pagination.jsx` - Renders shared pagination controls across admin tables.

## admin shared APIs and styles
- `admin-frontend/src/api/adminApi.js` - Wraps core auth, user, IAP, and credit APIs used across admin pages.
- `admin-frontend/src/utils/format.js` - Provides shared number, currency, and date formatting helpers for admin surfaces.
- `admin-frontend/src/styles/layout.css` - Styles the shared admin layout shell and navigation surfaces.
- `admin-frontend/src/styles/forms.css` - Styles admin forms, buttons, notices, and dialog controls.
- `admin-frontend/src/styles/tables.css` - Styles shared admin tables, pills, and pagination rows.
- `admin-frontend/src/styles/detail.css` - Styles detail views and compact summary grids.
