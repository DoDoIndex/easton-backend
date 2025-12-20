import express from 'express';
import adminRouter from './admin';
import salesRepRouter from './sales-rep';
import eventsRouter from './events';
import { auth, adminAuth, salesAuth } from '../middlewares/index';

const router = express.Router();

// Mount the route groups with authentication
router.use('/admin', auth, adminAuth, adminRouter);
router.use('/sales-rep', auth, salesAuth, salesRepRouter);
// Events route - public POST, GET endpoints for analytics
router.use('/events', eventsRouter);

export default router; 