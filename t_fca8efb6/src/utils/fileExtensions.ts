/**
 * Safely extracts the file extension from a filename or URL.
 * Returns the extension without the dot, or null if no valid extension is found.
 */
export function getFileExtension(filename: string): string | null {
  if (!filename || !filename.includes('.')) return null;
  
  const parts = filename.split('.');
  if (parts.length <= 1) return null;
  
  const ext = parts.pop()?.toLowerCase() || null;
  
  // If the "extension" is the only thing (e.g. ".gitignore"), 
  // and there were no other dots, parts would have been empty or had one element.
  // Actually, split('.') on ".gitignore" gives ["", "gitignore"]. parts.length is 2.
  // pop() gives "gitignore". This is usually acceptable as an extension.
  
  return ext;
}

/**
 * Gets a default extension if none is found.
 */
export function getFileExtensionWithDefault(filename: string, defaultExt: string): string {
  return getFileExtension(filename) || defaultExt;
}
