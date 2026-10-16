import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const SESSION_TTL_DAYS = 30;

const sessionSchema = new Schema({
  // cookie 中存隨機 token，資料庫只存其 SHA-256 雜湊，資料庫外洩也無法冒用登入狀態
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// TTL 索引：MongoDB 會在 expiresAt 之後自動清除過期的登入狀態
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ISession = InferSchemaType<typeof sessionSchema>;

export const Session: Model<ISession> =
  (mongoose.models.Session as Model<ISession> | undefined) ||
  mongoose.model<ISession>("Session", sessionSchema);
