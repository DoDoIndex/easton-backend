import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/index.js';

interface AuthenticatedRequest extends Request {
  userRole?: string[];
}

const salesAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.userRole?.includes('sales_rep')) {
    next();
  } else {
    forbidden(res, 'Insufficient Permission. Please contact Admin.');
  }
};

export default salesAuth; 