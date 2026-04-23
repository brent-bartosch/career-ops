/**
 * Shared prerequisite validator for the outbound pipeline.
 *
 * Every stage calls validate(stageId, data) BEFORE doing work.
 * Missing or thin data returns { ok: false, errors: [...] } — never silently degrade.
 */

export const STAGE_SCHEMAS = {
  'jd-ingest': {
    required: {
      raw_text: (v) => typeof v === 'string' && v.length >= 500,
      title: (v) => typeof v === 'string' && v.length > 0,
      company_name: (v) => typeof v === 'string' && v.length > 0,
      location: (v) => typeof v === 'string' && v.length > 0,
      stack: (v) => Array.isArray(v) && v.length >= 1,
      required: (v) => Array.isArray(v) && v.length >= 1,
      preferred: (v) => Array.isArray(v) && v.length >= 1,
      responsibilities: (v) => Array.isArray(v) && v.length >= 1
    }
  },
  'company-research': {
    required: {
      product_description: (v) => typeof v === 'string' && v.length >= 200,
      icp: (v) => typeof v === 'string' && v.length > 0,
      funding_stage: (v) => typeof v === 'string' && v.length > 0,
      last_round: (v) => v && typeof v.date === 'string' && ageInMonths(v.date) <= 36,
      customers: (v) => Array.isArray(v) && v.length >= 3,
      news: (v) => Array.isArray(v) && v.length >= 1 && v.some(n => ageInMonths(n.date) <= 12)
    }
  },
  'target-id': {
    required: {
      candidates: (v) => Array.isArray(v) && v.length >= 3 && v.every(c => c.rank_reason)
    }
  },
  'enrichment': {
    required: {
      email: (v) => typeof v === 'string' && v.includes('@'),
      email_status: (v) => ['verified', 'guessed', 'catch-all'].includes(v),
      linkedin_url: (v) => typeof v === 'string' && v.startsWith('http'),
      tenure_at_company_months: (v) => typeof v === 'number',
      prior_roles: (v) => Array.isArray(v) && v.length >= 2,
      recent_activity: (v) => Array.isArray(v) && v.length >= 3
    },
    warnings: {
      email_status: (v) => (v === 'guessed' || v === 'catch-all') ? `email_status=${v} (not verified)` : null
    }
  },
  'proof-match': {
    required: {
      proofs: (v) => Array.isArray(v) && v.length >= 2 && v.every(p => p.jd_bullet && p.proof_text)
    }
  },
  'draft': {
    required: {
      drafts: (v) => Array.isArray(v) && v.length === 3 && v.every(d => d.word_count <= 80 && d.word_count >= 1)
    },
    message: {
      drafts: 'Each variant must be 1-80 words.'
    }
  }
};

export function validate(stage, data) {
  const schema = STAGE_SCHEMAS[stage];
  if (!schema) throw new Error(`unknown stage: ${stage}`);

  const errors = [];
  const warnings = [];

  for (const [field, check] of Object.entries(schema.required)) {
    if (!check(data[field])) {
      const hint = schema.message?.[field] || '';
      errors.push(`[${stage}] required field failed validation: ${field}${hint ? ' — ' + hint : ''}`);
    }
  }

  if (schema.warnings) {
    for (const [field, check] of Object.entries(schema.warnings)) {
      const msg = check(data[field]);
      if (msg) warnings.push(`[${stage}] ${msg}`);
    }
  }

  return { ok: errors.length === 0, stage, errors, warnings };
}

function ageInMonths(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  const diffMs = Date.now() - d.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 30.44);
}
