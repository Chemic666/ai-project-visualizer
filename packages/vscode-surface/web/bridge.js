(() => {
  const api = acquireVsCodeApi();
  const { apvMode: mode, apvGeneration: generation } = document.body.dataset;
  const navigate = (destination) =>
    api.postMessage({ type: "surface.navigate", destination, generation });
  document.addEventListener("DOMContentLoaded", () => {
    document
      .getElementById("open-demo")
      ?.addEventListener("click", () => navigate("synthetic"));
    document
      .getElementById("open-recovered")
      ?.addEventListener("click", () => navigate("recovered"));
    document
      .getElementById("back-overview")
      ?.addEventListener("click", () => navigate("overview"));
    // New page navigation starts at its heading, not the first bottom button.
    document
      .getElementById(mode === "overview" ? "surface-title" : "back-overview")
      ?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    const progress = !!document
      .getElementById("progress-number")
      ?.textContent?.trim();
    const ok =
      mode === "overview"
        ? !!document.getElementById("unconnected-overview")
        : mode === "recovered"
          ? progress &&
            document.getElementById("replay-panel")?.hidden === true &&
            document.getElementById("demo-mode")?.textContent ===
              "已恢复的合成历史"
          : mode === "synthetic" &&
            progress &&
            document.querySelectorAll(
              '#checkpoint-nav button[aria-pressed="true"]',
            ).length === 1 &&
            !!document.getElementById("checkpoint-label")?.textContent?.trim();
    api.postMessage({ type: "surface.ready", mode, generation, ok });
  });
})();
