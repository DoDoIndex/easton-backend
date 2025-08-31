import { Response } from 'express';
import fetch from 'node-fetch';

export const unauthorized = (res: Response, message: string = 'Unauthorized') => {
  res.status(401).json({ error: message });
};

export const forbidden = (res: Response, message: string = 'Forbidden') => {
  res.status(403).json({ error: message });
};

const API_URL = "https://api.jobtread.com/pave";
const GRANT_KEY = process.env.JOBTREAD_GRANT_KEY;

export async function jobtread(query: any) {
  if (!GRANT_KEY) {
    throw new Error('JobTread grant key not configured');
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { 
      "content-type": "text/plain;charset=UTF-8",
      "accept": "*/*"
    },
    body: JSON.stringify({ 
      query: { 
        $: { 
          grantKey: GRANT_KEY 
        }, 
        ...query 
      } 
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`JobTread API error: ${res.status} ${res.statusText} - ${errorText}`);
  }

  return res.json();
} 