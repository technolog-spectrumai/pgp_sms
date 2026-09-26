
import * as openpgp from 'https://unpkg.com/openpgp@6.3.1/dist/openpgp.min.mjs';
import {
  Encoder, Decoder, Detector, Byte, binarize, grayscale
} from './vendor/qrcode.min.js';

const $ = id => document.getElementById(id);

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

    if (!armoredKey) throw new Error('Paste or load the recipient public key.');
    if (!plaintext) throw new Error('Enter a message.');

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
      `Encrypted successfully. ${plaintext.length} plaintext characters → ${output.length} transport characters.`
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

    if (!armoredPrivateKey) throw new Error('Paste or load your private key.');
    if (!encryptedInput) throw new Error('Paste the encrypted message.');

    let privateKey = await openpgp.readPrivateKey({
      armoredKey: armoredPrivateKey
    });

    if (!privateKey.isDecrypted()) {
      if (!passphrase) {
        throw new Error(
          'This private key is passphrase-protected. Enter its passphrase to decrypt.'
        );
      }

      try {
        privateKey = await openpgp.decryptKey({
          privateKey,
          passphrase
        });
      } catch (err) {
        throw new Error(
          'Could not unlock the private key. Check the passphrase and try again.'
        );
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

    setStatus('decryptStatus', 'Decryption successful.');
  } catch (err) {
    setStatus(
      'decryptStatus',
      'Decryption failed: ' + (err?.message || String(err)),
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

    if (!name) throw new Error('Enter a name.');
    if (!email) throw new Error('Enter an email address.');

    setStatus('keygenStatus', 'Generating key pair...');

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
      'Key pair generated locally. Save the private key securely.'
    );
  } catch (err) {
    setStatus('keygenStatus', err?.message || String(err), true);
  }
});

async function copyFrom(id, statusId) {
  const value = $(id).value;
  if (!value) return;
  await navigator.clipboard.writeText(value);
  setStatus(statusId, 'Copied to clipboard.');
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
  setStatus('keygenStatus', 'Public key downloaded.');
});

$('downloadPrivateKeyBtn').addEventListener('click', () => {
  const base = sanitizeFilenamePart(
    $('keyEmail').value || $('keyName').value,
    'pgp'
  );
  downloadText(`${base}-private.asc`, $('generatedPrivateKey').value);
  setStatus('keygenStatus', 'Private key downloaded. Keep it secret.');
});

/* ------------------------------------------------------------------ *
 * Key QR: export an OpenPGP key as a PNG, and read one back.
 * All encoding, rendering and decoding happens locally in the browser.
 * ------------------------------------------------------------------ */

// Byte-mode capacity of a version-40 QR code at each error-correction level.
const QR_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

const QUIET_MODULES = 4;
const MONO = '"SFMono-Regular", Consolas, ui-monospace, monospace';

let qrState = { text: '', kind: '', filenameBase: 'key' };
let decodedKey = { text: '', isPrivate: false };

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
  setStatus('qrReadStatus', '');

  if (!text) {
    qrState = { text: '', kind: '', filenameBase: 'key' };
    $('qrSource').value = '';
    $('qrSourceKind').textContent = 'none selected';
    setQrWarning('');
    setStatus('qrStatus', `No ${fallbackKind} available yet.`, true);
    return;
  }

  let info;
  try {
    info = await describeKey(text);
  } catch (err) {
    qrState = { text: '', kind: '', filenameBase: 'key' };
    $('qrSource').value = text;
    $('qrSourceKind').textContent = 'unreadable';
    setQrWarning('');
    setStatus('qrStatus', 'That is not a readable OpenPGP key: ' + (err?.message || String(err)), true);
    return;
  }

  const kind = info.isPrivate ? 'private key' : 'public key';
  qrState = {
    text,
    kind,
    filenameBase: sanitizeFilenamePart(info.userID || 'key', 'key')
  };

  $('qrSource').value = text;
  $('qrSourceKind').textContent = kind;
  $('qrTitle').value = info.isPrivate ? 'PGP PRIVATE KEY' : 'PGP PUBLIC KEY';

  if (info.isPrivate) {
    setQrWarning(
      info.unprotected
        ? 'This private key has NO passphrase. Anyone who sees this image owns the key. '
          + 'Generate the key with a passphrase before exporting it.'
        : 'A private key QR is a secret. Anyone who photographs or copies the image can '
          + 'attempt to use the key. Store the PNG offline, not in a synced photo folder.'
    );
  } else {
    setQrWarning('');
  }

  setStatus('qrStatus', `Loaded ${kind} for ${info.userID || 'unknown user'}. Press Generate QR.`);
  await generateQr();
}

