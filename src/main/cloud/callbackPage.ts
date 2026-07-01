/**
 * Branded HTML page shown in the user's browser after an OAuth callback.
 * Self-contained — no external requests, no CDN fonts.
 */
export function callbackPage(success: boolean, heading: string, message: string): string {
  // 3×3 node grid: 6 active + 3 ghost at 0.22 opacity — mirrors Logo.tsx NODES.
  const mark = `<svg viewBox="0 0 24 24" fill="#0295f6" width="48" height="48" aria-hidden="true">
    <circle cx="5"  cy="5"  r="2.6"/>
    <circle cx="12" cy="5"  r="2.6"/>
    <circle cx="19" cy="5"  r="2.6"/>
    <circle cx="5"  cy="12" r="2.6"/>
    <circle cx="12" cy="12" r="2.6"/>
    <circle cx="19" cy="12" r="2.6" opacity="0.22"/>
    <circle cx="5"  cy="19" r="2.6"/>
    <circle cx="12" cy="19" r="2.6" opacity="0.22"/>
    <circle cx="19" cy="19" r="2.6" opacity="0.22"/>
  </svg>`;

  const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#0295f6" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" width="28" height="28" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`;

  const errorIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" width="28" height="28" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const iconBg = success ? 'rgba(2,149,246,0.12)' : 'rgba(239,68,68,0.12)';
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
    background:#0c1322;
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
  p{font-size:.875rem;color:#7c87a6;line-height:1.6}
  .divider{width:32px;height:1px;background:#1e2a40}
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
