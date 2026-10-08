<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';
require_once __DIR__ . '/_common.php';

// "Generate provisional estimate": Claude reads a site walk — its notes,
// general notes and photos — and fills in the estimate form's answers
// (the same structure the form edits). The answers then go through the
// deterministic scope generator in the app, so the wording is always the
// office's JCCS wording and its guards still apply. Nothing is saved here:
// the app shows the answers in the form, editable, and autosaves from there.
//
// POST {id}  →  {form, office_notes}
//
// Needs ANTHROPIC_API_KEY in config.php. The SDK (api/vendor, PHP ≥ 8.1) is
// loaded only by this endpoint, so nothing else depends on it.

const QR_AI_MODEL      = 'claude-opus-5-5';
const QR_AI_MAX_PHOTOS = 20;
const QR_AI_EDGE       = 1280; // px — keeps each photo near ~1.2k tokens

$auth = requireAuth(QR_ROLES);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }
if (!defined('ANTHROPIC_API_KEY') || ANTHROPIC_API_KEY === '' || ANTHROPIC_API_KEY === 'CHANGE_ME') {
    http_response_code(503); exit(json_encode(['error' => 'AI drafting is not set up yet (no Anthropic API key on the server).']));
}
if (PHP_VERSION_ID < 80100) {
    http_response_code(503); exit(json_encode(['error' => 'AI drafting needs PHP 8.1 or newer on the server.']));
}
require_once __DIR__ . '/../vendor/autoload.php';
@set_time_limit(240);

$pdo  = getPDO();
$body = jsonBody();
$row  = qrLoadVisible($pdo, $auth, (int)($body['id'] ?? 0));

$s = $pdo->prepare('SELECT id, body, sort_order FROM quote_request_notes WHERE quote_request_id = ? ORDER BY sort_order, id');
$s->execute([$row['id']]);
$notes = $s->fetchAll();
$s = $pdo->prepare('SELECT id, note_id, file_path, caption, is_before, is_reference FROM quote_request_photos WHERE quote_request_id = ? ORDER BY id');
$s->execute([$row['id']]);
$photos = $s->fetchAll();

$noteNo = [];
foreach ($notes as $i => $n) $noteNo[(int)$n['id']] = $i + 1;

if (!$notes && !$photos && trim((string)$row['description']) === '') {
    http_response_code(422); exit(json_encode(['error' => 'Add some notes or photos to the site visit first.']));
}

// ── Photos: downscale (GD) so a full walk fits comfortably in one request ──
function qrAiImage(string $path): ?array {
    $full = __DIR__ . '/../uploads/' . $path;
    if (!is_file($full)) return null;
    $mime = mime_content_type($full) ?: '';
    if (function_exists('imagecreatefromstring') && in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        $img = @imagecreatefromstring((string)file_get_contents($full));
        if ($img) {
            $w = imagesx($img); $h = imagesy($img);
            $scale = min(1, QR_AI_EDGE / max($w, $h));
            if ($scale < 1) {
                $dst = imagecreatetruecolor((int)round($w * $scale), (int)round($h * $scale));
                imagecopyresampled($dst, $img, 0, 0, 0, 0, imagesx($dst), imagesy($dst), $w, $h);
                $img = $dst; // GD images free themselves (imagedestroy() is a deprecated no-op)
            }
            ob_start(); imagejpeg($img, null, 80); $data = ob_get_clean();
            return ['mediaType' => 'image/jpeg', 'data' => base64_encode($data)];
        }
    }
    // No GD (or it couldn't decode): send the stored file if the API takes it.
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true) || filesize($full) > 4 * 1024 * 1024) return null;
    return ['mediaType' => $mime, 'data' => base64_encode((string)file_get_contents($full))];
}

// Photos filed under notes first (they carry the most context), then the rest.
usort($photos, fn($a, $b) => [($a['note_id'] ? 0 : 1), (int)$a['id']] <=> [($b['note_id'] ? 0 : 1), (int)$b['id']]);
$photos = array_slice($photos, 0, QR_AI_MAX_PHOTOS);

$content = [];
$photoCount = 0;
foreach ($photos as $p) {
    $img = qrAiImage($p['file_path']);
    if (!$img) continue;
    $photoCount++;
    $label = "Photo {$photoCount}";
    if ($p['note_id'] && isset($noteNo[(int)$p['note_id']])) $label .= ' — taken for note ' . $noteNo[(int)$p['note_id']];
    if ($p['caption']) $label .= ' — caption: ' . $p['caption'];
    if ($p['is_before']) $label .= ' — before condition';
    if ($p['is_reference']) $label .= ' — reference only';
    $content[] = ['type' => 'text', 'text' => $label];
    $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $img['mediaType'], 'data' => $img['data']]];
}

