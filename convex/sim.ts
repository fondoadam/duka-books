import { internalMutation } from "./_generated/server";

// Simulator only. Internal, so only `npx convex run` (an admin key) can mint an upload URL; the photo it uploads
// is sent as the media id `${SIM_STORAGE}<storageId>`, which only a simulated shop reads (process.ts fetchMedia).
export const SIM_STORAGE = "sim-storage:";

export const uploadUrl = internalMutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});
