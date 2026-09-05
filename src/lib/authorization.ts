import type { Session } from "next-auth";

import { prisma } from "@/lib/prisma";

export class UnauthorizedError extends Error {
  constructor() {
    super("No autenticado.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("No autorizado para realizar esta acción.");
    this.name = "ForbiddenError";
  }
}

/**
 * Route-level guard. Throws if there is no session, or if `role` is "super"
 * and the current user isn't. Spec §5 permission matrix.
 */
export function requireRole(session: Session | null, role: "super" | "normal") {
  if (!session) {
    throw new UnauthorizedError();
  }
  if (role === "super" && session.user.role !== "super") {
    throw new ForbiddenError();
  }
  return session;
}

// Operations whose args include a `where` clause — the ones worth scoping.
// `create`/`createMany` are excluded on purpose: there's no existing owner to
// violate, and the caller is responsible for setting `createdById` itself.
// `upsert` is excluded too — merging owner conditions into its `where` would
// make an attempt on another user's row fall through to `create` instead of
// cleanly failing, which is a confusing failure mode; revisit if/when a
// route actually needs upsert on one of these models.
const WHERE_SCOPED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

// findUnique/findUniqueOrThrow take a `WhereUniqueInput`, which requires the
// unique field (id/folio/viewerToken) directly at the top level — wrapping
// it in `AND` fails Prisma's validation. Flat-merging instead is the fix,
// with one known limitation: if the caller's own `where` already used the
// exact key our owner condition uses (`createdById` for contracts,
// `contract` for payments/notes), ours wins and theirs is discarded — that's
// deliberate for `createdById` (never let a route override the scope), but
// for the nested `contract` key on payments/notes it would also silently
// drop any other filter the caller nested under `contract`. Acceptable for
// now since findUnique calls on these models are effectively always
// "by id" — revisit if a route ever needs both at once.
const UNIQUE_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow"]);

function mergeWhere(
  existingWhere: Record<string, unknown> | undefined,
  ownerWhere: Record<string, unknown>,
  isUniqueOp: boolean
) {
  if (isUniqueOp) {
    return { ...(existingWhere ?? {}), ...ownerWhere };
  }
  return { AND: [existingWhere ?? {}, ownerWhere] };
}

function scopedAllOperations(ownerWhere: Record<string, unknown>) {
  return ({
    operation,
    args,
    query,
  }: {
    operation: string;
    args: Record<string, unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
  }) => {
    if (WHERE_SCOPED_OPERATIONS.has(operation)) {
      args.where = mergeWhere(
        args.where as Record<string, unknown> | undefined,
        ownerWhere,
        UNIQUE_OPERATIONS.has(operation)
      );
    }
    return query(args);
  };
}

/**
 * Data-access-layer enforcement of spec §5: for a `normal` session, every
 * query against contracts/payments/notes is scoped to that user's own
 * contracts automatically — the route doesn't have to remember to filter.
 * `super` sessions get the unscoped client back unchanged.
 */
export function scopeToOwner(session: Session) {
  if (!session) {
    throw new UnauthorizedError();
  }

  if (session.user.role === "super") {
    return prisma;
  }

  const userId = session.user.id;

  return prisma.$extends({
    name: "scopeToOwner",
    query: {
      contract: {
        $allOperations: scopedAllOperations({ createdById: userId }),
      },
      payment: {
        $allOperations: scopedAllOperations({ contract: { createdById: userId } }),
      },
      note: {
        $allOperations: scopedAllOperations({ contract: { createdById: userId } }),
      },
    },
  });
}
