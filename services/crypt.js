const forge = require('node-forge');
var pki = forge.pki;

const AES_STANDARD = 'AES-CBC';

module.exports = () => {
  var crypt = {
    _bigInteger(num) {
      if (typeof num === 'string') return new forge.jsbn.BigInteger(num, 16);
      return num;
    },

    fingerprint(publicKey) {
      return pki.getPublicKeyFingerprint(publicKey, {
        encoding: 'hex',
        delimiter: ':'
      });
    },

    signature(privateKey, message) {
      // Create SHA-1 checksum
      var csum = forge.md.sha1.create();
      csum.update(message, 'utf8');

      // Sign checksum with private key
      if (typeof privateKey === 'string') privateKey = pki.privateKeyFromPem(privateKey);
      if (typeof privateKey === 'object')
        privateKey = pki.setRsaPrivateKey(
          crypt._bigInteger(privateKey.n),
          crypt._bigInteger(privateKey.e),
          crypt._bigInteger(privateKey.d),
          crypt._bigInteger(privateKey.p),
          crypt._bigInteger(privateKey.q),
          crypt._bigInteger(privateKey.dP),
          crypt._bigInteger(privateKey.dQ),
          crypt._bigInteger(privateKey.qInv)
        );
      var signature = privateKey.sign(csum);

      // Return base64 encoded signature
      return forge.util.encode64(signature);
    },

    verify(publicKey, signature, decrypted) {
      // Return false if ne signature is defined
      if (!signature) return false;

      // Create SHA-1 checksum
      var csum = forge.md.sha1.create();
      csum.update(decrypted, 'utf8');

      // Base64 decode signature
      signature = forge.util.decode64(signature);

      // Sign checksum with private key
      if (typeof publicKey === 'string') publicKey = pki.publicKeyFromPem(publicKey);
      if (typeof publicKey === 'object') publicKey = pki.setRsaPublicKey(this._bigInteger(publicKey.n), this._bigInteger(publicKey.e));

      // Verify signature
      var verified = publicKey.verify(csum.digest().getBytes(), signature);
      return verified;
    },

    encrypt(publicKeys, message, signature) {
      var payload = {};

      // Generate flat array of keys
      if (!Array.isArray(publicKeys)) {
        publicKeys = [publicKeys];
      }

      // Map PEM keys to forge public key objects
      publicKeys = publicKeys.map(function(key) {
        if (typeof key === 'string') return pki.publicKeyFromPem(key);
        if (typeof key === 'object') return pki.setRsaPublicKey(crypt._bigInteger(key.n), crypt._bigInteger(key.e));
        return key;
      });

      // Generate random keys
      var iv = forge.random.getBytesSync(32);
      var key = forge.random.getBytesSync(32);

      // Encrypt random key with all of the public keys
      var encryptedKeys = {};
      publicKeys.forEach(function(publicKey) {
        var encryptedKey = publicKey.encrypt(key, 'RSA-OAEP');
        var fingerprint = crypt.fingerprint(publicKey);
        encryptedKeys[fingerprint] = forge.util.encode64(encryptedKey);
      });

      // Create buffer and cipher
      var buffer = forge.util.createBuffer(message, 'utf8');
      var cipher = forge.cipher.createCipher(AES_STANDARD, key);

      // Actual encryption
      cipher.start({ iv: iv });
      cipher.update(buffer);
      cipher.finish();

      // Attach encrypted message int payload
      payload.v = '1.0';
      payload.iv = forge.util.encode64(iv);
      payload.keys = encryptedKeys;
      payload.cipher = forge.util.encode64(cipher.output.data);
      payload.signature = signature;

      // Return encrypted message
      var output = JSON.stringify(payload);
      return output;
    },

    decrypt(privateKey, encrypted) {
      // Validate encrypted message, return if unvalidated
      if (!crypt._validate(encrypted)) return;

      // Parse encrypted string to JSON
      var payload = JSON.parse(encrypted);

      // Accept both PEMs and forge private key objects
      // Cast PEM to forge private key object
      if (typeof privateKey === 'string') privateKey = pki.privateKeyFromPem(privateKey);
      if (typeof privateKey === 'object')
        privateKey = pki.setRsaPrivateKey(
          crypt._bigInteger(privateKey.n),
          crypt._bigInteger(privateKey.e),
          crypt._bigInteger(privateKey.d),
          crypt._bigInteger(privateKey.p),
          crypt._bigInteger(privateKey.q),
          crypt._bigInteger(privateKey.dP),
          crypt._bigInteger(privateKey.dQ),
          crypt._bigInteger(privateKey.qInv)
        );

      // Get key fingerprint
      var fingerprint = crypt.fingerprint(privateKey);

      // Get encrypted keys and encrypted message from the payload
      var encryptedKey = payload.keys[fingerprint];

      // Log error if key wasn't found
      if (!encryptedKey) {
        // console.warn('RSA fingerprint doesn\'t match with any of the encrypted message\'s fingerprints');
        return;
      }

      // Get bytes of encrypted AES key, initialization vector and cipher
      var keyBytes = forge.util.decode64(encryptedKey);
      var iv = forge.util.decode64(payload.iv);
      var cipher = forge.util.decode64(payload.cipher);

      // Use RSA to decrypt AES key
      var key = privateKey.decrypt(keyBytes, 'RSA-OAEP');

      // Create buffer and decipher
      var buffer = forge.util.createBuffer(cipher);
      var decipher = forge.cipher.createDecipher(AES_STANDARD, key);

      // Actual decryption
      decipher.start({ iv: iv });
      decipher.update(buffer);
      decipher.finish();

      // Return utf-8 encoded bytes
      var bytes = decipher.output.getBytes();
      var decrypted = forge.util.decodeUtf8(bytes);

      var output = {};
      output.message = decrypted;
      output.signature = payload.signature;
      return output;
    },

    _validate(encrypted) {
      try {
        // Try to parse encrypted message
        var p = JSON.parse(encrypted);

        return (
          // Check required properties
          p.hasOwnProperty('v') && p.hasOwnProperty('iv') && p.hasOwnProperty('keys') && p.hasOwnProperty('cipher')
        );
      } catch (e) {
        // Invalid message
        // Log the error and then return false
        console.warn(e);
        return false;
      }
    },

    _entropy(input) {
      var bytes = forge.util.encodeUtf8(String(input));
      forge.random.collect(bytes);
    },

    publicKeyToPem(publicKey) {
      if (typeof publicKey !== 'object') {
        return publicKey;
      }

      const key = pki.setRsaPublicKey(crypt._bigInteger(publicKey.n), crypt._bigInteger(publicKey.e));
      return pki.publicKeyToPem(key);
    },

    privateKeyToPem(privateKey) {
      if (typeof privateKey !== 'object') {
        return privateKey;
      }

      const key = (privateKey = pki.setRsaPrivateKey(
        crypt._bigInteger(privateKey.n),
        crypt._bigInteger(privateKey.e),
        crypt._bigInteger(privateKey.d),
        crypt._bigInteger(privateKey.p),
        crypt._bigInteger(privateKey.q),
        crypt._bigInteger(privateKey.dP),
        crypt._bigInteger(privateKey.dQ),
        crypt._bigInteger(privateKey.qInv)
      ));
      return pki.privateKeyToPem(key);
    },

    signMessage(ourPrivateKey, partnerPublicKey, message) {
      // Create a signature with ISSUER's private RSA key
      var signature = crypt.signature(ourPrivateKey, message);

      // Encrypt message with RECEIVERS public RSA key and attach the signature
      const encrypted = crypt.encrypt(partnerPublicKey, message, signature);
      return encrypted;
    },

    verifyMessage(ourPrivateKey, partnerPublicKey, encrypted) {
      // Decrypt message with own (RECEIVER) private key
      var decrypted = crypt.decrypt(ourPrivateKey, encrypted);
      if (!decrypted) {
        return null;
      }

      // Verify message with ISSUER's public key
      var verified = crypt.verify(partnerPublicKey, decrypted.signature, decrypted.message);
      if (verified) {
        return decrypted.message;
      } else {
        return null;
      }
    }
  };

  return crypt;
};
