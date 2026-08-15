import { NextFunction, Request, Response } from 'express';
import { SessionPayload, verifySession } from '../lib/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    req.session = verifySession(token);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
