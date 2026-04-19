import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcryptjs';
import { JwtPayload } from './types';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from 'src/common/audit/audit.service';

export type LoginAuditMeta = {
  correlationId: string;
  ip?: string;
  userAgent?: string;
};

function clientIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') {
    return xf.split(',')[0]?.trim();
  }
  if (Array.isArray(xf)) {
    return xf[0]?.split(',')[0]?.trim();
  }
  return req.socket?.remoteAddress;
}

export function loginAuditMetaFromRequest(req: Request): LoginAuditMeta {
  return {
    correlationId: req.correlationId ?? 'unknown',
    ip: clientIp(req),
    userAgent:
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async login(
    dto: LoginDto,
    meta: LoginAuditMeta,
  ): Promise<{ accessToken: string }> {
    const user = await this.usersService.findByEmailSelectPassword(dto.email);

    if (!user?.passwordHash) {
      this.auditService.emit({
        action: 'auth.login_failed',
        targetType: 'user',
        outcome: 'failure',
        correlationId: meta.correlationId,
        reason: 'user_not_found_or_no_password',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPassMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPassMatch) {
      this.auditService.emit({
        action: 'auth.login_failed',
        targetType: 'user',
        targetId: user.id,
        outcome: 'failure',
        correlationId: meta.correlationId,
        reason: 'invalid_password',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles ?? [],
    };
    const accessToken = await this.jwtService.signAsync(payload);

    this.auditService.emit({
      action: 'auth.login_success',
      actorId: user.id,
      actorRoles: user.roles ?? [],
      targetType: 'user',
      targetId: user.id,
      outcome: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { accessToken };
  }

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const user = await this.usersService.create(dto);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles ?? [],
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken };
  }
}
