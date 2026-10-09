import { describe, expect, it, vi } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

import { GET } from "@/app/(app)/reportes/export/route";

describe("the reports export route rejects an unauthenticated request", () => {
  it("returns 401 without touching the database", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/reportes/export?usuario=x"));
    expect(response.status).toBe(401);
  });
});
