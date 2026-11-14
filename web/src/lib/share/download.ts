/** Saves text as a file through the browser's own download, as a link with a download name does. */
export function saveFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let go of the file once the download has it; some browsers start it a moment after the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copies text to the clipboard; fails when the browser will not let the page (an insecure page, or no permission). */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('this browser gives the page no clipboard');
  await navigator.clipboard.writeText(text);
}
