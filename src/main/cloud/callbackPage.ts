/**
 * Branded HTML page shown in the user's browser after an OAuth callback.
 * Self-contained — no external requests, no CDN fonts.
 */
export function callbackPage(success: boolean, heading: string, message: string): string {
  // 3×3 scoop-tile mark: 6 active tiles (reversed "F") + 3 ghost — mirrors
  // Logo.tsx TILES. Ghost tiles are White at 16% opacity on the dark shell.
  const mark = `<svg viewBox="0 0 40 40" width="48" height="48" aria-hidden="true">
    <rect x="3"  y="3"  width="10" height="10" rx="2.8" fill="#f26d6d"/>
    <rect x="15" y="3"  width="10" height="10" rx="2.8" fill="#f286b4"/>
    <rect x="27" y="3"  width="10" height="10" rx="2.8" fill="#f9a85c"/>
    <rect x="3"  y="15" width="10" height="10" rx="2.8" fill="#6e9bee"/>
    <rect x="15" y="15" width="10" height="10" rx="2.8" fill="#4fc9b8"/>
    <rect x="3"  y="27" width="10" height="10" rx="2.8" fill="#a585e0"/>
    <rect x="27" y="15" width="10" height="10" rx="2.8" fill="#ffffff" opacity="0.16"/>
    <rect x="15" y="27" width="10" height="10" rx="2.8" fill="#ffffff" opacity="0.16"/>
    <rect x="27" y="27" width="10" height="10" rx="2.8" fill="#ffffff" opacity="0.16"/>
  </svg>`;

  const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#4fc9b8" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" width="28" height="28" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`;

  const errorIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" width="28" height="28" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const iconBg = success ? 'rgba(79,201,184,0.12)' : 'rgba(239,68,68,0.12)';
  const icon = success ? checkIcon : errorIcon;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FilDOS</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{
    background:#0f1117;
    color:#eef2fb;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center;
    min-height:100vh;padding:2rem;
  }
  .wrap{display:flex;flex-direction:column;align-items:center;gap:2rem;max-width:320px;text-align:center}
  .icon-ring{
    width:72px;height:72px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    background:${iconBg};
  }
  h1{font-size:1.1rem;font-weight:500;color:#eef2fb;margin-bottom:.5rem}
  p{font-size:.875rem;color:#8a8f9c;line-height:1.6}
  .divider{width:32px;height:1px;background:#262932}
</style>
</head>
<body>
<div class="wrap">
  ${mark}
  <div class="divider"></div>
  <div class="icon-ring">${icon}</div>
  <div>
    <h1>${heading}</h1>
    <p>${message}</p>
  </div>
</div>
</body>
</html>`;
}
