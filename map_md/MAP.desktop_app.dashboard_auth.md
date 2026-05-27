# MAP.desktop_app.dashboard_auth

## desktop auth and payments
- `frontend/src/components/AppShell/AppHeader.jsx` - Renders the top desktop header around auth, language, and purchase actions.
- `frontend/src/components/AppShell/CreditPackagesDialog.jsx` - Renders the desktop credit-purchase package dialog.
- `frontend/src/components/AppShell/HeaderLanguageSwitcher.jsx` - Renders the header locale switcher for the desktop shell.
- `frontend/src/components/AppShell/PaymentQrDialog.jsx` - Renders the desktop QR payment dialog flow.
- `frontend/src/components/AppShell/PaymentQrDialog.css` - Styles the QR payment dialog.
- `frontend/src/components/AppShell/paymentQrDialogModel.js` - Holds QR payment dialog state helpers and request formatting.
- `frontend/src/components/AppShell/PaymentQrDialogShared.jsx` - Renders shared payment dialog sections reused across QR payment states.
- `frontend/src/components/AppShell/PremiumPackagesDialog.jsx` - Renders the premium plan purchase dialog.
- `frontend/src/components/AppShell/PremiumPackagesDialog.css` - Styles the premium package dialog.
- `frontend/src/components/Auth/AuthDialog.jsx` - Renders the desktop auth popup for login and registration.
- `frontend/src/components/Auth/AuthDialog.css` - Styles the auth popup, form states, and responsive layout.
- `frontend/src/components/Auth/AuthHeaderActions.jsx` - Renders header auth actions, user menu, and credit button behavior.
- `frontend/src/components/Admin/AdminBootstrapSetup.jsx` - Renders the temporary-admin bootstrap setup flow inside the desktop app.
- `frontend/src/components/Admin/AdminBootstrapSetup.css` - Styles the bootstrap setup form.
- `frontend/src/components/Admin/AdminConsole.jsx` - Renders the desktop admin console for backend overview and user management.
- `frontend/src/components/Admin/AdminConsole.css` - Styles the desktop admin console panels and tables.
- `frontend/src/hooks/useAuthSession.js` - Owns desktop auth session state, refresh, and user/balance synchronization.
- `frontend/src/utils/adminClient.js` - Wraps desktop admin API requests used by the embedded admin console.
- `frontend/src/utils/authClient.js` - Wraps desktop auth API requests and session persistence helpers.
- `frontend/src/utils/iapClient.js` - Wraps desktop IAP package and payment API requests.
- `frontend/src/utils/premiumWindow.js` - Normalizes premium-window state and premium expiration helpers.
- `frontend/src/utils/runtimeConfig.js` - Exposes desktop runtime flags such as backend origin and developer mode.

## dashboard and project library
- `frontend/src/components/ProjectDashboard/ProjectDashboard.jsx` - Coordinates the desktop project dashboard, project grouping, and series navigation.
- `frontend/src/components/ProjectDashboard/ProjectDashboard.css` - Styles the dashboard, series layout, and project card surfaces.
- `frontend/src/components/ProjectDashboard/ProjectDashboardCards.jsx` - Renders reusable project and series cards plus option menus.
- `frontend/src/components/ProjectDashboard/ProjectDashboardDialogs.jsx` - Renders dashboard dialogs for editing project metadata and building series.
- `frontend/src/components/ProjectDashboard/projectDashboardModel.js` - Holds pure dashboard helpers for project grouping and metadata shaping.
- `frontend/src/components/ProjectDashboard/SeriesDetailView.jsx` - Renders the series watch page, episode list, and series export entrypoint.
- `frontend/src/components/ProjectDashboard/SeriesExportModal.jsx` - Renders the modal flow for exporting a full series into one file.
- `frontend/src/components/ProjectDashboard/SeriesVideoPlayer.jsx` - Renders the dashboard-side series preview player.
- `frontend/src/hooks/useEditorPersistence.js` - Persists editor projects and routes saved project state back into dashboard workflows.
- `frontend/src/hooks/useEditorPersistenceRestore.js` - Restores saved project state, subtitles, and voiceover assets into the editor.
- `frontend/src/hooks/editorPersistenceJobRestore.js` - Restores in-flight subtitle/translation jobs when reopening saved projects.
- `frontend/src/hooks/useSeriesExport.js` - Owns config, progress, and result state for dashboard series export.
- `frontend/src/utils/projectStorage.js` - Provides project-library storage helpers used by dashboard and editor flows.
- `frontend/src/utils/seriesExportPipeline.js` - Runs the multi-episode export and concat pipeline for dashboard series export.
