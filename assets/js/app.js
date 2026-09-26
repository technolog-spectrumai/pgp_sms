
import * as openpgp from 'https://unpkg.com/openpgp@6.3.1/dist/openpgp.min.mjs';
import { Encoder, Byte } from './vendor/qrcode.min.js';

const $ = id => document.getElementById(id);
const I18N = JSON.parse(document.getElementById('app-i18n')?.textContent || '{}');

function activateTab(name) {
  const config = {
    encrypt: ['encryptTab', 'encryptPanel'],
    decrypt: ['decryptTab', 'decryptPanel'],
    keygen: ['keygenTab', 'keygenPanel'],
    qr: ['qrTab', 'qrPanel']
  };

  for (const [key, [tabId, panelId]] of Object.entries(config)) {
    const active = key === name;
    $(tabId).classList.toggle('active', active);
    $(panelId).classList.toggle('active', active);
    $(tabId).setAttribute('aria-selected', String(active));
  }
}

$('encryptTab').addEventListener('click', () => activateTab('encrypt'));
$('decryptTab').addEventListener('click', () => activateTab('decrypt'));
$('keygenTab').addEventListener('click', () => activateTab('keygen'));
$('qrTab').addEventListener('click', () => activateTab('qr'));

function setStatus(id, message, isError = false) {
  const el = $(id);
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadTextFile(fileInputId, targetId) {
  const input = $(fileInputId);
  if (!input.files?.length) return;
  $(targetId).value = await input.files[0].text();
  input.value = '';
}

$('publicKeyFile').addEventListener('change',
  () => loadTextFile('publicKeyFile', 'publicKey'));

$('privateKeyFile').addEventListener('change',
  () => loadTextFile('privateKeyFile', 'privateKey'));

$('encryptBtn').addEventListener('click', async () => {
  setStatus('encryptStatus', '');
  $('encryptedText').value = '';

  try {
    const armoredKey = $('publicKey').value.trim();
    const plaintext = $('plainText').value;

    if (!armoredKey) throw new Error(I18N.loadRecipientKey);
    if (!plaintext) throw new Error(I18N.enterMessage);

    const publicKey = await openpgp.readKey({ armoredKey });
    const message = await openpgp.createMessage({ text: plaintext });

    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: publicKey,
      format: 'binary'
    });

    const bytes = encrypted instanceof Uint8Array
      ? encrypted
      : new Uint8Array(await new Response(encrypted).arrayBuffer());

    const output = 'PGP1:' + bytesToBase64(bytes);

    $('encryptedText').value = output;
    $('cipherText').value = output;

    setStatus(
      'encryptStatus',
      `${I18N.encryptedSuccess} ${plaintext.length} ${I18N.charsPlain} → ${output.length} ${I18N.charsTransport}.`
    );
  } catch (err) {
    setStatus('encryptStatus', err?.message || String(err), true);
  }
});

$('decryptBtn').addEventListener('click', async () => {
  setStatus('decryptStatus', '');
  $('decryptedText').value = '';

  try {
    const armoredPrivateKey = $('privateKey').value.trim();
    const encryptedInput = $('cipherText').value.trim();
    const passphrase = $('passphrase').value;

    if (!armoredPrivateKey) throw new Error(I18N.loadPrivateKey);
    if (!encryptedInput) throw new Error(I18N.pasteEncrypted);

    let privateKey = await openpgp.readPrivateKey({
      armoredKey: armoredPrivateKey
    });

    if (!privateKey.isDecrypted()) {
      if (!passphrase) {
        throw new Error(I18N.keyProtected);
      }

      try {
        privateKey = await openpgp.decryptKey({
          privateKey,
          passphrase
        });
      } catch (err) {
        throw new Error(I18N.keyUnlockFailed);
      }
    }

    let message;

    if (encryptedInput.startsWith('PGP1:')) {
      const raw = base64ToBytes(
        encryptedInput.slice('PGP1:'.length).replace(/\s+/g, '')
      );
      message = await openpgp.readMessage({ binaryMessage: raw });
    } else {
      message = await openpgp.readMessage({ armoredMessage: encryptedInput });
    }

    const { data } = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey
    });

    $('decryptedText').value =
      typeof data === 'string'
        ? data
        : new TextDecoder().decode(data);

    setStatus('decryptStatus', I18N.decryptionSuccess);
  } catch (err) {
    setStatus(
      'decryptStatus',
      I18N.decryptionFailed + ' ' + (err?.message || String(err)),
      true
    );
  }
});

