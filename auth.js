require('dotenv').config();

const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme';

function authMiddleware(req, res, next) {
  // Allow login endpoint
  if (req.path === '/login') return next();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === AUTH_PASSWORD) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { authMiddleware };
