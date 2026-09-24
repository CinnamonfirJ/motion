import { deletePrivyUser } from "./privy.js";
import { AccountDeletions } from "./store.js";
import { deleteUserPostMedia } from "./social.js";

let processing = false;
const processingJobs = new Set<string>();

export async function processAccountDeletionJob(jobId: string): Promise<boolean> {
  if (processingJobs.has(jobId)) return false;
  processingJobs.add(jobId);
  try {
    const job = await AccountDeletions.byId(jobId);
    if (!job || job.status === "complete") return true;
    try {
      await deleteUserPostMedia(job.userId);
      if (job.privyId) await deletePrivyUser(job.privyId);
      await AccountDeletions.complete(job.id);
      return true;
    } catch (error) {
      await AccountDeletions.failed(job.id, error);
      return false;
    }
  } finally {
    processingJobs.delete(jobId);
  }
}

export async function processPendingAccountDeletions(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (const job of await AccountDeletions.pending()) {
      await processAccountDeletionJob(job.id);
    }
  } finally {
    processing = false;
  }
}
