import express from 'express';
import mysqlPool from '../../services/_mysqlService';
import { jobtread } from '../../utils';
import firebaseAdmin from '../../services/_fiebaseService';

interface AuthenticatedRequest extends express.Request {
  userRecord?: any;
  userRole?: string[];
  grantKey?: string;
}

const ORGANIZATION_ID = process.env.JOBTREAD_ORGANIZATION_ID;
const JOBTREAD_BATCH_SIZE = 10;
const adminRouter = express.Router();

// GET /admin/info - Get admin user info
adminRouter.get('/info', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const uid = req.userRecord?.uid;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get admin info from database first
    const [adminRows] = await mysqlPool.query(
      "SELECT uid, name, phone, is_active FROM admin WHERE uid = ? AND is_active = 1",
      [uid]
    ) as [any[], any];

    if (adminRows.length === 0) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }

    const adminData = adminRows[0];

    // Get email from Firebase
    let email = null;
    try {
      const userRecord = await firebaseAdmin.auth().getUser(uid);
      email = userRecord.email || null;
    } catch (firebaseError) {
      console.error('Error fetching email from Firebase:', firebaseError);
      // Continue without email if Firebase fails
    }

    const adminInfo = {
      uid: adminData.uid,
      name: adminData.name,
      email: email,
      phone: adminData.phone,
      is_active: adminData.is_active,
      role: 'admin'
    };

    res.status(200).json({ 
      message: 'Admin info retrieved successfully',
      data: adminInfo
    });
  } catch (error) {
    console.error('Error fetching admin info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/sales-reps - Get all sales reps with detailed info including emails from Firebase
adminRouter.get('/sales-reps', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Fetch all sales reps from database
    const [salesReps] = await mysqlPool.query(
      "SELECT uid, name, grant_key, commission_rate, phone, calendar_url, is_active FROM sales_rep WHERE is_active = 1 ORDER BY name ASC",
      []
    ) as [any[], any];

    // Enrich with emails from Firebase
    const enrichedSalesReps = [];
    for (const rep of salesReps) {
      try {
        const userRecord = await firebaseAdmin.auth().getUser(rep.uid);
        enrichedSalesReps.push({
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: userRecord.email || null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      } catch (error) {
        // If Firebase lookup fails, still include the rep without email
        enrichedSalesReps.push({
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      }
    }

    res.status(200).json({ 
      message: 'Sales reps retrieved successfully',
      data: enrichedSalesReps
    });
  } catch (error) {
    console.error('Error fetching sales reps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/sales-reps/:uid - Get specific sales rep by ID with detailed info including email from Firebase
adminRouter.get('/sales-reps/:uid', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { uid } = req.params;

    if (!uid) {
      res.status(400).json({ error: 'Sales rep UID is required' });
      return;
    }

    // Fetch specific sales rep from database
    const [salesReps] = await mysqlPool.query(
      "SELECT uid, name, grant_key, commission_rate, phone, calendar_url, is_active FROM sales_rep WHERE uid = ?",
      [uid]
    ) as [any[], any];

    if (salesReps.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    const rep = salesReps[0];

    // Enrich with email from Firebase
    let email = null;
    try {
      const userRecord = await firebaseAdmin.auth().getUser(rep.uid);
      email = userRecord.email || null;
    } catch (error) {
      console.error('Error fetching email from Firebase:', error);
      // Continue without email if Firebase fails
    }

    const enrichedSalesRep = {
      uid: rep.uid,
      name: rep.name,
      grant_key: rep.grant_key,
      commission_rate: rep.commission_rate,
      phone: rep.phone,
      email: email,
      calendar_url: rep.calendar_url,
      is_active: rep.is_active
    };

    res.status(200).json({ 
      message: 'Sales rep retrieved successfully',
      data: enrichedSalesRep
    });
  } catch (error) {
    console.error('Error fetching sales rep:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/phone - Update sales rep phone number (admin can update any sales rep)
adminRouter.put('/phone', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { uid, phone } = req.body;
    
    if (!uid) {
      res.status(400).json({ error: 'Sales rep UID is required' });
      return;
    }

    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    // Update the phone number for the specified sales rep
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
      data: { uid, phone }
    });
  } catch (error) {
    console.error('Error updating sales rep phone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/calendar-url - Update sales rep calendar URL (admin can update any sales rep)
adminRouter.put('/calendar-url', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { uid, calendar_url } = req.body;
    
    if (!uid) {
      res.status(400).json({ error: 'Sales rep UID is required' });
      return;
    }

    if (!calendar_url) {
      res.status(400).json({ error: 'Calendar URL is required' });
      return;
    }

    // Update the calendar URL for the specified sales rep
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
      data: { uid, calendar_url }
    });
  } catch (error) {
    console.error('Error updating sales rep calendar URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/sales-reps/:uid - Update sales rep by ID (admin can update any sales rep)
adminRouter.put('/sales-reps/:uid', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { uid } = req.params;
    const { name, phone, calendar_url, commission_rate, grant_key, email, is_active } = req.body;
    
    if (!uid) {
      res.status(400).json({ error: 'Sales rep UID is required' });
      return;
    }

    // Check if sales rep exists
    const [existingSalesRep] = await mysqlPool.query(
      "SELECT * FROM sales_rep WHERE uid = ?",
      [uid]
    ) as [any[], any];

    if (existingSalesRep.length === 0) {
      res.status(404).json({ error: 'Sales rep not found' });
      return;
    }

    const currentSalesRep = existingSalesRep[0];

    // Update Firebase email if provided and different
    if (email && email !== currentSalesRep.email) {
      try {
        await firebaseAdmin.auth().updateUser(uid, {
          email: email
        });
      } catch (firebaseError) {
        console.error('Error updating Firebase email:', firebaseError);
        res.status(400).json({ error: 'Failed to update email in Firebase' });
        return;
      }
    }

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (calendar_url !== undefined) {
      updateFields.push('calendar_url = ?');
      updateValues.push(calendar_url);
    }
    if (commission_rate !== undefined) {
      updateFields.push('commission_rate = ?');
      updateValues.push(commission_rate);
    }
    if (grant_key !== undefined) {
      updateFields.push('grant_key = ?');
      updateValues.push(grant_key);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No fields provided to update' });
      return;
    }

    // Add UID to the end of values array
    updateValues.push(uid);

    // Update the sales rep in database
    const [result] = await mysqlPool.query(
      `UPDATE sales_rep SET ${updateFields.join(', ')} WHERE uid = ?`,
      updateValues
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Sales rep not found or no changes made' });
      return;
    }

    // Get updated sales rep with email from Firebase
    const [updatedSalesRep] = await mysqlPool.query(
      "SELECT uid, name, grant_key, commission_rate, phone, calendar_url, is_active FROM sales_rep WHERE uid = ?",
      [uid]
    ) as [any[], any];

    let updatedEmail = null;
    try {
      const userRecord = await firebaseAdmin.auth().getUser(uid);
      updatedEmail = userRecord.email || null;
    } catch (firebaseError) {
      console.error('Error fetching updated email from Firebase:', firebaseError);
    }

    const responseData = {
      ...updatedSalesRep[0],
      email: updatedEmail
    };

    res.status(200).json({ 
      message: 'Sales rep updated successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error updating sales rep:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/leads - Get all leads with detailed touch point information (admin access to all)
adminRouter.get('/leads', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Fetch all sales reps first (there are only ~10 max)
    const [salesReps] = await mysqlPool.query(
      "SELECT uid, name, grant_key, commission_rate, phone, calendar_url, is_active FROM sales_rep WHERE is_active = 1",
      []
    ) as [any[], any];

    // Create a map of sales rep UIDs to detailed info, and fetch emails from Firebase
    const salesRepMap = new Map();
    for (const rep of salesReps) {
      try {
        const userRecord = await firebaseAdmin.auth().getUser(rep.uid);
        salesRepMap.set(rep.uid, {
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: userRecord.email || null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      } catch (error) {
        // If Firebase lookup fails, still include the rep without email
        salesRepMap.set(rep.uid, {
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      }
    }

    // Get all leads with detailed touch point information (admin sees all leads) - no pagination limit
    const complexQuery = `SELECT 
        l.*,
        COALESCE(tp_count.touch_point_count, 0) as touch_point_count,
        tp_last.last_touched,
        tp_last_content.description as last_touchpoint_content,
        tp_last_content.contact_method as last_touchpoint_method,
        tp_last_content.created_at as last_touchpoint_date,
        tp_last_content.uid as last_touchpoint_uid,
        COALESCE(sr_last.name, tp_last_content.uid) as last_touchpoint_rep_name
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
       WHERE l.status != 'Imported'
       ORDER BY l.created_at DESC`;

    const [leads] = await mysqlPool.query(complexQuery, []) as [any[], any];

    // Replace sales_rep UID with detailed sales rep object
    const enrichedLeads = leads.map(lead => ({
      ...lead,
      sales_rep: (lead.sales_rep && lead.sales_rep !== 'unassigned') ? (salesRepMap.get(lead.sales_rep) || null) : null
    }));

    res.status(200).json({
      message: 'Leads retrieved successfully',
      data: enrichedLeads
    });

  } catch (error) {
    console.error('Error fetching admin leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/jobs - Get all jobs (admin access to all jobs)
adminRouter.get('/jobs', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Get grant key from auth middleware (admin can use any grant key)
    if (!req.grantKey) {
      res.status(400).json({ error: 'JobTread grant key not configured' });
      return;
    }
    const grantKey = req.grantKey;
    
    // Get all jobs (leads with status 'Imported') - admin sees all
    const simpleQuery = `SELECT * FROM leads 
       WHERE status = 'Imported'
       ORDER BY created_at DESC`;
    
    const [customers] = await mysqlPool.query(simpleQuery, []) as [any[], any];

    // Fetch all sales reps first (there are only ~10 max) for enrichment
    const [salesReps] = await mysqlPool.query(
      "SELECT uid, name, grant_key, commission_rate, phone, calendar_url, is_active FROM sales_rep WHERE is_active = 1",
      []
    ) as [any[], any];

    // Create a map of sales rep UIDs to detailed info, and fetch emails from Firebase
    const salesRepMap = new Map();
    for (const rep of salesReps) {
      try {
        const userRecord = await firebaseAdmin.auth().getUser(rep.uid);
        salesRepMap.set(rep.uid, {
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: userRecord.email || null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      } catch (error) {
        // If Firebase lookup fails, still include the rep without email
        salesRepMap.set(rep.uid, {
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      }
    }

    // Add empty jobs array and integration_name to each customer
    customers.forEach(customer => {
      customer.integration_name = null;
      customer.jobs = [];
      customer.estimates = [];
      customer.contracts = [];
    });
    
    // Collect integration_id only for JobTread customers
    const jobTreadCustomerIds = customers
      .filter(customer => customer.integration_platform === 'JobTread')
      .map(customer => customer.integration_id);
    
    // Fetch all jobs from JobTread for these customer IDs in batches
    let jobTreadJobs = [];
    if (jobTreadCustomerIds.length > 0) {
      try {
        if (!ORGANIZATION_ID) {
          console.warn('JobTread organization ID not configured');
        } else {
          // Batch customer IDs into chunks
          const batchSize = JOBTREAD_BATCH_SIZE;
          const batches = [];
          for (let i = 0; i < jobTreadCustomerIds.length; i += batchSize) {
            batches.push(jobTreadCustomerIds.slice(i, i + batchSize));
          }

          // Process each batch and collect results
          for (const batch of batches) {
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
                            batch
                          ]
                        }
                      ]
                    },
                    "size": JOBTREAD_BATCH_SIZE
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
            }, grantKey);
            
            const batchJobs = jobTreadResponse?.organization?.accounts?.nodes || [];
            jobTreadJobs.push(...batchJobs);
          }
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
    
    // Create array of just job_ids
    const jobIds = customers.flatMap(customer => 
      customer.jobs.map(job => job.id)
    );
    
    // Fetch documents for all jobs to determine estimate/contract status
    if (jobIds.length > 0) {
      try {
        if (ORGANIZATION_ID) {
          // Batch job IDs into chunks to respect API limits
          const batchSize = JOBTREAD_BATCH_SIZE;
          const jobBatches = [];
          for (let i = 0; i < jobIds.length; i += batchSize) {
            jobBatches.push(jobIds.slice(i, i + batchSize));
          }

          let allJobsWithDocuments = [];
          
          // Process each batch
          for (const batch of jobBatches) {
            const documentsResponse = await jobtread({
              organization: {
                $: {
                  id: ORGANIZATION_ID
                },
                jobs: {
                  $: {
                    where: {
                      "in": [
                        {
                          "field": "id"
                        },
                        batch
                      ]
                    },
                    "size": JOBTREAD_BATCH_SIZE
                  },
                  "nextPage": {},
                  "previousPage": {},
                  "nodes": {
                    "id": {},
                    "documents": {
                      "$": {},
                      "nodes": {
                        "fullName": {},
                        "price": {},
                        "status": {}
                      }
                    }
                  }
                }
              }
            }, grantKey);
            
            const batchJobs = documentsResponse?.organization?.jobs?.nodes || [];
            allJobsWithDocuments = allJobsWithDocuments.concat(batchJobs);
          }

          // Update estimate/contract status for each customer based on job documents
          customers.forEach(customer => {
            // Check all jobs for this customer
            customer.jobs.forEach(customerJob => {
              const jobWithDocs = allJobsWithDocuments.find(jwd => jwd.id === customerJob.id);
              if (jobWithDocs && jobWithDocs.documents && jobWithDocs.documents.nodes) {
                const documents = jobWithDocs.documents.nodes;
                
                // Check for Contract documents
                const contractDocs = documents.filter(doc => doc.fullName.toLowerCase().includes('contract'));
                contractDocs.forEach(contractDoc => {
                  customer.contracts.push({
                    fullName: contractDoc.fullName,
                    price: contractDoc.price || 0,
                    status: contractDoc.status || ''
                  });
                });
                
                // Check for Estimate documents
                const estimateDocs = documents.filter(doc => doc.fullName.toLowerCase().includes('estimate'));
                estimateDocs.forEach(estimateDoc => {
                  customer.estimates.push({
                    fullName: estimateDoc.fullName,
                    price: estimateDoc.price || 0,
                    status: estimateDoc.status || ''
                  });
                });
              }
            });
          });
        }
      } catch (error) {
        console.error('Error fetching job documents:', error);
      }
    }
    
    // Replace sales_rep UID with detailed sales rep object for each customer
    const enrichedCustomers = customers.map(customer => ({
      ...customer,
      sales_rep: (customer.sales_rep && customer.sales_rep !== 'unassigned') ? (salesRepMap.get(customer.sales_rep) || null) : null
    }));
    
    res.status(200).json({
      message: 'Customers retrieved successfully',
      data: enrichedCustomers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/leads/:leadId - Get specific lead by ID (admin access to any lead)
adminRouter.get('/leads/:leadId', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    // Check if user has admin role
    if (!req.userRole?.includes('admin')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { leadId } = req.params;

    // Get the specific lead - admin can access any lead
    const query = `SELECT * FROM leads WHERE lead_id = ?`;
    
    const [leads] = await mysqlPool.query(query, [leadId]) as [any[], any];
  
    if (leads.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const lead = leads[0];

    // Fetch all sales reps first (there are only ~10 max) for enrichment
    const [salesReps] = await mysqlPool.query(
      "SELECT uid, name, grant_key, commission_rate, phone, calendar_url, is_active FROM sales_rep WHERE is_active = 1",
      []
    ) as [any[], any];

    // Create a map of sales rep UIDs to detailed info, and fetch emails from Firebase
    const salesRepMap = new Map();
    for (const rep of salesReps) {
      try {
        const userRecord = await firebaseAdmin.auth().getUser(rep.uid);
        salesRepMap.set(rep.uid, {
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: userRecord.email || null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      } catch (error) {
        // If Firebase lookup fails, still include the rep without email
        salesRepMap.set(rep.uid, {
          uid: rep.uid,
          name: rep.name,
          grant_key: rep.grant_key,
          commission_rate: rep.commission_rate,
          phone: rep.phone,
          email: null,
          calendar_url: rep.calendar_url,
          is_active: rep.is_active
        });
      }
    }

    // Replace sales_rep UID with detailed sales rep object or null
    const enrichedLead = {
      ...lead,
      sales_rep: (lead.sales_rep && lead.sales_rep !== 'unassigned') ? (salesRepMap.get(lead.sales_rep) || null) : null
    };

    res.status(200).json({
      message: 'Lead retrieved successfully',
      data: enrichedLead
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
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

    // Get touch points for this lead with names from appropriate tables based on commenter_type
    const [touchPoints] = await mysqlPool.query(
      `SELECT 
        tp.*,
        CASE 
          WHEN tp.commenter_type = 'admin' THEN COALESCE(a.name, tp.uid)
          ELSE COALESCE(sr.name, tp.uid)
        END as contact_name,
        tp.commenter_type
       FROM touch_points tp
       LEFT JOIN sales_rep sr ON tp.uid = sr.uid AND sr.is_active = 1
       LEFT JOIN admin a ON tp.uid = a.uid AND a.is_active = 1
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
    const { lead_id, name, email, phone, city, state, zipcode, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel, text_notification, notes } = req.body;
    
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
      `INSERT INTO leads (lead_id, name, email, phone, city, state, zipcode, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lead_id, name, email || null, phone || null, city || null, state || null, zipcode || null, project_interest || null, budget || null, 
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
    const { name, email, phone, project_interest, budget, click_source, website_source, ad_source, status, sales_rep, finance_need, channel, notes, commission_rate } = req.body;

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
        sales_rep = ?, finance_need = ?, channel = ?, notes = ?, commission_rate = ?
       WHERE lead_id = ?`,
      [name || existingLead[0].name, email || existingLead[0].email, phone || existingLead[0].phone,
       project_interest || existingLead[0].project_interest, budget || existingLead[0].budget,
       click_source || existingLead[0].click_source, website_source || existingLead[0].website_source,
       ad_source || existingLead[0].ad_source, status || existingLead[0].status,
       sales_rep || existingLead[0].sales_rep, finance_need || existingLead[0].finance_need, channel || existingLead[0].channel, notes || existingLead[0].notes, commission_rate || existingLead[0].commission_rate, id]
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
    const { contact_method, description } = req.body;
    const systemNote = "Automated Message";
    
    // Get uid from authenticated user
    const uid = req.userRecord?.uid;

    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!leadId) {
      res.status(400).json({ error: 'Lead ID is required' });
      return;
    }

    // Check if lead exists (admin can access any lead)
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
      `INSERT INTO touch_points (touch_id, uid, lead_id, contact_method, description, system_note, commenter_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [touchId, uid, leadId, contact_method, description, systemNote, 'admin']
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