async function generateQr() {
  const text = qrState.text;
  const level = $('qrLevel').value;

  if (!text) {
    setStatus('qrStatus', 'No key loaded. Use a Show QR button on another tab.', true);
    return;
  }

  const bytes = new TextEncoder().encode(text).length;
  const limit = QR_CAPACITY[level];

  if (bytes > limit) {
    $('qrCanvas').width = 0;
    $('qrCanvas').height = 0;
    $('qrEmpty').hidden = false;
    setStatus(
      'qrStatus',
      `Key is ${bytes} bytes, over the ${limit}-byte limit at level ${level}. `
        + 'A single QR code tops out at 2953 bytes, so RSA keys do not fit. '
        + 'Use a lower error-correction level, or an ECC (curve25519) key.',
      true
    );
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
      `${qrState.kind || 'Key'} encoded: ${bytes} bytes, QR version ${result.version} `
        + `(${result.modules}x${result.modules} modules), level ${level}, `
        + `image ${result.width}x${result.height}px.`
    );
  } catch (err) {
    $('qrCanvas').width = 0;
    $('qrCanvas').height = 0;
    $('qrEmpty').hidden = false;
    setStatus('qrStatus', 'Could not build the QR code: ' + (err?.message || String(err)), true);
  }
}

function downloadQr() {
  const canvas = $('qrCanvas');
  if (!canvas.width || !canvas.height) {
    setStatus('qrStatus', 'Generate a QR code first.', true);
    return;
  }

  const suffix = qrState.kind === 'private key' ? 'private' : 'public';
  canvas.toBlob(blob => {
    downloadBlob(`${qrState.filenameBase}-${suffix}-qr.png`, blob);
    setStatus('qrStatus', `Downloaded ${qrState.filenameBase}-${suffix}-qr.png.`);
  }, 'image/png');
}

// Decode a QR image file. The detector returns candidate regions, so try each
// one until a decode succeeds rather than giving up on the first failure.
async function decodeQrImage(file) {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const binarized = binarize(grayscale(image), image.width, image.height);
    const decoder = new Decoder();
    const detected = new Detector().detect(binarized);

    let current = detected.next();
    while (!current.done) {
      try {
        return decoder.decode(current.value.matrix).content;
      } catch {
        // This candidate region was not a readable QR code; try the next.
      }
      current = detected.next(false);
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}

async function handleQrImage() {
  const input = $('qrImageFile');
  if (!input.files?.length) return;

  const file = input.files[0];
  input.value = '';

  setStatus('qrReadStatus', `Reading ${file.name}...`);
  $('qrDecoded').value = '';
  decodedKey = { text: '', isPrivate: false };

  let content;
  try {
    content = await decodeQrImage(file);
  } catch (err) {
    setStatus('qrReadStatus', 'Could not read that image: ' + (err?.message || String(err)), true);
    return;
  }

  if (!content) {
    setStatus(
      'qrReadStatus',
      'No QR code found in that image. Crop to the code, keep the white border, '
        + 'and avoid blur or glare.',
      true
    );
    return;
  }

  let info;
  try {
    info = await describeKey(content);
  } catch {
    $('qrDecoded').value = content;
    setStatus(
      'qrReadStatus',
      'Decoded the QR code, but it does not contain an OpenPGP key.',
      true
    );
    return;
  }

  decodedKey = { text: content, isPrivate: info.isPrivate };
  $('qrDecoded').value = content;
  setStatus(
    'qrReadStatus',
    `Found a ${info.isPrivate ? 'private' : 'public'} key for `
      + `${info.userID || 'unknown user'} (${groupFingerprint(info.fingerprint)}).`
  );
}

function useDecodedKey(target) {
  if (!decodedKey.text) {
    setStatus('qrReadStatus', 'Read a QR image first.', true);
    return;
  }

  if (target === 'encrypt') {
    if (decodedKey.isPrivate) {
      setStatus('qrReadStatus', 'That is a private key. Encrypting needs the recipient public key.', true);
      return;
    }
    $('publicKey').value = decodedKey.text;
    activateTab('encrypt');
    setStatus('encryptStatus', 'Public key loaded from QR image.');
    return;
  }

  if (!decodedKey.isPrivate) {
    setStatus('qrReadStatus', 'That is a public key. Decrypting needs your private key.', true);
    return;
  }
  $('privateKey').value = decodedKey.text;
  activateTab('decrypt');
  setStatus('decryptStatus', 'Private key loaded from QR image.');
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
$('qrImageFile').addEventListener('change', handleQrImage);

$('copyDecodedKeyBtn').addEventListener('click',
  () => copyFrom('qrDecoded', 'qrReadStatus'));

$('useDecodedPublicBtn').addEventListener('click', () => useDecodedKey('encrypt'));
$('useDecodedPrivateBtn').addEventListener('click', () => useDecodedKey('decrypt'));
