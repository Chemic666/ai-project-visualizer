import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { startPreview } from "./server.mjs";
import { writePreviewOutput } from "./output.mjs";

const args = process.argv.slice(2);
if (
  args.length > 1 ||
  (args.length === 1 && !["--build", "--help"].includes(args[0]))
) {
  console.error("用法：pnpm demo:preview [--build | --help]");
  process.exitCode = 2;
} else if (args[0] === "--help") {
  console.log(
    "本地合成预览；默认仅监听127.0.0.1，Ctrl+C结束。--build只生成本目录dist内的静态文件。",
  );
} else {
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const result = await build({
      entryPoints: [join(here, "app.ts")],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      target: "es2023",
      logLevel: "silent",
    });
    const assets = {
      html: await readFile(join(here, "index.html"), "utf8"),
      script: result.outputFiles[0].contents,
      css: await readFile(join(here, "style.css"), "utf8"),
    };
    const out = join(here, "dist");
    await writePreviewOutput(out, assets);
    if (args[0] === "--build")
      console.log("合成预览静态文件已生成：experiments/core-preview/dist");
    else {
      const preview = await startPreview(assets);
      console.log(`APV 合成预览：${preview.url}`);
      console.log("只使用固定合成数据。无真实会话/存储/模型接入；Ctrl+C结束。");
      process.once("SIGINT", () => preview.server.close());
      process.once("SIGTERM", () => preview.server.close());
    }
  } catch {
    console.error(
      "合成预览启动失败；没有放宽文件或外连权限。请运行标准检查核对源码。",
    );
    process.exitCode = 1;
  }
}
