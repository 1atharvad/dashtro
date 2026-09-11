import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@react-email/render';
import { ResetPasswordEmail } from './templates/ResetPassword';

// Rendered output is committed into the Python backend (a build artifact,
// like a compiled asset) so it has no runtime Node dependency — see
// cms_backend/api/utils/email_client.py, which just reads these files and
// substitutes {{reset_url}} / {{logo_url}}.
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'cms_backend', 'api', 'utils', 'email_templates');

const props = { resetUrl: '{{reset_url}}', logoUrl: '{{logo_url}}' };

const main = async () => {
  mkdirSync(OUT_DIR, { recursive: true });

  const html = await render(ResetPasswordEmail(props));
  const text = await render(ResetPasswordEmail(props), { plainText: true });

  writeFileSync(join(OUT_DIR, 'reset-password.html'), html);
  writeFileSync(join(OUT_DIR, 'reset-password.txt'), text);

  console.log(`Wrote email templates to ${OUT_DIR}`);
};

main();
