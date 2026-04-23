import { validate } from './validator.js';

export async function enrichTarget({ candidate, apolloClient, brightDataClient }) {
  if (!candidate?.apollo_person_id) {
    return { ok: false, errors: [`HARD STOP: candidate is missing apollo_person_id (${candidate?.name || 'unknown'}).`] };
  }

  let apollo;
  try {
    apollo = await apolloClient.matchPerson({ personId: candidate.apollo_person_id });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Apollo match failed: ${e.message}`] };
  }

  if (!apollo.email) {
    return { ok: false, errors: [`HARD STOP: No deliverable email for ${candidate.name}. Pick an alternate target.`] };
  }

  const liUrl = apollo.linkedin_url || candidate.linkedin_url;

  let profile;
  try {
    profile = await brightDataClient.getProfile(liUrl);
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Bright Data profile fetch failed: ${e.message}`] };
  }

  let activity;
  try {
    activity = await brightDataClient.getActivity(liUrl, { sinceDays: 90 });
  } catch (e) {
    return { ok: false, errors: [`HARD STOP: Bright Data activity fetch failed: ${e.message}`] };
  }

  const data = {
    name: candidate.name,
    title: candidate.title,
    email: apollo.email,
    email_status: apollo.email_status,
    linkedin_url: liUrl,
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
