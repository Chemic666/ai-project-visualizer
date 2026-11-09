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
      .getElementById("back-overview")
      ?.addEventListener("click", () => navigate("overview"));
    // New page navigation starts at its heading, not the first bottom button.
    document
      .getElementById(mode === "overview" ? "surface-title" : "back-overview")
      ?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    const ok =
      mode === "overview"
        ? !!document.getElementById("unconnected-overview")
        : document.querySelectorAll("#checkpoint-nav button").length === 8 &&
          !!document.getElementById("progress-number")?.textContent?.trim() &&
          !!document.getElementById("checkpoint-label")?.textContent?.trim();
    api.postMessage({ type: "surface.ready", mode, generation, ok });
  });
})();
