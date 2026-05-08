pub const BAZAARDB_BASE_URL: &str = "https://bazaardb.bazaarplusplus.com";

pub fn auth_me_url() -> String {
    format!("{BAZAARDB_BASE_URL}/api/auth/me")
}

pub fn upload_screenshot_url() -> String {
    format!("{BAZAARDB_BASE_URL}/api/uploads/screenshot")
}
