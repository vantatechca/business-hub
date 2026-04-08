-- ============================================================
-- Business Hub V2 — Phase 1 Seed Data
-- Run AFTER migrate.sql
-- Passwords are bcrypt hashes of: admin123 / leader123 / member123
-- ============================================================

-- ── DEPARTMENTS (14, priority-ordered) ───────────────────────
INSERT INTO departments (id, name, slug, color, icon, priority_score, sort_order, description) VALUES
  ('d0000001-0000-0000-0000-000000000001', 'Sites',            'sites',            '#5b8ef8', '🌐', 95, 1,  'Shopify stores — core revenue asset'),
  ('d0000001-0000-0000-0000-000000000002', 'Payments',         'payments',         '#f87171', '💳', 92, 2,  'Stripe & Shopify Payments — no payments = no revenue'),
  ('d0000001-0000-0000-0000-000000000003', 'Orders',           'orders',           '#34d399', '📦', 90, 3,  'Daily order volume across all channels'),
  ('d0000001-0000-0000-0000-000000000004', 'GMC',              'gmc',              '#fbbf24', '🛒', 85, 4,  'Google Merchant Center — gates Google Ads'),
  ('d0000001-0000-0000-0000-000000000005', 'Google Ads',       'google-ads',       '#a78bfa', '📣', 82, 5,  'Paid traffic — depends on GMC'),
  ('d0000001-0000-0000-0000-000000000006', 'Gmail',            'gmail',            '#22d3ee', '📧', 75, 6,  'Gmail account network — needed for reviews & accounts'),
  ('d0000001-0000-0000-0000-000000000007', 'GMB',              'gmb',              '#84cc16', '⭐', 70, 7,  'Google My Business — social proof & reviews'),
  ('d0000001-0000-0000-0000-000000000008', 'Blogs',            'blogs',            '#fb923c', '✍️', 60, 8,  'SEO content — 400+ posts/month across 680 Shopify stores'),
  ('d0000001-0000-0000-0000-000000000009', 'Chat Support',     'chat-support',     '#e879f9', '💬', 55, 9,  'Customer experience — response time matters'),
  ('d0000001-0000-0000-0000-000000000010', 'Restock',          'restock',          '#6366f1', '🏭', 50, 10, 'Restock & supplier management'),
  ('d0000001-0000-0000-0000-000000000011', 'Revenue',          'revenue',          '#10b981', '💰', 45, 11, 'Revenue & expense financial tracking'),
  ('d0000001-0000-0000-0000-000000000012', 'Web Dev',          'web-dev',          '#0ea5e9', '🖥️', 40, 12, 'Web dev client projects — 3 active clients'),
  ('d0000001-0000-0000-0000-000000000013', 'Video',            'video',            '#f59e0b', '🎬', 30, 13, 'Video editing — support function'),
  ('d0000001-0000-0000-0000-000000000014', 'Game Dev',         'game-dev',         '#8b5cf6', '🎮', 20, 14, 'Game development — lowest operational urgency')
ON CONFLICT (slug) DO NOTHING;

-- ── METRICS (42 real metrics from the spec) ───────────────────

-- SITES (4 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'Sites connected to chat app',          'value',         'higher_better', 156, 600, 'count', 95, 1),
  ('m0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000001', 'Sites connected to CC payment router',  'value',         'higher_better',  82, 600, 'count', 92, 2),
  ('m0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000001', 'Sites connected to crypto & e-transfer','value',         'higher_better',   4, 600, 'count', 88, 3),
  ('m0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000001', 'Sites ready to sell',                  'daily',         'higher_better',   0,  50, 'count', 90, 4)
ON CONFLICT DO NOTHING;

