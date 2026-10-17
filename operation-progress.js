/* Show pending user operations independently of app rerenders and input focus. */
const OperationProgress = (() => {
  const pending = new Map();
  let legacy = "", panel;
  function paint() {
    const text = legacy || [...pending.values()].at(-1) || "";
    if (!panel && !text) return;
    if (!panel) {
      panel = document.createElement("div"); panel.id = "operation-progress";
      panel.className = "noprint";
      panel.innerHTML = '<div class="operation-progress-card" role="status" aria-live="polite" aria-atomic="true"><span class="operation-progress-spinner" aria-hidden="true"></span><span data-progress-text></span></div>';
      document.body.appendChild(panel);
    }
    panel.hidden = !text;
    panel.querySelector('[data-progress-text]').textContent = text;
    const app = document.getElementById('app');
    if (text) app?.setAttribute('aria-busy','true');
    else app?.removeAttribute('aria-busy');
  }
  return {
    begin(text = "読み込み中…") {
      const token = Symbol(); pending.set(token,text); paint();
      return () => { pending.delete(token); paint(); };
    },
    sync(text) { legacy = typeof text === "string" ? text : ""; paint(); }
  };
})();
