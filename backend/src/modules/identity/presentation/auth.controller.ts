import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentAuth, NoTenant, Public } from '../../../shared/auth/auth.decorators';
import type { AuthContext } from '../../../shared/auth/auth.types';
import { AuthService } from '../application/auth.service';
import { ChangePasswordDto, LoginDto, SignupDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req.ip ?? '');
  }

  @NoTenant()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentAuth() auth: AuthContext) {
    await this.auth.logout(auth.sessionId);
  }

  @NoTenant()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth.userId);
  }

  @NoTenant()
  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentAuth() auth: AuthContext, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(auth.userId, auth.sessionId, dto.currentPassword, dto.newPassword);
  }
}
