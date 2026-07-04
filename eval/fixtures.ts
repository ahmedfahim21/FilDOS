/**
 * Fixture documents and queries for the recall@k eval. Each document becomes a
 * real file on disk; each query names the documents that should appear in the
 * top-k results. Aim for real-world variety: code, docs, notes, data files.
 */

export interface Fixture {
  name: string;
  content: string;
}

export interface Query {
  q: string;
  /** Basenames of the files that should appear in the result set. */
  expected: string[];
}

export const FIXTURES: Fixture[] = [
  // Source code
  {
    name: 'auth.ts',
    content: `
import jwt from 'jsonwebtoken';
export function verifyToken(token: string): Payload {
  return jwt.verify(token, process.env.JWT_SECRET!) as Payload;
}
export function signToken(payload: Payload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' });
}`,
  },
  {
    name: 'database.ts',
    content: `
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}`,
  },
  {
    name: 'cache.ts',
    content: `
import Redis from 'ioredis';
const client = new Redis(process.env.REDIS_URL);
export async function get(key: string): Promise<string | null> {
  return client.get(key);
}
export async function set(key: string, value: string, ttl = 3600): Promise<void> {
  await client.setex(key, ttl, value);
}`,
  },
  {
    name: 'emailService.ts',
    content: `
import nodemailer from 'nodemailer';
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({ from: 'noreply@app.com', to, subject, html });
}`,
  },
  {
    name: 'rateLimiter.ts',
    content: `
export function rateLimit(windowMs: number, max: number) {
  const requests = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    const hits = (requests.get(ip) ?? []).filter(t => now - t < windowMs);
    hits.push(now);
    requests.set(ip, hits);
    return hits.length <= max;
  };
}`,
  },
  // Documentation
  {
    name: 'api-guide.md',
    content: `
# REST API Guide
All endpoints require an Authorization header with a Bearer token obtained from /auth/login.
Rate limiting is enforced at 100 requests per minute per IP address.
Pagination uses cursor-based navigation; pass the cursor from the previous response.
Error responses always include a machine-readable code and a human-readable message.`,
  },
  {
    name: 'deployment.md',
    content: `
# Deployment Guide
Build the Docker image: \`docker build -t myapp .\`
Push to registry and update the Kubernetes deployment manifest.
Secrets are managed via AWS Secrets Manager; never commit credentials to git.
Zero-downtime deploys use rolling updates with a 60s readiness probe timeout.`,
  },
  {
    name: 'CHANGELOG.md',
    content: `
# Changelog
## v2.3.0
- Added multi-factor authentication support
- Fixed race condition in session renewal
- Improved search performance with vector indexing
## v2.2.1
- Security patch for XSS in the user profile page
- Updated dependencies to address CVE-2024-1234`,
  },
  {
    name: 'architecture.md',
    content: `
# System Architecture
The backend is split into three services: API gateway, auth service, and data service.
Communication uses gRPC internally and REST externally.
State is stored in PostgreSQL for relational data and Redis for ephemeral cache.
The message queue is RabbitMQ; consumers are horizontally scalable workers.`,
  },
  {
    name: 'onboarding.md',
    content: `
# Developer Onboarding
Clone the repo and run \`npm install\` to install dependencies.
Copy .env.example to .env and fill in local database credentials.
Run \`npm run dev\` to start the development server with hot reload.
Tests: \`npm test\` for unit tests, \`npm run test:e2e\` for end-to-end.`,
  },
  // Notes and prose
  {
    name: 'meeting-notes-2024-03.txt',
    content: `
Meeting: Product roadmap Q2 2024
Attendees: Alice, Bob, Carol
Decision: Prioritise search feature over mobile app redesign.
Action items: Bob to spec out semantic search by Friday.
              Carol to investigate vector database options.
Next meeting: April 2.`,
  },
  {
    name: 'ideas.txt',
    content: `
Feature ideas backlog
- Dark mode for the dashboard
- CSV export for all reports
- Webhook support for third-party integrations
- Bulk delete for admin users
- Two-factor authentication via TOTP or SMS
- Public API with OAuth2 scopes`,
  },
  {
    name: 'bug-report-432.txt',
    content: `
Bug #432: Login fails on Safari when cookies are blocked
Steps to reproduce:
1. Open Safari with ITP strict mode enabled
2. Navigate to /login and enter valid credentials
3. Observe: redirect loop; user never reaches dashboard
Root cause: Session cookie requires SameSite=None but Safari rejects it
without Secure flag on localhost.
Fix: set Secure flag conditionally based on HTTPS_ONLY env var.`,
  },
  {
    name: 'performance-analysis.txt',
    content: `
Performance Analysis: Database query latency
P50: 12ms, P95: 89ms, P99: 340ms
Slow queries identified via EXPLAIN ANALYZE:
- User lookup by email: missing index on users.email
- Report aggregation: full table scan on events table (50M rows)
Recommended fixes: add composite index, materialise hourly summaries.`,
  },
  {
    name: 'security-review.txt',
    content: `
Security review findings - March 2024
HIGH: SQL injection risk in legacy search endpoint (line 234 of search.js)
MEDIUM: Session tokens not rotated after privilege escalation
LOW: Verbose error messages leak stack traces in production
All HIGH findings must be fixed before next release.
Penetration test scheduled for April 15.`,
  },
  // Data files
  {
    name: 'config.json',
    content: JSON.stringify({
      server: { port: 3000, host: '0.0.0.0' },
      database: { pool: { min: 2, max: 20 }, timeout: 5000 },
      cache: { ttl: 3600, maxSize: 1000 },
      features: { search: true, notifications: false, analytics: true },
    }, null, 2),
  },
  {
    name: 'package-lock-snippet.json',
    content: JSON.stringify({
      name: 'myapp',
      lockfileVersion: 3,
      dependencies: {
        express: { version: '4.18.2', resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz' },
        jsonwebtoken: { version: '9.0.2', resolved: 'https://registry.npmjs.org/jsonwebtoken/-/jsonwebtoken-9.0.2.tgz' },
      },
    }, null, 2),
  },
  {
    name: 'schema.sql',
    content: `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL
);`,
  },
  {
    name: 'queries.sql',
    content: `
-- Active session count per user
SELECT user_id, COUNT(*) as session_count
FROM sessions WHERE expires_at > NOW()
GROUP BY user_id ORDER BY session_count DESC;
-- Recent login failures
SELECT email, COUNT(*) as failures, MAX(created_at) as last_attempt
FROM login_attempts WHERE success = false AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY email HAVING COUNT(*) > 5;`,
  },
  {
    name: 'Makefile',
    content: `
.PHONY: build test lint deploy
build:
\tdocker build -t myapp:latest .
test:
\tnpm test && npm run test:e2e
lint:
\teslint src/ --ext .ts,.tsx
deploy:
\tkubectl set image deployment/myapp myapp=myapp:latest`,
  },
  // More diverse content
  {
    name: 'search-design.md',
    content: `
# Search Feature Design
We will implement hybrid search combining vector embeddings (BGE Base) with BM25
keyword matching. The two result sets are fused using Reciprocal Rank Fusion (RRF).
A cross-encoder reranker (MS-MARCO) optionally re-scores the top-50 candidates.
Vector store: SQLite with Float32 BLOBs. BM25: minisearch in-memory index.`,
  },
  {
    name: 'terraform-main.tf',
    content: `
provider "aws" { region = "us-east-1" }
resource "aws_db_instance" "main" {
  engine         = "postgres"
  instance_class = "db.t3.medium"
  allocated_storage = 100
  db_name  = "myapp"
  username = var.db_username
  password = var.db_password
}`,
  },
  {
    name: 'cron-jobs.md',
    content: `
# Scheduled Jobs
- Daily at 2am: purge expired sessions from the database
- Every 15 minutes: sync user data from the external CRM API
- Weekly on Sunday: generate usage reports and email to admin
- Hourly: recompute recommendation scores for active users
All jobs run via the worker process; failures are logged and retried once.`,
  },
  {
    name: 'observability.md',
    content: `
# Observability Setup
Metrics: Prometheus + Grafana dashboards for request rate, latency, error rate.
Logs: structured JSON via Winston, shipped to Elasticsearch via Filebeat.
Traces: OpenTelemetry with Jaeger backend for distributed request tracing.
Alerts: PagerDuty integration; on-call rotation defined in OpsGenie.`,
  },
  {
    name: 'privacy-policy.txt',
    content: `
Privacy Policy (last updated March 2024)
We collect only the data necessary to provide our service: email, usage logs,
and payment information processed by Stripe. We never sell personal data.
Users may request deletion of their account and all associated data at any time.
Logs are retained for 90 days for security purposes, then permanently deleted.`,
  },
];

export const QUERIES: Query[] = [
  { q: 'JWT authentication token verification', expected: ['auth.ts'] },
  { q: 'PostgreSQL database connection pooling', expected: ['database.ts'] },
  { q: 'Redis cache set get expiry', expected: ['cache.ts'] },
  { q: 'send email nodemailer SMTP', expected: ['emailService.ts'] },
  { q: 'rate limiting requests per minute per IP', expected: ['rateLimiter.ts'] },
  { q: 'Docker Kubernetes deployment rolling update', expected: ['deployment.md'] },
  { q: 'session cookie Safari SameSite bug fix', expected: ['bug-report-432.txt'] },
  { q: 'slow query performance index database latency', expected: ['performance-analysis.txt'] },
  { q: 'SQL injection security vulnerability high', expected: ['security-review.txt'] },
  { q: 'BM25 RRF vector hybrid search cross-encoder', expected: ['search-design.md'] },
  { q: 'user email table index schema create', expected: ['schema.sql'] },
  { q: 'session expiry purge cron scheduled job', expected: ['cron-jobs.md'] },
  { q: 'Prometheus Grafana metrics monitoring latency', expected: ['observability.md'] },
  { q: 'meeting product roadmap semantic search feature', expected: ['meeting-notes-2024-03.txt'] },
  { q: 'changelog security patch XSS CVE', expected: ['CHANGELOG.md'] },
];
