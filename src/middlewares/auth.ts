import { Request, Response, NextFunction } from 'express';
import firebaseAdmin from '../services/_fiebaseService';
import mysqlPool from '../services/_mysqlService';
import { unauthorized } from '../utils/index';

interface AuthenticatedRequest extends Request {
  userRecord?: any;
  userRole?: string[];
}

const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // console.log(req.headers);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    unauthorized(res, 'No authorization header found.');
    return;
  }

  // Extract token from "Bearer <token>" format
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  if (!token) {
    unauthorized(res, 'No token found in authorization header.');
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

    let data: any[];
    try {
      const salesRepResult = await mysqlPool.query("SELECT * FROM sales_rep WHERE uid = ? AND is_active = 1", [uid]);
      const adminResult = await mysqlPool.query("SELECT * FROM admin WHERE uid = ? AND is_active = 1", [uid]);
      data = [salesRepResult, adminResult];
    } catch (dbError) {
      throw dbError;
    }

    const [agentRows] = data[0] as [any[], any];
    const [adminRows] = data[1] as [any[], any];

    const roles: string[] = [];
    if (Array.isArray(agentRows) && agentRows.length > 0) {
      roles.push('sales_rep');
    }
    if (Array.isArray(adminRows) && adminRows.length > 0) {
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