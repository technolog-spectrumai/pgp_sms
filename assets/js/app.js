
import * as openpgp from 'https://unpkg.com/openpgp@6.3.1/dist/openpgp.min.mjs';

const $ = id => document.getElementById(id);

function activateTab(name) {
  const config = {
    encrypt: ['encryptTab', 'encryptPanel'],
    decrypt: ['decryptTab', 'decryptPanel'],
    keygen: ['keygenTab', 'keygenPanel']
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

    if (passphrase) {
      privateKey = await openpgp.decryptKey({
        privateKey,
        passphrase
      });
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

function downloadText(filename, text) {
  if (!text) return;
  const blob = new Blob([text], { type: 'application/pgp-keys' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
