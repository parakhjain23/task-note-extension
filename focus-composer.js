(function () {
  const INPUT_ID = 'quickAddInput';

  function focusComposer() {
    const input = document.getElementById(INPUT_ID);
    if (!input) return;
    // Don't steal focus while the command palette is open…
    const cmdk = document.getElementById('cmdkOverlay');
    if (cmdk && !cmdk.classList.contains('hidden')) return;
    // …or while the user is typing in the notes pane (title or editor).
    const active = document.activeElement;
    if (active && active !== input) {
      const notesPane = document.getElementById('notesPane');
      if (notesPane && notesPane.contains(active)) return;
      if (active.isContentEditable) return;
    }
    input.focus({ preventScroll: true });
  }

  function scheduleComposerFocus() {
    focusComposer();
    requestAnimationFrame(focusComposer);
    [50, 150, 300].forEach((ms) => setTimeout(focusComposer, ms));
  }

  window.scheduleComposerFocus = scheduleComposerFocus;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleComposerFocus);
  } else {
    scheduleComposerFocus();
  }

  window.addEventListener('pageshow', scheduleComposerFocus);
})();
