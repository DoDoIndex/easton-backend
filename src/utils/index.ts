import { Response } from 'express';

export const unauthorized = (res: Response, message: string = 'Unauthorized') => {
  res.status(401).json({ error: message });
};

export const forbidden = (res: Response, message: string = 'Forbidden') => {
  res.status(403).json({ error: message });
}; 