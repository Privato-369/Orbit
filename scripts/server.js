import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const root = resolve(projectRoot, process.argv[2] || ".");
const port = Number(process.argv[3] || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Invalid URL");
    return;
  }

  const requested = resolve(root, `.${pathname}`);
  const relativePath = relative(root, requested);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  const file = pathname.endsWith("/") ? resolve(requested, "index.html") : requested;
  let details;
  try {
    details = await stat(file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    console.error(`Could not inspect ${file}:`, error);
    response.writeHead(500).end("Internal server error");
    return;
  }

  if (!details.isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Length": details.size,
    "Content-Type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(file);
  stream.on("error", error => {
    console.error(`Could not serve ${file}:`, error);
    if (response.headersSent) response.destroy(error);
    else response.writeHead(500).end("Internal server error");
  });
  stream.pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Orbit is available at http://localhost:${port}`);
  console.log(`Serving ${root}`);
});
