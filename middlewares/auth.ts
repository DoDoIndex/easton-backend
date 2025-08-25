import { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../services/_fiebaseService.js';
import mysqlPool from '../services/_mysqlService.js';
import { unauthorized } from '../utils/index.js';

interface AuthenticatedRequest extends Request {
  userRecord?: any;
  userRole?: string[];
}

const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization;
  if (!token) {
    unauthorized(res, 'No token found.');
    return;
  }

  let uid: string | null = null;

  // Verify token
  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    uid = decodedToken?.uid;
  } catch (error) {
    unauthorized(res, `Unable to verify token ${token}`);
    return;
  }

  // Check if uid is null
  if (!uid) {
    unauthorized(res, `Unable to get uid from token ${token}`);
    return;
  }

  // Get userRecord from uid
  try {
    const userRecord = await firebaseAdmin.auth().getUser(uid);
    if (!userRecord) {
      unauthorized(res);
      return;
    }
    req.userRecord = userRecord;

    const promises = [
      mysqlPool.query("SELECT * FROM sales_rep WHERE uid = ? AND is_active='1'", [uid]),
      mysqlPool.query("SELECT * FROM admin WHERE uid = ? AND is_active='1'", [uid]),
    ];

    const data = await Promise.all(promises);

    const [agentRows] = data[0];
    const [adminRows] = data[1];

    const roles: string[] = [];
    if (agentRows?.length) {
      roles.push('sales_rep');
    }
    if (adminRows?.length) {
      roles.push('admin');
    }

    req.userRole = roles;
    next();
  } catch (error) {
    unauthorized(res, `Unable to get user ${uid}`);
    return;
  }
};

export default authMiddleware; 