-- PAYMENTS (4 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000002', 'Stripe APIs active',                   'value',         'higher_better',  0, 100, 'count', 92, 1),
  ('m0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000002', 'Stripe APIs banned',                   'value',         'lower_better',   0,   0, 'count', 92, 2),
  ('m0000001-0000-0000-0000-000000000007', 'd0000001-0000-0000-0000-000000000002', 'Shopify Payments active',              'value',         'higher_better',  0, 100, 'count', 90, 3),
  ('m0000001-0000-0000-0000-000000000008', 'd0000001-0000-0000-0000-000000000002', 'Shopify Payments banned',              'value',         'lower_better',   0,   0, 'count', 90, 4)
ON CONFLICT DO NOTHING;

-- ORDERS (5 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000009', 'd0000001-0000-0000-0000-000000000003', 'Shopify orders today',                 'daily',         'higher_better',  0, 50, 'count', 90, 1),
  ('m0000001-0000-0000-0000-000000000010', 'd0000001-0000-0000-0000-000000000003', 'Stripe orders today',                  'daily',         'higher_better',  0, 20, 'count', 88, 2),
  ('m0000001-0000-0000-0000-000000000011', 'd0000001-0000-0000-0000-000000000003', 'Crypto orders today (Nik Logic)',       'daily',         'higher_better',  0, 10, 'count', 85, 3),
  ('m0000001-0000-0000-0000-000000000012', 'd0000001-0000-0000-0000-000000000003', 'Crypto CC orders today (Onramp)',       'daily',         'higher_better',  0, 10, 'count', 85, 4),
  ('m0000001-0000-0000-0000-000000000013', 'd0000001-0000-0000-0000-000000000003', 'E-transfer orders today',              'daily',         'higher_better',  0, 15, 'count', 85, 5)
ON CONFLICT DO NOTHING;

-- GMAIL (4 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000014', 'd0000001-0000-0000-0000-000000000006', 'Gmail accounts active',                'value',         'higher_better', 250, 4000, 'count', 75, 1),
  ('m0000001-0000-0000-0000-000000000015', 'd0000001-0000-0000-0000-000000000006', 'Gmail accounts banned',                'value',         'lower_better',    5,    0, 'count', 75, 2),
  ('m0000001-0000-0000-0000-000000000016', 'd0000001-0000-0000-0000-000000000006', 'Gmail accounts warming up',            'value',         'higher_better', 150,  500, 'count', 72, 3),
  ('m0000001-0000-0000-0000-000000000017', 'd0000001-0000-0000-0000-000000000006', 'Gmails warmed up (ready for reviews)', 'value',         'higher_better', 120,  500, 'count', 72, 4)
ON CONFLICT DO NOTHING;

-- GMB (3 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000018', 'd0000001-0000-0000-0000-000000000007', 'Google My Business active',            'daily',         'higher_better',  0,  20, 'count', 70, 1),
  ('m0000001-0000-0000-0000-000000000019', 'd0000001-0000-0000-0000-000000000007', 'Reviews per day (total GMB)',           'daily',         'higher_better',  0,  50, 'count', 70, 2),
  ('m0000001-0000-0000-0000-000000000020', 'd0000001-0000-0000-0000-000000000007', 'Reviews shadow banned per day',         'daily',         'lower_better',   0,   0, 'count', 70, 3)
ON CONFLICT DO NOTHING;

-- GMC (7 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000021', 'd0000001-0000-0000-0000-000000000004', 'GMC approved total',                   'value',         'higher_better',   1, 100, 'count', 85, 1),
  ('m0000001-0000-0000-0000-000000000022', 'd0000001-0000-0000-0000-000000000004', 'GMC banned total',                     'value',         'lower_better',   85,   0, 'count', 85, 2),
  ('m0000001-0000-0000-0000-000000000023', 'd0000001-0000-0000-0000-000000000004', 'GMC accounts created today',           'daily',         'higher_better',   0,  10, 'count', 83, 3),
  ('m0000001-0000-0000-0000-000000000024', 'd0000001-0000-0000-0000-000000000004', 'GMC custom feeds created today',        'daily',         'higher_better',   0,   5, 'count', 80, 4),
  ('m0000001-0000-0000-0000-000000000025', 'd0000001-0000-0000-0000-000000000004', 'GMC submitted today',                  'daily',         'higher_better',   0,  10, 'count', 82, 5),
  ('m0000001-0000-0000-0000-000000000026', 'd0000001-0000-0000-0000-000000000004', 'GMC approved today',                   'daily',         'higher_better',   0,   5, 'count', 85, 6),
  ('m0000001-0000-0000-0000-000000000027', 'd0000001-0000-0000-0000-000000000004', 'GMC banned today',                     'daily',         'lower_better',    0,   0, 'count', 85, 7)
ON CONFLICT DO NOTHING;

-- GOOGLE ADS (5 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000028', 'd0000001-0000-0000-0000-000000000005', 'Google Ads accounts created today',    'daily',         'higher_better',  0,  5, 'count',  82, 1),
  ('m0000001-0000-0000-0000-000000000029', 'd0000001-0000-0000-0000-000000000005', 'Google Ads connected to GMC feed today','daily',         'higher_better',  0,  5, 'count',  82, 2),
  ('m0000001-0000-0000-0000-000000000030', 'd0000001-0000-0000-0000-000000000005', 'Performance Max campaigns created today','daily',        'higher_better',  0,  3, 'count',  80, 3),
  ('m0000001-0000-0000-0000-000000000031', 'd0000001-0000-0000-0000-000000000005', 'Google Ads spend today (USD)',          'daily',         'lower_better',   0, 500, 'USD',   80, 4),
  ('m0000001-0000-0000-0000-000000000032', 'd0000001-0000-0000-0000-000000000005', 'Google Ads sales today (USD)',          'daily',         'higher_better',  0, 1000, 'USD',  82, 5)
ON CONFLICT DO NOTHING;

-- BLOGS (1 metric)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000033', 'd0000001-0000-0000-0000-000000000008', 'Blogs posted (all 680 Shopify, last 7 days)', 'daily', 'higher_better', 0, 400, 'count', 60, 1)
ON CONFLICT DO NOTHING;

-- CHAT SUPPORT (1 metric)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000034', 'd0000001-0000-0000-0000-000000000009', 'Avg response time (minutes)',           'daily',         'lower_better',   0,   5, 'minutes', 55, 1)
ON CONFLICT DO NOTHING;

-- RESTOCK (2 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000035', 'd0000001-0000-0000-0000-000000000010', 'Active suppliers',                     'value',         'higher_better',  0,  10, 'count', 50, 1),
  ('m0000001-0000-0000-0000-000000000036', 'd0000001-0000-0000-0000-000000000010', 'Pending restock orders',               'value',         'lower_better',   0,   0, 'count', 50, 2)
ON CONFLICT DO NOTHING;

-- REVENUE (1 metric)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000037', 'd0000001-0000-0000-0000-000000000011', 'Net revenue this month (CAD)',          'value',         'higher_better',  0, 50000, 'CAD', 45, 1)
ON CONFLICT DO NOTHING;

-- WEB DEV (3 metrics)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000038', 'd0000001-0000-0000-0000-000000000012', 'Active web dev clients',               'value',         'higher_better',  3,  10, 'count', 40, 1),
  ('m0000001-0000-0000-0000-000000000039', 'd0000001-0000-0000-0000-000000000012', 'Projects in progress',                 'value',         'higher_better',  2,   5, 'count', 40, 2),
  ('m0000001-0000-0000-0000-000000000040', 'd0000001-0000-0000-0000-000000000012', 'Projects delivered this month',        'value',         'higher_better',  0,   3, 'count', 40, 3)
ON CONFLICT DO NOTHING;

-- VIDEO (1 metric)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000041', 'd0000001-0000-0000-0000-000000000013', 'Videos completed this month',          'value',         'higher_better',  0,  10, 'count', 30, 1)
ON CONFLICT DO NOTHING;

-- GAME DEV (1 metric)
INSERT INTO metrics (id, department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000042', 'd0000001-0000-0000-0000-000000000014', 'Game dev milestones completed',        'value',         'higher_better',  0,  12, 'count', 20, 1)
ON CONFLICT DO NOTHING;

-- ── USERS ────────────────────────────────────────────────────
-- Admin: Andrei (password: admin123)
INSERT INTO users (id, email, name, password_hash, role) VALUES
  ('u0000001-0000-0000-0000-000000000001', 'admin@hub.com',    'Andrei',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Leaders (password: leader123)
INSERT INTO users (id, email, name, password_hash, role) VALUES
  ('u0000001-0000-0000-0000-000000000002', 'mathieu@hub.com',  'Mathieu',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'leader'),
  ('u0000001-0000-0000-0000-000000000003', 'fernanda@hub.com', 'Fernanda',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'leader'),
  ('u0000001-0000-0000-0000-000000000004', 'brisson@hub.com',  'Brisson',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'leader'),
  ('u0000001-0000-0000-0000-000000000005', 'gauthier@hub.com', 'Gauthier',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'leader'),
  ('u0000001-0000-0000-0000-000000000006', 'dana@hub.com',     'Dana',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'leader')
ON CONFLICT (email) DO NOTHING;

-- Members (password: member123) — key operational team
INSERT INTO users (id, email, name, password_hash, role) VALUES
  ('u0000001-0000-0000-0000-000000000007', 'renold@hub.com',   'Renold',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000008', 'tristan@hub.com',  'Tristan',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000009', 'launce@hub.com',   'Launce',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000010', 'joshua@hub.com',   'Joshua',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000011', 'jaxyl@hub.com',    'Jaxyl',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000012', 'jerome@hub.com',   'Jerome',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000013', 'mark@hub.com',     'Mark',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000014', 'ilce@hub.com',     'Ilce',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000015', 'ohna@hub.com',     'Ohna',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000016', 'angelito@hub.com', 'Angelito',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000017', 'nathan@hub.com',   'Nathan',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000018', 'valerie@hub.com',  'Valerie',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000019', 'eric@hub.com',     'Eric',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000020', 'mik@hub.com',      'Mik',       '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000021', 'nate@hub.com',     'Nate',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000022', 'claire@hub.com',   'Claire',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000023', 'barcha@hub.com',   'Barcha',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member'),
  ('u0000001-0000-0000-0000-000000000024', 'jordan@hub.com',   'Jordan',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'member')
ON CONFLICT (email) DO NOTHING;

-- ── METRIC ASSIGNMENTS (from spec Appendix B) ─────────────────

-- Shopify orders → Renold, Tristan, Launce, Joshua, Jaxyl, Jerome
INSERT INTO metric_assignments (metric_id, user_id, role_in_metric) VALUES
  ('m0000001-0000-0000-0000-000000000009', 'u0000001-0000-0000-0000-000000000007', 'contributor'),
  ('m0000001-0000-0000-0000-000000000009', 'u0000001-0000-0000-0000-000000000008', 'contributor'),
  ('m0000001-0000-0000-0000-000000000009', 'u0000001-0000-0000-0000-000000000009', 'contributor'),
  ('m0000001-0000-0000-0000-000000000009', 'u0000001-0000-0000-0000-000000000010', 'contributor'),
  ('m0000001-0000-0000-0000-000000000009', 'u0000001-0000-0000-0000-000000000011', 'contributor'),
  ('m0000001-0000-0000-0000-000000000009', 'u0000001-0000-0000-0000-000000000012', 'contributor')
ON CONFLICT DO NOTHING;

-- Gmail → Jerome (owner, target 4000)
INSERT INTO metric_assignments (metric_id, user_id, role_in_metric) VALUES
  ('m0000001-0000-0000-0000-000000000014', 'u0000001-0000-0000-0000-000000000012', 'owner'),
  ('m0000001-0000-0000-0000-000000000015', 'u0000001-0000-0000-0000-000000000012', 'owner'),
  ('m0000001-0000-0000-0000-000000000016', 'u0000001-0000-0000-0000-000000000012', 'owner'),
  ('m0000001-0000-0000-0000-000000000017', 'u0000001-0000-0000-0000-000000000012', 'owner')
ON CONFLICT DO NOTHING;

-- GMB → Mark, Ilce, Ohna
INSERT INTO metric_assignments (metric_id, user_id, role_in_metric) VALUES
  ('m0000001-0000-0000-0000-000000000018', 'u0000001-0000-0000-0000-000000000013', 'contributor'),
  ('m0000001-0000-0000-0000-000000000018', 'u0000001-0000-0000-0000-000000000014', 'contributor'),
  ('m0000001-0000-0000-0000-000000000018', 'u0000001-0000-0000-0000-000000000015', 'contributor'),
  ('m0000001-0000-0000-0000-000000000019', 'u0000001-0000-0000-0000-000000000013', 'contributor'),
  ('m0000001-0000-0000-0000-000000000019', 'u0000001-0000-0000-0000-000000000014', 'contributor'),
  ('m0000001-0000-0000-0000-000000000019', 'u0000001-0000-0000-0000-000000000015', 'contributor')
ON CONFLICT DO NOTHING;

-- Blogs → Angelito, Tristan, Nathan
INSERT INTO metric_assignments (metric_id, user_id, role_in_metric) VALUES
  ('m0000001-0000-0000-0000-000000000033', 'u0000001-0000-0000-0000-000000000016', 'contributor'),
  ('m0000001-0000-0000-0000-000000000033', 'u0000001-0000-0000-0000-000000000008', 'contributor'),
  ('m0000001-0000-0000-0000-000000000033', 'u0000001-0000-0000-0000-000000000017', 'contributor')
ON CONFLICT DO NOTHING;

-- Chat support → Valerie, Eric, Mik, Nate, Claire
INSERT INTO metric_assignments (metric_id, user_id, role_in_metric) VALUES
  ('m0000001-0000-0000-0000-000000000034', 'u0000001-0000-0000-0000-000000000018', 'contributor'),
  ('m0000001-0000-0000-0000-000000000034', 'u0000001-0000-0000-0000-000000000019', 'contributor'),
  ('m0000001-0000-0000-0000-000000000034', 'u0000001-0000-0000-0000-000000000020', 'contributor'),
  ('m0000001-0000-0000-0000-000000000034', 'u0000001-0000-0000-0000-000000000021', 'contributor'),
  ('m0000001-0000-0000-0000-000000000034', 'u0000001-0000-0000-0000-000000000022', 'contributor')
ON CONFLICT DO NOTHING;

-- GMC + Google Ads → Barcha, Renold, Launce, Joshua, Tristan, Jordan
INSERT INTO metric_assignments (metric_id, user_id, role_in_metric) VALUES
  ('m0000001-0000-0000-0000-000000000021', 'u0000001-0000-0000-0000-000000000023', 'owner'),
  ('m0000001-0000-0000-0000-000000000021', 'u0000001-0000-0000-0000-000000000007', 'contributor'),
  ('m0000001-0000-0000-0000-000000000021', 'u0000001-0000-0000-0000-000000000009', 'contributor'),
  ('m0000001-0000-0000-0000-000000000021', 'u0000001-0000-0000-0000-000000000010', 'contributor'),
  ('m0000001-0000-0000-0000-000000000021', 'u0000001-0000-0000-0000-000000000008', 'contributor'),
  ('m0000001-0000-0000-0000-000000000021', 'u0000001-0000-0000-0000-000000000024', 'contributor'),
  ('m0000001-0000-0000-0000-000000000022', 'u0000001-0000-0000-0000-000000000023', 'owner'),
  ('m0000001-0000-0000-0000-000000000022', 'u0000001-0000-0000-0000-000000000007', 'contributor'),
  ('m0000001-0000-0000-0000-000000000023', 'u0000001-0000-0000-0000-000000000023', 'owner'),
  ('m0000001-0000-0000-0000-000000000025', 'u0000001-0000-0000-0000-000000000023', 'owner'),
  ('m0000001-0000-0000-0000-000000000026', 'u0000001-0000-0000-0000-000000000023', 'owner')
ON CONFLICT DO NOTHING;

-- ── DAILY PROMPTS ─────────────────────────────────────────────
INSERT INTO daily_prompts (prompt_text, prompt_type, department_id) VALUES
  ('What did you accomplish today? Be specific about numbers.', 'universal', NULL),
  ('Any blockers or issues stopping your progress?', 'universal', NULL),
  ('How many Shopify orders were processed today? Any payment issues?', 'department', 'd0000001-0000-0000-0000-000000000003'),
  ('How many GMC accounts did you create, submit, and get approved/banned today?', 'department', 'd0000001-0000-0000-0000-000000000004'),
  ('How many Gmail accounts did you create or warm up today? Current total?', 'department', 'd0000001-0000-0000-0000-000000000006'),
  ('How many GMB reviews were posted today? Any shadow bans detected?', 'department', 'd0000001-0000-0000-0000-000000000007'),
  ('How many blog posts were published today across which stores?', 'department', 'd0000001-0000-0000-0000-000000000008'),
  ('What was the average chat response time today? Any difficult tickets?', 'department', 'd0000001-0000-0000-0000-000000000009')
ON CONFLICT DO NOTHING;