function sanitizeFilenamePart(value, fallback) {
  const clean = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function downloadBlob(filename, blob) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(filename, text) {
  if (!text) return;
  downloadBlob(filename, new Blob([text], { type: 'application/pgp-keys' }));
}

$('generateKeyBtn').addEventListener('click', async () => {
  setStatus('keygenStatus', '');
  $('generatedPublicKey').value = '';
  $('generatedPrivateKey').value = '';

  try {
    const name = $('keyName').value.trim();
    const email = $('keyEmail').value.trim();
    const passphrase = $('keyPassphrase').value;

    if (!name) throw new Error(I18N.enterName);
    if (!email) throw new Error(I18N.enterEmail);

    setStatus('keygenStatus', I18N.generatingKey);

    const options = {
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ name, email }],
      format: 'armored'
    };

    if (passphrase) options.passphrase = passphrase;

    const { privateKey, publicKey } = await openpgp.generateKey(options);

    $('generatedPublicKey').value = publicKey;
    $('generatedPrivateKey').value = privateKey;
    $('publicKey').value = publicKey;
    $('privateKey').value = privateKey;

    setStatus(
      'keygenStatus',
      I18N.keyGenerated
    );
  } catch (err) {
    setStatus('keygenStatus', err?.message || String(err), true);
  }
});

async function copyFrom(id, statusId) {
  const value = $(id).value;
  if (!value) return;
  await navigator.clipboard.writeText(value);
  setStatus(statusId, I18N.copied);
}

$('copyEncryptedBtn').addEventListener('click',
  () => copyFrom('encryptedText', 'encryptStatus'));

$('copyDecryptedBtn').addEventListener('click',
  () => copyFrom('decryptedText', 'decryptStatus'));

$('copyPublicKeyBtn').addEventListener('click',
  () => copyFrom('generatedPublicKey', 'keygenStatus'));

$('copyPrivateKeyBtn').addEventListener('click',
  () => copyFrom('generatedPrivateKey', 'keygenStatus'));

$('downloadPublicKeyBtn').addEventListener('click', () => {
  const base = sanitizeFilenamePart(
    $('keyEmail').value || $('keyName').value,
    'pgp'
  );
  downloadText(`${base}-public.asc`, $('generatedPublicKey').value);
  setStatus('keygenStatus', I18N.publicDownloaded);
});

$('downloadPrivateKeyBtn').addEventListener('click', () => {
  const base = sanitizeFilenamePart(
    $('keyEmail').value || $('keyName').value,
    'pgp'
  );
  downloadText(`${base}-private.asc`, $('generatedPrivateKey').value);
  setStatus('keygenStatus', I18N.privateDownloaded);
});

/* ------------------------------------------------------------------ *
 * Key QR: export an OpenPGP key as a PNG, and read one back.
 * All encoding, rendering and decoding happens locally in the browser.
 * ------------------------------------------------------------------ */

// Byte-mode capacity of a version-40 QR code at each error-correction level.
const QR_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

const QUIET_MODULES = 4;
const MONO = '"SFMono-Regular", Consolas, ui-monospace, monospace';

let qrState = { text: '', kind: '', isPrivate: false, filenameBase: 'key' };

function groupFingerprint(fp) {
  return (fp.toUpperCase().match(/.{1,4}/g) || []).join(' ');
}

