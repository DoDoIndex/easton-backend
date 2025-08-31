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
      "SELECT name FROM sales_rep WHERE uid = ? AND is_active = 1",
      [uid]
    ) as [any[], any];

    if (salesRepRows.length === 0) {
      res.status(404).json({ error: 'Sales Rep not found or access denied' });
      return;
    }

    const salesRepName = salesRepRows[0].name || 'Unknown';

    // Query MySQL to get lead information
    const [leadRows] = await mysqlPool.query(
      "SELECT name, email, phone FROM leads WHERE lead_id = ? AND sales_rep = ?",
      [lead_id, uid]
    ) as [any[], any];

    if (leadRows.length === 0) {
      res.status(404).json({ error: 'Lead not found or access denied' });
      return;
    }

    const lead = leadRows[0];
    const { name, email, phone } = lead;

    if (!name) {
      res.status(400).json({ error: 'Lead must have a name' });
      return;
    }

    // Create customer account with type "customer" using lead data
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

    // Create a contact for the customer
    if (email || phone) {
      await jobtread({
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
    }

    // TODO: update location and other fields for the customer
    // TODO: create a job for the customer
    await jobtread({
      createComment: {
        $: {
          isVisibleToAll: false,
          isVisibleToInternalRoles: true,
          isVisibleToCustomerRoles: false,
          isVisibleToVendorRoles: false,
          message: 'THIS IS A MESSAGE',
          targetId: customer.id,
          targetType: 'account',
        }
      }
    }, grantKey);

    // Update the leads database with JobTread integration details
    await mysqlPool.query(
      "UPDATE leads SET status = 'Imported', integration_id = ?, integration_platform = ? WHERE lead_id = ?",
      [customer.id, 'JobTread', lead_id]
    );

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
