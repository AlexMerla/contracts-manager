import type { DefaultSession } from "next-auth";

type AppUserRole = "super" | "normal";

declare module "next-auth" {
  interface User {
    id: string;
    role: AppUserRole;
  }

  interface Session {
    user: {
      id: string;
      role: AppUserRole;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: AppUserRole;
  }
}
