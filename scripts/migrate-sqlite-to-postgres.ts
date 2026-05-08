#!/usr/bin/env node
/**
 * Migration script: SQLite → Postgres
 * 
 * Reads data from a legacy SQLite database and migrates it to Postgres.
 * This is a one-time migration for existing OpenClaw deployments.
 * 
 * Usage:
 *   node scripts/migrate-sqlite-to-postgres.ts /path/to/openclaw.db
 * 
 * Environment variables:
 *   DATABASE_URL - Postgres connection string
 *   SQLITE_PATH - Path to SQLite database (optional, can be passed as argument)
 */

import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQLITE_PATH = process.argv[2] || process.env.SQLITE_PATH;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SQLITE_PATH) {
  console.error('Error: SQLite path not provided. Pass as argument or set SQLITE_PATH env var.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL not set.');
  process.exit(1);
}

console.log(`Migrating from SQLite: ${SQLITE_PATH}`);
console.log(`Migrating to Postgres: ${DATABASE_URL}`);

// Open SQLite
const sqlite = new Database(SQLITE_PATH);

// Connect to Postgres
const pg = new Pool({ connectionString: DATABASE_URL });

async function migrate() {
  try {
    // Migrate workspaces
    console.log('Migrating workspaces...');
    const workspaces = sqlite.prepare('SELECT * FROM workspaces').all();
    for (const ws of workspaces) {
      await pg.query(
        `INSERT INTO workspaces (id, name, created_at) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO NOTHING`,
        [ws.id, ws.name, ws.created_at]
      );
    }
    console.log(`Migrated ${workspaces.length} workspaces`);

    // Migrate users
    console.log('Migrating users...');
    const users = sqlite.prepare('SELECT * FROM users').all();
    for (const user of users) {
      await pg.query(
        `INSERT INTO users (id, email, password_hash, name, is_admin, workspace_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, user.password_hash, user.name, user.is_admin, user.workspace_id, user.status, user.created_at]
      );
    }
    console.log(`Migrated ${users.length} users`);

    // Migrate user_sessions
    console.log('Migrating user_sessions...');
    const sessions = sqlite.prepare('SELECT * FROM user_sessions').all();
    for (const session of sessions) {
      await pg.query(
        `INSERT INTO user_sessions (id, user_id, token_hash, ip, user_agent, created_at, expires_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [session.id, session.user_id, session.token_hash, session.ip, session.user_agent, session.created_at, session.expires_at, session.revoked_at]
      );
    }
    console.log(`Migrated ${sessions.length} user_sessions`);

    // Migrate api_tokens
    console.log('Migrating api_tokens...');
    const tokens = sqlite.prepare('SELECT * FROM api_tokens').all();
    for (const token of tokens) {
      await pg.query(
        `INSERT INTO api_tokens (id, user_id, name, hash, created_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [token.id, token.user_id, token.name, token.hash, token.created_at, token.last_used_at]
      );
    }
    console.log(`Migrated ${tokens.length} api_tokens`);

    // Migrate channel_identities
    console.log('Migrating channel_identities...');
    const identities = sqlite.prepare('SELECT * FROM channel_identities').all();
    for (const identity of identities) {
      await pg.query(
        `INSERT INTO channel_identities (id, user_id, channel, external_id, display_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [identity.id, identity.user_id, identity.channel, identity.external_id, identity.display_name, identity.created_at]
      );
    }
    console.log(`Migrated ${identities.length} channel_identities`);

    // Migrate channel_claims
    console.log('Migrating channel_claims...');
    const claims = sqlite.prepare('SELECT * FROM channel_claims').all();
    for (const claim of claims) {
      await pg.query(
        `INSERT INTO channel_claims (id, channel, external_id, claim_code, mode, workspace_id, expires_at, claimed_by, claimed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [claim.id, claim.channel, claim.external_id, claim.claim_code, claim.mode, claim.workspace_id, claim.expires_at, claim.claimed_by, claim.claimed_at, claim.created_at]
      );
    }
    console.log(`Migrated ${claims.length} channel_claims`);

    // Migrate workspace_secrets
    console.log('Migrating workspace_secrets...');
    const secrets = sqlite.prepare('SELECT * FROM workspace_secrets').all();
    for (const secret of secrets) {
      await pg.query(
        `INSERT INTO workspace_secrets (workspace_id, secret_type, encrypted_val, iv)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, secret_type) DO NOTHING`,
        [secret.workspace_id, secret.secret_type, secret.encrypted_val, secret.iv]
      );
    }
    console.log(`Migrated ${secrets.length} workspace_secrets`);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

migrate();
