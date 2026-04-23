import { validate } from './validator.js';

export async function enrichTarget({ candidate, apolloClient, brightDataClient }) {
  let apollo, profile, activity;
  try {
    apollo = await apolloClient.matchPerson({ personId: candidate.apollo_person_id });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Apollo match failed: ${e.message}`] };
  }
  try {
    profile = await brightDataClient.getProfile(apollo.linkedin_url || candidate.linkedin_url);
    activity = await brightDataClient.getActivity(apollo.linkedin_url || candidate.linkedin_url, { sinceDays: 90 });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Bright Data call failed: ${e.message}`] };
  }

  if (!apollo.email) {
    return { ok: false, errors: [`HARD STOP: No deliverable email for ${candidate.name}. Pick an alternate target.`] };
  }

  const data = {
    name: candidate.name,
    title: candidate.title,
    email: apollo.email,
    email_status: apollo.email_status,
    linkedin_url: apollo.linkedin_url || candidate.linkedin_url,
    tenure_at_company_months: apollo.tenure_at_company_months,
    prior_roles: apollo.prior_roles || [],
    recent_activity: activity || [],
    profile_about: profile.about || ''
  };

  const v = validate('enrichment', data);
  if (!v.ok) {
    const msgs = v.errors.map(e => {
      if (/recent_activity/i.test(e)) return `HARD STOP: ${candidate.name} has no LinkedIn activity (< 3 posts/comments) in the last 90 days. Verify LinkedIn URL or mark as low-signal and pick an alternate.`;
      return `HARD STOP: ${e}`;
    });
    return { ok: false, errors: msgs };
  }
  return { ok: true, data, warnings: v.warnings };
}
