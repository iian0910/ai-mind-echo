import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
// 主題清單與宣告版本號定義在 lib/theme、lib/disclaimer，前端也會引用
import { THEMES } from "@/lib/theme";

const userSchema = new Schema(
  {
    // 登入帳號：一律以小寫儲存，唯一索引見下方
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    // scrypt 雜湊（含 salt 與參數），格式見 lib/password
    passwordHash: { type: String, required: true, select: false },

    displayName: { type: String, trim: true, maxlength: 40 },

    preferences: {
      theme: { type: String, enum: THEMES, default: "light" },
    },

    // 非醫療服務宣告同意狀態
    isDisclaimerAccepted: { type: Boolean, default: false },
    disclaimerAcceptedAt: { type: Date },
    disclaimerVersion: { type: Number },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export type IUser = InferSchemaType<typeof userSchema>;

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser> | undefined) ||
  mongoose.model<IUser>("User", userSchema);
