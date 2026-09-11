import { Body, Button, Container, Font, Head, Heading, Hr, Html, Img, Preview, Section, Text } from '@react-email/components';

interface ResetPasswordEmailProps {
  resetUrl: string;
  logoUrl: string;
}

// Mirrors cms-frontend's actual theme — see
// src/scss/global/global-general.scss (--cms-chrome, --cms-gold,
// --advi-color-primary) and src/ts/theme/theme.ts (body font). Wordmark
// copy/font/color/logo match AppHeader.tsx's LogoLink + .vi-header-logo-text.
const brand = {
  chrome: '#0f3d38',
  gold: '#e9a800',
  primaryTeal: '#0a7a70',
  heading: '#1c2b29',
  body: '#4b5563',
  muted: '#6b7a78',
  page: '#f0f4f3',
};

// Same font stacks as global-vars.scss's $font-slackey / theme.ts's
// fontFamily. The <Font> declarations below load the real webfonts where the
// email client allows it (Apple/iOS Mail, most webmail); clients that strip
// webfonts (Gmail, Outlook desktop) fall through to the same sans-serif
// fallback the app itself uses. Every element below sets its own explicit
// fontFamily (never relies on inheritance) — that's what actually scopes
// Slackey to just the wordmark.
const fontBody = "'Raleway','Roboto',Arial,sans-serif";
const fontWordmark = "'Slackey','Roboto',Arial,Helvetica,sans-serif";

export const ResetPasswordEmail = ({ resetUrl, logoUrl }: ResetPasswordEmailProps) => (
  <Html>
    <Head>
      <Font
        fontFamily="Raleway"
        fallbackFontFamily="Arial"
        fontWeight={400}
        fontStyle="normal"
        webFont={{ url: 'https://fonts.gstatic.com/s/raleway/v37/1Ptug8zYS_SKggPNyC0IT4ttDfA.woff2', format: 'woff2' }}
      />
      <Font
        fontFamily="Raleway"
        fallbackFontFamily="Arial"
        fontWeight={700}
        fontStyle="normal"
        webFont={{ url: 'https://fonts.gstatic.com/s/raleway/v37/1Ptug8zYS_SKggPNyC0IT4ttDfA.woff2', format: 'woff2' }}
      />
      <Font
        fontFamily="Slackey"
        fallbackFontFamily="Arial"
        fontWeight={400}
        fontStyle="normal"
        webFont={{ url: 'https://fonts.gstatic.com/s/slackey/v29/N0bV2SdQO-5yM0-dGlNQJPTVkdc.woff2', format: 'woff2' }}
      />
    </Head>
    <Preview>Reset your DashTro password — this link expires in 15 minutes.</Preview>
    <Body style={{ backgroundColor: brand.page, fontFamily: fontBody, margin: 0, padding: '32px 16px' }}>
      <Container style={{ maxWidth: 480, width: '100%', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }}>
        <Section style={{ backgroundColor: brand.chrome, padding: '16px 32px' }}>
          <table role="presentation" cellPadding={0} cellSpacing={0}>
            <tr>
              <td style={{ verticalAlign: 'middle', paddingRight: 8 }}>
                <Img src={logoUrl} width={28} height={28} alt="DashTro" />
              </td>
              <td style={{ verticalAlign: 'middle' }}>
                <Text style={{ fontFamily: fontWordmark, fontSize: 20, fontWeight: 700, color: brand.gold, margin: 0, letterSpacing: '0.02em' }}>
                  DashTro!
                </Text>
              </td>
            </tr>
          </table>
        </Section>
        <Section style={{ padding: 32 }}>
          <Heading style={{ fontFamily: fontBody, fontSize: 20, fontWeight: 700, color: brand.heading, margin: '0 0 16px' }}>
            Reset your password
          </Heading>
          <Text style={{ fontFamily: fontBody, fontSize: 14, lineHeight: 1.6, color: brand.body, margin: '0 0 24px' }}>
            A password reset was requested for your DashTro account. Click the button below to choose a new one.
          </Text>
          <Button
            href={resetUrl}
            style={{ backgroundColor: brand.primaryTeal, color: '#ffffff', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 8, textDecoration: 'none' }}
          >
            {/* @react-email/button wraps children in its own inner <span> that
                doesn't inherit the style prop above, so fontFamily has to be
                set directly on this span — the innermost element around the
                actual text — or it falls through to whatever <Font> block's
                global `*{}` rule wins (see ResetPassword.tsx git history). */}
            <span style={{ fontFamily: fontBody }}>Reset your password</span>
          </Button>
          <Text style={{ fontFamily: fontBody, fontSize: 13, lineHeight: 1.6, color: brand.muted, margin: '24px 0 0' }}>
            This link expires in 15 minutes. If the button doesn't work, copy and paste this URL into your browser:
            <br />
            <a href={resetUrl} style={{ fontFamily: fontBody, color: brand.primaryTeal, wordBreak: 'break-all', overflowWrap: 'break-word' }}>{resetUrl}</a>
          </Text>
        </Section>
        <Hr style={{ borderColor: '#e5e7eb', margin: 0 }} />
        <Section style={{ padding: '20px 32px', backgroundColor: brand.page }}>
          <Text style={{ fontFamily: fontBody, fontSize: 12, color: brand.muted, margin: 0 }}>
            Didn't request this? You can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

ResetPasswordEmail.PreviewProps = {
  resetUrl: 'http://localhost:7312/reset-password/?token=preview-token',
  logoUrl: 'http://localhost:7312/dashtro-logo.png',
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;
