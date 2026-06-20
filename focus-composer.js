(function () {
  const INPUT_ID = 'quickAddInput';

  function focusComposer() {
    const input = document.getElementById(INPUT_ID);
    if (!input) return;
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
