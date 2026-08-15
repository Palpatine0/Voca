import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

export interface SessionPayload {
  uid: string;
  slot: 'A' | 'B';
  device_id?: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: `${TTL_DAYS}d` });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, SECRET) as SessionPayload;
}