// Parse an armored key and pull out what the caption and warnings need.
async function describeKey(armored) {
  const key = await openpgp.readKey({ armoredKey: armored });
  const isPrivate = key.isPrivate();

  let unprotected = false;
  if (isPrivate && typeof key.isDecrypted === 'function') {
    // isDecrypted() === true means the secret material is NOT passphrase-protected.
    unprotected = key.isDecrypted();
  }

  let userID = '';
  try {
    userID = key.getUserIDs()[0] || '';
  } catch {
    userID = '';
  }

  return {
    isPrivate,
    unprotected,
    userID,
    fingerprint: key.getFingerprint()
  };
}

// Shrink text until it fits maxWidth, then truncate with an ellipsis.
function fitText(ctx, text, maxWidth, startPx, minPx, weight = '') {
  let px = startPx;
  const font = p => `${weight} ${p}px ${MONO}`.trim();

  while (px > minPx) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxWidth) return { text, px };
    px -= 1;
  }

  ctx.font = font(minPx);
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '...').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return { text: out.length < text.length ? out + '...' : out, px: minPx };
}

// Draw the QR plus its title and caption onto the canvas.
// Modules are always a whole number of pixels, so they stay sharp and scannable.
function renderQrCard(canvas, { text, level, title, captions }) {
  const encoded = new Encoder({ level }).encode(new Byte(text));
  const modules = encoded.size;
  const totalModules = modules + QUIET_MODULES * 2;

  const moduleSize = Math.max(4, Math.min(10, Math.floor(900 / totalModules)));
  const qrPx = totalModules * moduleSize;

  const ctx = canvas.getContext('2d');
  const titlePx = Math.max(15, Math.round(qrPx * 0.045));
  const capPx = Math.max(10, Math.round(qrPx * 0.024));
  const titleBand = title ? Math.round(titlePx * 2.4) : Math.round(qrPx * 0.03);
  const lines = captions.filter(Boolean);
  const capBand = lines.length
    ? Math.round(capPx * 1.7 * lines.length + capPx * 1.2)
    : Math.round(qrPx * 0.03);

  canvas.width = qrPx;
  canvas.height = titleBand + qrPx + capBand;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (title) {
    const fitted = fitText(ctx, title, qrPx * 0.88, titlePx, 11, '700');
    ctx.fillStyle = '#111827';
    ctx.fillText(fitted.text, qrPx / 2, titleBand / 2);
  }

  // Quiet zone is already white; draw only the dark modules, on integer pixels.
  ctx.fillStyle = '#000000';
  const originX = QUIET_MODULES * moduleSize;
  const originY = titleBand + QUIET_MODULES * moduleSize;
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!encoded.get(x, y)) continue;
      ctx.fillRect(
        originX + x * moduleSize,
        originY + y * moduleSize,
        moduleSize,
        moduleSize
      );
    }
  }

  ctx.fillStyle = '#4b5563';
  let capY = titleBand + qrPx + capPx * 1.3;
  for (const line of lines) {
    const fitted = fitText(ctx, line, qrPx * 0.92, capPx, 8);
    ctx.fillStyle = '#4b5563';
    ctx.fillText(fitted.text, qrPx / 2, capY);
    capY += capPx * 1.7;
  }

  return { version: encoded.version, modules, width: canvas.width, height: canvas.height };
}

function setQrWarning(html) {
  const el = $('qrWarning');
  if (!html) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = html;
}

