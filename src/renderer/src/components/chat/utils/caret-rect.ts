/**
 * Gets the bounding rect of the current caret position in the DOM selection.
 * Uses a zero-width-space span trick for collapsed cursors with zero-size rects.
 */
export function getCaretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const span = document.createElement('span');
    span.textContent = '\u200b';
    range.insertNode(span);
    const spanRect = span.getBoundingClientRect();
    span.parentNode?.removeChild(span);
    selection.removeAllRanges();
    selection.addRange(range);
    return spanRect;
  }
  return rect;
}
