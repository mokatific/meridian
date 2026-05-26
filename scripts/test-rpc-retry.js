import http from "node:http";
import { createCachedConnection } from "../utils/rpc-cache.js";

const port = Number(process.env.RPC_MOCK_PORT || 8899);
const failCount = Number(process.env.RPC_MOCK_429S || 2);
let requestCount = 0;

function buildSuccessResponse(id, method) {
  if (method === "getLatestBlockhash") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        context: { slot: 1 },
        value: {
          blockhash: "11111111111111111111111111111111",
          lastValidBlockHeight: 123,
        },
      },
    };
  }

  return { jsonrpc: "2.0", id, result: null };
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    requestCount += 1;
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }

    const id = payload?.id ?? requestCount;
    const method = payload?.method || "unknown";

    if (requestCount <= failCount) {
      res.writeHead(429, {
        "content-type": "application/json",
        "retry-after": "1",
      });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32005, message: "Too Many Requests" },
        }),
      );
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(buildSuccessResponse(id, method)));
  });
});

server.listen(port, async () => {
  const rpcUrl = `http://127.0.0.1:${port}`;
  console.log(`Mock RPC listening at ${rpcUrl} (429 x ${failCount})`);

  try {
    const conn = createCachedConnection(rpcUrl, "confirmed");
    const result = await conn.getLatestBlockhash();
    console.log("getLatestBlockhash result:", result);
  } catch (err) {
    console.error("RPC call failed:", err?.message || err);
  } finally {
    server.close(() => {
      console.log("Mock RPC server closed");
    });
  }
});
