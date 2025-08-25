import express from 'express';

const adminRouter = express.Router();

// GET /admin/leads - Get all leads
adminRouter.get('/leads', (req, res) => {
  // TODO: Implement admin leads retrieval logic
  res.status(200).send({ message: 'Admin: Get all leads' });
});

// POST /admin/leads - Create new lead
adminRouter.post('/leads', (req, res) => {
  // TODO: Implement admin lead creation logic
  res.status(201).send({ message: 'Admin: Create new lead', data: req.body });
});

// GET /admin/leads/:lead-id/touch-points - Get touch points for specific lead
adminRouter.get('/leads/:leadId/touch-points', (req, res) => {
  const { leadId } = req.params;
  // TODO: Implement admin touch points retrieval logic
  res.status(200).send({ message: `Admin: Get touch points for lead ${leadId}` });
});

// POST /admin/leads/:leadId/assign - Assign lead to sales rep
adminRouter.post('/leads/:leadId/assign', (req, res) => {
  const { leadId } = req.params;
  const { salesRepId } = req.body;
  
  res.status(201).json({
    message: 'Lead assignment request received',
    data: {
      leadId,
      salesRepId
    }
  });
});

// POST /admin/leads/:leadId/status - Change lead status
adminRouter.post('/leads/:leadId/status', (req, res) => {
  const { leadId } = req.params;
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['active', 'close', 'need-reminder', 'dead'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status. Must be one of: active, close, need-reminder, dead'
    });
  }
  
  return res.status(201).json({
    message: 'Lead status change request received',
    data: {
      leadId,
      status
    }
  });
});

export default adminRouter; 