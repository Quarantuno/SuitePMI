import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@suite/shared';
import { CurrentUser, Public, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) body: LoginInput) {
    return this.auth.login(body);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return this.auth.me(user);
  }
}