// ── The walk, as text ───────────────────────────────────────────────────────
$lib = $pdo->query("SELECT kind, label FROM quote_library WHERE is_active = 1 ORDER BY kind, label")->fetchAll();
$libText = implode('; ', array_map(fn($l) => "{$l['kind']}: {$l['label']}", $lib));

$lines = [];
$lines[] = 'Request title: ' . $row['title'];
if ($row['facility'])        $lines[] = 'Facility: ' . $row['facility'];
if ($row['location_detail']) $lines[] = 'Building / floor / suite: ' . $row['location_detail'];
$lines[] = 'Type: ' . ($row['work_type'] === 'addon' ? 'add-on to an existing project' : 'new job') . ', estimate type ' . $row['estimate_type'];
$lines[] = '';
$lines[] = 'Walk notes (one per area or issue):';
foreach ($notes as $i => $n) $lines[] = ($i + 1) . '. ' . (trim((string)$n['body']) !== '' ? $n['body'] : '(no text — see its photos)');
if (!$notes) $lines[] = '(none)';
$lines[] = '';
$lines[] = 'General notes: ' . (trim((string)$row['description']) !== '' ? $row['description'] : '(none)');
$lines[] = '';
$lines[] = "Saved materials/colors the office uses: {$libText}";
$lines[] = '';
$lines[] = "{$photoCount} photo(s) follow, each preceded by its label.";
array_unshift($content, ['type' => 'text', 'text' => implode("\n", $lines)]);
$content[] = ['type' => 'text', 'text' => 'Fill in the estimate form for this site walk.'];

$system = <<<'TXT'
You prepare the first draft of an estimate for JCCS Services, a commercial contractor doing interior repair and renovation work, mostly in healthcare facilities (Prisma Health practices and hospitals). A field manager walked the site and recorded short notes (one per area or issue), general notes, and photos. Notes may be in Spanish or English; always answer in English.

Your output fills a structured estimate form. The app turns the form into the office's standard Scope of Work wording, so you choose WHAT work is in scope; you do not write the estimate prose. An estimator will review and edit everything you fill in.

Rules:
- Only turn on a category when the notes or photos show that work is needed. Leave everything else off.
- Never turn on plumbing unless the notes or photos clearly call for plumbing work (capping, disconnecting, reconnecting). Never assume it.
- antimicrobial: only for visible mold or water damage, or when the notes say so.
- ic (infection control): "required" when the notes mention infection control or ICRA, or when demolition or other dust-making work happens in an occupied clinical area such as exam rooms, patient areas, or hospital floors. "limited" for light dust in occupied non-clinical areas. Otherwise "none". If you are unsure, pick the safer option and say so in office_notes.
- ceiling: only for a solid drywall (hard-lid) ceiling repair. If the photos show acoustical tile and grid, do not turn it on; mention it in office_notes instead.
- Measurements: use only numbers that are written in the notes or clearly visible (for example a tape measure in a photo). Never invent dimensions. Leave a number blank ("") when it is unknown, and set approx to true for estimated sizes.
- Colors and materials: copy a name only when the notes give it or it matches one of the office's saved materials. Otherwise leave it blank ("").
- area finishes the sentence "Prepare the designated ___." (for example "work area within Exam Room 3" or "window installation area"). locations names the rooms (for example "Exam Rooms 7, 8, 9, and 10") or is "".
- protect: adjacent things to protect, chosen from what is visible (flooring, walls, ceilings, doors, countertops, fixtures, furniture, medical equipment, equipment, utilities). verify: what to field-verify (dimensions, existing conditions, wall construction, existing utilities, ...).
- title: a short descriptive estimate title in the office's style, for example "Drywall, Insulation, Cove Base, and Hard-Ceiling Repairs" or "Frosted Window Film Installation – Exam Rooms 7, 8, 9, and 10".
- Work that fits none of the categories goes under other.sections as a heading plus short imperative bullets ("Provide and install ...", "Remove ...").
- office_notes: a few short lines for the estimator covering assumptions you made, anything unclear, and what to confirm on site. Use plain sentences, not markdown.
TXT;

