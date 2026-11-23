// Shared by the root layout (server) and lib/theme.ts (client).
export const THEME_KEY = "forior-theme";
/** Runs before the page paints (inlined in layout.tsx) so dark mode never flashes white. Keep it in sync with applyTheme. */
export const THEME_BOOT = `(function(){try{var p=location.pathname;if(/\\/(gallery|review)(\\/|$)/.test(p))return;var c=localStorage.getItem('${THEME_KEY}')||'light';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;
