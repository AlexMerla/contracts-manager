import { randomUUID } from "node:crypto";

import type { ContractImagePair } from "@/lib/contract-template/generate-contract-image";
import { getContractImageBuffers } from "@/lib/contract-template/get-contract-image-buffer";
import {
  googleApiFetch,
  type ContractDeliveryStepResult,
  type GoogleApiResult,
} from "@/lib/google/api-client";
import { prisma } from "@/lib/prisma";

// Sprint-06 task 6 — upload the generated contract JPEG to the Master Drive.

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const CONTRACT_IMAGE_MIME_TYPE = "image/jpeg";

/** Folder created (and thereafter reused) in the Master Drive's root when no
 * `GOOGLE_DRIVE_FOLDER_ID` is configured. */
export const CONTRACTS_FOLDER_NAME = "Contratos";

interface DriveFile {
  id: string;
  name?: string;
}

interface DriveFileList {
  files?: DriveFile[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolves the Drive folder contracts are uploaded into.
 *
 * Why find-or-create rather than a required env var: the OAuth scope is
 * `drive.file` (`oauth.ts`), which grants per-file access to files this app
 * *created* — it cannot write into a folder a human made by hand in the Drive
 * UI. Pointing a `GOOGLE_DRIVE_FOLDER_ID` at such a folder would 404 forever.
 * Creating the folder from the app keeps it inside the scope's reach, and
 * `files.list` under `drive.file` only ever returns app-created files, so the
 * lookup below can only match the folder this code created.
 *
 * `GOOGLE_DRIVE_FOLDER_ID` is still honoured as an OPTIONAL override, for the
 * case where the operator moves/renames the folder, or shares an existing one
 * with the app explicitly.
 *
 * Not cached: at ~2 contracts/week (spec §4.2's stated volume) one extra
 * `files.list` per upload is free, and skipping the cache removes the only
 * way this could serve a stale folder id after a reconnect.
 */
async function resolveFolderId(): Promise<GoogleApiResult<string>> {
  const configured = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (configured) {
    return { ok: true, data: configured };
  }

  const listUrl = `${DRIVE_FILES_ENDPOINT}?${new URLSearchParams({
    q: `mimeType='${FOLDER_MIME_TYPE}' and name='${CONTRACTS_FOLDER_NAME}' and trashed=false`,
    fields: "files(id,name)",
    pageSize: "1",
  })}`;

  const listed = await googleApiFetch<DriveFileList>({
    url: listUrl,
    operation: `buscar la carpeta "${CONTRACTS_FOLDER_NAME}" en Drive`,
  });
  if (!listed.ok) {
    return listed;
  }

  const existingId = listed.data.files?.[0]?.id;
  if (existingId) {
    return { ok: true, data: existingId };
  }

  const created = await googleApiFetch<DriveFile>({
    url: `${DRIVE_FILES_ENDPOINT}?fields=id`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: CONTRACTS_FOLDER_NAME, mimeType: FOLDER_MIME_TYPE }),
    operation: `crear la carpeta "${CONTRACTS_FOLDER_NAME}" en Drive`,
  });
  if (!created.ok) {
    return created;
  }

  return { ok: true, data: created.data.id };
}

/**
 * Assembles a `multipart/related` body: a JSON metadata part followed by the
 * raw file bytes. Exported so the byte-level framing can be unit-tested
 * without touching Google.
 *
 * `multipart` (one request) is chosen over `resumable` (two+ requests, plus a
 * session URL to track) because the contract JPEG is a few hundred KB — far
 * under the 5 MB ceiling Google recommends for multipart uploads — so the
 * resumable protocol's only benefit, surviving an interrupted large transfer,
 * does not apply.
 */
export function buildDriveMultipartBody(params: {
  boundary: string;
  metadata: Record<string, unknown>;
  contentType: string;
  content: Buffer;
}): Buffer {
  const head =
    `--${params.boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(params.metadata)}\r\n` +
    `--${params.boundary}\r\n` +
    `Content-Type: ${params.contentType}\r\n\r\n`;
  const tail = `\r\n--${params.boundary}--\r\n`;

  return Buffer.concat([Buffer.from(head, "utf8"), params.content, Buffer.from(tail, "utf8")]);
}

/**
 * Uploads a contract's PAIR of images (official contract + pre-contract) to
 * Drive and records `driveFileId` / `preContractDriveFileId` /
 * `driveUploaded`. Never throws for an API failure (spec §4.2).
 *
 * Idempotency, per spec §4.2 step 5 ("check the relevant ID/status column
 * before acting"), is now PER FILE — the id column itself is the completion
 * signal for that exact file:
 *  1. Both ids already present → no-op, returns success. Deliberately no
 *     round-trip to verify the files still exist in Drive: that would cost an
 *     API call on every retry to defend against a human deleting a file out
 *     from under us, which is not a case this step owns.
 *  2. Whichever id is still missing gets uploaded — a retry never re-sends a
 *     file whose id already exists, so "un reintento no debe volver a
 *     subirlo" holds per file, not just for the pair as a whole.
 *  3. Both ids present but the flag still `false` (a crash between the 2nd
 *     upload and the flag write) → flip the flag alone, no upload at all.
 *
 * A legacy row from before this change (flag `true`, `driveFileId` set,
 * `preContractDriveFileId` null) naturally uploads only the missing
 * pre-contract on the next retry and leaves its old `<folio> - <cliente>.jpg`
 * file untouched — no backfill migration needed.
 *
 * @param images the pair already produced by the confirm flow; omitted by the
 * manual retry action, which regenerates both from stored data instead.
 */
type ContractDriveFileKind = "contract" | "preContract";

/** `Contrato<folio>.jpg` / `Precontrato<folio>.jpg` — no client name (product
 * owner's instruction), which also keeps the two companion files adjacent
 * under alphabetical sort. Agnostic to the folio's own format. */
export function contractDriveFileName(kind: ContractDriveFileKind, folio: string): string {
  return kind === "contract" ? `Contrato${folio}.jpg` : `Precontrato${folio}.jpg`;
}

async function createDriveFile(params: {
  name: string;
  folderId: string;
  content: Buffer;
  operation: string;
}): Promise<GoogleApiResult<string>> {
  const boundary = `contract-manager-${randomUUID()}`;
  const body = buildDriveMultipartBody({
    boundary,
    metadata: {
      name: params.name,
      mimeType: CONTRACT_IMAGE_MIME_TYPE,
      parents: [params.folderId],
    },
    contentType: CONTRACT_IMAGE_MIME_TYPE,
    content: params.content,
  });

  const uploaded = await googleApiFetch<DriveFile>({
    url: `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id`,
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
    operation: params.operation,
  });
  if (!uploaded.ok) {
    return uploaded;
  }

  return { ok: true, data: uploaded.data.id };
}

export async function uploadContractImageToDrive(
  contractId: string,
  images?: ContractImagePair
): Promise<ContractDeliveryStepResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      folio: true,
      driveUploaded: true,
      driveFileId: true,
      preContractDriveFileId: true,
    },
  });
  if (!contract) {
    return { ok: false, message: "Contrato no encontrado." };
  }

  if (contract.driveUploaded && contract.driveFileId && contract.preContractDriveFileId) {
    return { ok: true };
  }

  const pending: ContractDriveFileKind[] = [];
  if (!contract.driveFileId) {
    pending.push("contract");
  }
  if (!contract.preContractDriveFileId) {
    pending.push("preContract");
  }

  // Both files exist, only the flag is behind (crash between 2nd upload and flag write).
  if (pending.length === 0) {
    await prisma.contract.update({
      where: { id: contractId },
      data: { driveUploaded: true },
    });
    return { ok: true };
  }

  let pair: ContractImagePair;
  try {
    pair = images ?? (await getContractImageBuffers(contractId));
  } catch (error: unknown) {
    return {
      ok: false,
      message: `No se pudieron generar las imágenes del contrato para subirlas a Drive: ${errorMessage(error)}`,
    };
  }

  const folder = await resolveFolderId();
  if (!folder.ok) {
    return { ok: false, message: folder.message };
  }

  for (const kind of pending) {
    const isOfficial = kind === "contract";
    const created = await createDriveFile({
      name: contractDriveFileName(kind, contract.folio),
      folderId: folder.data,
      content: isOfficial ? pair.contract : pair.preContract,
      operation: isOfficial ? "subir el contrato a Drive" : "subir el precontrato a Drive",
    });
    if (!created.ok) {
      return { ok: false, message: created.message };
    }

    // Persisted per file: if the NEXT upload fails, the retry must know this one is done.
    await prisma.contract.update({
      where: { id: contractId },
      data: isOfficial
        ? { driveFileId: created.data }
        : { preContractDriveFileId: created.data },
    });
  }

  await prisma.contract.update({
    where: { id: contractId },
    data: { driveUploaded: true },
  });

  return { ok: true };
}
