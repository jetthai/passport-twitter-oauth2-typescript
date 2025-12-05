import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';
import * as crypto from 'crypto';

@Controller('auth')
export class AuthController {
  constructor(private readonly redisService: RedisService) {}

  @Get('twitter')
  async twitterLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Query('redirect') redirect?: string,
  ) {
    // 生成自定義 state
    const state = crypto.randomUUID();
    const redisKey = `pkce:${state}`;

    // 預先存入你需要的 payload 到 Redis
    const payload = {
      redirect: redirect || '/',
      timestamp: Date.now(),
      // 可以加入其他需要的資料
    };

    await this.redisService.set(redisKey, JSON.stringify(payload), 300);

    console.log('[AuthController.twitterLogin] state:', state);
    console.log('[AuthController.twitterLogin] payload:', payload);

    // 使用 passport.authenticate 並傳入自定義 state
    const passport = require('passport');
    passport.authenticate('twitter', {
      state,
      scope: ['tweet.read', 'users.read'],
    })(req, res);
  }

  @Get('twitter/callback')
  @UseGuards(AuthGuard('twitter'))
  async twitterCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const state = req.query.state as string;

    console.log('[AuthController.twitterCallback] user:', user);
    console.log('[AuthController.twitterCallback] state:', state);

    // 從 Redis 取得之前存的 payload
    const redisKey = `pkce:${state}`;
    const data = await this.redisService.get(redisKey);

    if (data) {
      const payload = JSON.parse(data);
      console.log('[AuthController.twitterCallback] payload:', payload);

      // 清理 Redis
      await this.redisService.del(redisKey);

      // 可以根據 payload.redirect 重定向
      return res.redirect(payload.redirect || '/');
    }

    return res.json({
      message: 'Twitter login successful',
      user: user.profile,
    });
  }
}
