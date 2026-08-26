const APP_START = '<div id="app">';
const SCRIPT_START = "\n<script>";

export function replaceLegacyBootstrapLogin(html: string) {
  const appStart = html.indexOf(APP_START);
  const scriptStart = html.indexOf(SCRIPT_START, appStart + APP_START.length);

  if (appStart < 0 || scriptStart < 0) {
    throw new Error("Legacy CRM application shell markers were not found.");
  }

  const loadingShell = `<div id="app" aria-busy="true">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#334155;font:700 16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    Загрузка ROLANPRO CRM…
  </div>
</div>`;

  return `${html.slice(0, appStart)}${loadingShell}${html.slice(scriptStart)}`;
}
