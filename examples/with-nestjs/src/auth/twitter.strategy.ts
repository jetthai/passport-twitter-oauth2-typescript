import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  Profile,
  StrategyOptionsWithRequest,
} from '@jetthai/passport-twitter-oauth2';
import { Request } from 'express';
import TwitterPKCEStoreService from './twitter-pkce-store.service';

/**
 * Twitter OAuth 2.0 Strategy with proper PKCE support
 *
 * 使用自定義的 PKCEStore 將 code_verifier 存入 Redis
 * 這樣就不需要 express-session
 */
@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy, 'twitter') {
  constructor(
    private readonly configService: ConfigService,
    private readonly pkceStore: TwitterPKCEStoreService,
  ) {
    const options: StrategyOptionsWithRequest = {
      clientID: configService.get<string>('TWITTER_CLIENT_ID') as string,
      clientSecret: configService.get<string>('TWITTER_CLIENT_SECRET') as string,
      clientType: 'confidential',
      callbackURL: configService.get<string>('TWITTER_CALLBACK_URL'),
      passReqToCallback: true,
      // 傳入自定義的 PKCE store，啟用真正的 PKCE
      // 如果不傳入 store，library 會使用 fake PKCE bypass
      store: pkceStore,
    };

    super(options);
  }

  /**
   * Passport validate callback
   * 在 Twitter callback 成功並取得 profile 後被呼叫
   */
  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    // 取得 state，可用於查詢 Redis 中的 payload
    const state = req.query.state as string;

    // 在這裡你可以：
    // 1. 從 Redis 取得之前存入的 payload（例如 redirectUrl, userId 等）
    // 2. 執行用戶驗證邏輯（查詢或建立用戶）
    // 3. 回傳用戶物件，會被放入 req.user

    return {
      accessToken,
      refreshToken,
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        photos: profile.photos,
      },
      state,
    };
  }
}
