import express from 'express';
import mysqlPool from '../../services/_mysqlService';
import { randomUUID } from 'crypto';

const eventsRouter = express.Router();

// POST /events - Create a new event
eventsRouter.post('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { event_name, event_type, occurred_at, page_path, referrer, ad_source, session_id } = req.body;

    // Validate required fields
    if (!event_name) {
      res.status(400).json({ error: 'event_name is required' });
      return;
    }

    if (!event_type) {
      res.status(400).json({ error: 'event_type is required' });
      return;
    }

    // Generate event_id if not provided
    const event_id = randomUUID();

    // Use provided occurred_at or current timestamp
    const timestamp = occurred_at ? new Date(occurred_at) : new Date();

    // Insert event into database
    await mysqlPool.query(
      `INSERT INTO events (event_id, event_name, event_type, occurred_at, page_path, referrer, ad_source, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event_id,
        event_name,
        event_type,
        timestamp,
        page_path || null,
        referrer || null,
        ad_source || null,
        session_id || null
      ]
    ) as [any, any];

    res.status(201).json({
      message: 'Event created successfully',
      data: {
        event_id,
        event_name,
        event_type,
        occurred_at: timestamp,
        session_id: session_id || null
      }
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /events/sessions - Get latest sessions with their events
eventsRouter.get('/sessions', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { limit = 50 } = req.query;

    // Get latest sessions (grouped by session_id, ordered by latest event)
    const [sessionsResult] = await mysqlPool.query(
      `SELECT 
        session_id,
        MAX(occurred_at) as latest_event_at,
        COUNT(*) as event_count
       FROM events
       WHERE session_id IS NOT NULL
       GROUP BY session_id
       ORDER BY latest_event_at DESC
       LIMIT ?`,
      [parseInt(limit as string, 10)]
    ) as [any[], any];

    // For each session, get all its events
    const sessionsWithEvents = await Promise.all(
      sessionsResult.map(async (session: any) => {
        const [events] = await mysqlPool.query(
          `SELECT 
            event_id,
            event_name,
            event_type,
            occurred_at,
            page_path,
            referrer,
            ad_source,
            session_id
           FROM events
           WHERE session_id = ?
           ORDER BY occurred_at ASC`,
          [session.session_id]
        ) as [any[], any];

        return {
          session_id: session.session_id,
          latest_event_at: session.latest_event_at,
          event_count: session.event_count,
          events: events
        };
      })
    );

    res.status(200).json({
      message: 'Sessions retrieved successfully',
      data: sessionsWithEvents
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /events/summary - Get event analytics summary
eventsRouter.get('/summary', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    // Build date filter for all queries
    let dateFilter = '';
    const queryParams: any[] = [];

    if (start_date || end_date) {
      dateFilter = 'WHERE ';
      if (start_date) {
        dateFilter += 'occurred_at >= ?';
        queryParams.push(new Date(start_date as string));
      }
      if (start_date && end_date) {
        dateFilter += ' AND ';
      }
      if (end_date) {
        dateFilter += 'occurred_at <= ?';
        queryParams.push(new Date(end_date as string));
      }
    }

    // Build session filter (exclude NULL/unknown session_id)
    const sessionFilter = dateFilter 
      ? `${dateFilter} AND session_id IS NOT NULL`
      : 'WHERE session_id IS NOT NULL';
    const sessionParams = dateFilter ? [...queryParams] : [];

    // 1. Total events
    const [totalEventsResult] = await mysqlPool.query(
      `SELECT COUNT(*) as total FROM events ${dateFilter}`,
      queryParams
    ) as [any[], any];
    const totalEvents = totalEventsResult[0]?.total || 0;

    // 2. Total sessions (distinct session_ids, excluding NULL)
    const [totalSessionsResult] = await mysqlPool.query(
      `SELECT COUNT(DISTINCT session_id) as total FROM events ${sessionFilter}`,
      sessionParams
    ) as [any[], any];
    const totalSessions = totalSessionsResult[0]?.total || 0;

    // 3. Average events per session (excluding unknown session_id)
    const [avgEventsResult] = await mysqlPool.query(
      `SELECT 
        COUNT(*) as event_count,
        COUNT(DISTINCT session_id) as session_count
       FROM events ${sessionFilter}`,
      sessionParams
    ) as [any[], any];
    const eventCount = avgEventsResult[0]?.event_count || 0;
    const sessionCount = avgEventsResult[0]?.session_count || 0;
    const avgEventsPerSession = sessionCount > 0 ? (eventCount / sessionCount) : 0;

    // 4. Top 10 options (event_name, count) where event_type is 'option_selection'
    let optionsFilter = dateFilter 
      ? `${dateFilter} AND event_type = 'option_selection'`
      : "WHERE event_type = 'option_selection'";
    const [topOptionsResult] = await mysqlPool.query(
      `SELECT event_name, COUNT(*) as count 
       FROM events ${optionsFilter}
       GROUP BY event_name 
       ORDER BY count DESC 
       LIMIT 10`,
      queryParams
    ) as [any[], any];

    // 5. Top 10 CTAs (event_name, count) where event_type is 'cta_clicked'
    let ctaFilter = dateFilter 
      ? `${dateFilter} AND event_type = 'cta_clicked'`
      : "WHERE event_type = 'cta_clicked'";
    const [topCtasResult] = await mysqlPool.query(
      `SELECT event_name, COUNT(*) as count 
       FROM events ${ctaFilter}
       GROUP BY event_name 
       ORDER BY count DESC 
       LIMIT 10`,
      queryParams
    ) as [any[], any];

    // 6. Total leads (count where event_type = 'lead')
    let leadFilter = dateFilter 
      ? `${dateFilter} AND event_type = 'lead'`
      : "WHERE event_type = 'lead'";
    const [totalLeadsResult] = await mysqlPool.query(
      `SELECT COUNT(*) as total FROM events ${leadFilter}`,
      queryParams
    ) as [any[], any];
    const totalLeads = totalLeadsResult[0]?.total || 0;

    res.status(200).json({
      message: 'Event summary retrieved successfully',
      data: {
        average_events_per_session: Math.round(avgEventsPerSession * 100) / 100,
        total_events: totalEvents,
        total_sessions: totalSessions,
        total_leads: totalLeads,
        top_options: topOptionsResult,
        top_ctas: topCtasResult
      }
    });
  } catch (error) {
    console.error('Error fetching event summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default eventsRouter;

