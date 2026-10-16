import "server-only";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Diary, type IDiary } from "@/models/Diary";
import { CURRENT_DISCLAIMER_VERSION } from "@/lib/disclaimer";
import type { Theme } from "@/lib/theme";
import { Session } from "@/models/Session";
import { User, type IUser } from "@/models/User";

// ---- 回傳給前端的純資料型別（ObjectId / Date 皆轉為字串） ----

export type UserDTO = {
  id: string;
  email: string;
  displayName?: string;
  theme: Theme;
  isDisclaimerAccepted: boolean;
  disclaimerVersion?: number;
};

export type DiaryDTO = {
  id: string;
  title?: string;
  content: string;
  emotions: string[];
  aiResponse?: {
    content: string;
    identifiedEmotions: string[];
    needsSummary: string;
    createdAt: string;
  };
  isFlaggedRisk: boolean;
  createdAt: string;
  updatedAt: string;
};

type LeanUser = IUser & { _id: Types.ObjectId };
type LeanDiary = IDiary & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

function toUserDTO(u: LeanUser): UserDTO {
  return {
    id: u._id.toString(),
    email: u.email,
    displayName: u.displayName ?? undefined,
    theme: (u.preferences?.theme as Theme | undefined) ?? "light",
    isDisclaimerAccepted: u.isDisclaimerAccepted ?? false,
    disclaimerVersion: u.disclaimerVersion ?? undefined,
  };
}

export function toDiaryDTO(d: LeanDiary): DiaryDTO {
  return {
    id: d._id.toString(),
    title: d.title ?? undefined,
    content: d.content,
    emotions: d.emotions ?? [],
    aiResponse: d.aiResponse
      ? {
          content: d.aiResponse.content,
          identifiedEmotions: d.aiResponse.identifiedEmotions ?? [],
          needsSummary: d.aiResponse.needsSummary ?? "",
          createdAt: new Date(d.aiResponse.createdAt ?? d.createdAt).toISOString(),
        }
      : undefined,
    isFlaggedRisk: d.isFlaggedRisk ?? false,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// ---- 使用者與登入狀態 ----

export class EmailTakenError extends Error {
  constructor() {
    super("此信箱已經註冊");
    this.name = "EmailTakenError";
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  acceptDisclaimer: boolean;
}): Promise<UserDTO> {
  await connectDB();
  try {
    const user = await User.create({
      email: input.email,
      passwordHash: input.passwordHash,
      ...(input.acceptDisclaimer && {
        isDisclaimerAccepted: true,
        disclaimerAcceptedAt: new Date(),
        disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
      }),
    });
    return toUserDTO(user.toObject() as LeanUser);
  } catch (error) {
    // E11000：唯一索引衝突（兩個請求同時註冊同一信箱也會落在這裡）
    if ((error as { code?: number })?.code === 11000) throw new EmailTakenError();
    throw error;
  }
}

/** 登入用：唯一會讀出 passwordHash 的查詢 */
export async function findUserForLogin(
  email: string,
): Promise<{ user: UserDTO; passwordHash: string } | null> {
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase() })
    .select("+passwordHash")
    .lean<LeanUser>()
    .exec();
  return user ? { user: toUserDTO(user), passwordHash: user.passwordHash } : null;
}

export async function createSession(userId: string, token: string, expiresAt: Date): Promise<void> {
  await connectDB();
  await Session.create({
    tokenHash: hashSessionToken(token),
    userId: new Types.ObjectId(userId),
    expiresAt,
  });
}

export async function findUserBySessionToken(token: string): Promise<UserDTO | null> {
  await connectDB();
  // TTL 索引的清除約有一分鐘延遲，因此仍需自行比對 expiresAt
  const session = await Session.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  })
    .lean()
    .exec();
  if (!session) return null;
  const user = await User.findById(session.userId).lean<LeanUser>().exec();
  return user ? toUserDTO(user) : null;
}

export async function deleteSession(token: string): Promise<void> {
  await connectDB();
  await Session.deleteOne({ tokenHash: hashSessionToken(token) }).exec();
}

/** 已同意的是目前版本的宣告，才允許送出日記 */
export function hasAcceptedCurrentDisclaimer(user: UserDTO): boolean {
  return user.isDisclaimerAccepted && user.disclaimerVersion === CURRENT_DISCLAIMER_VERSION;
}

export async function acceptDisclaimer(userId: string): Promise<UserDTO | null> {
  await connectDB();
  const user = await User.findByIdAndUpdate(
    userId,
    {
      isDisclaimerAccepted: true,
      disclaimerAcceptedAt: new Date(),
      disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
    },
    { returnDocument: "after" },
  )
    .lean<LeanUser>()
    .exec();
  return user ? toUserDTO(user) : null;
}

export async function updateTheme(userId: string, theme: Theme): Promise<UserDTO | null> {
  await connectDB();
  const user = await User.findByIdAndUpdate(
    userId,
    { "preferences.theme": theme },
    { returnDocument: "after", runValidators: true },
  )
    .lean<LeanUser>()
    .exec();
  return user ? toUserDTO(user) : null;
}

// ---- 日記（唯讀查詢一律使用 .lean()） ----

export async function listDiaries(
  userId: string,
  { limit = 20, before }: { limit?: number; before?: Date } = {},
): Promise<DiaryDTO[]> {
  await connectDB();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (before) filter.createdAt = { $lt: before };

  const diaries = await Diary.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50))
    .lean<LeanDiary[]>()
    .exec();
  return diaries.map(toDiaryDTO);
}

export async function createDiary(
  userId: string,
  input: {
    title?: string;
    content: string;
    emotions: string[];
    aiResponse?: { content: string; identifiedEmotions: string[]; needsSummary: string };
    isFlaggedRisk: boolean;
  },
): Promise<DiaryDTO> {
  await connectDB();
  const diary = await Diary.create({ userId: new Types.ObjectId(userId), ...input });
  return toDiaryDTO(diary.toObject() as LeanDiary);
}

export async function getDiary(userId: string, diaryId: string): Promise<DiaryDTO | null> {
  if (!Types.ObjectId.isValid(diaryId)) return null;
  await connectDB();
  // 同時比對 userId，確保使用者只能讀到自己的日記
  const diary = await Diary.findOne({
    _id: new Types.ObjectId(diaryId),
    userId: new Types.ObjectId(userId),
  })
    .lean<LeanDiary>()
    .exec();
  return diary ? toDiaryDTO(diary) : null;
}

/** 只會刪除屬於該使用者的日記；回傳 false 代表不存在或不屬於此使用者 */
export async function deleteDiary(userId: string, diaryId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(diaryId)) return false;
  await connectDB();
  const { deletedCount } = await Diary.deleteOne({
    _id: new Types.ObjectId(diaryId),
    userId: new Types.ObjectId(userId),
  }).exec();
  return deletedCount === 1;
}
