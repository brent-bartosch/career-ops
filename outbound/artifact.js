import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';

export function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function nextReportNumber(outreachDir) {
  try {
    const files = await readdir(outreachDir);
    const nums = files
      .map(f => f.match(/^(\d{3})-/)?.[1])
      .filter(Boolean)
      .map(n => parseInt(n, 10));
    const max = nums.length ? Math.max(...nums) : 0;
    return String(max + 1).padStart(3, '0');
  } catch {
    return '001';
  }
}

export async function writeArtifact(opts) {
  const {
    outreachDir, num, date, company, role, oferta_score,
    target, alternates, schedule,
    company_dossier, target_dossier, proofs,
    touch1
  } = opts;

  if (!company) throw new Error('writeArtifact: opts.company is required');
  if (!num || !date) throw new Error('writeArtifact: opts.num and opts.date are required');
  if (!target || typeof target !== 'object') throw new Error('writeArtifact: opts.target is required');
  if (!touch1 || typeof touch1 !== 'object') throw new Error('writeArtifact: opts.touch1 is required');

  await mkdir(outreachDir, { recursive: true });

  const status = touch1.sent_at ? 'Outreach Sent' : 'Outreach Drafted';

  const frontmatterRest = {
    date,
    company, company_slug: slugify(company),
    role,
    oferta_score,
    target,
    alternates,
    schedule,
    status
  };

  // Emit num unquoted so it reads as `num: 047` not `num: '047'`
  const frontmatterYaml = `num: ${num}\n${yaml.dump(frontmatterRest, { lineWidth: 120 }).trimEnd()}`;

  const body = [
    '## Company Dossier\n',
    '```yaml',
    yaml.dump(company_dossier, { lineWidth: 120 }).trimEnd(),
    '```',
    '',
    '## Target Dossier\n',
    '```yaml',
    yaml.dump(target_dossier, { lineWidth: 120 }).trimEnd(),
    '```',
    '',
    '## Proof Match\n',
    ...proofs.map((p, i) => `${i + 1}. **JD bullet:** ${p.jd_bullet}\n   **Proof:** ${p.proof_text}\n   **Score:** ${p.specificity_score}`),
    '',
    '## Touch 1 (T0)\n',
    renderTouch(touch1)
  ].join('\n');

  const path = join(outreachDir, `${num}-${slugify(company)}-${date}.md`);
  const out = `---\n${frontmatterYaml}\n---\n\n${body}\n`;
  await writeFile(path, out, 'utf8');
  return path;
}

export async function readArtifact(path) {
  const text = await readFile(path, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`artifact missing frontmatter: ${path}`);
  const frontmatter = yaml.load(m[1]) || {};
  // num is written unquoted (e.g. 001) so yaml.load parses it as integer; restore zero-padded string
  if (frontmatter.num != null) {
    frontmatter.num = String(frontmatter.num).padStart(3, '0');
  }
  return { frontmatter, body: m[2] };
}

/**
 * Append a follow-up touch section (Touch 2/3) to an existing artifact.
 *
 * Reads the file, concatenates the new section, writes back. NOT safe for
 * concurrent writes to the same artifact — callers must serialize follow-up
 * runs per artifact. MVP acceptable since each outreach is single-threaded
 * through the orchestrator.
 *
 * @param {string} path - artifact file path
 * @param {Object} touch
 * @param {2|3} touch.touchNumber
 * @param {string} touch.offsetLabel - "T+3" or "T+7"
 * @param {string} [touch.new_signal]
 * @param {Object[]} touch.variants
 * @param {number|null} touch.chosen_index
 * @param {string} [touch.edits]
 * @param {string|null} touch.sent_at
 */
export async function appendTouch(path, touch) {
  const text = await readFile(path, 'utf8');
  const section = [
    '',
    `## Touch ${touch.touchNumber} (${touch.offsetLabel})`,
    '',
    touch.new_signal ? `**New signal:** ${touch.new_signal}` : '**New signal:** (breakup — not required)',
    '',
    renderTouch(touch)
  ].join('\n');
  await writeFile(path, text + section + '\n', 'utf8');
}

/**
 * @param {Object} touch
 * @param {Object[]} touch.variants - each { subject, body, word_count, anchor_type, anchor_source_url }
 * @param {number|null} touch.chosen_index
 * @param {string} [touch.edits]
 * @param {string|null} touch.sent_at
 */
function renderTouch(touch) {
  const variants = (touch.variants || []).map((v, i) => {
    return `\n#### Variant ${String.fromCharCode(65 + i)}\n- **Subject:** ${v.subject}\n- **Anchor:** ${v.anchor_type} (${v.anchor_source_url || '—'})\n- **Words:** ${v.word_count}\n\n\`\`\`\n${v.body}\n\`\`\``;
  }).join('\n');
  return [
    '### Variants',
    variants,
    '',
    `### Chosen: ${touch.chosen_index != null ? String.fromCharCode(65 + touch.chosen_index) : '(none)'}`,
    touch.edits ? `### Edits\n${touch.edits}` : '',
    `### Sent at: ${touch.sent_at || '(not sent)'}`
  ].filter(Boolean).join('\n');
}
