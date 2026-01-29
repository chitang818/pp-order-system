use rand::RngCore;
use sha2::Sha512;
use pbkdf2::pbkdf2_hmac;

pub fn hash_password_pbkdf2(password: &str) -> String {
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let mut out = [0u8; 64];
    pbkdf2_hmac::<Sha512>(password.as_bytes(), &salt, 1000, &mut out);
    format!("{}:{}", hex::encode(salt), hex::encode(out))
}

pub fn verify_password_pbkdf2(password: &str, hash: &str) -> bool {
    let parts: Vec<&str> = hash.split(':').collect();
    if parts.len() != 2 {
        return false;
    }
    let salt = match hex::decode(parts[0]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let stored_hash = match hex::decode(parts[1]) {
        Ok(h) => h,
        Err(_) => return false,
    };
    if stored_hash.len() != 64 {
        return false;
    }
    let mut computed = [0u8; 64];
    pbkdf2_hmac::<Sha512>(password.as_bytes(), &salt, 1000, &mut computed);
    computed.as_ref() == stored_hash.as_slice()
}
