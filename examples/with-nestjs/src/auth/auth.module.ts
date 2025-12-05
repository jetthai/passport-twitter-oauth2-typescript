import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { TwitterStrategy } from './twitter.strategy';
import { TwitterPKCEStoreService } from './twitter-pkce-store.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'twitter' }),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [TwitterStrategy, TwitterPKCEStoreService],
  exports: [TwitterStrategy, TwitterPKCEStoreService],
})
export class AuthModule {}
