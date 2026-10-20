exports.run = async () => {
  const vscode = require("vscode"),
    fs = require("node:fs"),
    path = require("node:path");
  const spec = process.env.APV_B1_HOST_SPEC;
  try {
    const extension = vscode.extensions.getExtension(
      "apv-local-validation.apv-storage-host-validation",
    );
    if (!extension) throw Error("installed_extension_missing");
    if (extension.extensionPath === process.env.APV_B1_CONTROLLER)
      throw Error("not_installed");
    const api = await extension.activate();
    await api.validate(spec);
  } catch (error) {
    if (spec)
      fs.writeFileSync(
        path.join(path.dirname(spec), "host-error.json"),
        JSON.stringify({
          code: "unavailable",
          message: String(error.message),
          stack: String(error.stack),
        }),
        { flag: "wx" },
      );
    throw error;
  }
};
