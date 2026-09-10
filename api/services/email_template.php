<?php
// Branded HTML wrapper for JCCS notification emails — the maroon Procore-style
// layout: header bar, project line, activity badge, headline, meta, teaser
// card, call-to-action button, footer. Table-based with inline styles so it
// renders in Outlook/Gmail/Apple Mail. Portable: every field is passed in,
// including appName + accent, so other JCCS apps can reuse it with their own
// brand colour.
//
// renderNotificationEmail() returns the HTML string; notificationEmailText()
// returns the plain-text equivalent for the same $o. Callers pass both to
// sendEmail($to, $subject, $text, $html).

function renderNotificationEmail(array $o): string {
    $accent   = $o['accent']         ?? '#741B1B';
    $appName  = $o['appName']        ?? 'JCCS Projects';
    $badge    = $o['badge']          ?? '';
    $headline = $o['headline']       ?? '';
    $projNum  = $o['projectNumber']  ?? '';
    $projName = $o['projectName']    ?? '';
    $meta     = $o['metaLine']       ?? '';
    $teaser   = $o['teaser']         ?? '';
    $btnLabel = $o['buttonLabel']    ?? 'View in Client Portal';
    $btnUrl   = $o['buttonUrl']      ?? '';
    $prefsUrl = $o['preferencesUrl'] ?? '';
    $logoUrl  = $o['logoUrl']        ?? '';

    $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

    // White knockout logo (public/jccs-logo-white.png on the app origin);
    // bold text wordmark as the fallback when images are blocked or no URL.
    $logoHtml = $logoUrl !== ''
        ? '<img src="' . $e($logoUrl) . '" alt="JCCS Services" width="118" height="40" style="display:block;border:0;">'
        : '<span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.04em;">JCCS <span style="font-weight:400;">SERVICES</span></span>';

    // Small, quiet uppercase label — not a colour band.
    $labelHtml = $badge === '' ? '' :
        '<div style="font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#9a9a9a;">'
        . $e($badge) . '</div>';

    // Project + who/when, as a subdued sub-line under the headline.
    $subParts = [];
    if ($projName !== '')      { $subParts[] = $e($projName); }
    elseif ($projNum !== '')   { $subParts[] = 'Project #' . $e($projNum); }
    $subHtml = $subParts ? '<div style="font-size:14px;color:#6b6b6b;margin:9px 0 0;">' . implode(' &middot; ', $subParts) . '</div>' : '';
    $metaHtml = $meta === '' ? '' :
        '<div style="font-size:13px;color:#9a9a9a;margin:3px 0 0;">' . $e($meta) . '</div>';

    // Body text — a quiet left rule, no heavy box.
    $teaserHtml = $teaser === '' ? '' :
        '<div style="border-left:3px solid ' . $e($accent) . ';padding:2px 0 2px 14px;margin:22px 0 0;'
        . 'color:#333333;font-size:14px;line-height:1.6;">' . nl2br($e($teaser)) . '</div>';

    // Attachment indicator — 'attachments' as a string ("3 photos") or
    // ['count' => N, 'label' => 'photos'|'files']. Plain text, no pill.
    $attachText = '';
    if (!empty($o['attachments'])) {
        $a = $o['attachments'];
        if (is_array($a)) {
            $n = (int) ($a['count'] ?? 0);
            $lbl = $a['label'] ?? 'files';
            $attachText = $n > 0 ? $n . ' ' . ($n === 1 ? rtrim($lbl, 's') : $lbl) : '';
        } else {
            $attachText = (string) $a;
        }
    }
    $attachHtml = $attachText === '' ? '' :
        '<div style="font-size:13px;color:#9a9a9a;margin:14px 0 0;">&#128206;&nbsp; ' . $e($attachText) . ' attached</div>';

    $buttonHtml = $btnUrl === '' ? '' :
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px;"><tr>'
        . '<td style="background:' . $e($accent) . ';border-radius:6px;">'
        . '<a href="' . $e($btnUrl) . '" style="display:inline-block;padding:12px 26px;color:#ffffff;'
        . 'font-size:14px;font-weight:600;text-decoration:none;">' . $e($btnLabel) . ' &rarr;</a>'
        . '</td></tr></table>';

    $footerLines = $o['footerLines'] ?? [
        "You're receiving this because you have client-portal access to this project.",
        'Sign in with your email address and the password you set.',
        'This mailbox is not monitored &mdash; for anything about your project, contact your project manager.',
    ];
    $footerHtml = '';
    foreach ($footerLines as $line) {
        $footerHtml .= '<div style="margin:0 0 5px;">' . $e($line) . '</div>';
    }
    $prefsLink = $prefsUrl !== ''
        ? ' &nbsp;&middot;&nbsp; <a href="' . $e($prefsUrl) . '" style="color:#9a9a9a;text-decoration:underline;">Email preferences</a>'
        : '';

    return <<<HTML
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:{$accent};padding:16px 28px;">{$logoHtml}</td>
        </tr>
        <tr>
          <td style="padding:30px 28px 28px;">
            {$labelHtml}
            <div style="font-size:19px;font-weight:700;color:#1a1a1a;line-height:1.35;margin:7px 0 0;">{$headline}</div>
            {$subHtml}
            {$metaHtml}
            {$teaserHtml}
            {$attachHtml}
            {$buttonHtml}
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #ececec;padding:20px 28px 24px;color:#9a9a9a;font-size:12px;line-height:1.6;">
            {$footerHtml}
            <div style="margin:8px 0 0;">JCCS Services{$prefsLink}</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
}

