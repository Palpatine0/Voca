import { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  req.userId = user.id;
  next();
}
