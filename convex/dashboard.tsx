import { query } from "./_generated/server";

export const totalMeetings = query({
  args: {},
  handler: async (ctx, args) => {
    const meetings = await ctx.db.query("meetings").collect();
    return meetings.length;
  },
});

export const totalFinalizedSentences = query({
  handler: async (ctx) => {
    const finalizedSentences = await ctx.db
      .query("finalizedSentences")
      .collect();
    return finalizedSentences.length;
  },
});

export const totalMessages = query({
  handler: async (ctx) => {
    const messages = await ctx.db.query("messages").collect();
    return messages.length;
  },
});

export const totalSpeakers = query({
  handler: async (ctx) => {
    const speakers = await ctx.db.query("speakers").collect();
    return speakers.length;
  },
});

export const totalMeetingSummaries = query({
  handler: async (ctx) => {
    const meetingSummaries = await ctx.db.query("meetingSummaries").collect();
    return meetingSummaries.length;
  },
});

export const totalQuestions = query({
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    return questions.length;
  },
});

export const totalSentenceEmbeddings = query({
  handler: async (ctx) => {
    const sentenceEmbeddings = await ctx.db
      .query("sentenceEmbeddings")
      .collect();
    return sentenceEmbeddings.length;
  },
});
