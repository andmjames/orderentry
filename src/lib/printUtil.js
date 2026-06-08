// Print a specific overlay at a specific page size without the two print
// layouts (packing list = Letter, pallet labels = 6x4) clobbering each other.
// We tag <html> with an intent class (so CSS shows the right overlay) and
// inject a matching @page rule, then clean both up after printing.
export function printWithPage(intentClass, pageCss) {
  const html = document.documentElement;
  const style = document.createElement('style');
  style.setAttribute('data-print-page', '1');
  style.textContent = pageCss;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    html.classList.remove(intentClass);
    if (style.parentNode) style.parentNode.removeChild(style);
    window.removeEventListener('afterprint', cleanup);
  };

  html.classList.add(intentClass);
  document.head.appendChild(style);
  window.addEventListener('afterprint', cleanup);

  // Let the browser apply styles before opening the print dialog.
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1500); // fallback if afterprint doesn't fire
  }, 60);
}
