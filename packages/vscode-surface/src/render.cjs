const escape = (value) =>
  String(value).replace(
    /[&<>\"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
function once(template, marker, replacement) {
  if (template.split(marker).length !== 2)
    throw Error("surface_template_rejected");
  return template.replace(marker, () => replacement);
}
function encodeCheckpoint(checkpoint) {
  // The synthetic host supplies the display projection, so storage cuts never
  // enter the document. As with other script data blocks, escape HTML delimiters.
  const keys = [
    "currentPhase",
    "currentTask",
    "key",
    "label",
    "phases",
    "progress",
    "progressReasons",
    "sessionState",
    "tasks",
    "timeline",
  ];
  if (
    checkpoint?.key !== "restored" ||
    Object.keys(checkpoint).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(checkpoint, key))
  )
    throw Error("surface_checkpoint_rejected");
  return JSON.stringify(checkpoint).replace(/</g, "\\u003c");
}

exports.renderSurface = (
  template,
  {
    mode,
    nonce,
    cspSource,
    assets,
    recoveredSample = false,
    runtimeCheckpoint,
  },
) => {
  const recovered = mode === "recovered" && recoveredSample === true;
  if (mode !== "overview" && mode !== "synthetic" && !recovered)
    throw Error("surface_mode_rejected");
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(nonce))
    throw Error("surface_nonce_rejected");
  const runtimeRecovery = recovered && runtimeCheckpoint !== undefined;
  const policy = `default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'`;
  let html = once(
    template,
    "<head>",
    `<head>\n<meta http-equiv="Content-Security-Policy" content="${escape(policy)}" />`,
  );
  html = once(
    html,
    'href="style.css"',
    `href="${escape(assets["style.css"])}"`,
  );
  html = once(
    html,
    "</head>",
    `<link rel="stylesheet" href="${escape(assets["surface.css"])}" />\n</head>`,
  );
  const script = (name) =>
    `<script nonce="${nonce}" src="${escape(assets[name])}" defer></script>`;
  if (mode !== "overview") {
    const client = recovered && !runtimeRecovery ? "recovered.js" : "app.js";
    if (typeof assets[client] !== "string")
      throw Error("surface_assets_unavailable");
    html = once(
      html,
      '<script src="app.js" defer></script>',
      script("bridge.js") + "\n" + script(client),
    );
    html = once(
      html,
      '<div class="app-shell">',
      '<nav class="surface-switcher" aria-label="示例导航"><button id="back-overview" type="button">← 回到项目概览</button><span>' +
        (runtimeRecovery
          ? "本次启动从合成库恢复"
          : recovered
            ? "构建时恢复的合成样例"
            : "内置合成示例") +
        '</span></nav>\n<div class="app-shell">',
    );
  } else {
    html = once(
      html,
      '<script src="bridge.js" defer></script>',
      script("bridge.js"),
    );
    if (recoveredSample === true)
      html = once(
        html,
        "<!-- recovered-sample-entry -->",
        '<button id="open-recovered" type="button">查看已恢复的合成历史 →</button>',
      );
  }
  html = once(
    html,
    "<body>",
    `<body data-apv-mode="${mode}" data-apv-generation="${nonce}"${runtimeRecovery ? ' data-apv-runtime-recovery="true"' : ""}>`,
  );
  if (runtimeRecovery)
    html = once(
      html,
      "</head>",
      `<script id="apv-runtime-checkpoint" type="application/json" nonce="${nonce}">${encodeCheckpoint(runtimeCheckpoint)}</script>\n</head>`,
    );
  return html;
};
