export const DEFAULT_GUEST_THEME='glass-bistro';
export const GUEST_THEMES=['glass-bistro','heritage','garden','coastal','midnight','cafe'];
export function guestThemeAccess(rows,venueId){
 return [DEFAULT_GUEST_THEME,...GUEST_THEMES.slice(1).filter(id=>(rows||[]).some(r=>r.venue_id===venueId&&r.kind==='addon'&&r.status==='completed'&&r.service_name==='guest-theme:'+id))];
}
export function publishedGuestTheme(theme,access){
 return GUEST_THEMES.includes(theme)&&access.includes(theme)?theme:DEFAULT_GUEST_THEME;
}
