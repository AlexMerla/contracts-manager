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
 * `GOOGLE_DRIVE_FOLDER_ID` is configured. Named distinctly from a generic
 * "Contratos" so it reads clearly as this app's own automated folder, not
 * whatever manual contract documentation the business may already keep. */
export const CONTRACTS_FOLDER_NAME = "ContratosWeb";

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

/** `https://drive.google.com/file/d/{id}/view` — the human-openable Drive link
 * for a file this module uploaded. Used both by the Calendar description's 📎
 * line and by the contract detail page's "Documento y respaldos" card.
 *
 * Lived in `calendar.ts` until the contract-detail redesign purely because
 * Calendar was its first consumer; it is a Drive concern and belongs here. */
export function driveFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
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

/** Overwrites an existing file's bytes, keeping its id, name and parents
 * (`PATCH /upload/drive/v3/files/{id}?uploadType=media`). Works under the
 * `drive.file` scope because every file it targets was created by this app. */
async function replaceDriveFileContent(params: {
  fileId: string;
  content: Buffer;
  operation: string;
}): Promise<GoogleApiResult<string>> {
  const replaced = await googleApiFetch<DriveFile>({
    url: `${DRIVE_UPLOAD_ENDPOINT}/${encodeURIComponent(params.fileId)}?uploadType=media&fields=id`,
    method: "PATCH",
    headers: { "Content-Type": CONTRACT_IMAGE_MIME_TYPE },
    body: new Uint8Array(params.content),
    operation: params.operation,
  });
  if (!replaced.ok) {
    return replaced;
  }
  return { ok: true, data: replaced.data.id };
}

/**
 * Syncs a contract's PAIR of images (official contract + pre-contract) to
 * Drive and records `driveFileId` / `preContractDriveFileId` /
 * `driveUploaded`. Never throws for an API failure (spec §4.2).
 *
 * `driveUploaded` is the "Drive matches the stored data" signal; the id
 * columns only say WHICH file holds each image. Per file:
 *  - no id yet → create it (multipart upload) and persist the id at once, so
 *    a failure on the second file never re-creates the first;
 *  - id present → overwrite its bytes IN PLACE (media PATCH, same id) — so
 *    the Calendar attachment link and the detail page's "Abrir" links stay
 *    valid. A 404 (the file was deleted by hand) falls back to create and
 *    stores the new id.
 *
 * Idempotency (spec §4.2 step 5): `driveUploaded && both ids` → no-op, no API
 * call. Everything else is safe to re-run: create happens only for a missing
 * id, and an overwrite can never produce a duplicate file.
 *
 * edit-precontract: `updateContract` resets `driveUploaded` to `false`, so
 * the post-edit sync — and, if that fails, the manual "Reintentar" — overwrite
 * the stale files instead of the old "both ids present → just flip the flag"
 * shortcut, which would have silently left the pre-edit images in Drive. The
 * rare crash-between-upload-and-flag case now re-sends identical bytes to the
 * same ids — harmless, and the price of not needing a "stale" column.
 *
 * @param images the pair already rendered by the caller; omitted by the
 * manual retry action, which regenerates both from stored data instead.
 */
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

  let pair: ContractImagePair;
  try {
    pair = images ?? (await getContractImageBuffers(contractId));
  } catch (error: unknown) {
    return {
      ok: false,
      message: `No se pudieron generar las imágenes del contrato para subirlas a Drive: ${errorMessage(error)}`,
    };
  }

  const files: { kind: ContractDriveFileKind; fileId: string | null }[] = [
    { kind: "contract", fileId: contract.driveFileId },
    { kind: "preContract", fileId: contract.preContractDriveFileId },
  ];

  // Resolved lazily: a pure overwrite of two existing files never needs it.
  let folderId: string | null = null;
  async function ensureFolder(): Promise<GoogleApiResult<string>> {
    if (folderId) {
      return { ok: true, data: folderId };
    }
    const folder = await resolveFolderId();
    if (folder.ok) {
      folderId = folder.data;
    }
    return folder;
  }

  for (const { kind, fileId } of files) {
    const isOfficial = kind === "contract";
    const content = isOfficial ? pair.contract : pair.preContract;

    if (fileId) {
      const replaced = await replaceDriveFileContent({
        fileId,
        content,
        operation: isOfficial ? "actualizar el contrato en Drive" : "actualizar el precontrato en Drive",
      });
      if (replaced.ok) {
        continue;
      }
      // Anything but "the file is gone" is a real failure; leave the id alone.
      if (replaced.reason !== "request_failed" || replaced.status !== 404) {
        return { ok: false, message: replaced.message };
      }
    }

    const folder = await ensureFolder();
    if (!folder.ok) {
      return { ok: false, message: folder.message };
    }
    const created = await createDriveFile({
      name: contractDriveFileName(kind, contract.folio),
      folderId: folder.data,
      content,
      operation: isOfficial ? "subir el contrato a Drive" : "subir el precontrato a Drive",
    });
    if (!created.ok) {
      return { ok: false, message: created.message };
    }

    // Persisted per file: if the NEXT upload fails, the retry must know this one exists.
    await prisma.contract.update({
      where: { id: contractId },
      data: isOfficial ? { driveFileId: created.data } : { preContractDriveFileId: created.data },
    });
  }

  await prisma.contract.update({
    where: { id: contractId },
    data: { driveUploaded: true },
  });

  return { ok: true };
}
