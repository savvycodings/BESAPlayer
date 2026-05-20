import { Request, Response, NextFunction } from 'express'

export function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_SECRET?.trim()
  const provided = (req.headers['x-admin-secret'] as string) || (req.query.adminSecret as string)
  if (!expected) {
    res.status(503).json({
      error: 'ADMIN_SECRET is not set in server/.env. Add it and restart the server.',
    })
    return
  }
  if (provided !== expected) {
    res.status(403).json({
      error: 'Forbidden — X-Admin-Secret must match ADMIN_SECRET in server/.env',
    })
    return
  }
  next()
}
