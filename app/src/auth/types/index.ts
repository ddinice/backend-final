export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
};

export type AuthUser = {
  sub: string;
  email: string;
  roles: string[];
};
