import { cp, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd(),
  standalone = path.join(root, ".next", "standalone");
await access(path.join(standalone, "server.js")).catch(() => {
  throw new Error("Chưa có bản build. Chạy npm run build trước.");
});
await cp(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  { recursive: true },
);
try {
  await access(path.join(root, "public"));
  await cp(path.join(root, "public"), path.join(standalone, "public"), {
    recursive: true,
  });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
process.env.HOSTNAME = process.env.HOSTNAME || "127.0.0.1";
await import(pathToFileURL(path.join(standalone, "server.js")).href);
