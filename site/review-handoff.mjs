// Never send the visitor to Google before their review is on the clipboard.
export async function copyAndContinue({ review, url, clipboard, redirect }) {
  try { await clipboard.writeText(review); }
  catch { return false; }
  if (url) redirect(url);
  return true;
}