function notificationEmailText(array $o): string {
    $lines = [];
    if (!empty($o['badge']))    { $lines[] = strtoupper((string) $o['badge']); }
    if (!empty($o['headline'])) { $lines[] = (string) $o['headline']; }

    $proj = trim(((string) ($o['projectNumber'] ?? '') !== '' ? '#' . $o['projectNumber'] . ' ' : '') . (string) ($o['projectName'] ?? ''));
    if ($proj !== '')                 { $lines[] = $proj; }
    if (!empty($o['projectAddress'])) { $lines[] = (string) $o['projectAddress']; }
    if (!empty($o['metaLine']))       { $lines[] = (string) $o['metaLine']; }

    $lines[] = '';
    if (!empty($o['teaser'])) { $lines[] = (string) $o['teaser']; }
    if (!empty($o['attachments'])) {
        $a = $o['attachments'];
        $txt = is_array($a)
            ? ((int) ($a['count'] ?? 0)) . ' ' . ($a['label'] ?? 'files')
            : (string) $a;
        if (trim($txt) !== '' && $txt[0] !== '0') { $lines[] = '(' . $txt . ' attached)'; }
    }
    $lines[] = '';
    if (!empty($o['buttonUrl'])) {
        $lines[] = ($o['buttonLabel'] ?? 'View in the client portal') . ': ' . $o['buttonUrl'];
        $lines[] = '';
    }
    $lines[] = '--';
    $lines[] = 'Sign in at the portal with your email address and the password you set.';
    $lines[] = 'This mailbox is not monitored. For anything about your project, contact your JCCS project manager.';
    if (!empty($o['preferencesUrl'])) {
        $lines[] = 'Manage email preferences: ' . $o['preferencesUrl'];
    }

    return implode("\n", $lines);
}

// ── Account-setup invite ────────────────────────────────────────────────
// Sent when an admin provisions a client without a password. $o keys:
//   appName, name, email, projects (array of names), setupUrl, expiryDays,
//   accent, logoUrl
function renderClientInviteEmail(array $o): string {
    $accent   = $o['accent']     ?? '#741B1B';
    $appName  = $o['appName']    ?? 'JCCS Projects';
    $name     = $o['name']       ?? '';
    $setupUrl = $o['setupUrl']   ?? '';
    $days     = (int) ($o['expiryDays'] ?? 7);
    $logoUrl  = $o['logoUrl']    ?? '';
    $projects = array_values(array_filter((array) ($o['projects'] ?? [])));

    $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');

    $logoHtml = $logoUrl !== ''
        ? '<img src="' . $e($logoUrl) . '" alt="JCCS Services" width="132" height="45" style="display:block;border:0;">'
        : '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.04em;">JCCS <span style="font-weight:400;">SERVICES</span></span>';

    $greeting = $name !== '' ? 'Hi ' . $e($name) . ',' : 'Hello,';

    $projLine = '';
    if ($projects) {
        $names = implode(', ', array_map($e, $projects));
        $projLine = '<p style="margin:0 0 16px;color:#333333;font-size:14px;line-height:1.6;">'
            . 'Your portal access covers: <strong>' . $names . '</strong>.</p>';
    }

    $button = $setupUrl === '' ? '' :
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;"><tr><td '
        . 'style="background:' . $e($accent) . ';border-radius:4px;">'
        . '<a href="' . $e($setupUrl) . '" style="display:inline-block;padding:13px 28px;color:#ffffff;'
        . 'font-size:14px;font-weight:700;text-decoration:none;">Set up your account</a></td></tr></table>';

    return <<<HTML
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#eeeeee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeeee;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;font-family:Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:{$accent};padding:18px 28px;">{$logoHtml}</td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <p style="margin:0 0 16px;color:#222222;font-size:15px;">{$greeting}</p>
            <p style="margin:0 0 16px;color:#333333;font-size:14px;line-height:1.6;">
              An account has been created for you on the <strong>{$appName}</strong> client portal, where you can follow
              daily logs, documents, submittals, and the punch list for your project.
            </p>
            {$projLine}
            <p style="margin:0 0 18px;color:#333333;font-size:14px;line-height:1.6;">
              To get started, set your password:
            </p>
            {$button}
            <p style="margin:14px 0 0;color:#6b6b6b;font-size:12px;line-height:1.6;">
              This link expires in {$days} days. If it has, ask your JCCS project manager to resend the invitation.
              After you set your password, sign in any time with your email address and that password.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f7f3f3;border-top:1px solid #e2d9d9;padding:18px 28px;color:#6b6b6b;font-size:12px;line-height:1.5;">
            <div>This mailbox is not monitored. For anything about your project, contact your JCCS project manager.</div>
            <div style="margin:4px 0 0;">JCCS Services &middot; noreply@jccs-services.com</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
}

function clientInviteEmailText(array $o): string {
    $appName  = $o['appName']  ?? 'JCCS Projects';
    $name     = $o['name']     ?? '';
    $setupUrl = $o['setupUrl'] ?? '';
    $days     = (int) ($o['expiryDays'] ?? 7);
    $projects = array_values(array_filter((array) ($o['projects'] ?? [])));

    $lines = [$name !== '' ? "Hi {$name}," : 'Hello,', ''];
    $lines[] = "An account has been created for you on the {$appName} client portal.";
    if ($projects) { $lines[] = 'Portal access covers: ' . implode(', ', $projects) . '.'; }
    $lines[] = '';
    $lines[] = 'Set your password to get started:';
    $lines[] = $setupUrl;
    $lines[] = '';
    $lines[] = "This link expires in {$days} days; ask your JCCS project manager to resend it if needed.";
    $lines[] = 'After that, sign in with your email address and the password you set.';
    $lines[] = '';
    $lines[] = '--';
    $lines[] = 'This mailbox is not monitored. For anything about your project, contact your JCCS project manager.';

    return implode("\n", $lines);
}
