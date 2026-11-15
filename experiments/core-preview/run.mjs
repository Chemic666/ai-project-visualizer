import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { startPreview } from "./server.mjs";
import { writePreviewOutput } from "./output.mjs";

const args = process.argv.slice(2);
const recovery =
  args.length === 3 &&
  args[0] === "--recover-demo" &&
  args[1] === "--driver-root" &&
  isAbsolute(args[2]);
if (
  !recovery &&
  (args.length > 1 ||
    (args.length === 1 && !["--build", "--help"].includes(args[0])))
) {
  console.error(
    "用法：pnpm demo:preview [--build | --help | --recover-demo --driver-root 绝对路径]",
  );
  process.exitCode = 2;
} else if (args[0] === "--help") {
  console.log(
    "本地合成预览仅监听 127.0.0.1，Ctrl+C 结束。\n--build 生成静态文件。--recover-demo 用现有 SQLite Driver 验证一次合成写入和恢复，再打开历史预览。",
  );
} else {
  let historyRecovered = false;
  try {
    const checkpoint = recovery
      ? await (await import("./recovery.mjs")).loadRecoveredCheckpoint(args[2])
      : undefined;
    historyRecovered = checkpoint !== undefined;
    const here = fileURLToPath(new URL(".", import.meta.url));
    const result = await build({
      entryPoints: [join(here, "app.ts")],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      target: "es2023",
      logLevel: "silent",
      ...(checkpoint === undefined
        ? {}
        : { define: { APV_RECOVERED_CHECKPOINT: JSON.stringify(checkpoint) } }),
    });
    const assets = {
      html: await readFile(join(here, "index.html"), "utf8"),
      script: result.outputFiles[0].contents,
      css: await readFile(join(here, "style.css"), "utf8"),
    };
    if (!recovery) await writePreviewOutput(join(here, "dist"), assets);
    if (args[0] === "--build")
      console.log("合成预览静态文件已生成：experiments/core-preview/dist");
    else {
      const preview = await startPreview(assets);
      if (recovery) {
        console.log("APV 已恢复的合成历史：" + preview.url);
        console.log("打开本机地址即可查看，Ctrl+C 结束。");
      } else {
        console.log("APV 合成预览：" + preview.url);
        console.log(
          "只使用固定合成数据。无真实会话/存储/模型接入；Ctrl+C结束。",
        );
      }
      process.once("SIGINT", () => preview.server.close());
      process.once("SIGTERM", () => preview.server.close());
    }
  } catch {
    console.error(
      recovery
        ? historyRecovered
          ? "合成历史已恢复，浏览预览启动失败。请检查本地预览环境。"
          : "合成历史恢复失败。请检查现有 SQLite Driver 和本地开发环境。"
        : "合成预览启动失败。请运行标准检查核对源码。",
    );
    process.exitCode = 1;
  }
}
