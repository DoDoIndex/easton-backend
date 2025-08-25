import express from 'express';
import mysqlPool from '../../services/_mysqlService';

interface AuthenticatedRequest extends express.Request {
  userRecord?: any;
}

const salesRepRouter = express.Router();

// GET /sales-rep/info - Get sales rep info
salesRepRouter.get('/info', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Query the sales_rep table to get the name
    const [rows] = await mysqlPool.query(
      "SELECT name FROM sales_rep WHERE uid = ? AND is_active = 1",
      [uid]
    ) as [any[], any];

    if (rows.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    const salesRepInfo = rows[0];
    res.status(200).json({ 
      message: 'Sales rep info retrieved successfully',
      data: {
        name: salesRepInfo.name,
        uid: uid
      }
    });
  } catch (error) {
    console.error('Error fetching sales rep info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sales-rep/leads - Get all leads
salesRepRouter.get('/leads', (req, res) => {
  // TODO: Implement sales rep leads retrieval logic
  res.status(200).send({ message: 'Sales Rep: Get all leads' });
});

// POST /sales-rep/leads - Create new lead
salesRepRouter.post('/leads', (req, res) => {
  // TODO: Implement sales rep lead creation logic
  res.status(201).send({ message: 'Sales Rep: Create new lead', data: req.body });
});

// GET /sales-rep/leads/:lead-id/touch-points - Get touch points for specific lead
salesRepRouter.get('/leads/:leadId/touch-points', (req, res) => {
  const { leadId } = req.params;
  // TODO: Implement sales rep touch points retrieval logic
  res.status(200).send({ message: `Sales Rep: Get touch points for lead ${leadId}` });
});

// POST /sales-rep/leads/:lead-id/touch-points - Create touch point for specific lead
salesRepRouter.post('/leads/:leadId/touch-points', (req, res) => {
  const { leadId } = req.params;
  // TODO: Implement sales rep touch point creation logic
  res.status(201).send({ 
    message: `Sales Rep: Create touch point for lead ${leadId}`, 
    data: req.body 
  });
});

export default salesRepRouter; 