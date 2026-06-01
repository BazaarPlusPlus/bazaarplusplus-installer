use serde::Serialize;
use tauri::AppHandle;

use crate::services::startup::InstallerContextState;

#[derive(Clone, Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct AppBootstrap {
    pub app_version: String,
    pub bundled_bpp_version: Option<String>,
    pub locale: String,
    pub links: AppLinks,
    pub credits: Vec<AppCredit>,
    pub licenses: Vec<AppLicense>,
}

#[derive(Clone, Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct AppLinks {
    pub github: String,
    pub bilibili_project: String,
    pub bilibili_author: String,
    pub xiaohongshu: String,
    pub kofi: String,
    pub supporter_list: String,
}

#[derive(Clone, Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct AppCredit {
    pub name: String,
    pub role: String,
}

#[derive(Clone, Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct AppLicense {
    pub name: String,
    pub license: String,
    pub category: String,
}

#[tauri::command]
pub fn get_app_bootstrap(
    app: AppHandle,
    state: tauri::State<'_, InstallerContextState>,
) -> AppBootstrap {
    let startup = state.get_or_initialize(&app);
    AppBootstrap {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        bundled_bpp_version: startup.bundled_bpp_version.clone(),
        locale: "zh".to_string(),
        links: AppLinks {
            github: "https://github.com/cauyxy/BazaarPlusPlus".to_string(),
            bilibili_project: "https://space.bilibili.com/3546978457750467".to_string(),
            bilibili_author: "https://space.bilibili.com/1564408396".to_string(),
            xiaohongshu: "https://www.xiaohongshu.com/user/profile/5d414f64000000000100a5f6"
                .to_string(),
            kofi: "https://ko-fi.com/cauyxy".to_string(),
            supporter_list: "https://bazaarplusplus.com/support".to_string(),
        },
        credits: vec![
            AppCredit {
                name: "cauyxy".to_string(),
                role: "AUTHOR".to_string(),
            },
            AppCredit {
                name: "Trae".to_string(),
                role: "CO-CREATOR".to_string(),
            },
            AppCredit {
                name: "Codex".to_string(),
                role: "CO-CREATOR".to_string(),
            },
            AppCredit {
                name: "Claude Code".to_string(),
                role: "CO-CREATOR".to_string(),
            },
            AppCredit {
                name: "BazaarHelper".to_string(),
                role: "INSPIRATION".to_string(),
            },
            AppCredit {
                name: "BazaarPlannerMod".to_string(),
                role: "INSPIRATION".to_string(),
            },
        ],
        licenses: vec![
            AppLicense {
                name: "BepInEx".to_string(),
                license: "LGPL-2.1".to_string(),
                category: "runtime".to_string(),
            },
            AppLicense {
                name: "FFmpeg".to_string(),
                license: "GPL".to_string(),
                category: "runtime".to_string(),
            },
            AppLicense {
                name: "React".to_string(),
                license: "MIT".to_string(),
                category: "frontend".to_string(),
            },
            AppLicense {
                name: "Tauri".to_string(),
                license: "MIT".to_string(),
                category: "backend".to_string(),
            },
            AppLicense {
                name: "Tailwind CSS".to_string(),
                license: "MIT".to_string(),
                category: "frontend".to_string(),
            },
        ],
    }
}
