import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as passport from 'passport';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 初始化 Passport（不需要 session）
  app.use(passport.initialize());

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Twitter login: http://localhost:${port}/auth/twitter`);
}

bootstrap();
