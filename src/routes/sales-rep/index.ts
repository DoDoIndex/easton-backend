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

// GET /sales-rep/leads - Get all leads for the authenticated sales rep
salesRepRouter.get('/leads', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get the sales rep's name to filter leads
    const salesRepQuery = "SELECT name FROM sales_rep WHERE uid = ? AND is_active = 1";
    console.log('Sales rep query:', salesRepQuery);
    console.log('Sales rep query params:', [uid]);
    
    const [salesRepRows] = await mysqlPool.query(
      salesRepQuery,
      [uid]
    ) as [any[], any];

    if (salesRepRows.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    // First, let's get the basic leads to see what we're working with
    console.log('Sales rep UID:', uid);
    
    const basicLeadsQuery = "SELECT * FROM leads WHERE sales_rep = ? ORDER BY lead_id DESC";
    console.log('Basic leads query:', basicLeadsQuery);
    console.log('Basic leads query params:', [uid]);
    
    const [basicLeads] = await mysqlPool.query(
      basicLeadsQuery,
      [uid]
    ) as [any[], any];
    
    console.log('Basic leads found:', basicLeads.length);
    console.log('Sample lead:', basicLeads[0]);
    
    // Get all leads assigned to this sales rep with touch point count and last touched timestamp
    const complexQuery = `SELECT 
        l.*,
        COALESCE(tp_count.touch_point_count, 0) as touch_point_count,
        tp_last.last_touched
       FROM leads l
       LEFT JOIN (
         SELECT lead_id, COUNT(*) as touch_point_count
         FROM touch_points 
         WHERE is_active = 1 
         GROUP BY lead_id
       ) tp_count ON l.lead_id = tp_count.lead_id
       LEFT JOIN (
         SELECT lead_id, MAX(created_at) as last_touched
         FROM touch_points 
         WHERE is_active = 1 
         GROUP BY lead_id
       ) tp_last ON l.lead_id = tp_last.lead_id
       WHERE l.sales_rep = ? 
       ORDER BY l.lead_id DESC`;
    
    console.log('Complex query:', complexQuery);
    console.log('Complex query params:', [uid]);
    
    const [leads] = await mysqlPool.query(
      complexQuery,
      [uid]
    ) as [any[], any];
    
    console.log('Complex query leads found:', leads.length);
    console.log('Sample complex lead:', leads[0]);

    res.status(200).json({
      message: 'Leads retrieved successfully',
      data: leads
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sales-rep/leads/:leadId - Get specific lead by ID
salesRepRouter.get('/leads/:leadId', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { leadId } = req.params;

    console.log('Sales rep UID:', uid);
    console.log('Lead ID:', leadId);
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get the specific lead with touch point count and last touched timestamp
    const query = `SELECT * FROM leads WHERE lead_id = ? AND sales_rep = ?`;
    
    const flatQuery = query.replace('?', leadId).replace('?', uid);
    
    console.log('Query with placeholders:', query);
    console.log('Flat query:', flatQuery);
    console.log('Query params:', [leadId, uid]);
    
    const [leads] = await mysqlPool.query(
      query,
      [leadId, uid]
    ) as [any[], any];
    
    console.log('Leads found:', leads);

    if (leads.length === 0) {
      res.status(404).json({ error: 'Lead not found or access denied' });
      return;
    }

    const lead = leads[0];
    res.status(200).json({
      message: 'Lead retrieved successfully',
      data: lead
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /sales-rep/leads - Create new lead
salesRepRouter.post('/leads', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get the sales rep's name (for display purposes)
    const [salesRepRows] = await mysqlPool.query(
      "SELECT name FROM sales_rep WHERE uid = ? AND is_active = 1",
      [uid]
    ) as [any[], any];

    if (salesRepRows.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    // Validate required fields
    const { name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, finance_need } = req.body;
    
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Validate finance_need if provided
    if (finance_need && !['Yes', 'No'].includes(finance_need)) {
      res.status(400).json({ error: 'Finance need must be either "Yes" or "No"' });
      return;
    }

    // Generate a unique ID (using timestamp + random number)
    const leadId = Date.now() + Math.floor(Math.random() * 1000000);

    // Insert the new lead
    await mysqlPool.query(
      `INSERT INTO leads (lead_id, name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [leadId, name, email || null, phone || null, project_interest || null, budget || null, 
       click_source || null, website_source || null, ad_source || null, status || 'New', uid, finance_need || null]
    );

    res.status(201).json({
      message: 'Lead created successfully',
      data: {
        lead_id: leadId,
        name,
        email,
        phone,
        project_interest,
        budget,
        click_source,
        website_source,
        ad_source,
        status: status || 'New',
        finance_need
      }
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sales-rep/leads/:leadId/touch-points - Get touch points for specific lead
salesRepRouter.get('/leads/:leadId/touch-points', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { leadId } = req.params;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Check if lead exists and belongs to this sales rep
    const [leadRows] = await mysqlPool.query(
      "SELECT lead_id FROM leads WHERE lead_id = ? AND sales_rep = ?",
      [leadId, uid]
    ) as [any[], any];

    if (leadRows.length === 0) {
      res.status(404).json({ error: 'Lead not found or access denied' });
      return;
    }

    // Get touch points for this lead with sales rep names
    const [touchPoints] = await mysqlPool.query(
      `SELECT 
        tp.*,
        sr.name as contact_name
       FROM touch_points tp
       LEFT JOIN sales_rep sr ON tp.uid = sr.uid AND sr.is_active = 1
       WHERE tp.lead_id = ? AND tp.is_active = 1 
       ORDER BY tp.created_at DESC`,
      [leadId]
    ) as [any[], any];

    res.status(200).json({
      message: 'Touch points retrieved successfully',
      data: touchPoints
    });
  } catch (error) {
    console.error('Error fetching touch points:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /sales-rep/leads/:leadId/touch-points - Create touch point for specific lead
salesRepRouter.post('/leads/:leadId/touch-points', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { leadId } = req.params;
    const { contact_method, description, status, follow_up_date } = req.body;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Validate required fields
    if (!contact_method || !description) {
      res.status(400).json({ error: 'Contact method and description are required' });
      return;
    }

    // Validate contact_method enum values
    const validContactMethods = ['Phone Call', 'Email', 'Text Message'];
    if (!validContactMethods.includes(contact_method)) {
      res.status(400).json({ error: 'Contact method must be one of: Phone Call, Email, Text Message' });
      return;
    }

    // Check if lead exists and belongs to this sales rep
    const [leadRows] = await mysqlPool.query(
      "SELECT lead_id FROM leads WHERE lead_id = ? AND sales_rep = ?",
      [leadId, uid]
    ) as [any[], any];

    if (leadRows.length === 0) {
      res.status(404).json({ error: 'Lead not found or access denied' });
      return;
    }

    const currentLead = leadRows[0];
    let systemNote = '';
    let statusUpdated = false;
    let finalFollowUpDate = null;

    console.log('status:', status);
    console.log('Current lead status:', currentLead.status);

    // Handle status update if provided
    if (status && status !== currentLead.status) {
      statusUpdated = true;
      
      // Update the lead status
      await mysqlPool.query(
        "UPDATE leads SET status = ? WHERE lead_id = ?",
        [status, leadId]
      );

      // Handle follow_up_date based on status
      if (status === "Follow-up") {
        let finalFollowUpDate = follow_up_date;
        
        if (!follow_up_date) {
          // Set follow-up date to 1 week from now if not provided
          const oneWeekFromNow = new Date();
          oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
          finalFollowUpDate = oneWeekFromNow.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
        
        await mysqlPool.query(
          "UPDATE leads SET follow_up_date = ? WHERE lead_id = ?",
          [finalFollowUpDate, leadId]
        );
        systemNote = `Follow-up on ${finalFollowUpDate}.`;
      } else {
        // Clear follow_up_date for non-follow-up statuses
        await mysqlPool.query(
          "UPDATE leads SET follow_up_date = NULL WHERE lead_id = ?",
          [leadId]
        );
        systemNote = `Change status to ${status}.`;
      }
    }

    // Generate a unique touch_id using UUID
    const touchId = `tp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Insert the new touch point
    await mysqlPool.query(
      `INSERT INTO touch_points (touch_id, uid, lead_id, contact_method, description, system_note) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [touchId, uid, leadId, contact_method, description, systemNote]
    );

    res.status(201).json({
      message: 'Touch point created successfully',
      data: {
        touch_id: touchId,
        uid,
        lead_id: leadId,
        contact_method,
        description: systemNote,
        status_updated: statusUpdated,
        new_status: status || currentLead.status,
        follow_up_date: finalFollowUpDate
      }
    });
  } catch (error) {
    console.error('Error creating touch point:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default salesRepRouter; 