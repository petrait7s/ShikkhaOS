import type { Conversation } from "@shikkhaos/types";

export const convTitle = (c: Pick<Conversation, "type" | "peer" | "title">): string => (c.type === "DIRECT" ? c.peer?.displayName ?? "Message" : c.title ?? "Channel");

/** Student may post only in direct messages and in class groups where the teacher enabled posting; channels are read-only. */
export const canPost = (c: Pick<Conversation, "type" | "studentsCanPost">): boolean => c.type === "DIRECT" || (c.type === "CLASS_GROUP" && c.studentsCanPost);
