import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const configFile = new URL("../public/site-password.json", import.meta.url);
const origin = "http://127.0.0.1:4188";
const hash = (password, salt) => pbkdf2Sync(password, salt, 600000, 32, "sha256");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 60000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
let busy = false;
createServer(async (req, res) => {
  const send = (status, body, type = "application/json") => { res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" }); res.end(type === "application/json" ? JSON.stringify(body) : body); };
  if (req.headers.host !== "127.0.0.1:4188") return send(403, { error: "仅允许本机访问" });
  if (req.method === "GET" && req.url === "/") return send(200, await readFile(new URL("password-admin.html", import.meta.url), "utf8"), "text/html");
  if (req.method !== "POST" || req.url !== "/publish" || req.headers.origin !== origin || req.headers["content-type"] !== "application/json") return send(403, { error: "请求不允许" });
  if (busy) return send(409, { error: "正在发布，请等待" });
  busy = true; let saved = false;
  try {
    let body = "";
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new Error("请求过大"); }
    const { currentPassword, password, confirm } = JSON.parse(body);
    if (typeof currentPassword !== "string" || currentPassword.length > 128 || typeof password !== "string" || password.length < 6 || password.length > 128 || password !== confirm) throw new Error("请输入当前密码；新密码需为 6–128 位且两次一致");
    const current = JSON.parse(await readFile(configFile, "utf8"));
    if (!timingSafeEqual(hash(currentPassword, current.salt), Buffer.from(current.hash, "hex"))) throw new Error("当前密码不正确");
    if (git("branch", "--show-current") !== "main" || git("diff", "--cached", "--name-only")) throw new Error("请先切换到 main 并处理暂存区，再发布密码");
    if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("工作区有未提交修改，请先处理后再发布密码");
    if (git("remote", "get-url", "origin") !== "https://github.com/possbb/assets.git") throw new Error("发布仓库不匹配");
    git("fetch", "origin", "main");
    if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) throw new Error("本地和线上版本不一致，请先同步代码");
    const salt = randomBytes(16).toString("hex");
    await writeFile(configFile, JSON.stringify({ version: 1, salt, hash: hash(password, salt).toString("hex") }, null, 2) + "\n"); saved = true;
    git("add", "--", "web/public/site-password.json");
    git("commit", "-m", "chore: rotate site access password", "--", "web/public/site-password.json");
    git("push", "origin", "main");
    return send(200, { message: "新密码已提交发布。等待 GitHub Pages 部署完成后，所有设备打开网站将使用新密码。" });
  } catch (error) { return send(400, { error: saved ? "新密码已保存到本机，但发布未完成。请让维护者检查 Git 状态并完成发布；不要再次重设。" : error.message?.startsWith("Command failed") ? "Git 操作失败，请检查仓库登录和网络。密码尚未修改。" : error.message }); }
  finally { busy = false; }
}).listen(4188, "127.0.0.1", () => console.log(`管理员密码配置（仅本机）：${origin}\n关闭此终端即可停止配置工具。`));
