use std::sync::Mutex;

pub trait KeyringBackend: Send + Sync {
    fn set(&self, value: &str) -> Result<(), String>;
    fn get(&self) -> Result<Option<String>, String>;
    fn delete(&self) -> Result<(), String>;
}

pub struct OsKeyringBackend {
    service: &'static str,
    user: &'static str,
}

impl OsKeyringBackend {
    pub fn new() -> Self {
        Self {
            service: "com.bazaarplusplus.installer",
            user: "bazaardb-pat",
        }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(self.service, self.user).map_err(|err| err.to_string())
    }
}

impl KeyringBackend for OsKeyringBackend {
    fn set(&self, value: &str) -> Result<(), String> {
        self.entry()?.set_password(value).map_err(|err| err.to_string())
    }

    fn get(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}

#[derive(Default)]
pub struct MemoryKeyringBackend {
    inner: Mutex<Option<String>>,
}

impl KeyringBackend for MemoryKeyringBackend {
    fn set(&self, value: &str) -> Result<(), String> {
        *self.inner.lock().unwrap() = Some(value.to_string());
        Ok(())
    }

    fn get(&self) -> Result<Option<String>, String> {
        Ok(self.inner.lock().unwrap().clone())
    }

    fn delete(&self) -> Result<(), String> {
        *self.inner.lock().unwrap() = None;
        Ok(())
    }
}

pub struct KeyringStore<B: KeyringBackend = OsKeyringBackend> {
    backend: B,
}

impl KeyringStore<OsKeyringBackend> {
    pub fn os() -> Self {
        Self { backend: OsKeyringBackend::new() }
    }
}

impl<B: KeyringBackend> KeyringStore<B> {
    pub fn with_backend(backend: B) -> Self {
        Self { backend }
    }

    pub fn save(&self, token: &str) -> Result<(), String> {
        self.backend.set(token)
    }

    pub fn load(&self) -> Result<Option<String>, String> {
        self.backend.get()
    }

    pub fn delete(&self) -> Result<(), String> {
        self.backend.delete()
    }
}

#[cfg(test)]
mod tests {
    use super::{KeyringStore, MemoryKeyringBackend};

    #[test]
    fn save_then_load_returns_the_token() {
        let store = KeyringStore::with_backend(MemoryKeyringBackend::default());
        store.save("pat-abc").unwrap();
        assert_eq!(store.load().unwrap().as_deref(), Some("pat-abc"));
    }

    #[test]
    fn delete_clears_the_token() {
        let store = KeyringStore::with_backend(MemoryKeyringBackend::default());
        store.save("pat-abc").unwrap();
        store.delete().unwrap();
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn load_returns_none_when_no_token_is_stored() {
        let store = KeyringStore::with_backend(MemoryKeyringBackend::default());
        assert!(store.load().unwrap().is_none());
    }
}
