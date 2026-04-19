import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LoginDto, RegisterDto, RegisterResponseDto } from './dto/auth.dto';
import { AuthService, loginAuditMetaFromRequest } from './auth.service';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUser } from './types';
import { MeResponseDto } from './dto/me-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  async register(@Body() body: RegisterDto): Promise<{ accessToken: string }> {
    return this.authService.register(body);
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
  ): Promise<{ accessToken: string }> {
    return this.authService.login(body, loginAuditMetaFromRequest(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse()
  @Get('me')
  me(@Req() req: Request & { user?: AuthUser }): AuthUser {
    return req.user as AuthUser;
  }
}