// Strict JSON schema mirroring the app's form (src/scope-engine): every key
// required, no extras, so the response always drops straight into the form.
$str = ['type' => 'string'];
$bool = ['type' => 'boolean'];
$obj = fn(array $props) => ['type' => 'object', 'properties' => $props, 'required' => array_keys($props), 'additionalProperties' => false];
$enum = fn(array $vals) => ['type' => 'string', 'enum' => $vals];
$schema = $obj([
    'title' => $str, 'area' => $str, 'locations' => $str, 'allRoomsPhrase' => $str, 'leaveArea' => $str,
    'ic' => $enum(['none', 'limited', 'required']),
    'protect' => ['type' => 'array', 'items' => $str],
    'verify' => ['type' => 'array', 'items' => $str],
    'cats' => $obj([
        'itemRemoval'   => $obj(['on' => $bool, 'item' => $str, 'plumbing' => $bool]),
        'demo'          => $obj(['on' => $bool, 'mode' => $enum(['affected', 'wallboard']), 'wallDrywall' => $bool, 'insulation' => $bool, 'coveBase' => $bool, 'solidCeiling' => $bool, 'other' => $str]),
        'plumbing'      => $obj(['on' => $bool, 'work' => $enum(['cap', 'reconnect'])]),
        'framing'       => $obj(['on' => $bool, 'area' => $str, 'purpose' => $str]),
        'antimicrobial' => $obj(['on' => $bool]),
        'drywall'       => $obj(['on' => $bool, 'mode' => $enum(['new', 'replace', 'full']), 'type' => $enum(['standard', 'mold-resistant', 'moisture-resistant', 'fire-rated']), 'insulation' => $bool, 'finishLevel' => ['type' => 'integer', 'enum' => [4, 5]]]),
        'ceiling'       => $obj(['on' => $bool]),
        'windowFilm'    => $obj(['on' => $bool, 'film' => $enum(['frosted', 'tinted'])]),
        'window'        => $obj(['on' => $bool, 'kind' => $enum(['sliding', 'fixed']), 'glazing' => $str, 'qty' => ['type' => 'integer'], 'width' => $str, 'height' => $str, 'approx' => $bool, 'touchUp' => $bool]),
        'painting'      => $obj(['on' => $bool, 'mode' => $enum(['match', 'full']), 'color' => $str, 'exteriorDoor' => $bool]),
        'coveBase'      => $obj(['on' => $bool, 'mode' => $enum(['match', 'new']), 'color' => $str]),
        'other'         => $obj(['on' => $bool, 'sections' => ['type' => 'array', 'items' => $obj(['heading' => $str, 'bullets' => ['type' => 'array', 'items' => $str]])]]),
    ]),
    'office_notes' => $str,
]);

$client = new Anthropic\Client(apiKey: ANTHROPIC_API_KEY);
try {
    // Server-side refusal fallback: if a safety classifier declines, the API
    // re-runs the request on a fallback model within the same call.
    $message = $client->beta->messages->create(
        model: QR_AI_MODEL,
        maxTokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        outputConfig: ['effort' => 'high', 'format' => ['type' => 'json_schema', 'schema' => $schema]],
        system: $system,
        messages: [['role' => 'user', 'content' => $content]],
    );
} catch (\Anthropic\Core\Exceptions\APIStatusException $e) {
    // Plain-language message for the person tapping the button; the raw
    // error goes to the PHP error log for whoever fixes it.
    error_log('ai-draft: ' . $e->getMessage());
    $msg = match ($e->type?->value) {
        'authentication_error', 'permission_error' => 'The Anthropic API key on the server is missing or invalid.',
        'rate_limit_error'                         => 'The AI is busy right now — try again in a minute.',
        'overloaded_error', 'api_error'            => 'The AI service is having trouble — try again in a minute.',
        'request_too_large'                        => 'Too many or too large photos for one draft.',
        default                                    => 'The AI service returned an error — try again.',
    };
    http_response_code(502);
    exit(json_encode(['error' => $msg]));
} catch (\Throwable $e) {
    http_response_code(502);
    exit(json_encode(['error' => 'Could not reach the AI service: ' . $e->getMessage()]));
}

if ($message->stopReason === 'refusal') {
    http_response_code(422); exit(json_encode(['error' => 'The AI declined to draft this one — fill in the form manually.']));
}
if ($message->stopReason === 'max_tokens') {
    http_response_code(502); exit(json_encode(['error' => 'The AI response was cut off — try again.']));
}
$json = null;
foreach ($message->content as $block) {
    if ($block->type === 'text') { $json = json_decode($block->text, true); break; }
}
if (!is_array($json) || !isset($json['cats'])) {
    http_response_code(502); exit(json_encode(['error' => 'The AI response could not be read — try again.']));
}

$officeNotes = trim((string)($json['office_notes'] ?? ''));
unset($json['office_notes']);
$json['v'] = 1;
qrLogActivity($pdo, (int)$row['id'], $auth, 'ai_draft', null, null, "{$photoCount} photos, " . count($notes) . ' notes');

echo json_encode(['form' => $json, 'office_notes' => $officeNotes, 'photos_used' => $photoCount]);
