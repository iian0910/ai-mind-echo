import "server-only";
import mongoose, { type Mongoose } from "mongoose";
import { getEnv } from "@/lib/env";

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

// 掛在 globalThis 上：開發模式熱重載會重新執行模組，但 globalThis 會保留，
// Serverless 環境下同一個暖啟動實例也能重複使用既有連線池。
const globalForMongoose = globalThis as typeof globalThis & {
  __mongoose?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.__mongoose ??= {
  conn: null,
  promise: null,
});

export async function connectDB(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const { MONGODB_URI } = getEnv();
    cache.promise = mongoose.connect(MONGODB_URI, {
      // 連線未就緒時直接報錯，而不是無聲地把查詢排隊等到逾時
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    // 失敗時清掉 promise，下一次請求才能重試，而不是永遠拿到同一個 rejected promise
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}
