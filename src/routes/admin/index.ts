import express from 'express';
import mysqlPool from '../../services/_mysqlService';

interface AuthenticatedRequest extends express.Request {
  userRecord?: any;
  userRole?: string[];
}

const adminRouter = express.Router();

// GET /admin/leads - Get all leads with pagination and filtering
adminRouter.get('/leads', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 1000);
    const offset = (page - 1) * limit;

    // Parse filter parameters
    const status = req.query.status as string;
    const salesRep = req.query.sales_rep as string;
    const projectInterest = req.query.project_interest as string;
    const budget = req.query.budget as string;
    const financeNeed = req.query.finance_need as string;
    const channel = req.query.channel as string;
    const search = req.query.search as string;

    // Build WHERE clause for filters
    let whereConditions = [];
    let queryParams = [];

    if (status) {
      whereConditions.push('l.status = ?');
      queryParams.push(status);
    }

    if (salesRep) {
      whereConditions.push('l.sales_rep = ?');
      queryParams.push(salesRep);
    }

    if (projectInterest) {
      whereConditions.push('l.project_interest = ?');
      queryParams.push(projectInterest);
    }

    if (budget) {
      whereConditions.push('l.budget = ?');
      queryParams.push(budget);
    }

    if (financeNeed) {
      whereConditions.push('l.finance_need = ?');
      queryParams.push(financeNeed);
    }

    if (channel) {
      whereConditions.push('l.channel = ?');
      queryParams.push(channel);
    }

    if (search) {
      whereConditions.push('(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM leads l ${whereClause}`;
    const [countResult] = await mysqlPool.query(countQuery, queryParams) as [any[], any];
    const totalLeads = countResult[0].total;

    // Get leads with touch point count and last touched timestamp
    const leadsQuery = `
      SELECT 
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
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`;

    const [leads] = await mysqlPool.query(leadsQuery, [...queryParams, limit, offset]) as [any[], any];

    // Calculate pagination info
    const totalPages = Math.ceil(totalLeads / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      message: 'Leads retrieved successfully',
      data: leads,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_leads: totalLeads,
        limit: limit,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage,
        next_page: hasNextPage ? page + 1 : null,
        prev_page: hasPrevPage ? page - 1 : null
      },
      filters: {
        status,
        sales_rep: salesRep,
        project_interest: projectInterest,
        budget,
        finance_need: financeNeed,
        channel,
        search
      }
    });

  } catch (error) {
    console.error('Error fetching admin leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/leads - Create new lead
// GET /admin/leads/:leadId/touch-points - Get touch points for specific lead
adminRouter.get('/leads/:leadId/touch-points', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { leadId } = req.params;

    // Check if lead exists
    const [leadRows] = await mysqlPool.query(
      "SELECT lead_id FROM leads WHERE lead_id = ?",
      [leadId]
    ) as [any[], any];

    if (leadRows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
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
    console.error('Error fetching admin touch points:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// POST /admin/leads - Create new lead
adminRouter.post('/leads', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Validate required fields
    const { lead_id, name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel, text_notification, notes } = req.body;
    
    if (!lead_id) {
      res.status(400).json({ error: 'Lead ID is required' });
      return;
    }

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (!sales_rep) {
      res.status(400).json({ error: 'Sales rep is required' });
      return;
    }

    // Validate finance_need if provided
    if (finance_need && !['Yes', 'No'].includes(finance_need)) {
      res.status(400).json({ error: 'Finance need must be either "Yes" or "No"' });
      return;
    }

    // Check if lead_id already exists
    const [existingLead] = await mysqlPool.query(
      "SELECT lead_id FROM leads WHERE lead_id = ?",
      [lead_id]
    ) as [any[], any];

    if (existingLead.length > 0) {
      res.status(409).json({ error: 'Lead ID already exists' });
      return;
    }

    // Insert the new lead
    await mysqlPool.query(
      `INSERT INTO leads (lead_id, name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lead_id, name, email || null, phone || null, project_interest || null, budget || null, 
       click_source || null, website_source || null, ad_source || null, status || 'New', sales_rep, finance_need || null, channel || 'Marketing', notes || null]
    );

    // Send welcome text message via OpenPhone
    if (text_notification) {
      try {
        const [rows] = await mysqlPool.query(
          "SELECT phone FROM sales_rep WHERE uid = ?",
          [sales_rep]
        ) as [any[], any];

        if (rows.length > 0) {
          const sales_rep_phone = rows[0].phone;        
          // Strip everything except numbers and add +1
          const cleanPhone = '+1' + sales_rep_phone.replace(/\D/g, '');
          const myHeaders = new Headers();
          myHeaders.append("Authorization", process.env.OPEN_PHONE_API);
          myHeaders.append("Content-Type", "application/json");
          
          const sendLeadNotification = async (number: string) => {
            await fetch('https://api.openphone.com/v1/messages', {
              method: 'POST',
              headers: myHeaders,
              body: JSON.stringify({
                content: `[Lead Assigned]
                
${name} 
${phone} 

${process.env.LEAD_DOMAIN}/leads/${lead_id}`,
                from: '+16578880026',
                to: [number],
                userId: 'USNATDaG43' // Dolo's phone number
              }),
            });
          }

          await sendLeadNotification(cleanPhone); // Sales Rep's phone number
          await sendLeadNotification('+17147919016'); // An's phone number
        }
      } catch (smsError) {
        console.error('Error sending welcome SMS:', smsError);
        // Don't fail the lead creation if SMS fails
      }
    }

    res.status(201).json({
      message: 'Lead created successfully',
      data: {
        lead_id,
        name,
        email,
        phone,
        project_interest,
        budget,
        click_source,
        website_source,
        ad_source,
        status: status || 'New',
        sales_rep,
        finance_need,
        channel,
        notes
      }
    });
  } catch (error) {
    console.error('Error creating admin lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/leads/:id - Update existing lead
adminRouter.put('/leads/:id', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { id } = req.params;
    const { name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel, notes } = req.body;

    // Check if lead exists
    const [existingLead] = await mysqlPool.query(
      "SELECT * FROM leads WHERE lead_id = ?",
      [id]
    ) as [any[], any];

    if (existingLead.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    // Update the lead
    await mysqlPool.query(
      `UPDATE leads SET 
        name = ?, email = ?, phone = ?, project_interest = ?, budget = ?, 
        click_source = ?, website_source = ?, ad_source = ?, status = ?, 
        sales_rep = ?, finance_need = ?, channel = ?, notes = ?
       WHERE lead_id = ?`,
      [name || existingLead[0].name, email || existingLead[0].email, phone || existingLead[0].phone,
       project_interest || existingLead[0].project_interest, budget || existingLead[0].budget,
       click_source || existingLead[0].click_source, website_source || existingLead[0].website_source,
       ad_source || existingLead[0].ad_source, status || existingLead[0].status,
       sales_rep || existingLead[0].sales_rep, finance_need || existingLead[0].finance_need, channel || existingLead[0].channel, notes || existingLead[0].notes, id]
    );

    // Get updated lead
    const [updatedLead] = await mysqlPool.query(
      "SELECT * FROM leads WHERE lead_id = ?",
      [id]
    ) as [any[], any];

    res.status(200).json({
      message: 'Lead updated successfully',
      data: updatedLead[0]
    });
  } catch (error) {
    console.error('Error updating admin lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminRouter.post('/leads/:leadId/touch-points', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { leadId } = req.params;
    const { uid, contact_method, description } = req.body;
    const systemNote = "Automated Message";

    if (!leadId) {
      res.status(400).json({ error: 'Lead ID is required' });
      return;
    }

    // Check if lead exists and belongs to this sales rep
    const [leadRows] = await mysqlPool.query(
      "SELECT lead_id FROM leads WHERE lead_id = ?",
      [leadId]
    ) as [any[], any];

    if (leadRows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
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
      }
    });
  } catch (error) {
    console.error('Error creating admin touch point:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default adminRouter; 