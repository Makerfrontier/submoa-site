-- SubMoa Content DB schema (synced from remote submoacontent-db)
-- Dumped from sqlite_master; do not edit by hand — re-run the sync instead.

-- Tables
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;
CREATE TABLE access_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL
, account_id TEXT DEFAULT 'makerfrontier');
CREATE TABLE agent_skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, content TEXT NOT NULL, active INTEGER DEFAULT 1, updated_at INTEGER);
CREATE TABLE api_token_cache (key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE api_usage_log (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  title TEXT,
  api_name TEXT NOT NULL,         
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,                      
  latency_ms INTEGER,
  status TEXT DEFAULT 'ok',       
  created_at INTEGER NOT NULL
);
CREATE TABLE article_feedback (id TEXT PRIMARY KEY, submission_id TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, star_rating INTEGER NOT NULL, notes TEXT DEFAULT NULL, q1_author_voice INTEGER DEFAULT NULL, q2_factual_accuracy INTEGER DEFAULT NULL, q3_optimization_met INTEGER DEFAULT NULL, q4_no_ai_patterns INTEGER DEFAULT NULL, q5_publish_ready INTEGER DEFAULT NULL, created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE TABLE article_flags (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, user_id TEXT NOT NULL, selected_text TEXT, comment TEXT, flag_type TEXT NOT NULL DEFAULT 'revision', char_offset_start INTEGER, char_offset_end INTEGER, status TEXT NOT NULL DEFAULT 'open', fact_check_result TEXT, fact_check_verdict TEXT, created_at INTEGER NOT NULL, account_id TEXT DEFAULT 'makerfrontier', FOREIGN KEY (submission_id) REFERENCES submissions(id));
CREATE TABLE author_profiles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  style_guide TEXT NOT NULL,
  keyword_themes TEXT,
  semantic_entities TEXT,
  description TEXT,
  rss_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'rss',
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, account_id TEXT DEFAULT 'makerfrontier', tts_voice_id TEXT DEFAULT 'alloy', quality_threshold INTEGER DEFAULT 80);
CREATE TABLE email_assets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE email_submissions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  preheader_text TEXT,
  brand_name TEXT,
  primary_color TEXT DEFAULT '#c8973a',
  secondary_color TEXT DEFAULT '#0f200f',
  brand_voice TEXT,
  logo_url TEXT,
  cta_text TEXT,
  cta_url TEXT,
  unsubscribe_url TEXT,
  company_address TEXT,
  sections TEXT,
  sendgrid_api_key TEXT,
  aweber_account TEXT,
  api_push_enabled INTEGER DEFAULT 0,
  api_push_service TEXT,
  email_status TEXT DEFAULT NULL,
  html_r2_key TEXT,
  txt_r2_key TEXT,
  assembled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL,
  subject_line TEXT,
  preheader_text TEXT,
  brand_name TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  brand_voice TEXT,
  logo_url TEXT,
  cta_text TEXT,
  cta_url TEXT,
  unsubscribe_url TEXT,
  company_address TEXT,
  sections TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE feedback (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, user_id TEXT NOT NULL, rating INTEGER NOT NULL, what_worked TEXT, what_needs_work TEXT, created_at INTEGER NOT NULL, account_id TEXT DEFAULT 'makerfrontier');
CREATE TABLE flag_analytics (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, flag_type TEXT, original_text TEXT, chosen_resolution TEXT, llm_slot INTEGER, author_profile TEXT, article_format TEXT, fact_check_verdict TEXT, overall_rating INTEGER, sounds_like_author INTEGER, factually_accurate INTEGER, meets_optimization INTEGER, free_of_ai_patterns INTEGER, would_publish INTEGER, notes TEXT, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE grades (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  grammar_score INTEGER,
  readability_score INTEGER,
  ai_detection_score INTEGER,
  plagiarism_score INTEGER,
  seo_score INTEGER,
  overall_score INTEGER,
  rewrite_attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  graded_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE infographic_styles (id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT, colour_palette TEXT, font_style TEXT, layout_preference TEXT DEFAULT 'vertical', active INTEGER DEFAULT 1);
CREATE TABLE infographic_submissions (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE, design_style TEXT NOT NULL, infographic_type TEXT, layout TEXT DEFAULT 'vertical', primary_stat TEXT, max_data_points INTEGER DEFAULT 5, brand_colour TEXT, output_format TEXT DEFAULT 'both', cta_text TEXT, infographic_status TEXT DEFAULT NULL, infographic_data TEXT, svg_r2_key TEXT, png_r2_key TEXT, assembled_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  used_by TEXT,
  used_at INTEGER,
  max_uses INTEGER DEFAULT 1,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
, email TEXT, name TEXT, token TEXT, status TEXT DEFAULT 'pending', account_id TEXT DEFAULT 'makerfrontier');
CREATE TABLE itinerary_flags (id TEXT PRIMARY KEY, itinerary_id TEXT NOT NULL, section_id TEXT NOT NULL, section_title TEXT DEFAULT NULL, selected_text TEXT DEFAULT NULL, comment TEXT NOT NULL, flag_type TEXT DEFAULT 'edit', status TEXT DEFAULT 'open', created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE itinerary_submissions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, title TEXT NOT NULL, situation TEXT NOT NULL, clarifications TEXT DEFAULT NULL, recap TEXT DEFAULT NULL, additions TEXT DEFAULT NULL, plan_json TEXT DEFAULT NULL, plan_html TEXT DEFAULT NULL, revised_plan_json TEXT DEFAULT NULL, revised_plan_html TEXT DEFAULT NULL, status TEXT DEFAULT 'draft', pdf_r2_key TEXT DEFAULT NULL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE llm_config (slot INTEGER PRIMARY KEY, model_string TEXT NOT NULL, display_name TEXT NOT NULL, descriptor TEXT NOT NULL, warning_badge TEXT DEFAULT NULL, is_active INTEGER DEFAULT 1, updated_at INTEGER);
CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, link TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER NOT NULL, account_id TEXT DEFAULT 'makerfrontier');
CREATE TABLE password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, account_id TEXT DEFAULT 'makerfrontier');
CREATE TABLE presentation_submissions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  template_r2_key TEXT NOT NULL,
  template_filename TEXT NOT NULL,
  slide_count_target INTEGER DEFAULT NULL,
  key_details TEXT,
  structured_notes TEXT,
  include_charts INTEGER DEFAULT 0,
  include_images INTEGER DEFAULT 0,
  image_r2_keys TEXT DEFAULT NULL,
  presentation_status TEXT DEFAULT NULL,
  pptx_r2_key TEXT DEFAULT NULL,
  slide_count_actual INTEGER DEFAULT NULL,
  assembled_at INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  desired_outcome TEXT,
  llm TEXT,
  prompt_content TEXT NOT NULL,
  conversation TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE revision_reviews (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, flag_id TEXT NOT NULL, original_text TEXT NOT NULL, context_buffer TEXT, finding TEXT, option_remove TEXT, option_a TEXT, option_b TEXT, chosen_option TEXT DEFAULT NULL, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE share_links (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  author TEXT NOT NULL,
  article_format TEXT NOT NULL,
  vocal_tone TEXT,
  min_word_count TEXT NOT NULL,
  product_link TEXT,
  target_keywords TEXT,
  seo_research INTEGER DEFAULT 0,
  human_observation TEXT NOT NULL,
  anecdotal_stories TEXT,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, content_path TEXT, article_content TEXT, revision_notes TEXT, is_hidden INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, deleted_at INTEGER, seo_report_content TEXT, optimization_target TEXT, tone_stance TEXT, include_faq INTEGER DEFAULT 0, has_images INTEGER DEFAULT 0, account_id TEXT DEFAULT 'makerfrontier', submission_type TEXT DEFAULT 'brief', source_url TEXT, source_content TEXT, analysis_report TEXT, grade_status TEXT DEFAULT 'ungraded', grammar_score INTEGER, readability_score INTEGER, ai_detection_score INTEGER, plagiarism_score INTEGER, seo_score INTEGER, overall_score INTEGER, rewrite_attempts INTEGER DEFAULT 0, generation_attempts INTEGER DEFAULT 0, article_images TEXT, audio_path TEXT, youtube_url TEXT, use_youtube INTEGER DEFAULT 0, youtube_transcript TEXT, product_details_manual TEXT, generate_audio INTEGER DEFAULT 0, word_count INTEGER, zip_url TEXT NOT NULL DEFAULT '', package_status TEXT DEFAULT NULL, live_url TEXT DEFAULT NULL, image_urls TEXT DEFAULT NULL, image_r2_keys TEXT DEFAULT NULL, image_metadata TEXT DEFAULT NULL, featured_image_filename TEXT DEFAULT NULL, relevant_links TEXT DEFAULT NULL, content_rating INTEGER DEFAULT 1, generate_featured_image INTEGER DEFAULT 0, image_mood TEXT DEFAULT NULL, image_perspective TEXT DEFAULT NULL, image_setting TEXT DEFAULT NULL, generated_image_key TEXT DEFAULT NULL, generated_image_prompt TEXT DEFAULT NULL, revision_mode TEXT DEFAULT NULL, infographic_r2_key TEXT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, role TEXT DEFAULT 'user', account_id TEXT DEFAULT 'makerfrontier', user_quality_threshold INTEGER DEFAULT 85);

-- Indexes
CREATE INDEX idx_article_flags_submission ON article_flags(submission_id);
CREATE INDEX idx_itinerary_flags ON itinerary_flags(itinerary_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_submissions_package_status ON submissions(package_status, grade_status);
CREATE INDEX idx_usage_api ON api_usage_log(api_name);
CREATE INDEX idx_usage_created ON api_usage_log(created_at);
CREATE INDEX idx_usage_sub ON api_usage_log(submission_id);
