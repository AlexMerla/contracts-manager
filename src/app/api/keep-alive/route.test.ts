import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Real database, no mocks (the project's pattern): the whole point of the
// route is that the `SELECT 1` actually reaches Postgres.
import { GET } from "./route";

const SECRET = "test-cron-secret";
let previousSecret: string | undefined;

function call(authorization?: string): Promise<Response> {
  const headers = authorization ? { authorization } : undefined;
  return GET(new Request("http://localhost/api/keep-alive", { headers }));
}

beforeEach(() => {
  previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
});

describe("GET /api/keep-alive", () => {
  it("runs the query and returns 200 with the right bearer secret", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("rejects a missing or wrong Authorization header with 401", async () => {
    for (const header of [undefined, "Bearer nope", SECRET, `Bearer ${SECRET}x`]) {
      const response = await call(header);
      expect(response.status).toBe(401);
    }
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
  });
});