// Load a key into the QR tab from one of the other tabs.
async function showQrFor(armoredText, fallbackKind) {
  const text = (armoredText || '').trim();

  activateTab('qr');

  if (!text) {
    qrState = { text: '', kind: '', isPrivate: false, filenameBase: 'key' };
    $('qrSource').value = '';
    $('qrSourceKind').textContent = I18N.qrNoneSelected;
    setQrWarning('');
    setStatus('qrStatus', I18N.qrNoKeyAvailable, true);
    return;
  }

  let info;
  try {
    info = await describeKey(text);
  } catch (err) {
    qrState = { text: '', kind: '', isPrivate: false, filenameBase: 'key' };
    $('qrSource').value = text;
    $('qrSourceKind').textContent = I18N.qrUnreadable;
    setQrWarning('');
    setStatus('qrStatus', I18N.qrNotAKey + ' ' + (err?.message || String(err)), true);
    return;
  }

  const kind = info.isPrivate ? I18N.qrPrivateKey : I18N.qrPublicKey;
  qrState = {
    text,
    kind,
    isPrivate: info.isPrivate,
    filenameBase: sanitizeFilenamePart(info.userID || 'key', 'key')
  };

  $('qrSource').value = text;
  $('qrSourceKind').textContent = kind;
  $('qrTitle').value = info.isPrivate ? I18N.qrTitlePrivate : I18N.qrTitlePublic;

  if (info.isPrivate) {
    setQrWarning(info.unprotected ? I18N.qrWarnUnprotected : I18N.qrWarnPrivate);
  } else {
    setQrWarning('');
  }

  setStatus('qrStatus', `${I18N.qrLoaded} ${info.userID || I18N.qrUnknownUser} (${kind}).`);
  await generateQr();
}

async function generateQr() {
  const text = qrState.text;
  const level = $('qrLevel').value;

  if (!text) {
    setStatus('qrStatus', I18N.qrNoKeyLoaded, true);
    return;
  }

  const bytes = new TextEncoder().encode(text).length;
  const limit = QR_CAPACITY[level];

  if (bytes > limit) {
    $('qrCanvas').width = 0;
    $('qrCanvas').height = 0;
    $('qrEmpty').hidden = false;
    setStatus('qrStatus', `${bytes} / ${limit} bytes (level ${level}). ${I18N.qrTooLarge}`, true);
    return;
  }

  let info = null;
  try {
    info = await describeKey(text);
  } catch {
    info = null;
  }

  const captions = info
    ? [info.userID, groupFingerprint(info.fingerprint)]
    : [];

  try {
    const result = renderQrCard($('qrCanvas'), {
      text,
      level,
      title: $('qrTitle').value.trim(),
      captions
    });
    $('qrEmpty').hidden = true;
    setStatus(
      'qrStatus',
      `${qrState.kind} ${I18N.qrEncoded}: ${bytes} B, QR v${result.version} `
        + `(${result.modules}x${result.modules}), ${level}, ${result.width}x${result.height} px.`
    );
  } catch (err) {
    $('qrCanvas').width = 0;
    $('qrCanvas').height = 0;
    $('qrEmpty').hidden = false;
    setStatus('qrStatus', I18N.qrBuildFailed + ' ' + (err?.message || String(err)), true);
  }
}

function downloadQr() {
  const canvas = $('qrCanvas');
  if (!canvas.width || !canvas.height) {
    setStatus('qrStatus', I18N.qrGenerateFirst, true);
    return;
  }

  const suffix = qrState.isPrivate ? 'private' : 'public';
  canvas.toBlob(blob => {
    downloadBlob(`${qrState.filenameBase}-${suffix}-qr.png`, blob);
    setStatus('qrStatus', `${I18N.qrDownloaded} ${qrState.filenameBase}-${suffix}-qr.png`);
  }, 'image/png');
}

$('showPublicQrBtn').addEventListener('click',
  () => showQrFor($('generatedPublicKey').value, 'generated public key'));

$('showPrivateQrBtn').addEventListener('click',
  () => showQrFor($('generatedPrivateKey').value, 'generated private key'));

$('showEncryptPublicQrBtn').addEventListener('click',
  () => showQrFor($('publicKey').value, 'public key'));

$('showDecryptPrivateQrBtn').addEventListener('click',
  () => showQrFor($('privateKey').value, 'private key'));

$('generateQrBtn').addEventListener('click', () => generateQr());
$('qrLevel').addEventListener('change', () => { if (qrState.text) generateQr(); });
$('downloadQrBtn').addEventListener('click', downloadQr);
