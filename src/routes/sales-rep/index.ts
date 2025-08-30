import express from 'express';
import mysqlPool from '../../services/_mysqlService';
import jobtreadRouter from './jobtread';
import { jobtread } from '../../utils';

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

    // Query the sales_rep table to get all info
    const [rows] = await mysqlPool.query(
      "SELECT * FROM sales_rep WHERE uid = ? AND is_active = 1",
      [uid]
    ) as [any[], any];

    if (rows.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    const salesRepInfo = rows[0];
    res.status(200).json({ 
      message: 'Sales rep info retrieved successfully',
      data: salesRepInfo
    });
  } catch (error) {
    console.error('Error fetching sales rep info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// PUT /sales-rep/phone - Update sales rep phone number
salesRepRouter.put('/phone', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { phone } = req.body;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    // Update the sales rep's phone number
    const [result] = await mysqlPool.query(
      "UPDATE sales_rep SET phone = ? WHERE uid = ? AND is_active = 1",
      [phone, uid]
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    res.status(200).json({
      message: 'Phone number updated successfully',
      data: { phone }
    });
  } catch (error) {
    console.error('Error updating phone number:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /sales-rep/calendar-url - Update sales rep calendar URL
salesRepRouter.put('/calendar-url', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { calendar_url } = req.body;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!calendar_url) {
      res.status(400).json({ error: 'Calendar URL is required' });
      return;
    }

    // Validate URL format
    try {
      new URL(calendar_url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }

    // Update the sales rep's calendar URL
    const [result] = await mysqlPool.query(
      "UPDATE sales_rep SET calendar_url = ? WHERE uid = ? AND is_active = 1",
      [calendar_url, uid]
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    res.status(200).json({
      message: 'Calendar URL updated successfully',
      data: { calendar_url }
    });
  } catch (error) {
    console.error('Error updating calendar URL:', error);
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
    
    const [salesRepRows] = await mysqlPool.query(
      salesRepQuery,
      [uid]
    ) as [any[], any];

    if (salesRepRows.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }
    
    const basicLeadsQuery = "SELECT * FROM leads WHERE sales_rep = ? ORDER BY lead_id DESC";
    
    await mysqlPool.query(
      basicLeadsQuery,
      [uid]
    ) as [any[], any];
    
    // Get all leads assigned to this sales rep with touch point count, last touched timestamp, and last touchpoint content
    const complexQuery = `SELECT 
        l.*,
        COALESCE(tp_count.touch_point_count, 0) as touch_point_count,
        tp_last.last_touched,
        tp_last_content.description as last_touchpoint_content,
        tp_last_content.contact_method as last_touchpoint_method,
        tp_last_content.created_at as last_touchpoint_date,
        tp_last_content.uid as last_touchpoint_uid,
        sr_last.name as last_touchpoint_rep_name
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
       LEFT JOIN (
         SELECT tp1.lead_id, tp1.description, tp1.contact_method, tp1.created_at, tp1.uid
         FROM touch_points tp1
         INNER JOIN (
           SELECT lead_id, MAX(created_at) as max_created_at
           FROM touch_points 
           WHERE is_active = 1 
           GROUP BY lead_id
         ) tp2 ON tp1.lead_id = tp2.lead_id AND tp1.created_at = tp2.max_created_at
         WHERE tp1.is_active = 1
       ) tp_last_content ON l.lead_id = tp_last_content.lead_id
       LEFT JOIN sales_rep sr_last ON tp_last_content.uid = sr_last.uid AND sr_last.is_active = 1
       WHERE l.sales_rep = ? AND l.status != 'Imported'
       ORDER BY l.created_at DESC`;
    
    const [leads] = await mysqlPool.query(
      complexQuery,
      [uid]
    ) as [any[], any];
    res.status(200).json({
      message: 'Leads retrieved successfully',
      data: leads
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sales-rep/jobs - Get all jobs (leads with status 'Imported') for the authenticated sales rep
salesRepRouter.get('/jobs', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get the sales rep's name to filter jobs
    const salesRepQuery = "SELECT name FROM sales_rep WHERE uid = ? AND is_active = 1";
    
    const [salesRepRows] = await mysqlPool.query(
      salesRepQuery,
      [uid]
    ) as [any[], any];

    if (salesRepRows.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }
    
    // Get all jobs (leads with status 'Imported') assigned to this sales rep
    const simpleQuery = `SELECT * FROM leads 
       WHERE sales_rep = ? AND status = 'Imported'
       ORDER BY created_at DESC`;
    
    const [customers] = await mysqlPool.query(
      simpleQuery,
      [uid]
    ) as [any[], any];

    // Add empty jobs array and integration_name to each customer
    customers.forEach(customer => {
      customer.integration_name = null;
      customer.jobs = [];
    });

    // Collect all integration_id and integration_platform from customers
    const integrationData = customers.map(customer => ({
      integration_id: customer.integration_id,
      integration_platform: customer.integration_platform
    }));
    
    console.log('Integration Data from Customers:', integrationData);
    
    // Collect integration_id only for JobTread customers
    const jobTreadCustomerIds = customers
      .filter(customer => customer.integration_platform === 'JobTread')
      .map(customer => customer.integration_id);
    
    console.log('JobTread Customer IDs:', jobTreadCustomerIds);
    
    // Fetch all jobs from JobTread for these customer IDs
    let jobTreadJobs = [];
    if (jobTreadCustomerIds.length > 0) {
      try {
        const ORGANIZATION_ID = process.env.JOBTREAD_ORGANIZATION_ID;
        if (!ORGANIZATION_ID) {
          console.warn('JobTread organization ID not configured');
        } else {
          const jobTreadResponse = await jobtread({
            organization: {
              $: {
                id: ORGANIZATION_ID
              },
              accounts: {
                $: {
                  where: {
                    and: [
                      {
                        "=": [
                          {
                            "field": "type"
                          },
                          "customer"
                        ]
                      },
                      {
                        "in": [
                          {
                            "field": "id"
                          },
                          jobTreadCustomerIds
                        ]
                      }
                    ]
                  },
                  "size": 10
                },
                "nextPage": {},
                "previousPage": {},
                "nodes": {
                  "id": {},
                  "name": {},
                  "jobs": {
                    "$": {},
                    "nodes": {
                      "id": {},
                      "name": {}
                    }
                  }
                }
              }
            }
          });
          
          jobTreadJobs = jobTreadResponse?.organization?.accounts?.nodes || [];
          console.log('JobTread Jobs Response:', JSON.stringify(jobTreadJobs, null, 2));
          // console.log('JobTread Jobs Response:', JSON.stringify(jobTreadResponse, null, 2));
        }
      } catch (error) {
        console.error('Error fetching JobTread jobs:', error);
      }
    }
    
    // Match JobTread customers with local customers and populate jobs array and integration_name
    if (jobTreadJobs.length > 0) {
      customers.forEach(customer => {
        if (customer.integration_platform === 'JobTread' && customer.integration_id) {
          const matchingJobTreadCustomer = jobTreadJobs.find(jtCustomer => jtCustomer.id === customer.integration_id);
          if (matchingJobTreadCustomer) {
            customer.integration_name = matchingJobTreadCustomer.name;
            if (matchingJobTreadCustomer.jobs && matchingJobTreadCustomer.jobs.nodes) {
              customer.jobs = matchingJobTreadCustomer.jobs.nodes;
            }
          }
        }
      });
    }
    
    res.status(200).json({
      message: 'Customers retrieved successfully',
      data: customers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sales-rep/leads/:leadId - Get specific lead by ID
salesRepRouter.get('/leads/:leadId', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { leadId } = req.params;

    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get the specific lead with touch point count and last touched timestamp
    const query = `SELECT * FROM leads WHERE lead_id = ? AND sales_rep = ?`;
    
    query.replace('?', leadId).replace('?', uid);
    
    const [leads] = await mysqlPool.query(
      query,
      [leadId, uid]
    ) as [any[], any];
  
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
    const { lead_id, name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, finance_need, channel } = req.body;
    
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Generate a unique ID (using timestamp + random number)
    const leadId = lead_id || Date.now() + Math.floor(Math.random() * 1000000);

    // Insert the new lead
    await mysqlPool.query(
      `INSERT INTO leads (lead_id, name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [leadId, name, email || null, phone || null, project_interest || null, budget || null, 
       click_source || null, website_source || null, ad_source || null, status || 'New', uid, finance_need || null, channel || null]
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
        finance_need,
        channel
      }
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /sales-rep/leads/:leadId - Edit lead (limited fields)
salesRepRouter.put('/leads/:leadId', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
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

    // Extract only the allowed fields from request body
    const {
      name,
      email,
      phone,
      project_interest,
      budget,
      finance_need,
      address,
      city,
      state,
      zipcode
    } = req.body;

    // Validate required fields
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Build dynamic update query with only the provided fields
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (project_interest !== undefined) {
      updateFields.push('project_interest = ?');
      updateValues.push(project_interest);
    }
    if (budget !== undefined) {
      updateFields.push('budget = ?');
      updateValues.push(budget);
    }
    if (finance_need !== undefined) {
      updateFields.push('finance_need = ?');
      updateValues.push(finance_need);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }
    if (city !== undefined) {
      updateFields.push('city = ?');
      updateValues.push(city);
    }
    if (state !== undefined) {
      updateFields.push('state = ?');
      updateValues.push(state);
    }
    if (zipcode !== undefined) {
      updateFields.push('zipcode = ?');
      updateValues.push(zipcode);
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // Add lead_id and uid to update values
    updateValues.push(leadId, uid);

    // Update the lead
    const [result] = await mysqlPool.query(
      `UPDATE leads SET ${updateFields.join(', ')} WHERE lead_id = ? AND sales_rep = ?`,
      updateValues
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Lead not found or no changes made' });
      return;
    }

    // Get the updated lead data
    const [updatedLead] = await mysqlPool.query(
      "SELECT * FROM leads WHERE lead_id = ?",
      [leadId]
    ) as [any[], any];

    res.status(200).json({
      message: 'Lead updated successfully',
      data: updatedLead[0]
    });
  } catch (error) {
    console.error('Error updating lead:', error);
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
          // Set follow-up date to 2 days from now if not provided
          const twoDaysFromNow = new Date();
          twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
          finalFollowUpDate = twoDaysFromNow.toISOString().split('T')[0]; // Format as YYYY-MM-DD
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

// Mount the jobtread router
salesRepRouter.use('/jobtread', jobtreadRouter);

export default salesRepRouter; 