import { Injectable } from '@nestjs/common';
import { PKCEStore } from '@jetthai/passport-twitter-oauth2';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

/**
 * 符合用戶服務架構的 Twitter PKCE Store
 *
 * 整合現有的 Redis 儲存模式：
 * - 使用與 Google OAuth 相同的 state 生成邏輯
 * - 將 code_verifier 加入到現有的 Redis payload 中
 * - 支援 CommonUtils.getChallengeCode(state) 格式的 key
 */
@Injectable()
class TwitterPKCEStoreService implements PKCEStore {
  // TTL 設定為 10 分鐘（與一般 OAuth 流程超時一致）
  private readonly TTL_SECONDS = 600;

  // Redis key 前綴，可根據需求調整
  private readonly KEY_PREFIX = 'oauth:twitter:pkce:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * 儲存 PKCE code_verifier
   *
   * 此方法在用戶被重定向到 Twitter 授權頁面前被呼叫。
   * code_verifier 會被儲存到 Redis，之後在 callback 時取回。
   *
   * @param req - Express request
   * @param verifier - PKCE code_verifier（passport-oauth2 自動生成的隨機字串）
   * @param state - 從 authenticate({ state }) 傳入的 state
   * @param meta - 元資料（通常為空）
   * @param callback - 回呼函數，回傳 handle（即 state）
   */
  store(
    req: Request,
    verifier: string,
    state: string | null,
    meta: object,
    callback: (err: Error | null, handle?: string) => void,
  ): void {
    // 優先使用從 authenticate() 傳入的 state
    // passport-oauth2 會將 state 放在 req.query.state 或透過參數傳入
    const customState = state || (req.query?.state as string);

    if (!customState) {
      return callback(new Error('State is required for PKCE storage'));
    }

    // 使用與用戶現有模式相容的 Redis key
    // 如果用戶使用 CommonUtils.getChallengeCode(state)，可以在這裡調整
    const redisKey = this.getRedisKey(customState);

    // Properly handle the async operation's Promise to catch any unhandled rejections
    this.storeToRedis(redisKey, verifier, customState, callback).catch((err) => {
      // If there's an unhandled error in the async operation, ensure callback is called
      callback(err instanceof Error ? err : new Error(String(err)));
    });
  }

  /**
   * 驗證並取回 PKCE code_verifier
   *
   * 此方法在 Twitter callback 回來時被呼叫。
   * 從 Redis 取回先前儲存的 code_verifier，用於 token 交換。
   *
   * @param req - Express request（包含 callback 的 query params）
   * @param providedState - Twitter 回傳的 state 參數
   * @param callback - 回呼函數，回傳 code_verifier
   */
  verify(
    req: Request,
    providedState: string,
    callback: (err: Error | null, ok?: string | false, state?: string) => void,
  ): void {
    const redisKey = this.getRedisKey(providedState);

    // Properly handle the async operation's Promise to catch any unhandled rejections
    this.retrieveFromRedis(redisKey, providedState, callback).catch((err) => {
      // If there's an unhandled error in the async operation, ensure callback is called
      callback(err instanceof Error ? err : new Error(String(err)));
    });
  }

  /**
   * 生成 Redis key
   * 可以覆寫此方法以配合現有的 key 格式
   * 例如：CommonUtils.getChallengeCode(state)
   */
  protected getRedisKey(state: string): string {
    return `${this.KEY_PREFIX}${state}`;
  }

  private async storeToRedis(
    redisKey: string,
    verifier: string,
    state: string,
    callback: (err: Error | null, handle?: string) => void,
  ): Promise<void> {
    let callbackCalled = false;
    try {
      // 檢查是否已有現有資料（可能是用戶先前存入的 payload）
      const existingData = await this.redisService.get(redisKey);
      const payload = existingData ? JSON.parse(existingData) : {};

      // 將 code_verifier 加入 payload
      payload.code_verifier = verifier;

      await this.redisService.set(redisKey, JSON.stringify(payload), this.TTL_SECONDS);
      callbackCalled = true;
      callback(null, state);
    } catch (err) {
      if (!callbackCalled) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private async retrieveFromRedis(
    redisKey: string,
    state: string,
    callback: (err: Error | null, ok?: string | false, state?: string) => void,
  ): Promise<void> {
    let callbackCalled = false;
    try {
      const data = await this.redisService.get(redisKey);

      if (!data) {
        callbackCalled = true;
        return callback(null, false);
      }

      const payload = JSON.parse(data);
      const codeVerifier = payload.code_verifier;

      if (!codeVerifier) {
        callbackCalled = true;
        return callback(null, false);
      }

      // 注意：這裡不刪除 Redis 資料，因為用戶可能還需要其他 payload 資料
      // 如果需要自動清理，可以取消下面這行的註解
      // await this.redisService.del(redisKey);

      callbackCalled = true;
      callback(null, codeVerifier, state);
    } catch (err) {
      if (!callbackCalled) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

export default TwitterPKCEStoreService
