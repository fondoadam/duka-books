import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { isDryRun, sendButtons, sendDocument, sendImage, sendText } from "./whatsapp";

// Logs every reply to the outbox, then sends it (unless the deployment or the shop is a dry run).
export function replier(ctx: ActionCtx, shop: Doc<"shops">) {
  const to = shop.waId;
  const dryRun = isDryRun(shop);
  return {
    dryRun,
    text: async (body: string) => {
      await ctx.runMutation(internal.outbox.log, { to, body, buttons: null, dryRun });
      await sendText(to, body, dryRun);
    },
    buttons: async (body: string, buttons: { id: string; title: string }[]) => {
      await ctx.runMutation(internal.outbox.log, { to, body, buttons, dryRun });
      await sendButtons(to, body, buttons, dryRun);
    },
    document: async (link: string, filename: string, caption: string) => {
      await ctx.runMutation(internal.outbox.log, { to, body: caption, buttons: null, media: { type: "document", link, filename }, dryRun });
      await sendDocument(to, link, filename, caption, dryRun);
    },
    image: async (link: string, caption: string) => {
      await ctx.runMutation(internal.outbox.log, { to, body: caption, buttons: null, media: { type: "image", link, filename: null }, dryRun });
      await sendImage(to, link, caption, dryRun);
    },
  };
}
export type Reply = ReturnType<typeof replier>;
