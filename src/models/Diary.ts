import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const DIARY_CONTENT_MAX = 5000;
export const DIARY_TITLE_MAX = 100;

const aiResponseSchema = new Schema(
  {
    content: { type: String, required: true },
    identifiedEmotions: { type: [String], default: [] },
    needsSummary: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const diarySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // title、content 與 aiResponse 的文字欄位皆為密文（lib/fieldCrypto），
    // 長度會膨脹，因此不設 maxlength，上限改由 API 層以明文驗證
    title: { type: String },
    content: { type: String, required: true },
    emotions: { type: [String], default: [] },
    // 觸發高風險通報時不呼叫 LLM，因此 aiResponse 不存在
    aiResponse: { type: aiResponseSchema, required: false },
    isFlaggedRisk: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// 以 userId 為前綴的複合索引：同時滿足「依使用者查詢」與「依時間倒序列出」，
// 不另建單獨的 userId 索引，避免重複索引拖慢寫入。
diarySchema.index({ userId: 1, createdAt: -1 });

export type IDiary = InferSchemaType<typeof diarySchema>;

export const Diary: Model<IDiary> =
  (mongoose.models.Diary as Model<IDiary> | undefined) ||
  mongoose.model<IDiary>("Diary", diarySchema);
