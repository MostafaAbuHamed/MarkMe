import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}

export interface TestServer {
  url: string;
  port: number;
  close: () => Promise<void>;
  requests: RecordedRequest[];
}

export type ServerHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export function startServer(handler: ServerHandler, host = "127.0.0.2"): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    requests.push({
      method: req.method ?? "",
      path: req.url ?? "",
      headers: { ...req.headers },
    });
    void Promise.resolve(handler(req, res)).catch(() => {
      res.destroy();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected a TCP address"));
        return;
      }
      const port = address.port;
      const formatted = host.includes(":") ? `[${host}]` : host;
      resolve({
        url: `http://${formatted}:${port}/`,
        port,
        requests,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => {
              if (error) fail(error);
              else done();
            });
            server.closeAllConnections();
          }),
      });
    });
  });
}
