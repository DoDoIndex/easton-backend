import express from 'express';
import mysqlPool from '../../../services/_mysqlService';
import { jobtread } from '../../../utils';

interface AuthenticatedRequest extends express.Request {
  userRecord?: any;
  userRole?: string[];
  grantKey?: string;
}

const jobtreadRouter = express.Router();

const ORGANIZATION_ID = process.env.JOBTREAD_ORGANIZATION_ID;

/*
  [1] Create customer account with type "customer" using lead data
  [2] Update the leads database with JobTread integration details
  [3] Create a contact for the customer
  [4] Update Location  
  [5] Create one comment per touch point
  [6] Add finance need, channel, budget, and project interest as a message to the customer
  [7] create a job for the customer
  [8] Assign Sales Process Checklist to the job
*/

// POST /sales-rep/jobtread/customer - Create customer from lead data
jobtreadRouter.post('/customer', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!ORGANIZATION_ID) {
      res.status(500).json({ error: 'JobTread organization ID not configured' });
      return;
    }

    const { lead_id, customer_type, customer_title, contact_notes } = req.body;
    
    if (!lead_id) {
      res.status(400).json({ error: 'Lead ID is required' });
      return;
    }

    // Get grant key from auth middleware
    if (!req.grantKey) {
      res.status(400).json({ error: 'JobTread grant key not configured for this user' });
      return;
    }

    const grantKey = req.grantKey;

    // Get sales rep name for the lead import
    const [salesRepRows] = await mysqlPool.query(
      "SELECT name, commission_rate FROM sales_rep WHERE uid = ? AND is_active = 1",
      [uid]
    ) as [any[], any];

    if (salesRepRows.length === 0) {
      res.status(404).json({ error: 'Sales Rep not found or access denied' });
      return;
    }

    const salesRepName = salesRepRows[0].name || 'Unknown';
    const salesRepCommissionRate = salesRepRows[0].commission_rate || 0;
  
    // Query MySQL to get lead information
    const [leadRows] = await mysqlPool.query(
      "SELECT * FROM leads WHERE lead_id = ? AND sales_rep = ?",
      [lead_id, uid]
    ) as [any[], any];

    if (leadRows.length === 0) {
      res.status(404).json({ error: 'Lead not found or access denied' });
      return;
    }

    const lead = leadRows[0];
    const { name, email, phone, address, city, state, zipcode, finance_need, channel, budget, project_interest } = lead;

    if (!name) {
      res.status(400).json({ error: 'Lead must have a name' });
      return;
    }

    // [1] Create customer account with type "customer" using lead data
    const customerResponse = await jobtread({
      createAccount: {
        $: { 
          organizationId: ORGANIZATION_ID, 
          name: (process.env.CURRENT_ENVIRONMENT === 'DEV' ? '[TEST] ' : '') + name + " " + customer_type, 
          type: "customer",
          isTaxable: false,
          customFieldValues: {
            Notes: `Imported from Lead Portal by ${salesRepName}`
          }
        },
        createdAccount: { 
          id: {}, 
          name: {}, 
          createdAt: {},
          type: {},
          organization: {
            id: {},
            name: {}
          }
        }
      }
    }, grantKey);

    if (!customerResponse?.createAccount?.createdAccount?.id) {
      res.status(500).json({ error: 'Failed to create customer account' });
      return;
    }

    const customer = customerResponse?.createAccount?.createdAccount;

    // [2] Update the leads database with JobTread integration details
    await mysqlPool.query(
      "UPDATE leads SET status = 'Imported', integration_id = ?, integration_platform = ?, commission_rate = ?  WHERE lead_id = ?",
      [customer.id, 'JobTread', salesRepCommissionRate, lead_id]
    );

    // [3] Create a contact for the customer
    let contactId = null;
    if (email || phone) {
      try {
        const contactResponse = await jobtread({
          createContact: {
            $: {
              accountId: customer.id,
              name: name,
              title: customer_title || "",
              customFieldValues: {
                Email: email || "",
                Phone: phone || "",
                Notes: contact_notes
              }
            },
            createdContact: {
              id: {},
              name: {},
              title: {},
              account: { id: {}, name: {} },
              customFieldValues: {}
            }
          }
        }, grantKey);
        contactId = contactResponse?.createContact?.createdContact?.id;
      } catch (error) {
        console.error('[WARN] Error creating contact: ', error);
      }
    }

    // [4] Update Location
    let locationId = null;
    if (address && city) {
      try {
        const locationResponse = await jobtread({
          createLocation: {
            $: {
              accountId: customer.id,
              contactId: contactId || "",
              name: address,
              address: address + ", " + city || "" + ", " + state || "CA" + " " + zipcode || ""
            },
            createdLocation: {
              id: {},
            }
          },
          
        }, grantKey);
        locationId = locationResponse?.createLocation?.createdLocation?.id;
      } catch (error) {
        console.error('[WARN] Error creating location:', error);
      }
    }
    
    // Query touch points for the lead to create individual comments
    const [touchPointRows] = await mysqlPool.query(
      "SELECT description, system_note, created_at FROM touch_points WHERE lead_id = ? AND is_active = 1 ORDER BY created_at ASC",
      [lead_id]
    ) as [any[], any];

    // [5] Create one comment per touch point
    if (touchPointRows.length > 0) {
      for (const tp of touchPointRows) {
        let message = tp.description || '';
        if (tp.system_note) {
          message += '\n\nSystem Note: ' + tp.system_note;
        }
        
        // Format date as "- Aug 20, 2025"
        const dateObj = new Date(tp.created_at);
        const formattedDate = '- ' + dateObj.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        message += '\n\n' + formattedDate;

        try {
          await jobtread({
            createComment: {
              $: {
                isVisibleToAll: false,
                isVisibleToInternalRoles: true,
                isVisibleToCustomerRoles: false,
                isVisibleToVendorRoles: false,
                message: message,
                targetId: customer.id,
                targetType: 'account',
              }
            }
          }, grantKey);
        } catch (error) {
          console.error('[WARN] Error creating comment:', error);
        }
      }
    } 
    
    // [6] Add finance need, channel, budget, and project interest as a message to the customer
    if (finance_need || channel || budget || project_interest) {
      let message = '';
      if (finance_need) {
        message += 'Finance Need: ' + finance_need + '\n';
      }
      if (channel) {
        message += 'Channel: ' + channel + '\n';
      }
      if (budget) {
        message += 'Budget: ' + budget + '\n';
      }
      if (project_interest) {
        message += 'Project Interest: ' + project_interest + '\n';
      }
      try {
        await jobtread({
          createComment: {
            $: {
              isVisibleToAll: false,
              isVisibleToInternalRoles: true,
              isVisibleToCustomerRoles: false,
              isVisibleToVendorRoles: false,
              message: message,
              targetId: customer.id,
              targetType: 'account',
            }
          }
        }, grantKey);
      } catch (error) {
        console.error('[WARN] Error creating comment:', error);
      }
    }

    // [7] create a job for the customer
    let jobId = null;
    if (locationId) {
      try {
        const jobResponse = await jobtread({
          createJob: {
            $: {
              locationId: locationId,
            },
            createdJob: {
              id: {},
            }
          }
        }, grantKey); 
        jobId = jobResponse?.createJob?.createdJob?.id;
      } catch (error) {
        console.error('[WARN] Error creating job:', error);
      }
    }

    if (jobId) {
      // [8] Assign Sales Process Checklist to the job
      try {
        await jobtread({
          copyTaskTemplateToTarget: {
            $: {
              notify: false,
              targetId: jobId,
              targetType: "job",
              taskTemplateId: "22PEApzGMSk8" // Sales Process Checklist 
            }
          }
        }, grantKey); 
      } catch (error) {
        console.error('[WARN] Error assigning Sales Process Checklist to job:', error);
      }
    }

    res.status(201).json({
      message: 'Residential customer created successfully from lead',
      data: {
        customer,
        lead_id,
        lead_data: { name, email, phone },
        integration: {
          integration_id: customer.id,
          integration_name: 'JobTread'
        },
        note: email || phone ? 'Customer created with contact information from lead and lead updated with integration details.' : 'Customer created and lead updated with integration details. Contact information can be added separately.'
      }
    });
  } catch (error) {
    console.error('Error creating customer from lead:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /sales-rep/jobtread/customer/:customerId - Get customer info with all associated jobs
jobtreadRouter.get('/customer/:customerId', async (req: AuthenticatedRequest, res: express.Response): Promise<void> => {
  try {
    const uid = req.userRecord?.uid;
    const { customerId } = req.params;
    
    if (!uid) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!ORGANIZATION_ID) {
      res.status(500).json({ error: 'JobTread organization ID not configured' });
      return;
    }

    // Get grant key from auth middleware
    if (!req.grantKey) {
      res.status(400).json({ error: 'JobTread grant key not configured for this user' });
      return;
    }

    const grantKey = req.grantKey;

    // Get customer account details
    const customerResponse = await jobtread({
      account: {
        $: { id: customerId },
        id: {},
        name: {},
        type: {},
        isTaxable: {},
        createdAt: {},
        customFieldValues: {
          $: { size: 25 },
          nodes: {
            id: {},
            value: {},
            customField: {
              id: {},
              name: {}
            }
          }
        }
      }
    }, grantKey);

    if (!customerResponse.data?.account) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    // Get all jobs for this customer
    const jobsResponse = await jobtread({
      organization: {
        $: { id: ORGANIZATION_ID },
        jobs: {
          $: {
            where: [
              ['accountId', '=', customerId]
            ],
            sortBy: [
              { field: 'createdAt', order: 'desc' }
            ]
          },
          nodes: {
            id: {},
            name: {},
            number: {},
            status: {},
            createdAt: {},
            estimatedCost: {},
            estimatedDuration: {},
            description: {},
            account: {
              id: {},
              name: {}
            }
          }
        }
      }
    }, grantKey);

    // Get customer locations
    const locationsResponse = await jobtread({
      organization: {
        $: { id: ORGANIZATION_ID },
        locations: {
          $: {
            where: [
              ['accountId', '=', customerId]
            ]
          },
          nodes: {
            id: {},
            name: {},
            address: {},
            createdAt: {}
          }
        }
      }
    }, grantKey);

    res.status(200).json({
      message: 'Customer and jobs retrieved successfully',
      data: {
        customer: customerResponse.data.account,
        jobs: jobsResponse.data.organization.jobs.nodes || [],
        locations: locationsResponse.data.organization.locations.nodes || []
      }
    });
  } catch (error) {
    console.error('Error fetching customer and jobs:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default jobtreadRouter;
