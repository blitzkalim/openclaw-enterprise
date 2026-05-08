import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { getAllUsers } from '@openclaw/enterprise-shared/db/queries.js';
import { listApiTokens } from '@openclaw/enterprise-shared/db/queries.js';
import { listChannelIdentities } from '@openclaw/enterprise-shared/db/queries.js';
import { generateCsrfTokenForTemplate } from './csrf.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const router = new Hono();

/**
 * Simple template renderer (replaces {{variable}} with values).
 */
function renderTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  
  // Handle {{#if condition}}...{{/if}}
  result = result.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (_, condition, content) => {
    return data[condition] ? content : '';
  });
  
  // Handle {{#each array}}...{{/each}}
  result = result.replace(/{{#each (\w+)}}([\s\S]*?){{\/each}}/g, (_, arrayName, content) => {
    const array = data[arrayName] || [];
    return array.map((item: any) => {
      let itemContent = content;
      // Replace {{property}} with item property
      Object.keys(item).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        itemContent = itemContent.replace(regex, item[key]);
      });
      // Replace {{../property}} with parent property
      Object.keys(data).forEach(key => {
        if (key !== arrayName) {
          const regex = new RegExp(`{{../${key}}}`, 'g');
          itemContent = itemContent.replace(regex, data[key]);
        }
      });
      return itemContent;
    }).join('');
  });
  
  // Replace {{variable}}
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, data[key]);
  });
  
  return result;
}

/**
 * GET /login
 * Render login page.
 */
router.get('/login', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (team) {
    // Already logged in, redirect to team
    return c.redirect('/team');
  }
  
  const error = c.req.query('error');
  const csrfToken = generateCsrfTokenForTemplate('session');
  
  const loginHtml = await readFile(join(__dirname, 'web/login.html'), 'utf-8');
  const rendered = renderTemplate(loginHtml, { error, csrfToken });
  
  return c.html(rendered);
});

/**
 * GET /team
 * Render team admin page.
 */
router.get('/team', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.redirect('/login');
  }
  
  const csrfToken = generateCsrfTokenForTemplate(team.userId);
  
  // Fetch data
  const users = team.isAdmin ? await getAllUsers() : [];
  const tokens = await listApiTokens(team.userId);
  const identities = await listChannelIdentities(team.userId);
  const dlqCount = 0; // TODO: Fetch from BullMQ
  
  const teamHtml = await readFile(join(__dirname, 'web/team.html'), 'utf-8');
  const rendered = renderTemplate(teamHtml, {
    userName: team.name || team.email,
    isAdmin: team.isAdmin,
    csrfToken,
    users,
    tokens,
    identities,
    dlqCount,
  });
  
  return c.html(rendered);
});

export default router;
