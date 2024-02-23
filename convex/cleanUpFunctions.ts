import { v } from "convex/values";
import {
  action,
  internalQuery,
  mutation,
  internalMutation,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";

//cleanup to add word count to finalized sentences
export const addWordCountToFinalizedSentences = action({
  args: {},
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Fetch all sentences without embeddings
    const sentencesWithoutEmbeddings = await ctx.runQuery(
      api.cleanUpFunctions.getSentencesWithoutWordCount, // Ensure this is correctly defined in your API module
      {}
    );

    // Iterate over each sentence and call generateAndSaveEmbedding
    for (const sentence of sentencesWithoutEmbeddings) {
      // Count the words in the transcript
      const wordCount = sentence.transcript.split(/\s+/).filter(Boolean).length;

      // Update the sentence with the word count
      await ctx.runMutation(
        api.cleanUpFunctions.updateSentenceWithWordCount, // Ensure this is correctly defined in your API module
        {
          sentenceId: sentence._id,
          wordCount: wordCount,
        }
      );
    }
  },
});

export const getSentencesWithoutWordCount = query({
  args: {},
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to create send a message");
    }

    return await ctx.db
      .query("finalizedSentences")
      .filter((q) => q.eq(q.field("wordCount"), undefined))
      .collect();
  },
});

export const updateSentenceWithWordCount = mutation({
  args: {
    sentenceId: v.string(),
    wordCount: v.number(),
  },
  handler: async (ctx, args) => {
    //@ts-ignore
    await ctx.db.patch(args.sentenceId, {
      wordCount: args.wordCount,
    });
  },
});

//cleanup to add userid to sentenceEmbeddings

interface FinalizedSentence {
  _id: string;
  userId?: string;
  meetingID: string;
  transcript: string;
  wordCount?: number;
  // Add other fields as necessary
}

interface SentenceEmbedding {
  _id: string;
  meetingID: string;
  finalizedSentenceId: string;
  userId?: string;
  embedding: number[];
  // Add other fields as necessary
}

export const addUserIdToSentenceEmbeddings = action({
  args: {},
  handler: async (ctx, args) => {
    // Fetch all sentence embeddings that are missing a userId
    const sentenceEmbeddingsWithoutUserId: SentenceEmbedding[] =
      await ctx.runQuery(
        internal.cleanUpFunctions.getSentenceEmbeddingsWithoutUserId,
        {}
      );

    // Fetch all finalized sentences
    const finalizedSentences = await ctx.runQuery(
      api.cleanUpFunctions.getUserIdFromFinalizedSentence,
      { sentenceEmbeddingId: "kn7bzf9wn4jqbcsek9f9tam0z16m12rv" }
    );

    // console.log("finalizedSentences", finalizedSentences);

    // Create a map from embeddingId to userId
    const embeddingIdToUserId: Record<string, string> = {};
    finalizedSentences.forEach((sentence) => {
      if (sentence.sentenceEmbeddingId && sentence.userId) {
        embeddingIdToUserId[sentence.sentenceEmbeddingId] = sentence.userId;
      }
    });

    // Iterate over each sentence embedding and patch it with the userId
    for (const embedding of sentenceEmbeddingsWithoutUserId) {
      const userId = embeddingIdToUserId[embedding._id];
      if (userId) {
        await ctx.runMutation(
          internal.cleanUpFunctions.updateSentenceEmbeddingsWithUserId,
          { sentenceEmbeddingsId: embedding._id, userId: userId }
        );
      }
    }
  },
});

export const getSentenceEmbeddingsWithoutUserId = internalQuery({
  args: {},
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if (!user) {
      throw new Error("Please login to create send a message");
    }

    return await ctx.db
      .query("sentenceEmbeddings")
      .filter((q) => q.eq(q.field("userId"), undefined))
      .collect();
  },
});

export const getUserIdFromFinalizedSentence = query({
  args: { sentenceEmbeddingId: v.string() },
  handler: async (ctx, args) => {
    console.log("args.sentenceEmbeddingId", args.sentenceEmbeddingId);

    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new Error("Please login to create send a message");
    }

    const sentence = await ctx.db.query("finalizedSentences").collect();
    return sentence;
  },
});

export const updateSentenceEmbeddingsWithUserId = internalMutation({
  args: {
    sentenceEmbeddingsId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    //@ts-ignore
    await ctx.db.patch(args.sentenceEmbeddingsId, {
      userId: args.userId,
    });
  },
});
