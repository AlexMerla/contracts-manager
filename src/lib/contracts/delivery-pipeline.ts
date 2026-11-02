import {
  generateContractImages,
  type ContractImageData,
  type ContractImagePair,
} from "@/lib/contract-template/generate-contract-image";
import { getContractImageBuffers } from "@/lib/contract-template/get-contract-image-buffer";
import { sendContractEmail } from "@/lib/email/contract-email";
import { upsertContractCalendarEvent } from "@/lib/google/calendar";
import { uploadContractImageToDrive } from "@/lib/google/drive";
import { prisma } from "@/lib/prisma";
import { triggerContractWhatsApp } from "@/lib/whatsapp/manychat";

// Spec §4.2 — the sequential, in-process delivery pipeline, extracted VERBATIM
// from `src/app/(app)/contratos/actions.ts`'s `createContract` so the public
// pre-contract action runs the identical sequence instead of a second copy
// that can drift. Extraction was safe because the block it came from already
// depended on nothing but `contractId` plus the image data: Drive, Calendar,
// email and WhatsApp each take only a contract id.
//
// Every rule from the original is preserved:
//  * runs AFTER the creating transaction has committed, never inside it;
//  * ONE try/catch per step, so a Drive outage cannot stop Calendar;
//  * never throws and never reports failure to the caller — the contract row
//    already exists, so a failed step stays `false` in its status column for
//    the detail page's manual retry (§4.2 steps 4-5);
//  * Drive BEFORE Calendar is load-bearing: Calendar's attachment link reads
//    the `driveFileId` the Drive step writes;
//  * WhatsApp last, because it is the only step with no status column.

export interface ContractDeliveryPipelineInput {
  contractId: string;
  /**
   * Pre-rendered image payload from the caller, when it already has one in
   * memory. `createContract` passes the data it just assembled, exactly as
   * before the extraction, so this stays a zero-extra-query path for the
   * internal wizard. Omitted by the public action, which lets the pipeline
   * re-read the committed row via `getContractImageBuffers`.
   */
  imageData?: ContractImageData;
}

export async function runContractDeliveryPipeline({
  contractId,
  imageData,
}: ContractDeliveryPipelineInput): Promise<void> {
  // Step 1 — image generation. Best effort: if it throws, creation still
  // succeeded and `imageGenerated` stays `false` for the retry action.
  let contractImages: ContractImagePair | null = null;
  try {
    contractImages = imageData
      ? await generateContractImages(imageData)
      : await getContractImageBuffers(contractId);
    await prisma.contract.update({
      where: { id: contractId },
      data: { imageGenerated: true },
    });
  } catch (error: unknown) {
    console.error(`Failed to generate image for contract ${contractId}:`, error);
  }

  // Step 2 — Drive. Passing the already-rendered pair avoids a second render;
  // `null` means Drive renders it itself and reports its own failure.
  try {
    const drive = await uploadContractImageToDrive(contractId, contractImages ?? undefined);
    if (!drive.ok) {
      console.error(`Drive upload failed for contract ${contractId}: ${drive.message}`);
    }
  } catch (error: unknown) {
    console.error(`Drive upload threw for contract ${contractId}:`, error);
  }

  // Step 3 — Calendar. Must stay after Drive (see the module header).
  try {
    const calendar = await upsertContractCalendarEvent(contractId);
    if (!calendar.ok) {
      console.error(`Calendar event failed for contract ${contractId}: ${calendar.message}`);
    }
  } catch (error: unknown) {
    console.error(`Calendar event threw for contract ${contractId}:`, error);
  }

  // Step 4 — email.
  try {
    const email = await sendContractEmail(contractId);
    if (!email.ok) {
      console.error(`Email delivery failed for contract ${contractId}: ${email.message}`);
    }
  } catch (error: unknown) {
    console.error(`Email delivery threw for contract ${contractId}:`, error);
  }

  // Step 5 — WhatsApp. No status column exists (spec §6.4 defines none); a
  // failure is only logged, with the copyable public link as the fallback.
  try {
    const whatsapp = await triggerContractWhatsApp(contractId);
    if (!whatsapp.ok) {
      console.error(`WhatsApp trigger failed for contract ${contractId}: ${whatsapp.message}`);
    }
  } catch (error: unknown) {
    console.error(`WhatsApp trigger threw for contract ${contractId}:`, error);
  }
}
